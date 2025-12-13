// 工具注册表
// 所有的外部能力都在这里注册和管理

import { Tool, ToolDefinition } from "./types";
import { timeTool } from "./builtins/time";

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

// 初始化：注册内置工具
function initBuiltinTools(): void {
  registerTool(timeTool);
  // 未来可以在这里添加更多内置工具
}

// 自动初始化
initBuiltinTools();

// 导出类型
export type { Tool, ToolDefinition, ToolParameterSchema, ToolCallResult } from "./types";
