// 类型定义

// AI 相关接口
export interface AiTextGenerationInput {
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface AiTextGenerationOutput {
  response: string;
}

export interface Ai {
  run(model: string, inputs: AiTextGenerationInput): Promise<AiTextGenerationOutput>;
}

// 环境变量接口
export interface Env {
  // DurableObjectNamespace 是全局类型
  AI_ROBOT: DurableObjectNamespace;
  USER_SECRETS: string;
  // 机器人名字，可通过 .dev.vars 配置
  AI_ROBOT_NAME: string;  
  AI: Ai;
}

// WebSocket 附加信息
export interface WebSocketAttachment {
  name: string;
  id: string;
  joinedAt: number;
  lastMessageAt: number;
}

// 聊天记录结构
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}