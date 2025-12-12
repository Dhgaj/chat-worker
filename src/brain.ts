// [大脑] 思考核心、记忆管理
import { Ai, ChatMessage, Env, AIToolCall, ToolDefinitionForAI } from "./types";
import { 
  CLOUDFLARE_MODEL, 
  CLOUDFLARE_TOOL_MODEL,
  OLLAMA_DEFAULT_HOST, 
  OLLAMA_DEFAULT_MODEL,
  OPENAI_DEFAULT_HOST,
  OPENAI_DEFAULT_MODEL,
  GEMINI_DEFAULT_MODEL,
  DEFAULT_AI_PROVIDER,
  AIProvider
} from "./config";
import { cleanAiResponse } from "./utils";
import { getSystemPrompt } from "./prompts";
import { getToolDefinitions, executeTool } from "./tools";

// 存储键名
const MEMORY_STORAGE_KEY = "chat_history";

// 记忆管理器
export class Memory {
  private history: ChatMessage[] = [];
  private maxSize: number;
  private storage: DurableObjectStorage | null = null;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  // 绑定持久化存储（由 Robot 调用）
  bindStorage(storage: DurableObjectStorage): void {
    this.storage = storage;
  }

  // 从存储加载记忆
  async load(): Promise<void> {
    if (!this.storage) return;
    
    const stored = await this.storage.get<ChatMessage[]>(MEMORY_STORAGE_KEY);
    if (stored) {
      this.history = stored;
      console.log(`[Memory] 已加载 ${this.history.length} 条历史记录`);
    }
  }

  // 保存记忆到存储
  async save(): Promise<void> {
    if (!this.storage) return;
    
    await this.storage.put(MEMORY_STORAGE_KEY, this.history);
  }

  // 添加记录
  add(name: string, content: string, role: "user" | "assistant"): void {
    const finalContent = role === "user" ? `[${name}]: ${content}` : content;
    this.history.push({ role, content: finalContent });
    
    // 保持记忆大小限制
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
    }
  }

  // 添加记录并自动保存
  async addAndSave(name: string, content: string, role: "user" | "assistant"): Promise<void> {
    this.add(name, content, role);
    await this.save();
  }

  // 获取历史记录
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  // 获取记录数量
  getSize(): number {
    return this.history.length;
  }

  // 清空记忆
  async clear(): Promise<void> {
    this.history = [];
    await this.save();
  }
}

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

// AI 响应结构
interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
}

// AI 调用函数
async function callCloudflareAI(
  ai: Ai,
  messages: { role: string; content: string }[],
  tools?: ToolDefinitionForAI[]
): Promise<AIResponse> {
  const model = tools && tools.length > 0 ? CLOUDFLARE_TOOL_MODEL : CLOUDFLARE_MODEL;
  
  const response = await ai.run(model, {
    messages: messages as any,
    temperature: 0.6,
    max_tokens: 256,
    tools: tools as any,
  });
  
  const responseAny = response as any;
  
  // Cloudflare 的 tool_calls 结构可能不同，需要做转换
  if (responseAny.tool_calls && responseAny.tool_calls.length > 0) {
    const toolCalls: AIToolCall[] = responseAny.tool_calls
      .filter((tc: any) => tc && tc.name) // 过滤无效的工具调用
      .map((tc: any) => ({
        function: {
          name: tc.name,
          arguments: tc.arguments || {},
        },
      }));
    
    if (toolCalls.length > 0) {
      return { content: "", toolCalls };
    }
  }
  
  return { content: response.response || "" };
}

async function callOllamaAI(
  host: string,
  model: string,
  messages: { role: string; content: string }[],
  apiKey?: string,
  tools?: ToolDefinitionForAI[]
): Promise<AIResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const isOllamaCloud = host.includes("ollama.com");
  
  if (isOllamaCloud) {
    const prompt = messages
      .map(m => {
        if (m.role === "system") return `System: ${m.content}`;
        if (m.role === "assistant") return `Assistant: ${m.content}`;
        return `User: ${m.content}`;
      })
      .join("\n\n");

    const response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama Cloud API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { response?: string };
    return { content: data.response || "" };
  } else {
    const requestBody: any = {
      model,
      messages,
      stream: false,
      options: { temperature: 0.6, num_predict: 256 },
    };
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }
    
    const response = await fetch(`${host}/api/chat`, {
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
      return { content: "", toolCalls: data.message.tool_calls };
    }
    
    return { content: data.message?.content || "" };
  }
}

