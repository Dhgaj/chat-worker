// LLM 统一调用入口

import { AIConfig, AIResponse, LLMMessage, ToolDefinitionForAI } from "./types";
import { 
  IAIProvider,
  CloudflareProvider,
  OllamaProvider,
  OpenAIProvider,
  GeminiProvider
} from "./providers";

// 创建 AI Provider 实例
export function createProvider(config: AIConfig): IAIProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider({
        host: config.ollamaHost!,
        model: config.ollamaModel!,
        apiKey: config.ollamaApiKey,
      });
    
    case "openai":
      if (!config.openaiApiKey) {
        throw new Error("OpenAI API Key 未配置");
      }
      return new OpenAIProvider({
        host: config.openaiHost!,
        apiKey: config.openaiApiKey,
        model: config.openaiModel!,
      });
    
    case "gemini":
      if (!config.geminiApiKey) {
        throw new Error("Gemini API Key 未配置");
      }
      return new GeminiProvider({
        apiKey: config.geminiApiKey,
        model: config.geminiModel!,
      });
    
    case "cloudflare":
    default:
      if (!config.cloudflareAI) {
        throw new Error("Cloudflare AI 未配置");
      }
      return new CloudflareProvider({
        ai: config.cloudflareAI,
      });
  }
}

// 统一 AI 调用接口
export async function callAI(
  provider: IAIProvider,
  messages: LLMMessage[],
  tools?: ToolDefinitionForAI[]
): Promise<AIResponse> {
  return provider.call(messages, tools);
}

// 导出类型和配置
export type { AIConfig, AIResponse, AIToolCall, LLMMessage, ToolDefinitionForAI } from "./types";
export { getAIConfig } from "./config";
export type { IAIProvider } from "./providers";
