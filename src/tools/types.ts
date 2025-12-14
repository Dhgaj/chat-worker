// 工具类型定义

// 工具参数 Schema（符合 OpenAI/Ollama Function Calling 格式）
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
  }>;
  required: string[];
}

// 工具定义（用于发送给 AI）
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

// 工具实现接口
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (args: Record<string, any>, context?: ToolContext) => Promise<any>;
  /** 
   * 是否为临时性工具（结果不应影响后续上下文）
   * 如：时间查询、天气查询等实时性工具
   * 设为 true 时，工具结果会保存但在构建 AI 上下文时被过滤
   */
  ephemeral?: boolean;
}

// 工具调用结果
export interface ToolCallResult {
  name: string;
  arguments: Record<string, any>;
}

// 工具执行上下文
export interface ToolContext {
  defaultTimezone: string;
  // 未来可扩展更多上下文
}
