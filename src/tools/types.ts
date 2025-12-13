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
  execute: (args: Record<string, any>) => Promise<any>;
}

// 工具调用结果
export interface ToolCallResult {
  name: string;
  arguments: Record<string, any>;
}
