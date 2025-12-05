import { DurableObject } from "cloudflare:workers";

export interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace;
  USER_SECRETS: string;
}

interface WebSocketAttachment {
  name: string;
  id: string;
  joinedAt: number;
}

export class MyDurableObject extends DurableObject<Env> {
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
      this.broadcast(`[系统通知]: 欢迎 ${name} 加入房间！`);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Durable Object Active", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachmentStr = ws.deserializeAttachment();
    if (!attachmentStr) return;
    const { name } = JSON.parse(attachmentStr as string);
    this.broadcast(`[${name}]: ${message}`);
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

