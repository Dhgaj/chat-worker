// 类型定义

// Cloudflare AI 相关接口
export interface AiTextGenerationInput {
  messages: { 
    role: string; 
    content: string; 
    tool_call_id?: string;
    tool_calls?: any[];
    name?: string;
  }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: any[];
}

// AI 返回结构
export interface AiTextGenerationOutput {
  response: string;
}

// AI 接口
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
  OLLAMA_API_KEY?: string;
  
  // OpenAI 兼容 API 配置（支持 OpenAI、DeepSeek、通义千问等）
  OPENAI_API_KEY?: string;
  OPENAI_HOST?: string;
  OPENAI_MODEL?: string;
  
  // Google Gemini 配置
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  
  // 功能开关
  ENABLE_TOOL_CALLING?: string;  // "true" | "false"
  
  // 默认时区
  DEFAULT_TIMEZONE?: string;  // 如 "Asia/Shanghai"
  
  // 日志级别: "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE"
  LOG_LEVEL?: string;
}

// WebSocket 附加信息
export interface WebSocketAttachment {
  name: string;
  id: string;
  joinedAt: number;
  lastMessageAt: number;
}

// 工具调用结构（通用）
export interface ToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, any> | string;
  };
}

// 聊天记录结构
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
  /** 是否为临时性消息（构建 AI 上下文时应被过滤） */
  ephemeral?: boolean;
}
