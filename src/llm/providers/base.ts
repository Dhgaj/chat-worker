// AI Provider 基础接口

import { AIResponse, LLMMessage, ToolDefinitionForAI } from "../types";

// AI Provider 接口
export interface IAIProvider {
  readonly name: string;
  call(
    messages: LLMMessage[],
    tools?: ToolDefinitionForAI[]
  ): Promise<AIResponse>;
}

// Provider 工厂类型
export type ProviderFactory = (config: any) => IAIProvider;
