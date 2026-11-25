# OpenClaw → Cursor ACP 本机验证

2026 年 11 月 24 日，Asia/Shanghai。本机已有 Cursor 桌面应用和 OpenClaw 2026.11.7。原 PATH 没有 Cursor CLI，也未发现可用的 acpx 后端。测试使用临时目录 `/tmp/spur-cursor.INSdT1`，其中包含从 Cursor 官方发行包解压的 CLI 2026.11.22-e9042b2、项目 README 副本和独立的 OpenClaw 配置与状态。

## 已实测

- `cursor-agent --version` 返回 `2026.11.22-e9042b2`。
- 不传 API Key 或 Token 时，`cursor-agent status` 返回 `Not logged in`。本次未能沿用现有桌面登录。
- 用 JSON-RPC over stdio 启动 `cursor-agent acp`，`initialize` 返回协议版本 1，`session/new` 返回 `Authentication required`。

## 恢复验证

先在本机终端完成 Cursor 官方登录。

```bash
/tmp/spur-cursor.INSdT1/bin/cursor-agent login
/tmp/spur-cursor.INSdT1/bin/cursor-agent status
```

授权后验证 OpenClaw Gateway → acpx → Cursor 的实际出站执行。首轮只读分析 README，第二轮在同一会话复述首轮标记，记录 Gateway 状态、耗时和 Cursor 会话 ID。最后用原生 CLI 和桌面分别验证能否打开会话。当前尚未产生 Cursor 任务结果或会话 ID。

[Cursor ACP 官方文档](https://prod.cursor.com/docs/cli/acp) · [仓内 ACP 快速开始](../agent/runtime/openclaw/docs/tools/acp-agents/quickstart.md)

## 登录与插件安装复查

首次 Cursor CLI 登录停留在 `Waiting for browser authentication`，复查状态仍为 `Not logged in`。Cursor 桌面应用内置的 CLI 也是同一版本，独立执行 `status` 同样未登录。已发起新的官方浏览器登录流程，需在浏览器里完成。首次隔离安装 acpx 下载并解包后报 `npm install failed: termination timeout (no output from npm)`，随后在临时状态目录重试安装。

用户在官方登录页看到 `Server Error`，请求 ID 为 `c7d77a62-f702-4e82-a52a-1704102d109c`。随后复查 CLI 仍为 `Not logged in`。官方状态页无法独立确认 CLI 授权是否有普遍故障。此时 OAuth 路径仍阻塞，官方 Cursor User API Key 是另一个可验证的认证入口，尚未测试。
