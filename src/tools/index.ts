// [工具/手脚] 工具注册表
// 所有的外部能力都在这里注册和管理

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

// 工具注册表
const toolRegistry: Map<string, Tool> = new Map();

// 注册工具
export function registerTool(tool: Tool): void {
  toolRegistry.set(tool.name, tool);
  console.log(`[Tools] 已注册工具: ${tool.name}`);
}

// 获取工具
export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

// 获取所有工具
export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

// 获取所有工具定义（用于发送给 AI 的 Function Calling）
export function getToolDefinitions(): ToolDefinition[] {
  return getAllTools().map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// 执行工具
export async function executeTool(name: string, args: Record<string, any> = {}): Promise<any> {
  const tool = toolRegistry.get(name);
  if (!tool) {
    throw new Error(`工具 "${name}" 未找到`);
  }
  console.log(`[Tools] 执行工具: ${name}`, args);
  return tool.execute(args);
}

// 内置工具定义
// 工具 1: 获取当前时间
registerTool({
  name: "get_current_time",
  description: "获取当前时间。当用户询问现在几点、当前时间、日期等时间相关问题时使用此工具。",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "时区，默认为 Asia/Shanghai（北京时间）",
      },
      format: {
        type: "string",
        description: "时间格式: 'full' (完整日期时间), 'time' (仅时间), 'date' (仅日期)",
        enum: ["full", "time", "date"],
      },
    },
    required: [],
  },
  execute: async (args) => {
    const timezone = args.timezone || "Asia/Shanghai";
    const format = args.format || "full";
    
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour12: false,
    };
    
    if (format === "time") {
      options.hour = "2-digit";
      options.minute = "2-digit";
      options.second = "2-digit";
    } else if (format === "date") {
      options.year = "numeric";
      options.month = "2-digit";
      options.day = "2-digit";
      options.weekday = "long";
    } else {
      // full
      options.year = "numeric";
      options.month = "2-digit";
      options.day = "2-digit";
      options.weekday = "long";
      options.hour = "2-digit";
      options.minute = "2-digit";
      options.second = "2-digit";
    }
    
    return now.toLocaleString("zh-CN", options);
  },
});

// 预留：未来可以在这里添加更多工具
// 
// 工具示例模板:
// registerTool({
//   name: "tool_name",
//   description: "工具描述，说明何时应该使用此工具",
//   parameters: {
//     type: "object",
//     properties: {
//       param1: { type: "string", description: "参数1描述" },
//     },
//     required: ["param1"],
//   },
//   execute: async (args) => {
//     // 执行逻辑
//     return result;
//   },
// });
//
// 可添加的工具:
// - search_web: 搜索网络
// - calculate: 数学计算
// - translate: 翻译
// - get_weather: 获取天气
// - etc.
