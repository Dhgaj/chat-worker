// 记忆管理
// 聊天历史持久化

import { ChatMessage } from "../types";
import { loggers } from "../logger";

const log = loggers.memory;

// 存储键名
const MEMORY_STORAGE_KEY = "chat_history";

// 记忆类
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
      log.info(`已加载 ${this.history.length} 条历史记录`);
    }
  }

  // 保存记忆到存储
  async save(): Promise<void> {
    if (!this.storage) return;
    
    await this.storage.put(MEMORY_STORAGE_KEY, this.history);
  }

  // 添加记录
  add(
    name: string,
    content: string,
    role: ChatMessage["role"],
    extra?: Partial<ChatMessage>
  ): void {
    const message: ChatMessage = {
      role,
      content,
      name,
      ...extra,
    };

    this.history.push(message);
    
    // 保持记忆大小限制
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
    }
  }

  // 添加记录并自动保存
  async addAndSave(
    name: string,
    content: string,
    role: ChatMessage["role"],
    extra?: Partial<ChatMessage>
  ): Promise<void> {
    this.add(name, content, role, extra);
    await this.save();
  }

  // 获取历史记录
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  // 获取历史记录（过滤临时性消息，用于构建 AI 上下文）
  getHistoryForContext(): ChatMessage[] {
    return this.history.filter(msg => !msg.ephemeral);
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
