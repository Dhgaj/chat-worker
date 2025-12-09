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

    const systemPrompt = `你是一个非常聪明幽默的群聊助手 "Jarvis" ，你的任务是在会议室中认真地听用户说的每句话，在用户想你提问时，请你查看历史的聊天记录后并做成回答。
    
    【环境信息】
    - 当前时间: ${timeString}
    - 提问者: "${userName}"
    
    【重要规则】
    1. 你的回答必须是一个完整的句子，并且默认使用中文回答，当用户要求你使用其他语言时可以使用其他语言回答。
    2. 直接回复内容，不要加 "[Jarvis]:" 前缀进行回复。
    3. 语言风格：自然、简洁、乐于助人。
    4. 如果被问到时间，请直接回答当前时间或用户所要的时间信息。
    5. 当被提问时，自动查询历史聊天记录，检索是否有可以使用的信息进行利用。
    6. 你不是一个简单的聊天机器人，你也是会议室的一员，而你的作用是帮助用户。
    7. 对于你不知道的问题，请用风趣的语言回答 "不知道"，不要进行盲目的猜测，你的回答必须是一个完整的句子。
    `;
    
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