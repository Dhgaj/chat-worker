// Cloudflare Workers AI Provider

import { CLOUDFLARE_MODEL, CLOUDFLARE_TOOL_MODEL } from "../../config";
import { AIResponse, AIToolCall, LLMMessage, ToolDefinitionForAI } from "../types";
import { IAIProvider } from "./base";

// Cloudflare AI 配置接口
export interface CloudflareConfig {
  ai: any; // Cloudflare AI binding
}

// Cloudflare 需要的工具格式（扁平结构，不同于 OpenAI 的嵌套结构）
interface CloudflareTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

// 将 OpenAI 格式转换为 Cloudflare 格式
function convertToCloudflareFormat(tools: ToolDefinitionForAI[]): CloudflareTool[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

// Cloudflare AI Provider 实现
export class CloudflareProvider implements IAIProvider {
  readonly name = "cloudflare";
  private ai: any;

  constructor(config: CloudflareConfig) {
    this.ai = config.ai;
  }

  async call(
    messages: LLMMessage[],
    tools?: ToolDefinitionForAI[]
  ): Promise<AIResponse> {
    const model = tools && tools.length > 0 ? CLOUDFLARE_TOOL_MODEL : CLOUDFLARE_MODEL;
    
    // 转换为 Cloudflare 扁平格式
    const cloudflareTools = tools && tools.length > 0 
      ? convertToCloudflareFormat(tools) 
      : undefined;
    
    console.log(`[Cloudflare] 使用模型: ${model}`);
    console.log(`[Cloudflare] 工具数量: ${cloudflareTools?.length || 0}`);
    if (cloudflareTools) {
      console.log(`[Cloudflare] 工具定义:`, JSON.stringify(cloudflareTools, null, 2));
    }
    
    const response = await this.ai.run(model, {
      messages: messages as any,
      temperature: 0.6,
      max_tokens: 256,
      tools: cloudflareTools,
    });
    
    console.log(`[Cloudflare] 原始响应:`, JSON.stringify(response));
    
    const responseAny = response as any;
    
    // Cloudflare 的 tool_calls 结构：{ name, arguments }
    if (responseAny.tool_calls && responseAny.tool_calls.length > 0) {
      const toolCalls: AIToolCall[] = responseAny.tool_calls
        .filter((tc: any) => tc && tc.name)
        .map((tc: any) => ({
          id: tc.id || `tool-${Date.now()}`,
          function: {
            name: tc.name,
            arguments: tc.arguments || {},
          },
        }));
      
      if (toolCalls.length > 0) {
        console.log(`[Cloudflare] 检测到工具调用:`, toolCalls.map(tc => tc.function.name));
        return { content: "", toolCalls };
      }
    }
    
    return { content: response.response || "" };
  }
}
