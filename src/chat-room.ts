// Durable Object 核心类
import { DurableObject } from "cloudflare:workers";
import { Env, ChatMessage, WebSocketAttachment } from "./types";
import { MAX_MESSAGE_LENGTH, RATE_LIMIT_MS } from "./config";
import { decodeMessage } from "./utils";
import { askJarvis } from "./ai";

export class ChatRoom extends DurableObject<Env> {
  history: ChatMessage[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // 广播消息
  broadcast(message: string) {
    const websockets = this.ctx.getWebSockets();
    for (const client of websockets) {
      if (client.readyState !== WebSocket.OPEN) {
        try { client.close(1011, "stale connection"); } catch {}
        continue;
      }
      try {
        client.send(message);
      } catch {
        try { client.close(1011, "failed to deliver"); } catch {}
      }
    }
  }

  // 拒绝连接辅助函数
  rejectWebSocket(reason: string): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    server.send(`[连接拒绝]: ${reason}`);
    server.close(1008, reason);
    return new Response(null, { status: 101, webSocket: client });
  }

  // HTTP 入口 (鉴权与升级)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/websocket") {
      return new Response("Chat Server Running.", { status: 200 });
    }

    const params = url.searchParams;
    const name = params.get("name");
    const secret = params.get("secret");

    if (!name) return this.rejectWebSocket("必须提供 'name' 参数");

    // 鉴权逻辑
    let allowedUsers: Record<string, string> = {};
    try {
      // 如果没有配置环境变量，直接抛出错误，不要让任何人进来
      if (!this.env.USER_SECRETS) {
        return this.rejectWebSocket("系统严重错误: 管理员未配置 USER_SECRETS 环境变量");
      }
      
      allowedUsers = JSON.parse(this.env.USER_SECRETS);
    } catch (e) {
      return this.rejectWebSocket("服务器配置错误: USER_SECRETS 格式无效");
    }

    if (!allowedUsers.hasOwnProperty(name)) return this.rejectWebSocket(`用户 '${name}' 不在名单中`);
    if (secret !== allowedUsers[name]) return this.rejectWebSocket("密码错误");

    // 检查重复登录
    const activeWebSockets = this.ctx.getWebSockets();
    for (const existingWS of activeWebSockets) {
      const attachmentStr = existingWS.deserializeAttachment();
      if (attachmentStr) {
        const info = JSON.parse(attachmentStr as string) as WebSocketAttachment;
        if (info.name === name) return this.rejectWebSocket(`用户 '${name}' 已经在线`);
      }
    }

    // 接受连接
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const initialAttachment: WebSocketAttachment = {
      name: name!,
      id: crypto.randomUUID(),
      joinedAt: Date.now(),
      lastMessageAt: 0 
    };

    server.serializeAttachment(JSON.stringify(initialAttachment));
    this.ctx.acceptWebSocket(server);
    
    // 入场通知
    const welcomeMsg = `[系统通知]: 欢迎 ${name} 加入房间！`;
    this.broadcast(welcomeMsg);
    this.recordHistory("系统", `欢迎 ${name} 加入房间`, "user");

    server.send(`[系统提示]: 👋 你好 ${name}！我是 Jarvis。@Jarvis 或 Jarvis 可呼叫我。`);

    return new Response(null, { status: 101, webSocket: client });
  }

  // 记录历史
  recordHistory(name: string, content: string, role: "user" | "assistant") {
    const finalContent = role === "user" ? `[${name}]: ${content}` : content;
    this.history.push({ role: role, content: finalContent });
    if (this.history.length > 50) {
      this.history = this.history.slice(this.history.length - 50);
    }
  }

  // WebSocket 消息处理
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (!attachmentStr) return; 

    const attachment = JSON.parse(attachmentStr as string) as WebSocketAttachment;
    const { name, lastMessageAt } = attachment;
    
    // 速率限制
    const now = Date.now();
    if (now - lastMessageAt < RATE_LIMIT_MS) {
      ws.send(`[系统提示]: 说话太快了，请休息一下。`);
      return;
    }

    attachment.lastMessageAt = now;
    ws.serializeAttachment(JSON.stringify(attachment));

    const userMsg = decodeMessage(message);
    const trimmed = userMsg.trim();

    // 消息过滤
    if (!trimmed) { ws.send("[系统提示]: 消息不能为空。"); return; }
    if (trimmed.length > MAX_MESSAGE_LENGTH) { ws.send(`[系统提示]: 消息过长。`); return; }

    // 消息处理
    this.broadcast(`[${name}]: ${trimmed}`);
    this.recordHistory(name, trimmed, "user");

    const lowerCaseMsg = trimmed.toLowerCase();

    // Commands
    if (lowerCaseMsg === "/help" || lowerCaseMsg === "/帮助") {
      ws.send(`[系统提示]: 直接聊天即可。@Jarvis 或 Jarvis 可呼叫 AI。`);
      return;
    }

    if (trimmed === "/who" || trimmed === "/在线人数") {
        const count = this.ctx.getWebSockets().length;
        ws.send(`[系统提示]: 当前在线人数: ${count} 人`);
        return;
    }

    // AI 回复
    if (lowerCaseMsg.startsWith("jarvis") || lowerCaseMsg.startsWith("@jarvis")) {
      // 封装 AI 调用逻辑
      this.ctx.waitUntil(this.handleAiReply(name, trimmed));
    }
  }

  // 处理 AI 回复的辅助方法
  async handleAiReply(name: string, question: string) {
      const answer = await askJarvis(this.env.AI, name, this.history);
      this.recordHistory("Jarvis", answer, "assistant");
      this.broadcast(`[Jarvis]: ${answer}`);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (attachmentStr) {
      const { name } = JSON.parse(attachmentStr as string) as WebSocketAttachment;
      if (code !== 1008) {
        const leaveMsg = `[系统通知]: ${name} 离开了房间`;
        this.broadcast(leaveMsg);
        this.recordHistory("系统", leaveMsg, "user");
      }
    }
  }
}