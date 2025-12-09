// Worker 入口

import { Env } from "./types";
import { ChatRoom } from "./chat-room";
import { GLOBAL_ROOM_ID } from "./config";

// 导出 Durable Object 类，以便 Cloudflare 识别
export { ChatRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      const id = env.CHAT_ROOM.idFromName(GLOBAL_ROOM_ID);
      const stub = env.CHAT_ROOM.get(id);

      return stub.fetch(new Request(url.toString().replace("/ws", "/websocket"), request));
    }
    
    return new Response("Chat Server Protected.", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
