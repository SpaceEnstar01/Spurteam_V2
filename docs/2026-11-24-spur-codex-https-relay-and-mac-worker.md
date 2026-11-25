# Spur Codex HTTPS 转发与 Mac 执行端

当前实现针对单用户、单 Mac 内测。现有 App 继续使用 `/api/codex/*`。ECS 上的 Node 服务启用 relay 模式，Mac 执行端主动建立 HTTPS 请求，OpenClaw 始终留在 Mac 的回环地址。详情过滤历史及新记录中的「OpenClaw 已接单」。

## 配置与运行

ECS 复用现有 HTTPS 入口和 Spur Node 容器，以持久卷保存 `SPUR_RUNTIME_ROOT/codex-relay/queue.json`。仅运行一个 relay 实例。使用服务器密钥管理配置原有 `SPUR_CREATOR_AGENT_TOKEN` 和独立、可撤销的 `SPUR_CODEX_DEVICE_TOKEN`，两者必须不同。当前绑定通过单套实例与唯一设备凭证配置完成，多设备自助绑定未实现。部署前确认反向代理保留 Authorization、允许报告回传请求大小达到 2 MiB、读取超时超过 30 秒。

```bash
docker build --platform linux/amd64 -f agent/deploy/docker/Dockerfile -t spur-codex-relay:local .
```

Mac 启动本地执行服务和 Gateway，详见 [已有本地运行记录](2026-11-24-spur-app-openclaw-native-codex-local-integration.md)。给同一个 Mac 执行端保留原有 Spur、Gateway 状态目录和任务工作区。在独立终端运行：

```bash
SPUR_CODEX_RELAY_URL=https://api.hispurring.com \
SPUR_CODEX_DEVICE_TOKEN_FILE=/path/to/private/device-token \
SPUR_CODEX_LOCAL_URL=http://127.0.0.1:24692 \
SPUR_CODEX_LOCAL_TOKEN_FILE=/path/to/private/local-token \
node web/codex/worker.mjs
```

App 在 Personal Agent 设置保存公网 HTTPS 地址和该环境 App 令牌。设备令牌只交给执行端。公网部署前应保留原容器配置和数据卷，并准备回滚。历史任务与云端新队列相互独立，未导入以前的局域网任务。

## 状态与恢复

同一个任务 UUID 同时用于云端任务、Mac 本地任务及 Gateway run ID。Mac 保留固定的 OpenClaw session key 和原生 Codex thread ID。设备掉线后，任务保留在队列中；重连时继续领取同一 UUID，Mac 读取已持久化的本地执行状态，完成后补传报告。云端连接状态根据最近的设备请求估计。生产多用户和多执行器需增加独立归属、绑定与设备级撤销管理。

## 验证

```bash
node --check web/codex/relay.mjs
node --check web/codex/worker.mjs
(cd web && node --test *.test.mjs email/*.test.mjs guest/*.test.mjs tests/*.test.mjs)
```

既有 Web 回归 95 项通过。公网域名可访问，但原 ECS 的批处理 SSH 鉴权返回 `Permission denied`，尚未发布。公网发布后必须关掉 iPhone Wi-Fi，验证 SpaceX 真实任务、报告、追问、断线恢复及重开 App 查询历史。

局域网 HTTPS 真实联调通过。使用独立设备令牌长轮询领取任务 `ccb4cbd1-3fe7-4547-bc15-6381a86b8e3f`，复用原生线程 `01a20dc3-97a2-70f3-a9f6-e3a45c903562` 完成 SpaceX 续查，观察到 queued、running、finished。经转发获取的 1,861 字节 Markdown 与 Mac 执行目录一致。另验证两类令牌不可交叉使用、相同请求 ID 重复提交返回原任务。公网部署、5G 真机和跨公网断线恢复尚未验收。
