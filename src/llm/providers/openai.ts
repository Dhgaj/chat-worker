// OpenAI 兼容 API Provider
// 支持 OpenAI、DeepSeek、通义千问等兼容 API

import { AIResponse, LLMMessage, ToolDefinitionForAI } from "../types";
import { IAIProvider } from "./base";

// OpenAI 配置接口
export interface OpenAIConfig {
  host: string;
  apiKey: string;
  model: string;
}

// OpenAI Provider 实现
export class OpenAIProvider implements IAIProvider {
  readonly name = "openai";
  private host: string;
  private apiKey: string;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.host = config.host;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async call(
    messages: LLMMessage[],
    tools?: ToolDefinitionForAI[]
  ): Promise<AIResponse> {
    const requestBody: any = {
      model: this.model,
      messages,
      temperature: 0.6,
      max_tokens: 256,
    };
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }
    
    const response = await fetch(`${this.host}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      choices?: { 
        message?: { 
          content?: string;
          tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
        } 
      }[];
    };
    
    const message = data.choices?.[0]?.message;
    
    if (message?.tool_calls && message.tool_calls.length > 0) {
      return {
        content: "",
        toolCalls: message.tool_calls.map(tc => ({
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: (() => {
              try {
                return JSON.parse(tc.function.arguments);
              } catch {
                return tc.function.arguments;
              }
            })(),
          },
        })),
      };
    }
    
    return { content: message?.content || "" };
  }
}
