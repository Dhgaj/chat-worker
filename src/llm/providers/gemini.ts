// Google Gemini AI Provider

import { AIResponse, LLMMessage, ToolDefinitionForAI } from "../types";
import { IAIProvider } from "./base";

// Gemini 配置接口
export interface GeminiConfig {
  apiKey: string;
  model: string;
}

// Gemini Provider 实现
export class GeminiProvider implements IAIProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async call(
    messages: LLMMessage[],
    tools?: ToolDefinitionForAI[]
  ): Promise<AIResponse> {
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));
    
    const systemMessage = messages.find(m => m.role === "system");
    
    const requestBody: any = {
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 256 }
    };
    
    if (systemMessage) {
      requestBody.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }
    
    if (tools && tools.length > 0) {
      requestBody.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: { 
        content?: { 
          parts?: { text?: string; functionCall?: { name: string; args: Record<string, any> } }[] 
        } 
      }[];
    };
    
    const parts = data.candidates?.[0]?.content?.parts;
    
    if (parts) {
      for (const part of parts) {
        if (part.functionCall) {
          return {
            content: "",
            toolCalls: [{
              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
              function: {
                name: part.functionCall.name,
                arguments: part.functionCall.args,
              },
            }],
          };
        }
      }
    }
    
    return { content: parts?.[0]?.text || "" };
  }
}
