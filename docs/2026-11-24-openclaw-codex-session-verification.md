# OpenClaw 调用原生 Codex 与桌面会话可见性验证

验证日期为 2026 年 11 月 24 日，时区为 Asia/Shanghai。本文记录本机 Mac 上的实际验证，便于重现任务调用、原生恢复和桌面端重新读取。

## 1. 版本与本机授权

- Spur V2 源码位于 `agent/runtime/openclaw`，版本为 `2026.10.9`。该检出目录没有现成构建产物。本机另有同版本发行包，Gateway 可以启动，但任务报 `owner-plugin-not-activatable`，发行包未能激活 Codex runtime。
- 成功路径使用本机已安装的 OpenClaw `2026.11.7 (393b8ff)` 与 ChatGPT 桌面应用自带的 Codex CLI `0.171.0-alpha.13`。无需安装或升级。
- Gateway 测试配置明确选择原生 `codex` runtime，App Server 使用 stdio、`homeScope: "user"` 和只读 sandbox。测试进程清除了 `OPENAI_API_KEY`、`CODEX_API_KEY`，使用现有本机登录。`account/read` 报 `chatgpt / plus`，额度接口报 `codex / plus`。未测量额度扣减量。
- 这是 Codex App Server 读取本机授权的路径。此前 OpenClaw 独立 OAuth 登录的 HTTP 403 在此路径未复现，具体原因未确认。

## 2. Gateway 调用与结果回传

在独立配置和状态目录下，通过回环地址启动测试 Gateway。客户端使用以下命令提交任务及读回终态。环境变量应在两端指向同一套隔离测试配置。

```bash
openclaw gateway run --port 24683 --bind loopback --verbose
openclaw agent --agent main --session-id spur-nvidia-1795495440 \
  --thinking low --timeout 480 --message '<研究任务>' --json
openclaw gateway call agent.wait \
  --params '{"runId":"274bbe37-21c3-4319-8cdb-46883f42419b","timeoutMs":45000}' \
  --timeout 50000
```

README 冒烟测试先遇到 `gpt-5.4` 已退役，改用 `gpt-5.6-terra` 后首轮仍超时。原生 CLI 对照记录到 WebSocket 重试，并在自动回退 HTTPS 后成功。Gateway 重试后由原生 Codex 读取 README 并返回报告，后续同一线程准确复述验证标记。

英伟达任务要求联网调查最近七天的动态、硬件、Agent 与物理 AI、财报和创业机会。原生记录证实 Codex 实际搜索并打开了来源。首版漏掉 11 月 19 日微软合作公告，核对后在同一线程提交修订。

| 阶段 | OpenClaw run ID | 终态 | Gateway 耗时 |
| --- | --- | --- | --- |
| 英伟达首轮 | `274bbe37-21c3-4319-8cdb-46883f42419b` | `ok` | 186.2 秒 |
| 英伟达修订 | `a4bfb8ee-742b-4d14-bb7f-2e0cf719b56c` | `ok` | 44.7 秒 |

原生运行证据是 Gateway 的 `codex_app_server` 事件及终态回执中以 `codex-app-server:` 开头的标识。测试 Gateway 后续已关闭。

## 3. 本机存储与 CLI 恢复

| 项目 | 实测值 |
| --- | --- |
| OpenClaw 会话 ID | `spur-nvidia-1795495440` |
| Codex 原生线程 ID | `01a20bde-3d35-7891-a2eb-f89720647323` |
| 原生记录 | `~/.codex/sessions/2026/11/24/rollout-2026-11-24T12-44-03-01a20bde-3d35-7891-a2eb-f89720647323.jsonl` |
| 原生索引 | `~/.codex/state_5.sqlite` |
| 任务工作目录 | `/private/tmp/spur-nvidia.Kk1lSu/ws` |
| OpenClaw 状态目录 | `/tmp/spur-nvidia.Kk1lSu/state` |

App Server 的 `thread/read` 和按工作目录筛选的 `thread/list` 均找到该线程。索引显示线程未归档，`project_id` 为空。本次 `homeScope: "user"` 共享原生 Codex home，临时工作目录和 OpenClaw 自身状态目录各自独立。

用户的 zsh 返回 `command not found: codex`，改用桌面应用的内置二进制后，实际恢复并看到已有英伟达报告。

```bash
cd /private/tmp/spur-nvidia.Kk1lSu/ws
"/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex" \
  resume 01a20bde-3d35-7891-a2eb-f89720647323
```

## 4. 桌面端打开、CLI 续聊与重新读取

1. 通过桌面工具 `mcp__codex_app__read_thread` 按原生线程 ID 找到本机会话。首次尝试移入 `spur` 项目时，工具返回 `The task is not available in the sidebar.`
2. 调用 `mcp__codex_app__navigate_to_codex_page` 打开原线程，返回 `{"navigated":true}`。用户截图确认桌面显示原提问及英伟达报告。再次移入项目时报 `The task's source project could not be safely determined.`，故项目侧栏归属未建立。
3. 用户在同一 CLI 会话提交清华系 AI 创业调研。新一轮的原生 turn ID 为 `01a20bec-6d6f-7e52-a4d3-2d143c41040e`，耗时 148.992 秒。用户最初未在已打开的桌面页面看到新结果。
4. 先用 `read_thread` 确认原线程中这轮状态为 `completed`，并可读取完整的《清华系AI创业项目观察（约600字）》。再用 `navigate_to_codex_page` 按相同线程 ID 重新打开。用户确认桌面随后显示新报告。此步骤未执行终端命令、未发送新消息、未重跑研究。

上述两个调用是桌面工具接口，复现参数如下。

```text
read_thread({
  threadId: "01a20bde-3d35-7891-a2eb-f89720647323",
  includeTurns: true,
  turnLimit: 3
})
navigate_to_codex_page({
  threadId: "01a20bde-3d35-7891-a2eb-f89720647323"
})
```

## 5. 结果边界与留存位置

- 已验证 OpenClaw 执行、结果回传、原生 CLI 恢复、桌面按 ID 打开，以及 CLI 新结果保存后由桌面重新打开并显示。
- 已打开的桌面页面是否实时更新、是否自动进入项目侧栏，本次仍未验证。该线程在 Mac 本机执行，网页版 Codex Cloud 不会仅因同账号而自动出现该线程。
- 后续若需按项目发现，优先用已添加到桌面项目的持久目录作为任务工作目录，并继续使用共享的 Codex user home。侧栏可见性需另行验收。
- 英伟达修订原文及回执当时保存在 `/tmp/spur-nvidia.Kk1lSu/report.md`、`revised.json` 和 `revised-wait.log`。README 测试输出在 `/tmp/spur-codex.bCSwws/`。这些是临时路径，长期回溯优先使用本文、原生线程 ID 和本地会话记录。
- 技术参考：[仓内 Codex 授权配置](../agent/runtime/openclaw/docs/plugins/codex-harness-reference/auth.md#shared-user-codex-home)、[Codex CLI](https://learn.chatgpt.com/docs/cli/reference)、[Codex 执行环境](https://learn.chatgpt.com/docs/environments/modes)、[桌面侧栏相似问题](https://github.com/openai/codex/issues/18640)。
