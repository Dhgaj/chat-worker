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
  CHAT_ROOM: DurableObjectNamespace;
  USER_SECRETS: string;
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