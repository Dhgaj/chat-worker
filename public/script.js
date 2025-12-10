let ws;
let myName = "";
let savedSecret = "";
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 2000;

function getAvatarText(name) {
  if (!name) return "?";
  return name.substring(0, 1).toUpperCase();
}

function joinChat() {
  const nameInput = document.getElementById('username');
  const secretInput = document.getElementById('secret');
  
  const name = nameInput.value.trim();
  const secret = secretInput.value.trim();
  
  if (!name || !secret) return alert("请输入名字和密码");

  // 记下自己的名字和密码（用于重连）
  myName = name;
  savedSecret = secret;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 注意：模板字符串不要用反斜杠转义，直接用反引号
  const wsUrl = `${protocol}//${window.location.host}/ws?name=${encodeURIComponent(name)}&secret=${encodeURIComponent(secret)}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.remove('hidden');
    reconnectAttempts = 0; // 连接成功，重置重连计数
    addSystemMessage("已连接到服务器");
  };

  ws.onmessage = (event) => {
    handleMessage(event.data);
  };
}

function handleMessage(text) {
  // 1. 系统消息
  if (text.startsWith("[系统")) {
    addSystemMessage(text);
    if (text.includes("当前在线人数:")) {
       const count = text.match(/(\d+)/)[0];
       document.getElementById('online-count').innerText = count;
    }
    return;
  }

  // 2. Jarvis 消息 (AI)
  if (text.startsWith("[Jarvis]")) {
    const content = text.replace("[Jarvis]:", "").trim();
    addMessage(content, 'jarvis', 'Jarvis');
    return;
  }

  // 3. 用户消息 (核心解析逻辑)
  // 正则匹配 [名字]: 内容
  const match = text.match(/^\[(.*?)\]: (.*)/);
  
  if (match) {
    const sender = match[1];
    const content = match[2];
    
    // 判断是谁发的
    if (sender === myName) {
      // 如果发送者是当前登录的用户名，标记为 'self' (CSS 会处理右对齐和隐藏名字)
      addMessage(content, 'self', sender);
    } else {
      // 别人发的，标记为 'others'
      addMessage(content, 'others', sender);
    }
  } else {
    // 无法解析的格式，当作系统消息
    addSystemMessage(text);
  }

  ws.onclose = (e) => {
    // 如果是服务器主动拒绝（如密码错误、重复登录），不重连
    if (e.code === 1008) {
      alert("连接被拒绝: " + (e.reason || "认证失败"));
      location.reload();
      return;
    }

    // 尝试自动重连
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY * reconnectAttempts;
      addSystemMessage(`连接断开，${delay / 1000} 秒后尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(() => attemptReconnect(), delay);
    } else {
      addSystemMessage("重连失败，请刷新页面重试");
    }
  };

  ws.onerror = () => {
    // onerror 后通常会触发 onclose，这里不做额外处理
  };
}

function attemptReconnect() {
  if (!myName || !savedSecret) {
    location.reload();
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?name=${encodeURIComponent(myName)}&secret=${encodeURIComponent(savedSecret)}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    addSystemMessage("重连成功！");
  };

  ws.onmessage = (event) => {
    handleMessage(event.data);
  };

  ws.onclose = (e) => {
    if (e.code === 1008) {
      alert("重连失败: " + (e.reason || "认证失败"));
      location.reload();
      return;
    }

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY * reconnectAttempts;
      addSystemMessage(`重连失败，${delay / 1000} 秒后再次尝试 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(() => attemptReconnect(), delay);
    } else {
      addSystemMessage("重连失败次数过多，请刷新页面");
    }
  };
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (text && ws) {
    ws.send(text);
    input.value = "";
    input.focus();
    // 注意：我们不在这里手动 addMessage，而是等待服务器广播回来
    // 这样能保证看到的消息是服务器确认接收的
  }
}

function handleKeyPress(e) {
  if (e.key === 'Enter') sendMessage();
}

function logout() {
  if (ws) ws.close();
  location.reload();
}

function addMessage(text, type, sender) {
  const container = document.getElementById('messages');
  const row = document.createElement('div');
  row.className = `message-row ${type}`;
  
  const avatarText = getAvatarText(sender);
  
  // 即使是 self，我们也把 sender 渲染进去，通过 CSS display:none 隐藏
  // 这样 DOM 结构统一，方便维护
  row.innerHTML = `
    <div class="avatar">${avatarText}</div>
    <div class="bubble-wrapper">
      <div class="username">${sender}</div>
      <div class="bubble">${text}</div>
    </div>
  `;

  container.appendChild(row);
  scrollToBottom();
}

function addSystemMessage(text) {
  const container = document.getElementById('messages');
  const row = document.createElement('div');
  row.className = 'message-row system';
  row.innerHTML = `<div class="bubble">${text}</div>`;
  container.appendChild(row);
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('messages');
  container.scrollTop = container.scrollHeight;
}

