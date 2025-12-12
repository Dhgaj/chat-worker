// [大脑] 思考核心、记忆管理
import { Ai, ChatMessage, Env } from "./types";
import { 
  CLOUDFLARE_MODEL, 
  OLLAMA_DEFAULT_HOST, 
  OLLAMA_DEFAULT_MODEL,
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
}

// 从环境变量构建 AI 配置
export function getAIConfig(env: Env): AIConfig {
  const provider = (env.AI_PROVIDER as AIProvider) || DEFAULT_AI_PROVIDER;
  
  return {
    provider,
    cloudflareAI: env.AI,
    ollamaHost: env.OLLAMA_HOST || OLLAMA_DEFAULT_HOST,
    ollamaModel: env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL,
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

// 调用 Ollama API
async function callOllamaAI(
  host: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
