// 大脑思考核心
// 协调 LLM 调用和工具执行

import { ChatMessage } from "./types";
import { cleanAiResponse } from "./utils";
import { getSystemPrompt } from "./prompts";
import { callAI, AIConfig, AIToolCall, IAIProvider, LLMMessage } from "./llm";
import { getToolDefinitions, executeTool } from "./tools/registry";

export interface ThinkResult {
  answer: string;
  toolMessages: ChatMessage[];
}

// 工具调用执行
async function executeToolCalls(toolCalls: AIToolCall[]): Promise<{
  aiMessages: ChatMessage[];
  memoryMessages: ChatMessage[];
}> {
  const aiMessages: ChatMessage[] = [];
  const memoryMessages: ChatMessage[] = [];
  
  for (const toolCall of toolCalls) {
    // 安全检查
    if (!toolCall?.function?.name) {
      console.warn(`[Brain] 跳过无效的工具调用:`, toolCall);
      continue;
    }
    
    const id = toolCall.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`);
    const name = toolCall.function.name;
    let args = toolCall.function.arguments || {};
    
    if (typeof args === "string") {
      try { args = JSON.parse(args); } catch { args = {}; }
    }
    
    try {
      const result = await executeTool(name, args as Record<string, any>);
      const content = typeof result === "string" ? result : JSON.stringify(result);
      
      aiMessages.push({
        role: "tool",
        content,
        name,
        tool_call_id: id,
        tool_name: name,
      });
      
      memoryMessages.push({
        role: "tool",
        content,
        name,
        tool_call_id: id,
        tool_name: name,
      });
      
      console.log(`[Brain] 工具 ${name} 执行结果:`, result);
    } catch (error) {
      const err = error as Error;
      const failureText = `[${name}] 执行失败 - ${err.message}`;
      
      aiMessages.push({
        role: "tool",
        content: failureText,
        name,
        tool_call_id: id,
        tool_name: name,
      });
      
      memoryMessages.push({
        role: "tool",
        content: failureText,
        name,
        tool_call_id: id,
        tool_name: name,
      });
      
      console.error(`[Brain] 工具 ${name} 执行失败:`, err);
    }
  }
  
  return { aiMessages, memoryMessages };
}

// 思考 - 主入口
export async function think(
  config: AIConfig,
  provider: IAIProvider,
  userName: string,
  history: ChatMessage[],
  robotName: string
): Promise<ThinkResult> {
  try {
    const hasToolCalling = config.enableToolCalling ?? true;
    const tools = hasToolCalling ? getToolDefinitions() : undefined;
    
    const systemPrompt = getSystemPrompt({ userName, robotName, hasToolCalling });
    
    const messagesToSend: LLMMessage[] = [
      { role: "system" as const, content: systemPrompt },
      ...history,
    ];

    console.log(`*** AI Request [${config.provider}] ***`);
    console.log(`[Brain] 工具调用: ${hasToolCalling ? "启用" : "禁用"}`);
    
    // 第一次调用：可能返回工具调用
    let response = await callAI(provider, messagesToSend, tools);
    const toolMessagesToPersist: ChatMessage[] = [];
    
    // 如果有工具调用，执行工具并进行第二次调用
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCalls = response.toolCalls.map((tc, idx) => ({
        ...tc,
        id: tc.id || (crypto.randomUUID ? crypto.randomUUID() : `tool-${idx}`),
      }));
      
      const toolNames = toolCalls
        .filter(tc => tc?.function?.name)
        .map(tc => tc.function.name);
      
      console.log(`[Brain] AI 请求调用工具:`, toolNames);
      
      const assistantToolMessage: ChatMessage = {
        role: "assistant",
        content: "",
        tool_calls: toolCalls,
        name: robotName,
      };
      
      const { aiMessages, memoryMessages } = await executeToolCalls(toolCalls);
      toolMessagesToPersist.push(...memoryMessages);
      
      // 构建工具结果摘要
      const toolResultsSummary = memoryMessages
        .map(m => `${m.tool_name || m.name}: ${m.content}`)
        .join("\n");
      
      // 对于 Cloudflare 模型，使用简化的消息格式（用户消息告知工具结果）
      const messagesWithToolResult: LLMMessage[] = [
        ...messagesToSend,
        { 
          role: "user" as const, 
          content: `[系统信息] 工具调用结果:\n${toolResultsSummary}\n\n请根据以上工具返回的信息回答用户的问题，不要提及你调用了工具。` 
        },
      ];
      
      response = await callAI(provider, messagesWithToolResult, undefined);
    }

    console.log(`[Raw AI Response]: ${response.content}`);
    const cleaned = cleanAiResponse(response.content);
    return { answer: cleaned || "Hmm... 我好像没听清。", toolMessages: toolMessagesToPersist };

  } catch (error) {
    const err = error as Error;
    console.error("AI Error:", err);
    return { answer: `(AI 连接打瞌睡了: ${err.message})`, toolMessages: [] };
  }
}

// 导出 Memory 和配置
export { Memory } from "./memory";
export { getAIConfig, createProvider } from "./llm";
export type { AIConfig, IAIProvider } from "./llm";
