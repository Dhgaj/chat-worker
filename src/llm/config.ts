// LLM 配置

import { Env } from "../types";
import { 
  OLLAMA_DEFAULT_HOST, 
  OLLAMA_DEFAULT_MODEL,
  OPENAI_DEFAULT_HOST,
  OPENAI_DEFAULT_MODEL,
  GEMINI_DEFAULT_MODEL,
  DEFAULT_AI_PROVIDER,
  AIProvider
} from "../config";
import { AIConfig } from "./types";

// 获取 AI 配置
export function getAIConfig(env: Env): AIConfig {
  const provider = (env.AI_PROVIDER as AIProvider) || DEFAULT_AI_PROVIDER;
  
  return {
    provider,
    cloudflareAI: env.AI,
    ollamaHost: env.OLLAMA_HOST || OLLAMA_DEFAULT_HOST,
    ollamaModel: env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL,
    ollamaApiKey: env.OLLAMA_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiHost: env.OPENAI_HOST || OPENAI_DEFAULT_HOST,
    openaiModel: env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    enableToolCalling: env.ENABLE_TOOL_CALLING !== "false",
  };
}
