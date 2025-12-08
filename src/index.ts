import { DurableObject } from 'cloudflare:workers';

// 配置常量
const MAX_MESSAGE_LENGTH = 1024;
// 限制每 1000ms 只能发一条消息
const RATE_LIMIT_MS = 1000;

// 类型定义完善

// 1. 定义 Cloudflare AI 的接口 (避免使用 any)
interface AiTextGenerationInput {
	messages: { role: string; content: string }[];
	// 可选参数：控制随机性 (0.0 - 1.0)
	temperature?: number;
	// 可选参数：限制回复长度
	max_tokens?: number;
	top_p?: number; // 可选参数
	stream?: boolean; // 可选参数
}
interface AiTextGenerationOutput {
	response: string;
}

interface Ai {
	run(model: string, inputs: AiTextGenerationInput): Promise<AiTextGenerationOutput>;
}

export interface Env {
	CHAT_ROOM: DurableObjectNamespace;
	USER_SECRETS: string;
	AI: Ai;
}

// 2. 扩充 WebSocket 附加数据，增加 lastMessageAt 用于防刷屏
interface WebSocketAttachment {
	name: string;
	id: string;
	joinedAt: number;
	lastMessageAt: number; // 上次发送消息的时间戳
}

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

// Durable Object 类定义

export class ChatRoom extends DurableObject<Env> {
	history: ChatMessage[] = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	// 广播消息逻辑保持不变
	broadcast(message: string) {
		const websockets = this.ctx.getWebSockets();
		for (const client of websockets) {
			if (client.readyState !== WebSocket.OPEN) {
				try {
					client.close(1011, 'stale connection');
				} catch {}
				continue;
			}
			try {
				client.send(message);
			} catch {
				try {
					client.close(1011, 'failed to deliver');
				} catch {}
			}
		}
	}

	rejectWebSocket(reason: string): Response {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		this.ctx.acceptWebSocket(server);
		server.send(`[连接拒绝]: ${reason}`);
		server.close(1008, reason);
		return new Response(null, { status: 101, webSocket: client });
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/websocket') {
			const params = url.searchParams;
			const name = params.get('name');
			const secret = params.get('secret');

			if (!name) return this.rejectWebSocket("必须提供 'name' 参数");

			let allowedUsers: Record<string, string> = {};
			try {
				const secretsJson = this.env.USER_SECRETS || '{"admin":"admin"}';
				allowedUsers = JSON.parse(secretsJson);
			} catch (e) {
				return this.rejectWebSocket('服务器配置错误');
			}

			if (!allowedUsers.hasOwnProperty(name)) return this.rejectWebSocket(`用户 '${name}' 不在名单中`);
			if (secret !== allowedUsers[name]) return this.rejectWebSocket('密码错误');

			const activeWebSockets = this.ctx.getWebSockets();
			for (const existingWS of activeWebSockets) {
				const attachmentStr = existingWS.deserializeAttachment();
				if (attachmentStr) {
					const info = JSON.parse(attachmentStr as string) as WebSocketAttachment;
					if (info.name === name) return this.rejectWebSocket(`用户 '${name}' 已经在线`);
				}
			}

			const webSocketPair = new WebSocketPair();
			const [client, server] = Object.values(webSocketPair);

			// 初始化 Attachment，包含 lastMessageAt: 0
			const initialAttachment: WebSocketAttachment = {
				name: name,
				id: crypto.randomUUID(),
				joinedAt: Date.now(),
				lastMessageAt: 0,
			};

			server.serializeAttachment(JSON.stringify(initialAttachment));

			this.ctx.acceptWebSocket(server);

			const welcomeMsg = `[系统通知]: 欢迎 ${name} 加入房间！`;
			this.broadcast(welcomeMsg);
			this.recordHistory('系统', `欢迎 ${name} 加入房间`, 'user');

			server.send(`[系统提示]: 👋 你好 ${name}！我是 Jarvis。@Jarvis 或 Jarvis 可呼叫我。`);

			return new Response(null, { status: 101, webSocket: client });
		}

