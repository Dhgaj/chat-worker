// Worker 入口

import { Env } from "./types";
import { AIRobot } from "./ai-robot";
import { AI_ROBOT_INSTANCE_ID } from "./config";

// 导出 Durable Object 类，以便 Cloudflare 识别
export { AIRobot };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      const id = env.AI_ROBOT.idFromName(AI_ROBOT_INSTANCE_ID);
      const stub = env.AI_ROBOT.get(id);

      return stub.fetch(new Request(url.toString().replace("/ws", "/websocket"), request));
    }
    
    return new Response("Chat Server Protected.", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
