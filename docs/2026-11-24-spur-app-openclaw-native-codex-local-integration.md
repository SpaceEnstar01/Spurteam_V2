# Spur App 与原生 Codex 的本地集成

Spur App 的 ChatGPT 入口在 Sidebar 的 Spur AI 下方。App 经 Spur Node 服务提交任务，Node 调用本机 OpenClaw Gateway，Gateway 通过 stdio 运行原生 Codex。原 Spur AI 路由继续使用 DeepSeek Harness。

## 配置与启动

本阶段使用单一可信用户、一个私有 Gateway 和一个专用成果工作区。分别保留 Spur 与 Gateway 的状态目录，两者均应位于私有本地目录。沿用原生 Codex 的本机登录。Gateway 配置需显式选择原生 Codex runtime，Codex App Server 使用专用工作目录、`workspace-write` 和现有本机登录的 `homeScope: "user"`。Gateway 保持回环监听。

```bash
# Spur V2 根目录。路径指向事先准备的私有配置和目录。
OPENCLAW_CONFIG_PATH="$GATEWAY_CONFIG" OPENCLAW_STATE_DIR="$GATEWAY_STATE" \
  node agent/runtime/openclaw/openclaw.mjs gateway run --port 24691 --bind loopback

# 另一个终端，从私有环境载入 SPUR_CREATOR_AGENT_TOKEN。
SPUR_CONFIG_FILE=/dev/null SPUR_RUNTIME_ROOT="$SPUR_STATE" \
  SPUR_CODEX_WORKSPACE="$CODEX_WORKSPACE" \
  SPUR_CODEX_GATEWAY_URL=ws://127.0.0.1:24691 \
  SPUR_CODEX_GATEWAY_CONFIG="$GATEWAY_CONFIG" \
  SPUR_CODEX_GATEWAY_STATE="$GATEWAY_STATE" \
  HOST=127.0.0.1 PORT=24692 node web/server.mjs
```

Mac 接口测试可用环回 HTTP。要在 iPhone 上使用，需用受控 HTTPS 反向代理转发到 Spur 的回环端口，并让手机信任该地址。App 的「设置」沿用 Personal Agent 服务地址和系统安全存储中的访问令牌。该令牌允许访问这套单用户服务的任务历史。多用户接入需要独立身份、任务所有权和运行隔离。

## 接口和运行状态

- `GET /api/codex/status` 表示 Gateway 可达。实际 Codex 执行由运行状态和终态回执验证。
- `POST /api/codex/tasks` 接收 `requestId`（UUID）和 `message`，相同请求 ID 去重。串行调度，避免同一原生线程并行写入。
- `GET /api/codex/tasks` 返回历史，可通过 `after` 分页。`GET /api/codex/tasks/<id>` 返回详情和服务生成的公开里程碑。
- `GET /api/codex/tasks/<id>/report` 经鉴权交付 Markdown。Codex 在专用工作区写入对应 UUID 的文件。后端验证原生回执、检查文件并保存报告快照。App 可以渲染报告及分享 Markdown 内容。
- 持久化任务由 Spur 保存。重启后通过原 run ID 查询，接单不明时不会重新发起任务。长期无法确认终态的任务进入恢复状态并继续查询，后续任务保持排队，等待操作员检查 Gateway。

## 验证

```bash
node --check web/codex/routes.mjs
node --check web/server.mjs
(cd appV2/app_mobile && ./node_modules/.bin/tsc --noEmit)
(cd appV2/app_mobile && npm test -- --runInBand)
./scripts/build-ios-release.sh
```

- SpaceX 首轮及两轮续聊使用实际 Codex。首轮生成 11,390 字节的 Markdown，下载内容与执行目录文件一致。三轮共用原生线程 `01a20dc3-97a2-70f3-a9f6-e3a45c903562`。
- Mac 本地验证包含无凭证拒绝、重复请求去重、Gateway 与 Spur 重启后的历史读取，以及未授权报告下载拒绝。最终实现复验观察到 queued → running → finished，报告快照与原件一致。三轮 Gateway 耗时分别为 221.598、30.357 和 133.375 秒。运行证据在 `/tmp/spur-codex-app.vCwEG4`。
- TypeScript 检查和 Web 95 项测试通过。移动端测试 276 项通过、4 项失败，失败属于在迁移基线上已复现的 AgentDashboard 和 CreatorAgentIntegration 两组。
- iOS Release 构建通过。独立 Bundle ID `com.spur.recordingring.codexvalidation` 的签名构建已安装并启动于 eFLY。真机 HTTPS 接入、发送任务、报告查看和 App 重开回读待验。云端部署待验。

## eFLY 局域网 HTTPS 测试

- Mac Wi-Fi 地址为 `192.168.0.100`。Gateway 和 Spur Node 服务分别留在回环端口 24691、24692。
- 局域网证书下载为 `http://192.168.0.100:24694/spur-test-ca.cer`，只提供公开根证书。HTTPS 测试地址为 `https://192.168.0.100:24693`，代理仅转发 Codex 路由和现有健康接口。证书有效期为两天。
- iPhone 安装「Spur Local Test CA」并在证书信任设置确认后，在独立测试版保存 Personal Agent 地址与测试令牌，再进入 Sidebar 的 ChatGPT。
- Mac 侧通过了 IP SAN/TLS 校验、未授权访问返回 401、授权状态查询及三条旧任务的历史读取。真机提交、报告卡片和重开 App 仍需现场确认。测试结束后应在 iPhone 中移除该测试根证书。