async function callOpenAI(
  host: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  tools?: ToolDefinitionForAI[]
): Promise<AIResponse> {
  const requestBody: any = {
    model,
    messages,
    temperature: 0.6,
    max_tokens: 256,
  };
  
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }
  
  const response = await fetch(`${host}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
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
        function: {
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        },
      })),
    };
  }
  
  return { content: message?.content || "" };
}

async function callGeminiAI(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
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
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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


// 统一 AI 调用接口
async function callAI(
  config: AIConfig,
  messages: { role: string; content: string }[],
  tools?: ToolDefinitionForAI[]
): Promise<AIResponse> {
  if (config.provider === "ollama") {
    return callOllamaAI(config.ollamaHost!, config.ollamaModel!, messages, config.ollamaApiKey, tools);
  } else if (config.provider === "openai") {
    if (!config.openaiApiKey) throw new Error("OpenAI API Key 未配置");
    return callOpenAI(config.openaiHost!, config.openaiApiKey, config.openaiModel!, messages, tools);
  } else if (config.provider === "gemini") {
    if (!config.geminiApiKey) throw new Error("Gemini API Key 未配置");
    return callGeminiAI(config.geminiApiKey, config.geminiModel!, messages, tools);
  } else {
    if (!config.cloudflareAI) throw new Error("Cloudflare AI 未配置");
    return callCloudflareAI(config.cloudflareAI, messages, tools);
  }
}

// 工具调用执行
async function executeToolCalls(toolCalls: AIToolCall[]): Promise<string> {
  const results: string[] = [];
  
  for (const toolCall of toolCalls) {
    // 安全检查
    if (!toolCall?.function?.name) {
      console.warn(`[Brain] 跳过无效的工具调用:`, toolCall);
      continue;
    }
    
    const name = toolCall.function.name;
    let args = toolCall.function.arguments || {};
    
    if (typeof args === "string") {
      try { args = JSON.parse(args); } catch { args = {}; }
    }
    
    try {
      const result = await executeTool(name, args as Record<string, any>);
      results.push(`[${name}]: ${result}`);
      console.log(`[Brain] 工具 ${name} 执行结果:`, result);
    } catch (error) {
      const err = error as Error;
      results.push(`[${name}]: 执行失败 - ${err.message}`);
      console.error(`[Brain] 工具 ${name} 执行失败:`, err);
    }
  }
  
  return results.join("\n");
}

// 思考 - 主入口
export async function think(
  config: AIConfig,
  userName: string,
  history: ChatMessage[],
  robotName: string
): Promise<string> {
  try {
    const hasToolCalling = config.enableToolCalling ?? true;
    const tools = hasToolCalling ? getToolDefinitions() : undefined;
    
    const systemPrompt = getSystemPrompt({ userName, robotName, hasToolCalling });
    
    const messagesToSend = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    console.log(`*** AI Request [${config.provider}] ***`);
    console.log(`[Brain] 工具调用: ${hasToolCalling ? "启用" : "禁用"}`);
    
    // 第一次调用：可能返回工具调用
    let response = await callAI(config, messagesToSend, tools);
    
    // 如果有工具调用，执行工具并进行第二次调用
    if (response.toolCalls && response.toolCalls.length > 0) {
      // 安全获取工具名称
      const toolNames = response.toolCalls
        .filter(tc => tc?.function?.name)
        .map(tc => tc.function.name);
      
      console.log(`[Brain] AI 请求调用工具:`, toolNames);
      
      if (toolNames.length > 0) {
        const toolResults = await executeToolCalls(response.toolCalls);
        
        const messagesWithToolResult = [
          ...messagesToSend,
          { role: "assistant", content: "我需要查询一些信息..." },
          { role: "user", content: `[工具调用结果]\n${toolResults}\n\n请根据以上信息回答用户的问题。` },
        ];
        
        response = await callAI(config, messagesWithToolResult, undefined);
      }
    }

    console.log(`[Raw AI Response]: ${response.content}`);
    const cleaned = cleanAiResponse(response.content);
    return cleaned || "Hmm... 我好像没听清。";

  } catch (error) {
    const err = error as Error;
    console.error("AI Error:", err);
    return `(AI 连接打瞌睡了: ${err.message})`;
  }
}
