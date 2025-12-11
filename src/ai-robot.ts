// AI 机器人核心类
/// <reference types="@cloudflare/workers-types" />
import { Env, ChatMessage, WebSocketAttachment } from "./types";
import { MAX_MESSAGE_LENGTH, RATE_LIMIT_MS, DEFAULT_ROBOT_NAME } from "./config";
import { decodeMessage } from "./utils";
import { askJarvis } from "./ai";

// 扩展 WebSocket 类型以包含自定义方法
declare global {
  interface WebSocket {
    serializeAttachment(attachment: string): void;
    deserializeAttachment(): string | null;
  }
}

export class AIRobot implements DurableObject {
  history: ChatMessage[] = [];

  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // 获取机器人名字（从环境变量或使用默认值）
  private getRobotName(): string {
    return this.env.AI_ROBOT_NAME || DEFAULT_ROBOT_NAME;
  }

  // 拒绝连接辅助函数
  rejectWebSocket(reason: string): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = [webSocketPair[0], webSocketPair[1]];
    this.state.acceptWebSocket(server);
    server.send(`[连接拒绝]: ${reason}`);
    server.close(1008, reason);
    return new Response(null, { status: 101, webSocket: client });
  }

  // HTTP 请求处理入口
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

    // 检查是否已有活跃连接
    const activeConnections = this.state.getWebSockets();
    if (activeConnections.length > 0) {
      return this.rejectWebSocket("当前机器人正在与其他用户对话中，请稍后再试");
    }

    // 接受连接
    const webSocketPair = new WebSocketPair();
    const [client, server] = [webSocketPair[0], webSocketPair[1]];

    const initialAttachment: WebSocketAttachment = {
      name: name!,
      id: crypto.randomUUID(),
      joinedAt: Date.now(),
      lastMessageAt: 0 
    };

    server.serializeAttachment(JSON.stringify(initialAttachment));
    this.state.acceptWebSocket(server);
    
    // 发送欢迎消息
    const robotName = this.getRobotName();
    this.recordHistory("系统", `${name} 已连接`, "user");
    server.send(`[${robotName}]: 你好 ${name}！我是你的 AI 助手 ${robotName}。有什么我可以帮你的吗？`);

    return new Response(null, { status: 101, webSocket: client });
  }

  // 记录对话历史
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

    // 消息验证
    if (!trimmed) { ws.send("[系统提示]: 消息不能为空。"); return; }
    if (trimmed.length > MAX_MESSAGE_LENGTH) { ws.send(`[系统提示]: 消息过长。`); return; }

    // 记录用户消息
    this.recordHistory(name, trimmed, "user");

      // 处理 AI 回复
    this.state.waitUntil(this.handleAiReply(name, trimmed, ws));
  }

  // 处理 AI 回复的辅助方法
  async handleAiReply(name: string, question: string, ws: WebSocket): Promise<void> {
    try {
      const robotName = this.getRobotName();
      const answer = await askJarvis(this.env.AI, name, this.history, robotName);
      this.recordHistory(robotName, answer, "assistant");
      ws.send(`[${robotName}]: ${answer}`);
    } catch (error) {
      console.error("AI 处理错误:", error);
      ws.send("[系统]: 抱歉，AI 处理请求时出错了，请稍后再试。");
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (attachmentStr) {
      const { name } = JSON.parse(attachmentStr) as WebSocketAttachment;
      console.log(`用户 ${name} 已断开连接，代码: ${code}, 原因: ${reason}`);
      this.recordHistory("系统", `${name} 已断开连接`, "user");
    }
  }
}