import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../src/index";
// 引入类型定义，方便 TS 提示
import type { Env } from "../src/index";

// 为了方便，定义一个类型转换函数，省得每次都写 as unknown as Env
const getEnv = () => env as unknown as Env;

describe("聊天室 Worker 集成测试", () => {

  // 测试鉴权失败的情况 
  it("应该拒绝没有名字的请求", async () => {
    // 伪造请求：不带 ?name 参数
    const request = new Request("http://example.com/ws?secret=pass123", {
      headers: { Upgrade: "websocket" },
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, getEnv(), ctx);
    await waitOnExecutionContext(ctx);

    // 这里的逻辑是：你现在的代码是先建立连接(101)，发报错消息，再断开
    expect(response.status).toBe(101);
    
    // 拿到客户端的 WebSocket
    const clientWs = response.webSocket;
    expect(clientWs).not.toBeNull();
    if (!clientWs) return;

    // 关键:测试端必须由我们手动 "accept" 接受连接
    clientWs.accept();

    // 监听收到的第一条消息
    // 我们用 Promise 来包装，等待消息到来
    const firstMessage = await new Promise<string>((resolve) => {
      clientWs.addEventListener("message", (event) => {
        resolve(event.data as string);
      });
    });

    // 断言：消息内容必须包含拒绝原因
    expect(firstMessage).toContain("必须提供 'name' 参数");
  });

  it("应该拒绝密码错误的请求", async () => {
    // 伪造请求：密码写错
    const request = new Request("http://example.com/ws?name=张三&secret=WRONG_PASSWORD", {
      headers: { Upgrade: "websocket" },
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, getEnv(), ctx);
    await waitOnExecutionContext(ctx);

    const clientWs = response.webSocket!;
    clientWs.accept();

    const firstMessage = await new Promise<string>((resolve) => {
      clientWs.addEventListener("message", (event) => {
        resolve(event.data as string);
      });
    });

    // 断言：必须包含密码错误提示
    expect(firstMessage).toContain("密码错误");
  });


  // 测试正常登录与聊天
  it("应该允许正确密码登录，并能接收广播消息", async () => {
    // 伪造请求：完全正确
    // 注意：这里的密码必须和 .dev.vars 里的匹配，或者我们依赖代码里的默认 fallback
    const request = new Request("http://example.com/ws?name=张三&secret=pass123", {
      headers: { Upgrade: "websocket" },
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, getEnv(), ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(101);
    const clientWs = response.webSocket!;
    clientWs.accept();

    // 收集所有收到的消息
    const messages: string[] = [];
    clientWs.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    // 等待一下，因为连接成功后，服务器会马上发一条 "[系统通知]: 欢迎..."
    // 在测试里处理时间比较麻烦，我们简单地用 setTimeout 等待异步操作完成
    await new Promise(r => setTimeout(r, 50)); 

    // 断言：收到了欢迎消息
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("欢迎 张三");

    // 测试发送消息
    // 假装用户发了一句 "Hello World"
    clientWs.send("Hello World");

    // 等待服务器处理并广播回来
    await new Promise(r => setTimeout(r, 50));

    // 断言：应该收到自己发的消息的回显
    // 现在的逻辑是收到消息后广播给所有人，所以自己也会收到
    const chatMessage = messages.find(m => m.includes("Hello World"));
    expect(chatMessage).toBeDefined();
    expect(chatMessage).toContain("[张三]: Hello World");
    
    // 测试完毕，手动关闭连接
    clientWs.close();
  });

  it("应该拒绝空消息或超长消息", async () => {
    const request = new Request("http://example.com/ws?name=李四&secret=secret456", {
      headers: { Upgrade: "websocket" },
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, getEnv(), ctx);
    await waitOnExecutionContext(ctx);

    const clientWs = response.webSocket!;
    clientWs.accept();

    const messages: string[] = [];
    clientWs.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    // 等待欢迎消息发出
    await new Promise(r => setTimeout(r, 50));

    // 发送空白消息
    clientWs.send("   ");
    await new Promise(r => setTimeout(r, 50));
    const emptyWarning = messages.find(m => m.includes("不能为空"));
    expect(emptyWarning).toBeDefined();

    // 发送超长消息
    const longMsg = "x".repeat(1100);
    clientWs.send(longMsg);
    await new Promise(r => setTimeout(r, 50));

    const longWarning = messages.find(m => m.includes("过长"));
    expect(longWarning).toBeDefined();

    // 不应该收到回显的超长消息
    const echoedLong = messages.find(m => m.includes(longMsg));
    expect(echoedLong).toBeUndefined();

    clientWs.close();
  });
});
