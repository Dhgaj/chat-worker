// 日志系统
// 统一管理日志输出，支持不同级别和模块

// 日志级别
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

// 日志级别名称
const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.NONE]: "NONE",
};

// 日志级别颜色（终端 ANSI）
const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "\x1b[36m", // 青色
  [LogLevel.INFO]: "\x1b[32m",  // 绿色
  [LogLevel.WARN]: "\x1b[33m",  // 黄色
  [LogLevel.ERROR]: "\x1b[31m", // 红色
  [LogLevel.NONE]: "",
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

// 当前日志级别（可通过环境变量控制）
let currentLevel: LogLevel = LogLevel.DEBUG;

// 设置日志级别
export function setLogLevel(level: LogLevel | string): void {
  if (typeof level === "string") {
    const upperLevel = level.toUpperCase();
    currentLevel = LogLevel[upperLevel as keyof typeof LogLevel] ?? LogLevel.DEBUG;
  } else {
    currentLevel = level;
  }
}

// 获取当前时间戳
function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString("zh-CN", { 
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// 格式化日志消息
function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  data?: any
): string {
  const timestamp = getTimestamp();
  const levelName = LEVEL_NAMES[level].padEnd(5);
  const color = LEVEL_COLORS[level];
  
  let formatted = `${DIM}${timestamp}${RESET} ${color}${levelName}${RESET} [${module}] ${message}`;
  
  if (data !== undefined) {
    if (typeof data === "object") {
      try {
        const jsonStr = JSON.stringify(data, null, 2);
        // 如果 JSON 较短，放在同一行
        if (jsonStr.length < 80 && !jsonStr.includes("\n")) {
          formatted += ` ${DIM}${jsonStr}${RESET}`;
        } else {
          formatted += `\n${DIM}${jsonStr}${RESET}`;
        }
      } catch {
        formatted += ` ${DIM}${String(data)}${RESET}`;
      }
    } else {
      formatted += ` ${DIM}${data}${RESET}`;
    }
  }
  
  return formatted;
}

// Logger 类
export class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  debug(message: string, data?: any): void {
    if (currentLevel <= LogLevel.DEBUG) {
      console.log(formatMessage(LogLevel.DEBUG, this.module, message, data));
    }
  }

  info(message: string, data?: any): void {
    if (currentLevel <= LogLevel.INFO) {
      console.log(formatMessage(LogLevel.INFO, this.module, message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(formatMessage(LogLevel.WARN, this.module, message, data));
    }
  }

  error(message: string, data?: any): void {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(formatMessage(LogLevel.ERROR, this.module, message, data));
    }
  }

  // 分隔线
  separator(title?: string): void {
    if (currentLevel <= LogLevel.DEBUG) {
      if (title) {
        console.log(`${DIM}${"─".repeat(20)} ${title} ${"─".repeat(20)}${RESET}`);
      } else {
        console.log(`${DIM}${"─".repeat(50)}${RESET}`);
      }
    }
  }

  // 高亮重要信息
  highlight(message: string): void {
    if (currentLevel <= LogLevel.INFO) {
      console.log(`\x1b[1m\x1b[35m★ [${this.module}] ${message}${RESET}`);
    }
  }
}

// 创建 Logger 实例的工厂函数
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// 预创建的常用 Logger
export const loggers = {
  robot: createLogger("Robot"),
  brain: createLogger("Brain"),
  memory: createLogger("Memory"),
  tools: createLogger("Tools"),
  llm: createLogger("LLM"),
  cloudflare: createLogger("Cloudflare"),
  ollama: createLogger("Ollama"),
  openai: createLogger("OpenAI"),
  gemini: createLogger("Gemini"),
};
