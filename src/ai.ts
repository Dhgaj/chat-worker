// AI 服务 (Prompt 工程)
import { Ai, ChatMessage } from "./types";
import { AI_MODEL } from "./config";
import { cleanAiResponse } from "./utils";
import { prompts } from "./prompts";

export async function askJarvis(
  ai: Ai,
  userName: string,
  history: ChatMessage[],
  robotName: string 
): Promise<string> {
  let aiText = "";

  try {
    const now = new Date();
    const timeString = now.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });

    const systemPrompt = prompts.system({
      timeString,
      userName,
      // 传递机器人名字
      robotName,  
    });
    
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