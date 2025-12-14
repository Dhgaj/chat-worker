// Durable Object (连接保持、鉴权) [身体]
/// <reference types="@cloudflare/workers-types" />
import { Env, WebSocketAttachment } from "./types";
import { MAX_MESSAGE_LENGTH, RATE_LIMIT_MS, DEFAULT_ROBOT_NAME, MEMORY_MAX_SIZE, DEFAULT_TIMEZONE } from "./config";
import { decodeMessage } from "./utils";
import { Memory, think, getAIConfig, AIConfig, createProvider, IAIProvider, ToolContext } from "./brain";
import { loggers, setLogLevel } from "./logger";

const log = loggers.robot;

// 扩展 WebSocket 类型以包含自定义方法
declare global {
  interface WebSocket {
    serializeAttachment(attachment: string): void;
    deserializeAttachment(): string | null;
  }
}

// Durable Object: Robot
export class Robot implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private memory: Memory;
  private aiConfig: AIConfig;
  private initialized: boolean = false;
  private provider: IAIProvider;
  private replyChain: Promise<void> = Promise.resolve();

  // 构造函数
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // 设置日志级别
    if (env.LOG_LEVEL) {
      setLogLevel(env.LOG_LEVEL);
    }
    
    this.memory = new Memory(MEMORY_MAX_SIZE);
    this.aiConfig = getAIConfig(env);
    this.provider = createProvider(this.aiConfig);
    
    // 绑定持久化存储
    this.memory.bindStorage(state.storage);
    
    log.info(`AI 提供商: ${this.aiConfig.provider}`);
  }

  // 确保记忆已加载
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.memory.load();
    this.initialized = true;
  }

  // 获取机器人名字
  private get name(): string {
    return this.env.AI_ROBOT_NAME || DEFAULT_ROBOT_NAME;
  }

  // 拒绝连接
  private rejectWebSocket(reason: string): Response {
    const webSocketPair = new WebSocketPair();
    const [client, server] = [webSocketPair[0], webSocketPair[1]];
    this.state.acceptWebSocket(server);
    server.send(`[连接拒绝]: ${reason}`);
    server.close(1008, reason);
    return new Response(null, { status: 101, webSocket: client });
  }

  // 鉴权
  private authenticate(name: string, secret: string | null): string | null {
    if (!this.env.USER_SECRETS) {
      return "系统严重错误: 管理员未配置 USER_SECRETS 环境变量";
    }

    let allowedUsers: Record<string, string>;
    try {
      allowedUsers = JSON.parse(this.env.USER_SECRETS);
    } catch {
      return "服务器配置错误: USER_SECRETS 格式无效";
    }

    if (!allowedUsers.hasOwnProperty(name)) {
      return `用户 '${name}' 不在名单中`;
    }
    if (secret !== allowedUsers[name]) {
      return "密码错误";
    }

    return null; // 鉴权通过
  }

  // HTTP 请求处理入口
  async fetch(request: Request): Promise<Response> {
    // 确保记忆已加载
    await this.ensureInitialized();
    
    const url = new URL(request.url);

    if (url.pathname !== "/websocket") {
      return new Response("EMO Robot Running. 🤖", { status: 200 });
    }

    const params = url.searchParams;
    const userName = params.get("name");
    const secret = params.get("secret");

    if (!userName) {
      return this.rejectWebSocket("必须提供 'name' 参数");
    }

    // 鉴权
    const authError = this.authenticate(userName, secret);
    if (authError) {
      return this.rejectWebSocket(authError);
    }

    // 检查是否已有活跃连接
    if (this.state.getWebSockets().length > 0) {
      return this.rejectWebSocket("当前机器人正在与其他用户对话中，请稍后再试");
    }

    // 接受连接
    const webSocketPair = new WebSocketPair();
    const [client, server] = [webSocketPair[0], webSocketPair[1]];

    const attachment: WebSocketAttachment = {
      name: userName,
      id: crypto.randomUUID(),
      joinedAt: Date.now(),
      lastMessageAt: 0,
    };

    server.serializeAttachment(JSON.stringify(attachment));
    this.state.acceptWebSocket(server);

    // 欢迎消息
    await this.memory.addAndSave("系统", `${userName} 已连接`, "user");
    server.send(`[${this.name}]: 你好 ${userName}！我是你的 AI 助手 ${this.name}。有什么我可以帮你的吗？`);

    return new Response(null, { status: 101, webSocket: client });
  }

  // WebSocket 消息处理
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (!attachmentStr) return;

    const attachment = JSON.parse(attachmentStr) as WebSocketAttachment;
    const { name, lastMessageAt } = attachment;

    // 速率限制
    const now = Date.now();
    if (now - lastMessageAt < RATE_LIMIT_MS) {
      ws.send("[系统提示]: 说话太快了，请休息一下。");
      return;
    }

    // 更新最后消息时间
    attachment.lastMessageAt = now;
    ws.serializeAttachment(JSON.stringify(attachment));

    const userMsg = decodeMessage(message).trim();

    // 消息验证
    if (!userMsg) {
      ws.send("[系统提示]: 消息不能为空。");
      return;
    }
    if (userMsg.length > MAX_MESSAGE_LENGTH) {
      ws.send("[系统提示]: 消息过长。");
      return;
    }

    // 记录用户消息
    await this.memory.addAndSave(name, userMsg, "user");

    // 处理 AI 回复
    this.enqueueReply(name, ws);
  }

  // 串行化回复，避免并发导致顺序错乱
  private enqueueReply(userName: string, ws: WebSocket): void {
    this.replyChain = this.replyChain
      .then(() => this.reply(userName, ws))
      .catch(err => console.error("replyChain error:", err));
    this.state.waitUntil(this.replyChain);
  }

  // 生成回复
  private async reply(userName: string, ws: WebSocket): Promise<void> {
    try {
      // 构建工具上下文
      const toolContext: ToolContext = {
        defaultTimezone: this.env.DEFAULT_TIMEZONE || DEFAULT_TIMEZONE,
      };

      const { answer, toolMessages } = await think(
        this.aiConfig,
        this.provider,
        userName,
        this.memory.getHistoryForContext(), // 使用过滤后的历史（排除临时性消息）
        this.name,
        toolContext
      );

      // 保存工具消息（包含 ephemeral 标记，便于调试/审计）
      for (const msg of toolMessages) {
        await this.memory.addAndSave(
          msg.name || msg.tool_name || "tool",
          msg.content,
          msg.role,
          {
            tool_call_id: msg.tool_call_id,
            tool_name: msg.tool_name,
            ephemeral: msg.ephemeral,
          }
        );
      }

      // 保存 AI 的最终回答
      await this.memory.addAndSave(this.name, answer, "assistant");
      ws.send(`[${this.name}]: ${answer}`);
    } catch (error) {
      const err = error as Error;
      log.error("AI 处理错误", err.message);
      ws.send("[系统]: 抱歉，AI 处理请求时出错了，请稍后再试。");
    }
  }

  // 连接关闭
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (attachmentStr) {
      const { name } = JSON.parse(attachmentStr) as WebSocketAttachment;
      const reasonText = this.getCloseReason(code, reason);
      log.info(`用户 ${name} 已断开连接`, reasonText);
      await this.memory.addAndSave("系统", `${name} 已断开连接`, "user");
    }
  }

  // 解析 WebSocket 关闭原因
  private getCloseReason(code: number, reason: string): string {
    if (reason) return `代码: ${code}, 原因: ${reason}`;
    
    const codeReasons: Record<number, string> = {
      1000: "正常关闭",
      1001: "客户端离开（如页面关闭）",
      1002: "协议错误",
      1003: "不支持的数据类型",
      1005: "客户端主动断开",
      1006: "异常断开（网络问题）",
      1008: "策略违规",
      1009: "消息过大",
      1011: "服务器错误",
    };
    
    return codeReasons[code] || `未知关闭码: ${code}`;
  }
}
