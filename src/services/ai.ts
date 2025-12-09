// AI 服务 (Prompt 工程)

import { Ai, ChatMessage } from "../types";
import { AI_MODEL } from "../config";
import { cleanAiResponse } from "../utils";

export async function askJarvis(
  ai: Ai,
  userName: string,
  history: ChatMessage[]
): Promise<string> {
  let aiText = "";

  try {
    const now = new Date();
    const timeString = now.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });

    const systemPrompt = `你是一个智能群聊助手 "Jarvis"。
    
    【环境信息】
    - 当前时间: ${timeString}
    - 提问者: "${userName}"
    
    【重要规则】
    1. 直接回复内容，不要加 "[Jarvis]:" 前缀。
    2. 语言风格：自然、简洁、乐于助人。
    3. 如果被问时间，请直接回答当前时间。`;

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

    aiText = cleanAiResponse(rawResponse);

    if (!aiText) aiText = "Hmm... 我好像没听清。";

  } catch (error) {
    const err = error as Error;
    console.error("AI Error:", err);
    aiText = `(AI 连接打瞌睡了: ${err.message})`;
  }

  return aiText;
}