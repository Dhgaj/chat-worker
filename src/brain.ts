// [大脑] 思考核心、记忆管理
import { Ai, ChatMessage } from "./types";
import { AI_MODEL } from "./config";
import { cleanAiResponse } from "./utils";
import { getSystemPrompt } from "./prompts";

// 记忆管理器
export class Memory {
  private history: ChatMessage[] = [];
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
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

  // 获取历史记录
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  // 清空记忆
  clear(): void {
    this.history = [];
  }
}

// 思考 - 调用 AI 生成回复
export async function think(
  ai: Ai,
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

    console.log("*** AI Request ***");
    
    const response = await ai.run(AI_MODEL, {
      messages: messagesToSend as any,
      temperature: 0.6,
      max_tokens: 256,
    });

    const rawResponse = response.response || "";
    console.log(`[Raw AI Response]: ${rawResponse}`);

    const cleaned = cleanAiResponse(rawResponse);
    return cleaned || "Hmm... 我好像没听清。";

  } catch (error) {
    const err = error as Error;
    console.error("AI Error:", err);
    return `(AI 连接打瞌睡了: ${err.message})`;
  }
}
