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
  AI_ROBOT: DurableObjectNamespace;
  USER_SECRETS: string;
  AI_ROBOT_NAME: string;
  AI: Ai;
  
  // AI 提供商配置: "cloudflare" | "ollama" | "openai" | "gemini"
  AI_PROVIDER?: string;
  
  // Ollama 配置
  OLLAMA_HOST?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_API_KEY?: string;      // 可选，用于需要认证的 Ollama 服务
  
  // OpenAI 兼容 API 配置（支持 OpenAI、DeepSeek、通义千问等）
  OPENAI_API_KEY?: string;
  OPENAI_HOST?: string;
  OPENAI_MODEL?: string;
  
  // Google Gemini 配置
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
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