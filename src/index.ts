import { DurableObject } from "cloudflare:workers";

export interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace;
  USER_SECRETS: string;
}

export interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace;
  USER_SECRETS: string;
  AI: Ai; 
}

interface WebSocketAttachment {
  name: string;
  id: string;
  joinedAt: number;
}

// 定义消息结构
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class MyDurableObject extends DurableObject<Env> {
  // 定义一个内存变量，用来存聊天记录
  history: ChatMessage[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // 辅助方法：向所有人广播
  broadcast(message: string) {
    const websockets = this.ctx.getWebSockets();
    for (const client of websockets) {
      try {
        client.send(message);
      } catch (e) {
        // 忽略发送失败
      }
    }
  }

  // 优雅地拒绝连接
  // 作用：为了让 wscat 能打印出错误信息，我们需要先建立连接，发消息，再挂断
  rejectWebSocket(reason: string): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // 接受连接
    this.ctx.acceptWebSocket(server);

    // 发送报错信息
    server.send(`[连接拒绝]: ${reason}`);
    
    // 【修改点】使用 Close Event 1000 (正常关闭) 或 1008 (策略违反)
    // 有时候客户端对 1008 反应比较慢，或者我们可以仅仅 close() 不带参数
    server.close(1008, reason);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/websocket") {
      const params = url.searchParams;
      const name = params.get("name");
      const secret = params.get("secret");

      // 1. 检查名字是否存在
      if (!name) {
        return this.rejectWebSocket("必须提供 'name' 参数 (例如 ?name=张三)");
      }

      // 2. 解析服务器配置
      let allowedUsers: Record<string, string> = {};
      try {
        // 如果环境变量没配置，为了测试方便，我们允许 "admin/admin" 作为一个默认后门
        // 实际生产中不建议保留这个 || 后面部分
        const secretsJson = this.env.USER_SECRETS || '{"admin":"admin"}';
        allowedUsers = JSON.parse(secretsJson);
      } catch (e) {
        return this.rejectWebSocket("服务器 USER_SECRETS 配置格式错误，不是有效的 JSON");
      }

      // 3. 检查白名单
      if (!allowedUsers.hasOwnProperty(name)) {
        return this.rejectWebSocket(`用户 '${name}' 未在允许名单中`);
      }

      // 4. 检查密码
      if (secret !== allowedUsers[name]) {
        return this.rejectWebSocket("密码错误");
      }

      // 5. 检查重复登录
      const activeWebSockets = this.ctx.getWebSockets();
      for (const existingWS of activeWebSockets) {
        const attachmentStr = existingWS.deserializeAttachment();
        if (attachmentStr) {
          const info = JSON.parse(attachmentStr as string) as WebSocketAttachment;
          if (info.name === name) {
            return this.rejectWebSocket(`用户 '${name}' 已经在线，禁止重复登录`);
          }
        }
      }

      // 所有检查通过，正式允许进入
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      server.serializeAttachment(JSON.stringify({
        name: name,
        id: crypto.randomUUID(),
        joinedAt: Date.now()
      }));

      this.ctx.acceptWebSocket(server);
      // 1. 广播给所有人：有人进来了
      this.broadcast(`[系统通知]: 欢迎 ${name} 加入房间！`);

      // 2. 单独给这个新用户发一条“使用说明”
      // server 代表当前这个连接，server.send 只会发给新进入会话人员
      server.send(`[系统提示]: 👋 你好 ${name}！我是 AI 助手 Jarvis。
      如果你想跟我聊天，请在消息开头加上 "Jarvis" 或 "@Jarvis"。
      例如: "Jarvis 给我讲个笑话"`);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Durable Object Active", { status: 200 });
  }

  // 收到消息时的处理逻辑
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (!attachmentStr) return;
    const { name } = JSON.parse(attachmentStr as string);
    
    const userMsg = message.toString();
    const lowerCaseMsg = userMsg.toLowerCase().trim();

    // 1. 广播用户的原始消息
    this.broadcast(`[${name}]: ${userMsg}`);

    // 2. 【新增】处理“帮助”指令
    if (lowerCaseMsg === "help" || lowerCaseMsg === "帮助") {
      ws.send(`[系统提示]: 💡 呼叫 AI 的方法：
      在消息前加 "Jarvis" 或 "@Jarvis"。
      例如: "@Jarvis 今天天气怎么样？"`);
      return; // 既然是求助，就不需要 AI 再处理了，直接返回
    }

    // 3. 处理呼叫 AI 的逻辑 (之前写的)
    if (lowerCaseMsg.startsWith("jarvis") || lowerCaseMsg.startsWith("@jarvis")) {
        this.ctx.waitUntil(this.askAI(name, userMsg));
    }
  }

  // 专门负责和 AI 对话的方法
  async askAI(userName: string, userQuestion: string) {
      let aiText = "";

      try {
        // 1. 把用户和用户的新问题加入历史记录
        this.history.push({ role: "user", content: `[${userName} 说]: ${userQuestion}` });

        // 2. 限制记忆长度 (滑动窗口)
        // 如果记录超过 20 条 (10轮对话)，就删掉最旧的，防止 token 爆炸
        if (this.history.length > 20) {
          this.history = this.history.slice(this.history.length - 20);
        }

        // 3. 准备发送给 AI 的完整数据包
        // 结构是: [系统人设, ...过去的对话记录]
        const systemPrompt = `你是一个群聊助手，名字叫 "Jarvis"。
        当前正在和你对话的用户是 "${userName}"。
        请用简短、幽默的中文回答。
        不要重复用户的名字，像老朋友一样聊天。`;

        const messagesToSend = [
          { role: "system", content: systemPrompt },
          ...this.history // 展开历史记录
        ];

        // 4. 调用 AI
        const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: messagesToSend as any // 类型断言，防止 TS 报错
        });

        aiText = (response as any).response;

        // 5. 【关键】把 AI 的回复也存进历史记录
        // 这样下一次 AI 就能知道自己说过什么了
        this.history.push({ role: "assistant", content: aiText });

      } catch (error) {
        const err = error as Error;
        console.warn("AI 调用失败:", err.message);
        aiText = `[脑回路断开]: 哎呀，我现在有点晕，刚才说到哪了？(${err.message})`;
      }

      // 6. 广播回复
      this.broadcast(`[Jarvis]: ${aiText}`);
    }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (attachmentStr) {
      const { name } = JSON.parse(attachmentStr as string);
      // 只有不是因为被服务器踢掉（1008）的情况下，才广播离开
      if (code !== 1008) {
        this.broadcast(`[系统通知]: ${name} 离开了房间`);
      }
    }
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

      const id = env.MY_DURABLE_OBJECT.idFromName("global-room");
      const stub = env.MY_DURABLE_OBJECT.get(id);

      return stub.fetch(new Request(url.toString().replace("/ws", "/websocket"), request));
    }
    
    return new Response("Chat Server Protected. Connect via WebSocket.", { status: 200 });
  },
} satisfies ExportedHandler<Env>;