		return new Response('Chat Server Running.', { status: 200 });
	}

	recordHistory(name: string, content: string, role: 'user' | 'assistant') {
		const finalContent = role === 'user' ? `[${name}]: ${content}` : content;
		this.history.push({ role: role, content: finalContent });
		if (this.history.length > 50) {
			this.history = this.history.slice(this.history.length - 50);
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const attachmentStr = ws.deserializeAttachment();
		// 理论上不会发生
		if (!attachmentStr) return;

		// 使用类型断言确保数据结构正确
		const attachment = JSON.parse(attachmentStr as string) as WebSocketAttachment;
		const { name, lastMessageAt } = attachment;

		// 防刷屏逻辑 (Rate Limiting)
		const now = Date.now();
		if (now - lastMessageAt < RATE_LIMIT_MS) {
			ws.send(`[系统提示]: 说话太快了，请休息一下。`);
			return;
		}

		// 更新该 WebSocket 的最后发送时间
		attachment.lastMessageAt = now;
		ws.serializeAttachment(JSON.stringify(attachment));

		const userMsg = this.decodeMessage(message);
		const trimmed = userMsg.trim();

		if (!trimmed) {
			ws.send('[系统提示]: 消息不能为空。');
			return;
		}

		if (trimmed.length > MAX_MESSAGE_LENGTH) {
			ws.send(`[系统提示]: 消息过长（限制 ${MAX_MESSAGE_LENGTH} 字）。`);
			return;
		}

		this.broadcast(`[${name}]: ${trimmed}`);
		this.recordHistory(name, trimmed, 'user');

		const lowerCaseMsg = trimmed.toLowerCase();

		if (lowerCaseMsg === 'help' || lowerCaseMsg === '帮助') {
			ws.send(`[系统提示]: 直接聊天即可。@Jarvis 呼叫 AI。`);
			return;
		}

		// 示例 2：增加 /who 指令查看在线人数
		if (trimmed === '/who') {
			const count = this.ctx.getWebSockets().length;
			ws.send(`[系统提示]: 当前在线人数: ${count} 人`);
			return;
		}

		if (lowerCaseMsg.startsWith('jarvis') || lowerCaseMsg.startsWith('@jarvis')) {
			// 使用 waitUntil 确保 AI 请求不会因为 DO 休眠而被切断
			this.ctx.waitUntil(this.askAI(name, trimmed));
		}
	}

	async askAI(userName: string, userQuestion: string) {
		let aiText = '';

		try {
			const now = new Date();
			// 使用更易读的时间格式，避免 AI 产生困惑
			const timeString = now.toLocaleString('zh-CN', {
				timeZone: 'Asia/Shanghai',
				hour12: false, // 使用 24 小时制，避免 AM/PM 格式干扰
			});

			const systemPrompt = `你是一个智能群聊助手 "Jarvis"。
      
      【环境信息】
      - 当前时间: ${timeString}
      - 提问者: "${userName}"
      
      【重要规则】
      1. 直接回复内容，不要加 "[Jarvis]:" 前缀。
      2. 语言风格：自然、简洁、乐于助人。
      3. 如果被问时间，请直接回答当前时间。`;

			const messagesToSend = [{ role: 'system', content: systemPrompt }, ...this.history];

			// 添加日志，方便在终端看到发给 AI 的完整历史
			console.log('  AI Request  ');
			// console.log(JSON.stringify(messagesToSend, null, 2));
			const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
				messages: messagesToSend,
				// 增加生成参数控制，减少胡言乱语
				temperature: 0.6, // 降低随机性
				max_tokens: 256, // 限制回复长度
			});

			aiText = response.response || '';

			// 打印 AI 原始回复，用于调试
			console.log(`[Raw AI Response]: ${aiText}`);

			// === 修复后的清洗逻辑 ===
			aiText = aiText.trim();

			// 1. 去掉 [Name]: 格式 (保留)
			aiText = aiText.replace(/^\[[^\]]+\][:：]\s*/, '');

			// 2. 【关键修复】去掉 Name: 格式，但排除纯数字的情况（保护时间显示）
			// 逻辑：开头必须是 字母或中文，不能包含数字，后面紧跟冒号
			aiText = aiText.replace(/^[a-zA-Z\u4e00-\u9fa5]+[:：]\s*/, '');

			// 3. 再次去头去尾
			aiText = aiText.trim();

			if (!aiText) aiText = 'Hmm... 我好像没听清。';
		} catch (error) {
			const err = error as Error;
			console.error('AI Error:', err);
			aiText = `(AI 连接打瞌睡了: ${err.message})`;
		}

		this.recordHistory('Jarvis', aiText, 'assistant');
		this.broadcast(`[Jarvis]: ${aiText}`);
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
		const attachmentStr = ws.deserializeAttachment();
		if (attachmentStr) {
			const { name } = JSON.parse(attachmentStr as string) as WebSocketAttachment;
			if (code !== 1008) {
				const leaveMsg = `[系统通知]: ${name} 离开了房间`;
				this.broadcast(leaveMsg);
				this.recordHistory('系统', leaveMsg, 'user');
			}
		}
	}

	private decodeMessage(message: string | ArrayBuffer): string {
		if (typeof message === 'string') return message;
		return new TextDecoder().decode(message);
	}
}

// 导出 Worker 入口
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/ws') {
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Expected Upgrade: websocket', { status: 426 });
			}

			const id = env.CHAT_ROOM.idFromName('global-room');
			const stub = env.CHAT_ROOM.get(id);

			// 重写路径以匹配 Durable Object 内部逻辑
			return stub.fetch(new Request(url.toString().replace('/ws', '/websocket'), request));
		}

		return new Response('Chat Server Protected.', { status: 200 });
	},
} satisfies ExportedHandler<Env>;
