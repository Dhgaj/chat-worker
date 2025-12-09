// 工具函数 (解码、清洗文本)
// 解码 WebSocket 消息
export function decodeMessage(message: string | ArrayBuffer): string {
  if (typeof message === "string") return message;
  return new TextDecoder().decode(message);
}

// 清洗 AI 回复的文本
export function cleanAiResponse(text: string): string {
  let cleaned = text.trim();

  // 去掉 [Name]: 格式
  cleaned = cleaned.replace(/^\[[^\]]+\][:：]\s*/, "");
  
  // 去掉 Name: 格式，但排除纯数字的情况（保护时间显示）
  // 逻辑：开头必须是 字母或中文，不能包含数字，后面紧跟冒号
  cleaned = cleaned.replace(/^[a-zA-Z\u4e00-\u9fa5]+[:：]\s*/, "");

  return cleaned.trim();
}