import { DurableObject } from "cloudflare:workers";

const MAX_MESSAGE_LENGTH = 1024;

export interface Env {
  CHAT_ROOM: DurableObjectNamespace;
  USER_SECRETS: string;
  AI: Ai; 
}

interface WebSocketAttachment {
  name: string;
  id: string;
  joinedAt: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ChatRoom extends DurableObject<Env> {
  history: ChatMessage[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  broadcast(message: string) {
    const websockets = this.ctx.getWebSockets();
    for (const client of websockets) {
      // 跳过和回收已经失效的连接，避免反复发送报错
      if (client.readyState !== WebSocket.OPEN) {
        try {
          client.close(1011, "stale connection");
        } catch {
          // ignore
        }
        continue;
      }

      try {
        client.send(message);
      } catch {
        try {
          client.close(1011, "failed to deliver");
        } catch {
          // ignore
        }
      }
    }
  }

  rejectWebSocket(reason: string): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    server.send(`[连接拒绝]: ${reason}`);
    server.close(1008, reason);
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/websocket") {
      const params = url.searchParams;
      const name = params.get("name");
      const secret = params.get("secret");

      if (!name) return this.rejectWebSocket("必须提供 'name' 参数");

      let allowedUsers: Record<string, string> = {};
      try {
        const secretsJson = this.env.USER_SECRETS || '{"admin":"admin"}';
        allowedUsers = JSON.parse(secretsJson);
      } catch (e) {
        return this.rejectWebSocket("服务器配置错误");
      }

      if (!allowedUsers.hasOwnProperty(name)) return this.rejectWebSocket(`用户 '${name}' 不在名单中`);
      if (secret !== allowedUsers[name]) return this.rejectWebSocket("密码错误");

      const activeWebSockets = this.ctx.getWebSockets();
      for (const existingWS of activeWebSockets) {
        const attachmentStr = existingWS.deserializeAttachment();
        if (attachmentStr) {
          const info = JSON.parse(attachmentStr as string) as WebSocketAttachment;
          if (info.name === name) return this.rejectWebSocket(`用户 '${name}' 已经在线`);
        }
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      server.serializeAttachment(JSON.stringify({
        name: name,
        id: crypto.randomUUID(),
        joinedAt: Date.now()
      }));

      this.ctx.acceptWebSocket(server);
      
      const welcomeMsg = `[系统通知]: 欢迎 ${name} 加入房间！`;
      
      // 1. 广播给所有人
      this.broadcast(welcomeMsg);
      
      // 2. 【关键修复】把这件事记入 AI 的历史！
      // 使用 "user" 角色，把发送者标记为 "系统"
      this.recordHistory("系统", `欢迎 ${name} 加入房间`, "user");

      server.send(`[系统提示]: 👋 你好 ${name}！我是 Jarvis。@Jarvis 或 Jarvis 可呼叫我。`);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Chat Server Running.", { status: 200 });
  }

  recordHistory(name: string, content: string, role: "user" | "assistant") {
    // 构造带名字的内容
    const finalContent = role === "user" ? `[${name}]: ${content}` : content;
    
    this.history.push({ role: role, content: finalContent });

    // 增加记忆到 50 条
    if (this.history.length > 50) {
      this.history = this.history.slice(this.history.length - 50);
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (!attachmentStr) return;
    const { name } = JSON.parse(attachmentStr as string);
    const userMsg = this.decodeMessage(message);
    const trimmed = userMsg.trim();

    if (!trimmed) {
      ws.send("[系统提示]: 消息不能为空或仅包含空白字符。");
      return;
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      ws.send(`[系统提示]: 消息过长（限制 ${MAX_MESSAGE_LENGTH} 字），请简短一些。`);
      return;
    }

    this.broadcast(`[${name}]: ${trimmed}`);
    this.recordHistory(name, trimmed, "user");

    const lowerCaseMsg = trimmed.toLowerCase();

    if (lowerCaseMsg === "help" || lowerCaseMsg === "帮助") {
      ws.send(`[系统提示]: 直接聊天即可。@Jarvis 呼叫 AI。`);
      return;
    }

    if (lowerCaseMsg.startsWith("jarvis") || lowerCaseMsg.startsWith("@jarvis")) {
        this.ctx.waitUntil(this.askAI(name, trimmed));
    }
  }

  async askAI(userName: string, userQuestion: string) {
    let aiText = "";

    try {
      const systemPrompt = `你是一个智能群聊助手 "Jarvis"。
      
      【重要规则】
      1. **角色**：你只是 Jarvis，不是“系统”，也不是其他用户。
      2. **环境感知**：你会看到 "[系统]: 欢迎 XXX" 的记录，这代表该用户在房间里。
      3. **输出格式**：**严禁**模仿历史记录的格式！**严禁**在开头加 "[系统]:"、"[Jarvis]:" 或 "[张三]:"。
      4. **说话方式**：请直接输出回复内容，就像真人在聊天一样自然。
      
      【当前提问者】: "${userName}"`;

      const messagesToSend = [
        { role: "system", content: systemPrompt },
        ...this.history
      ];

      const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: messagesToSend as any
      });

      aiText = (response as any).response;

      // === 终极清洗逻辑 ===
      aiText = aiText.trim();

      // 1. 去掉所有类似 [名字]: 或 [System]: 开头的东西
      // 正则解释：^ 开头，\[ 中括号，[^\]]+ 任意非中括号字符，\] 中括号结束，[:：] 中英文冒号，\s* 空格
      aiText = aiText.replace(/^\[[^\]]+\][:：]\s*/, "");
      
      // 2. 去掉所有类似 Name: 开头的东西
      aiText = aiText.replace(/^[a-zA-Z0-9\u4e00-\u9fa5]+[:：]\s*/, "");

      // 3. 再次去头去尾，防止残留空格
      aiText = aiText.trim();

      // 4. 防止空回复
      if (!aiText) aiText = "我刚才走神了，能再说一遍吗？";

    } catch (error) {
      const err = error as Error;
      aiText = `(连接超时: ${err.message})`;
    }

    // 存入历史 (存纯净版)
    this.recordHistory("Jarvis", aiText, "assistant");
    
    // 广播 (加上统一的 Jarvis 前缀)
    this.broadcast(`[Jarvis]: ${aiText}`);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (attachmentStr) {
      const { name } = JSON.parse(attachmentStr as string);
      if (code !== 1008) {
        const leaveMsg = `[系统通知]: ${name} 离开了房间`;
        this.broadcast(leaveMsg);
        
        // 有人离开房间也要记下来
        this.recordHistory("系统", `${name} 离开了房间`, "user");
      }
    }
  }

  private decodeMessage(message: string | ArrayBuffer): string {
    if (typeof message === "string") return message;
    return new TextDecoder().decode(message);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      const id = env.CHAT_ROOM.idFromName("global-room");
      const stub = env.CHAT_ROOM.get(id);

      return stub.fetch(new Request(url.toString().replace("/ws", "/websocket"), request));
    }
    
    return new Response("Chat Server Protected.", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
