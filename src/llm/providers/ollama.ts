// Ollama AI Provider

import { AIResponse, AIToolCall, LLMMessage, ToolDefinitionForAI } from "../types";
import { IAIProvider } from "./base";

// Ollama 配置接口
export interface OllamaConfig {
  host: string;
  model: string;
  apiKey?: string;
}

// Ollama AI Provider 实现
export class OllamaProvider implements IAIProvider {
  readonly name = "ollama";
  private host: string;
  private model: string;
  private apiKey?: string;

  constructor(config: OllamaConfig) {
    this.host = config.host;
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  async call(
    messages: LLMMessage[],
    tools?: ToolDefinitionForAI[]
  ): Promise<AIResponse> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const isOllamaCloud = this.host.includes("ollama.com");
    
    if (isOllamaCloud) {
      return this.callOllamaCloud(messages, headers);
    } else {
      return this.callOllamaLocal(messages, headers, tools);
    }
  }

  private async callOllamaCloud(
    messages: LLMMessage[],
    headers: Record<string, string>
  ): Promise<AIResponse> {
    const prompt = messages
      .map(m => {
        if (m.role === "system") return `System: ${m.content}`;
        if (m.role === "assistant") return `Assistant: ${m.content}`;
        return `User: ${m.content}`;
      })
      .join("\n\n");

    const response = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama Cloud API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { response?: string };
    return { content: data.response || "" };
  }

  private async callOllamaLocal(
    messages: LLMMessage[],
    headers: Record<string, string>,
    tools?: ToolDefinitionForAI[]
  ): Promise<AIResponse> {
    const requestBody: any = {
      model: this.model,
      messages,
      stream: false,
      options: { temperature: 0.6, num_predict: 256 },
    };
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }
    
    const response = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama API 错误: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { 
      message?: { content?: string; tool_calls?: AIToolCall[] } 
    };
    
    if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
      const toolCalls = data.message.tool_calls.map((tc, idx) => ({
        id: tc.id || `${idx}`,
        function: tc.function,
      }));
      return { content: "", toolCalls };
    }
    
    return { content: data.message?.content || "" };
  }
}
