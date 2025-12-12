// [大脑] 思考核心、记忆管理
import { Ai, ChatMessage, Env } from "./types";
import { 
  CLOUDFLARE_MODEL, 
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

// AI 调用

// AI 配置接口
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
}

// 从环境变量构建 AI 配置
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
  };
}

// 调用 Cloudflare Workers AI
async function callCloudflareAI(
  ai: Ai,
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await ai.run(CLOUDFLARE_MODEL, {
    messages: messages as any,
    temperature: 0.6,
    max_tokens: 256,
  });
  return response.response || "";
}

// 调用 Ollama API（支持本地和云端）
async function callOllamaAI(
  host: string,
  model: string,
  messages: { role: string; content: string }[],
  apiKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  // 如果有 API Key，添加认证头
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // 判断是否是 Ollama 官方云端 API
  const isOllamaCloud = host.includes("ollama.com");
  
  let response: Response;
  
  if (isOllamaCloud) {
    // Ollama 云端 API 使用 /api/generate 和 prompt 格式
    // 将 messages 转换为单个 prompt
    const prompt = messages
      .map(m => {
        if (m.role === "system") return `System: ${m.content}`;
        if (m.role === "assistant") return `Assistant: ${m.content}`;
        return `User: ${m.content}`;
      })
      .join("\n\n");

    response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama Cloud API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { response?: string };
    return data.response || "";
  } else {
    // 本地/自托管 Ollama 使用 /api/chat 和 messages 格式
    response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.6,
          num_predict: 256,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API 错误: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { message?: { content?: string } };
    return data.message?.content || "";
  }
}

// 调用 OpenAI 兼容 API（支持 OpenAI、DeepSeek、通义千问等）
async function callOpenAI(
  host: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await fetch(`${host}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API 错误: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content || "";
}

// 调用 Google Gemini API
async function callGeminiAI(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  // Gemini API 格式转换：将 OpenAI 格式转为 Gemini 格式
  const contents = messages
    .filter(m => m.role !== "system") // system 消息单独处理
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
  
  // 提取 system 消息作为 systemInstruction
  const systemMessage = messages.find(m => m.role === "system");
  
  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 256,
    }
  };
  
  if (systemMessage) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMessage.content }]
    };
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
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// 思考 - 调用 AI 生成回复
export async function think(
  config: AIConfig,
  userName: string,
  history: ChatMessage[],
  robotName: string
): Promise<string> {
  try {
    const now = new Date();
    const timeString = now.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });

    const systemPrompt = getSystemPrompt({ timeString, userName, robotName });
    
    const messagesToSend = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    console.log(`*** AI Request [${config.provider}] ***`);
    
    let rawResponse: string;
    
    if (config.provider === "ollama") {
      rawResponse = await callOllamaAI(
        config.ollamaHost!,
        config.ollamaModel!,
        messagesToSend,
        config.ollamaApiKey
      );
    } else if (config.provider === "openai") {
      if (!config.openaiApiKey) {
        throw new Error("OpenAI API Key 未配置");
      }
      rawResponse = await callOpenAI(
        config.openaiHost!,
        config.openaiApiKey,
        config.openaiModel!,
        messagesToSend
      );
    } else if (config.provider === "gemini") {
      if (!config.geminiApiKey) {
        throw new Error("Gemini API Key 未配置");
      }
      rawResponse = await callGeminiAI(
        config.geminiApiKey,
        config.geminiModel!,
        messagesToSend
      );
    } else {
      // 默认使用 Cloudflare
      if (!config.cloudflareAI) {
        throw new Error("Cloudflare AI 未配置");
      }
      rawResponse = await callCloudflareAI(config.cloudflareAI, messagesToSend);
    }

    console.log(`[Raw AI Response]: ${rawResponse}`);

    const cleaned = cleanAiResponse(rawResponse);
    return cleaned || "Hmm... 我好像没听清。";

  } catch (error) {
    const err = error as Error;
    console.error("AI Error:", err);
    return `(AI 连接打瞌睡了: ${err.message})`;
  }
}
