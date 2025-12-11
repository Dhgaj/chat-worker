# AI 机器人

一个基于 Cloudflare Workers 的 AI 机器人项目，使用 Durable Objects 实现实时通信功能。

## ✨ 功能特性

- 单用户 AI 对话
- 对话历史记录
- 用户认证
- 支持长文本处理与授权
- 消息广播
- AI 助手集成

## 🚀 快速开始

### 环境要求

- Node.js 20+
- npm 或 yarn
- Cloudflare 账号
- Wrangler CLI

### 安装依赖

```bash
# 安装项目依赖
npm install

# 安装 Wrangler CLI (如果尚未安装)
npm install -g wrangler
```

### 配置环境变量

1. 复制示例环境变量文件：
  ```bash
  cp .dev.vars.example .dev.vars
  ```

2. 编辑 `.dev.vars` 文件，填写您的配置：
  ```
  USER_SECRETS={"username":"password"}
  ```

### 本地开发

```bash
# 启动开发服务器
npm run dev

# 或者直接使用 Wrangler
wrangler dev

# 局域网广播测试
wrangler dev --ip 0.0.0.0
```

### 测试

```bash
# 运行测试
npm test

# 查看测试覆盖率
npm test -- --coverage
```

### 进入会议室
```bash
npx wscat -c "ws://localhost:8787/ws?name=UserName&secret=PassWord"
# 例如 npx wscat -c "ws://localhost:8787/ws?name=张三&secret=pass123"
# 或者安装 wscat 作为全局依赖
npm install -g wscat
# 然后直接使用（不需要 npx）
wscat -c "ws://localhost:8787/ws?name=张三&secret=pass123"
```

## 🛠 项目结构

```
.
├── src/
│   ├── index.ts         # 主应用入口
│   ├── ai-robot.ts      # AI 机器人 Durable Object 实现
│   ├── ai.ts            # AI 服务集成
│   ├── config.ts        # 应用配置
│   ├── prompts.ts       # AI 提示词模板
│   ├── types.ts         # 类型定义
│   └── utils.ts         # 工具函数
├── .dev.vars.example    # 环境变量示例
├── .gitignore
├── package.json
├── README.md
├── run.sh               # 开发环境启动脚本
├── tsconfig.json
└── wrangler.jsonc       # Cloudflare Workers 配置
```

## 🔧 配置

### Wrangler 配置

编辑 `wrangler.jsonc` 文件以配置您的 Worker：

```json
{
  "name": "chat-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-12-07",
  "durable_objects": {
    "bindings": [
 {
        "name": "AI_ROBOT",
        "class_name": "AIRobot"
      }
    ]
  }
}
```

## 🚀 部署

1. 登录 Cloudflare：
  ```bash
  wrangler login
  ```

2. 部署 Worker：
  ```bash
  npm run deploy
  ```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

## 📄 许可证

[MIT](LICENSE) © 2025

---

<p align="center">
  Made with ❤️ by Your Name
</p>
