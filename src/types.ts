// 类型定义

// AI 相关接口
export interface AiTextGenerationInput {
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ToolDefinitionForAI[];
}

export interface AiTextGenerationOutput {
  response: string;
}

export interface Ai {
  run(model: string, inputs: AiTextGenerationInput): Promise<AiTextGenerationOutput>;
}

// Function Calling 相关类型

// 工具定义（发送给 AI）
export interface ToolDefinitionForAI {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

// AI 返回的工具调用
export interface AIToolCall {
  function: {
    name: string;
    arguments: Record<string, any> | string;  // 可能是对象或 JSON 字符串
  };
}

// AI 响应消息（可能包含工具调用）
export interface AIMessage {
  role: string;
  content: string;
  tool_calls?: AIToolCall[];
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
  
  // 功能开关
  ENABLE_TOOL_CALLING?: string;  // "true" | "false"
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
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;  // 用于 tool 角色的消息
}