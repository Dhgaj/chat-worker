// LLM 类型定义

import { AIProvider } from "../config";
import { Ai, ToolCall } from "../types";

// AI 配置
export interface AIConfig {
  provider: AIProvider;
  cloudflareAI?: Ai;
  ollamaHost?: string;
  ollamaModel?: string;
  ollamaApiKey?: string;
  openaiApiKey?: string;
  openaiHost?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  enableToolCalling?: boolean;
}

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
export type AIToolCall = ToolCall;

// AI 响应结构
export interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
}

// 消息格式
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
}
