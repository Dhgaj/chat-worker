// [工具/手脚] 工具注册表
// 所有的外部能力都在这里注册和管理

// 工具接口定义
export interface Tool {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<any>;
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

// 执行工具
export async function executeTool(name: string, ...args: any[]): Promise<any> {
  const tool = toolRegistry.get(name);
  if (!tool) {
    throw new Error(`工具 "${name}" 未找到`);
  }
  return tool.execute(...args);
}

// 内置工具

// 获取当前时间
registerTool({
  name: "getCurrentTime",
  description: "获取当前北京时间",
  execute: async () => {
    return new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
  },
});

// 预留：未来可以在这里添加更多工具
// - TTS (文字转语音)
// - STT (语音转文字)
// - 表情控制
// - 动作控制
// - 搜索
// - 计算
// - 等等...
