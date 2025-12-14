// 常量配置

// 允许的最大消息长度
export const MAX_MESSAGE_LENGTH = 4096;
// 速率限制的时间间隔
export const RATE_LIMIT_MS = 1000;
// AI 机器人实例 ID（Durable Object 标识符）
export const AI_ROBOT_INSTANCE_ID = "ai-robot-main";
// 默认机器人名字
export const DEFAULT_ROBOT_NAME = "EMO";
// 记忆大小限制（历史消息条数）
export const MEMORY_MAX_SIZE = 100;
// AI 配置
// AI 提供商类型
export type AIProvider = "cloudflare" | "ollama" | "openai" | "gemini";
// 默认 AI 提供商
export const DEFAULT_AI_PROVIDER: AIProvider = "cloudflare";
// Cloudflare Workers AI 模型
export const CLOUDFLARE_MODEL = "@cf/meta/llama-3-8b-instruct";
// Cloudflare 支持 Function Calling 的模型
// 注：hermes-2-pro-mistral-7b 工具调用不稳定，改用 llama-3.1-8b-instruct
export const CLOUDFLARE_TOOL_MODEL = "@cf/meta/llama-3.1-8b-instruct";
// Ollama 默认配置
export const OLLAMA_DEFAULT_HOST = "http://localhost:11434";
export const OLLAMA_DEFAULT_MODEL = "llama3";
// OpenAI 兼容 API 默认配置（支持 OpenAI、DeepSeek、通义千问等）
export const OPENAI_DEFAULT_HOST = "https://api.openai.com";
export const OPENAI_DEFAULT_MODEL = "gpt-3.5-turbo";
// Google Gemini 默认配置
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
// 默认时区
export const DEFAULT_TIMEZONE = "Asia/Shanghai";


