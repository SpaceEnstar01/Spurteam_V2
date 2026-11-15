# Spur 工程架构与代码关系审计：团队协作与合并讨论稿

审计日期：2026年11月14日。对象：当前本地 `/Users/x/X/space/spur` 工作区，而非仅 Git HEAD。

本轮仅阅读源码、配置、脚本、Git 状态与历史记录，并生成本文件；未安装依赖、运行构建、调用模型、启动或重启服务、修改业务文件、执行部署。全文路径以仓库根目录为基准。

## 一、核心结论

1. **V2 是复制继承后持续扩展的产品工程，不是对根目录模块的统一包装。** `V2/agent/` 来源于根 `agent/`；`V2/cloud/audio-agent/` 来源于 `app/cloud/audio-agent/`。复制来源有迁移记录，当前内容比较亦支持这一点。
2. **当前 Web 主链是 V2 自己的 Node 服务调用 DSH CLI。** 并非先调用根 `agent/gateway/`。主要产品编排、任务交付、研究工具、连接器、访客网关与视频适配器位于 V2。
3. **根目录 DSH 存在真实的条件式运行依赖。** `V2/web/server.mjs:104` 优先选 V2 Harness，但 V2 缺少构建入口或依赖时会回退根 `agent/runtime/deepseek-harness/`。不能笼统说“完全独立”，也不能说“所有运行都依赖根 agent”。
4. **Docker 基础构建只使用 V2 上下文中的 DSH。** `V2/agent/deploy/docker/Dockerfile` 明确声明构建上下文为 V2，复制并构建 V2 内 Harness，不要求复制根 `agent/`。本地回退和容器构建是两种不同关系。
5. **不能整目录覆盖合并。** 移动端框架版本不同；音频后端存在行为分叉；Web 个人服务与访客服务具有不同权限边界；视频两条执行链共享交付基础设施但不是同一能力。
6. 当前源码包含未提交及未跟踪实现，README 也有过时描述；团队应以工作区源码、明确的发布清单与验收记录共同确定基线。

## 二、证据范围与状态定义

| 标记 | 含义 |
| --- | --- |
| 源码确认 | 当前文件、导入、调用、构建脚本或逐字节比较直接支持 |
| 历史验证 | 项目文档或本次会话的终端记录曾记录成功，不代表今天线上状态 |
| 待确认 | 本轮未运行验证，或缺少足够来源证据 |
| 仅规划／演示 | 只有说明、示例数据或展示组件，不能视为生产能力 |

主要依据：`V2/docs/MIGRATION-2026-10-28.md`、`harness-source-audit.json`、`cloud-source-audit.json`，各模块入口、包配置、Dockerfile、部署 Python 脚本，以及当前 Git 工作区。历史迁移审计与本轮比较使用不同筛选口径，数字不能直接视为增删变更。

本轮未 SSH 检查 ECS，因此以下关于线上架构是脚本设计与历史记录，而非在线盘点。未读取或记录实际密钥、邀请码、Cookie、私人授权内容。

## 三、根目录工程地图

| 路径 | 实际职责与证据 | 与 V2 的关系 | 状态／整理建议 |
| --- | --- | --- | --- |
| `V2/` | 移动端、Web、Node Personal Agent、复制的音频服务、工具与部署；见其各入口 | 当前产品开发主线 | 源码确认；建议作为整理主线 |
| `agent/` | 原 Agent 运行时、办公工具、办公网关、设计占位 | V2 的复制来源；DSH 仍是 Web 的回退候选 | 不宜立即删除，先消除回退并确认其他消费者 |
| `app/mobile/` | Expo 52、React Native 0.76.5、React 18.3.1；`package.json` 的 Expo 启动命令 | 旧移动端产品线；不是 V2 App 的 npm 依赖 | 不与 V2 RN 工程整体覆盖合并 |
| `app/cloud/audio-agent/` | Bun 音频、转写、模型文本处理服务，`src/server.ts` | V2 音频服务的复制来源 | 已分叉；需逐文件合并 |
| `app/web/Recording-H5/` | 独立 H5 前端及 Dockerfile | 与 V2 React/Vite Web 是独立工程 | 是否仍有用户／域名待确认 |
| `desktop/spur-buddy/` | Swift 6 包、macOS 14 可执行程序；桌面本地 HTTP、任务执行与云端请求 | HTTP 协作，不是 V2 Web 的构建依赖 | 保持独立应用生命周期 |
| `desktop/bridge/` | README 明确为旧 BLE→转写→编程工具实验 | 非当前 Web 主调用链 | 保留归档，删除前确认使用者 |
| `hardware/` | 当前根目录硬件占位；旧 `app/README.md` 提到的 `app/hardware/` 当前未见 | 不在所查 Web/Docker 主链 | 固件有效基线、实际存放处与发布归属待确认 |
| `tests/` | 包括 `ring_video_poc/`、`ring_ad_openmontage/` 等独立验证项目 | 与视频产品能力有主题重叠，但不是主工具入口 | 区分实验与生产适配器，勿批量迁移 |
| `docs/`、`app/docs/`、`desktop/docs/`、`V2/docs/` | 各阶段产品、构建、开发证据 | 可交叉引用，但不都是当前操作手册 | 建议统一索引，保留历史时间标签 |

根 `README.md` 仍主要介绍旧 App 与 Desktop；`V2/README.md` 仍写“聊天 API 尚未接通”，与现有 `web/server.mjs` 不符。它们适合说明来源，不宜直接作为当前能力清单。

## 四、V2 内部职责、来源和依赖

| 模块 | 当前实现／入口 | 来源分类 | 依赖与边界 |
| --- | --- | --- | --- |
| Web UI | `web/src/App.tsx`、`main.tsx`、`AgentWorkspace.tsx`、`Conversation.tsx` | V2 产品层实现 | React 18、Vite；调用 API，不直接持有模型 Key |
| 任务客户端 | `web/src/taskApi.ts`、`VideoTask.tsx` | V2 实现 | 提交任务、查询结果、展示视频；不负责 DSH 内循环 |
| Personal Agent HTTP 服务 | `web/server.mjs`、`start.mjs` | V2 实现 | Node HTTP + DSH 子进程；配置、鉴权、任务、邮件、连接器与视频交付 |
| 异步结果／文件 | `web/task-results.mjs`、`video-stream.mjs`、`creator-agent-auth.mjs` | V2 实现 | 默认 `.runtime/runs`、`.runtime/video-jobs`；结果 JSON、文件签名、视频流 |
| 云端开发桥 | `web/cloud-bridge.mjs`、`scripts/connect-ecs.mjs`、`vite.config.ts` | V2 实现 | 本地开发代理／云端连接；不是生产访客鉴权的替代品 |
| 访客服务 | `web/guest/gateway.mjs`、`access.mjs`、`queue.mjs`、`admin.mjs` | V2 实现 | 邀请、Cookie、租户路由、队列、额度；网关与 Worker 分离 |
| 邮箱 | `web/email/agentmail.mjs`、`workflow.mjs`、`notifications.mjs` | V2 实现 | AgentMail API、草稿与批准流程；不得因合并而绕过批准发送 |
| 平台授权 | `web/app-connections.mjs`、`youtube-oauth.mjs`、`agent/tools/connectors/` | V2 实现 | 个人与访客凭据作用域、OAuth 回调、YouTube/Notion工具 |
| Web 研究工具 | `agent/tools/travel-research/`、`playwright-browser/`、`research-adapter/` | V2 适配层 | DSH 工具注册，调用 MCP、外部程序和平台适配器 |
| 图像／视频 | `agent/tools/image-generation/`、`video-generation/`、`openmontage/` | V2 适配与编排层 | 模型服务、作业持久化、Python渲染与外部引擎 |
| DSH | `agent/runtime/deepseek-harness/` | 从根 Agent 复制的上游源码 | 自有 workspace、pnpm锁、CLI、Cordis/插件体系；不是 Spur 自研主循环 |
| 其他第三方 Runtime | `Agent-Reach/`、`MediaCrawler/`、`OpenMontage-main/` | 外部项目源码／运行时 | Spur 工具封装它们；不能把外部源码本身视为 Spur 新实现 |
| 其他 Runtime 目录 | `nanoMuse/`、`openclaw/`、`OpenMausBot-main/`、`dsh-superagent-prototype/` | 外部或实验目录 | 本轮所查 `server.mjs` 主注册链与基础 Dockerfile未证明它们都在执行；状态待确认 |
| 原办公工具 | `agent/tools/pdf/`、`pptx/`、`docx/`、`xlsx/`、`sandbox/` | 从根 Agent 复制 | 与新的研究文档工具不是同一个完整办公交付链 |
| 原办公网关 | `agent/gateway/server.mjs` | 从根 Agent 复制 | 直接导入 PDF/PPTX writer，不等于调用 DSH |
| 音频云端 | `cloud/audio-agent/src/server.ts` | 从旧 App 后端复制并适配 | Bun；模型直连或显式命令；并非默认经 Web DSH |
| V2 App | `appV2/app_mobile/` | 迁移时已存在的新版客户端，后续在 V2 适配 | RN 0.82.1、React 19.1.1；不能仅凭同名功能认定来自旧 App逐文件复制 |
| Java服务 | `appV2/app_server/` | 随新版客户端保留的配套实现 | Spring Boot 3.5.7、Java17；不是当前 Web Docker主后端 |
| 记忆／轨迹／评测目录 | `agent/memory/`、`trajectory/`、`eval/` | 原设计目录复制 | 当前目录仅有 README，不能据目录名声称已实现完整平台 |

### 4.1 真能力与展示能力不能混算

`web/src/MemoryPage.tsx` 导入 `memoryDemoData`，明确写明人物、公司、邮箱与记录是示例；`IdeaPage.tsx` 使用 `ideaDemoData.ts`、`demoOnDay` 和本地草稿模型。它们不是“已接通个人长期记忆云服务”的证据。另一方面，服务端真实任务结果存储也不等于完整长期记忆系统。

`research-adapter/index.cjs` 同时注册公开检索和需要专用会话的原生搜索。工具存在不代表每个平台、评论、字幕或后台经营数据均已启用；开关、运行时、授权与动作级验证仍需分别确认。

## 五、DSH 的实际调用链

### 5.1 Web 运行入口

```text
本地：浏览器 :5174 → Vite代理／cloud-bridge → Node :4173 或云端
生产访客：Caddy → guest/gateway → 对应租户Worker
Worker：web/server.mjs
  → 校验请求／配置、建立任务目录
  → makePatch：模型、persona、禁用默认工具、注册Spur插件
  → runHarness：spawn(Node, apps/cli/lib/bin.js --profile headless --patch ...)
  → DSH模型循环 → ctx.tools.register注册的Spur工具
  → terminal／事件／result.json／文件／视频作业
  → 前端轮询、结果摘要、详情、播放与下载
```

| 环节 | 源码证据 | 关键含义 |
| --- | --- | --- |
| Harness选择 | `web/server.mjs:104–112` | 先 V2 后根目录；两个条件是 CLI构建文件和 `node_modules` 存在，并非完整依赖健康验证 |
| 配置读取 | `web/server.mjs:58`附近 | `SPUR_CONFIG_FILE` 或 V2私有配置，加环境参数；不能把配置内容复制进文档 |
| CLI启动 | `web/server.mjs` 的 `runHarness()` | Node子进程、每任务工作目录、`DSH_HOME`；不是 HTTP请求根办公网关 |
| 模型配置 | `makePatch()` | 配置 SiliconFlow OpenAI兼容端点与模型；不修改 Harness源码来注册产品工具 |
| 工具限制 | `makePatch()` 的 `disabled` 数组 | Web路径禁用默认 Bash、PowerShell、通用FS、子Agent等；上游有工具不代表产品入口开放 |
| 工具注入 | `makePatch()` 的 `insert` | 指向 V2工具绝对路径；依开关、凭据与运行时选择注册 |
| MCP桥 | `agent/tools/playwright-browser/index.cjs` | `Client`、`StdioClientTransport`连接 V2内 Playwright MCP，不是复用普通用户浏览器就自动拥有全部会话 |
| 持久结果 | `web/task-results.mjs` | 写入 `result.json`；旧任务可由 `terminal.txt`恢复结果，不重新执行 |

**异步不等于无限运行。** 当前 `server.mjs` 明确有 `maxRunMs = 8 * 60 * 1000`。视频 Worker又有自己的作业生命周期；不能据“异步提交”认定目前能可靠跨进程重启持续运行两天。

### 5.2 三种容易混淆的 Agent 入口

| 入口 | 实际路径 | 是否等价 |
| --- | --- | --- |
| 当前Spur Web／App Creator Agent | `V2/web/server.mjs` → DSH headless | 当前产品工具编排链 |
| Harness自带Web | `V2/agent/runtime/spur-profile/run-web.sh` → 相邻Harness → `pnpm dsh web --patch ...` | 自带Web，不是 Spur React首页；脚本会生成 resolved patch，本轮未执行 |
| 办公网关 | `V2/agent/gateway/server.mjs` → `../tools/pdf/...`、`../tools/pptx/...` | 直接固定流程，不是 DSH模型工具循环 |

音频后端还有第四条路径：`V2/cloud/audio-agent/src/agent.ts` 优先直接请求模型 `/chat/completions`，没有Key时仅执行显式配置的 `AUDIO_AGENT_AGENT_COMMAND`；缺少配置则报错。它不天然转发给当前 DSH服务。

### 5.3 构建与部署依赖

| 路径／产物 | 真实依赖 | 整理影响 |
| --- | --- | --- |
| DSH源码包 | `package.json`：`pnpm@11.7.0`，Node `^22.19.0 || >=24.0.0`，`build:lib` | 提取为共享底座时须保留workspace、锁文件、原生绑定和构建关系 |
| 基础Dockerfile | V2上下文；Ubuntu24.04；Node24.22.1；`pnpm install --frozen-lockfile`、`pnpm run build:lib` | 可独立打包V2内DSH；无需根agent参与COPY |
| 基础镜像工具 | Playwright/Chrome、research venv、MediaCrawler venv、V2工具和Web dist | Agent-Reach通过锁定wheel安装，不是把本地全部源码环境原样复制 |
| OpenMontage镜像 | `OpenMontage.Dockerfile` 的 `FROM spur-agent:research-async-v3` | 依赖既有标签；不是独立从零的完整构建入口，建议后续固定digest／发布清单 |
| OpenMontage准备脚本 | `prepare-openmontage-context.py` | 读取本机隔离venv版本，执行Web build，并读取 `docs/...阿尔卑斯.../` 下分镜、素材清单与音乐 |
| ECS小包升级 | `web/guest/*ecs.py` 与 `agent/deploy/docker/*ecs.py` | 镜像之外还有挂载覆盖文件、网关、发布目录；只看镜像tag不足以确定实际线上代码 |

**重要耦合：`docs/` 不全是可随意清理的纯文档。** 上述准备脚本实际依赖演示素材目录。未来可迁到明确的测试资产／发布资产目录，但必须先改脚本、校验许可与回归验证；本轮未迁移。

## 六、重复代码与分叉证据

### 6.1 本轮逐字节比较结果

方法：按相对路径配对普通文件，比对字节；扩展名限 `.ts/.tsx/.js/.mjs/.cjs/.py/.sh/.json/.yml/.yaml/.md/.swift`，排除 `node_modules`、`.git`、`lib`、`dist`、`build`、`.runtime`、`__pycache__`、`.venv`、`venv`、`.build`、`Pods`。这不是全仓库所有二进制、原生代码、隐藏配置和生成物的完整哈希审计。

| 配对目录 | 左／右纳入文件数 | 共同文件一致／不同 | 独有文件 | 判断 |
| --- | --- | --- | --- | --- |
| `agent/runtime/deepseek-harness` ↔ `V2/agent/runtime/deepseek-harness` | 7342／7341 | 7341／0 | 根目录1，V2为0 | 大规模同源复制；不能由此推断两份依赖或构建产物也一致 |
| `agent/tools` ↔ `V2/agent/tools` | 20／66 | 20／0 | V2新增46 | 原办公工具同源；V2新增工具不是应删除的重复文件 |
| `agent/gateway` ↔ `V2/agent/gateway` | 3／3 | 2／1 | 无 | `server.mjs`、README相同，`run.sh`分叉 |
| `app/cloud/audio-agent/src` ↔ `V2/cloud/audio-agent/src` | 23／23 | 21／2 | 无 | `agent.ts`、`config.ts`分叉；其余配对源码相同 |

迁移历史 `harness-source-audit.json` 记录当时7903个跟踪项、7902个可检查项无缺失/变化。这是2026-10-28迁移口径，不可与本轮过滤后的7341混作同一次统计。

### 6.2 具体重复与风险

| 文件／能力 | 证据 | 可考虑的处理 | 风险 |
| --- | --- | --- | --- |
| 两份DSH源码 | 上表7341共同文件一致；迁移记录明确复制 | 最终选择一个固定版本的共享源码／构建产物 | 删除回退目录前须确认消费者、原生绑定与离线构建 |
| PDF/PPTX writer与sandbox | `agent/tools/pdf/src/write-pdf.mjs`、`pptx/src/write-pptx.mjs` 等在V2有相同文件 | 共用一个办公库，入口保持独立 | 路径、Chrome、输出目录、沙箱不能只做文本替换 |
| 两个办公网关 | 两份 `gateway/server.mjs` 字节一致 | 共用实现，分别配置启动参数 | `run.sh`不同，旧环境与端口仍可能被使用 |
| 两份音频服务 | 21/23源码相同 | 抽取稳定处理模块，显式保留配置差异 | 旧 `config.ts`默认命令为 `${process.execPath} run scripts/dev.ts -p`；V2移除隐式旧命令依赖，不能回退覆盖 |
| 旧App与V2 App | Expo/RN0.76/React18 对比 RN0.82/React19 | 优先共享协议、类型、纯函数；UI/原生工程分别保留 | 原生SDK、Pods、导航、存储键、签名与生命周期不兼容风险 |
| Bun模型调用与DSH模型调用 | `cloud/audio-agent/src/agent.ts` 对比 `web/server.mjs` | 统一配置契约、错误规范，不急于统一整个执行器 | 音频短任务、Agent多工具循环的协议与延迟不同 |
| YouTube OAuth两套入口 | `web/youtube-oauth.mjs` 与 `web/app-connections.mjs`；guest网关亦使用AppConnections | 统一底层客户端／凭据模型须先做消费者矩阵 | 开发者/个人/访客授权不能混用 |
| 原生视频与蒙太奇视频 | `video-generation/`、`openmontage/`；后者导入前者 `jobs.cjs` | 共享作业和交付接口，保留独立provider | 直接生视频与配音字幕合成的任务步骤、重试与成本不同 |
| 展示记忆与后端任务存储 | Memory/Idea demo 与 `.runtime`文件 | 清楚标记演示，未来接真实接口 | 不能把UI示例误迁为真实个人记忆 |

当前 `agent/tools/desktop-dispatch/` 等说明目录不能仅因名称就认定已经连上 Desktop执行器；需进一步核对真实调用与权限协议。

## 七、客户端与服务协议关系

| 客户端 | 证据入口 | 协议／边界 |
| --- | --- | --- |
| V2移动端普通聊天 | `appV2/app_mobile/src/services/chatApi.ts` | 默认生产域名；历史音频服务 `/api/chat`协议，与Creator Agent协议并存 |
| V2移动端Agent | `.../services/creatorAgentApi.ts` | `/api/creator-agent/chat`、`tasks/:id`、health；有独立地址和令牌存储 |
| V2移动端邮箱／连接器 | `agentEmailApi.ts`、`appConnections.ts` | Personal Agent接口；不是直接调用AgentMail私钥 |
| Web | `web/src/taskApi.ts` | API提交与轮询；Vite本地代理或访客网关提供接入环境 |
| Desktop | `desktop/spur-buddy/Sources/SpurBuddy/CloudAgent.swift` | 默认 `https://api.hispurring.com`，HTTP请求；不是导入V2 Node包 |

`appV2/app_mobile/src/config/backend.ts` 保留Java集成禁用说明。Java源码仍在不代表当前App/Web都依赖Java；具体新页面是否仍有遗留调用需在迁移前逐路由验收。

## 八、当前运行状态能确认到什么程度

| 事项 | 当前证据 | 本轮结论 |
| --- | --- | --- |
| Web、DSH、工具和访客部署入口 | 当前源码与脚本 | 源码确认存在，未重新执行 |
| 研究、邮箱、异步任务与视频线上闭环 | 会话终端输出及V2历史开发记录 | 历史验证；不可替代今天健康检查 |
| 15访客、2任务并发、1视频渲染锁 | 历史升级记录及相关guest/deploy脚本 | 设计与历史验收依据存在，当前运行参数待确认 |
| 今天ECS实际挂载和镜像 | 本轮未远程检查 | 待确认 |
| 本机页面正在正确使用哪份DSH | 代码有回退；未启动/探测进程 | 待确认，不能从浏览器URL判断 |
| 所有平台和所有数据动作均可用 | 工具声明有动作与会话限制 | 未证实，不得标“全部打通” |
| 长期记忆全链路 | UI示例、规划目录和任务存储是不同层 | 完整生产链路待确认 |

## 九、建议的整理边界

| 类别 | 建议 | 前提 |
| --- | --- | --- |
| 优先可合并 | 完全相同的DSH底座、办公writer、音频纯处理模块 | 明确唯一维护位置、固定版本、全部消费者测试通过 |
| 适合统一契约 | 任务状态、Artifact元数据、连接器结果、错误码、模型配置 | 保持旧API兼容层，不一次改所有客户端 |
| 必须保持隔离 | 个人/访客凭据和数据、每租户工作目录、队列额度、邮件批准流程 | 隔离是安全边界，不因“减少代码”取消 |
| 独立应用保留 | 新旧移动端、Desktop、Web、Java参考服务 | 是否废弃由实际用户、发布和产品负责人确认 |
| 外部源码单独管理 | DSH、MediaCrawler、Agent-Reach、OpenMontage等 | 维护版本、补丁与许可证清单，不和产品源码混为同一原创模块 |
| 暂不删除 | 实验目录、历史文档与docs素材 | 先审查构建/脚本引用、部署回滚和资产用途 |

推荐目标是“一份受控Agent底座 + V2产品编排 + 多客户端 + 明确租户隔离”，而不是把所有模块硬合并成一个进程或一个依赖包。

## 十、团队下一步讨论与最小实施顺序

1. **先固化当前工作区交付基线。** `git status --short` 显示Web、移动端、Dockerfile已修改，OpenMontage工具及多个部署脚本未跟踪；最新提交 `fec4955aa`（2026-11-09）不能代表全部当前实现。逐项确认Cursor/Codex改动归属，不直接重置或整目录覆盖。
2. **选定DSH唯一来源。** 决定保留V2副本还是提取共享vendor；后续显式配置唯一Harness路径，再去掉静默回退。先验证与根工程消费者兼容，再讨论删除副本。
3. **建立消费者与发布清单。** 列出App、Desktop、个人API、访客Worker、旧音频服务、办公网关各自的使用者、端口、配置与存储。线上清单须包含bind覆盖文件版本与哈希。
4. **小范围抽取重复模块。** 先办公writer/无状态函数，再音频配置与协议；每一步保留兼容入口、测试与回滚，最后处理客户端和发布结构。
5. **解除构建的个人机器和docs耦合。** 把venv依赖版本、OpenMontage素材来源、基础镜像和构建输入清单显式化；这属于后续实施，不是本轮已完成改造。

需队友确认的问题：旧App/H5/办公网关是否还有活跃使用者？根DSH是否还有独立任务？哪一版移动端及签名是发布主线？哪些未跟踪文件需要正式纳入交付？当前线上小包覆盖清单在哪里维护？演示记忆/Idea是否本期要接真实用户数据？

## 十一、可复查的只读命令

以下在仓库根执行；只用于复核，不会构建或部署。不要把私有环境文件内容粘贴到讨论中。

```bash
cd /Users/x/X/space/spur
git status --short
git log -5 --format='%h %ad %s' --date=short
rg -n 'harnessBinary|repoRoot|runHarness|makePatch|maxRunMs' V2/web/server.mjs
rg -n 'COPY|WORKDIR|pnpm|FROM' V2/agent/deploy/docker/Dockerfile \
  V2/agent/deploy/docker/OpenMontage.Dockerfile
rg -n 'import|officeOutput|writeOffice' V2/agent/gateway/server.mjs
rg -n 'demo|memoryDemoData|ideaDemoData' V2/web/src/MemoryPage.tsx V2/web/src/IdeaPage.tsx
```

本报告的合并建议均是讨论输入，尚未实施。当前最关键的整理对象是 **DSH双副本与隐式回退、复制后分叉的音频服务、镜像外部署覆盖、演示资产参与构建**；应先消除这些不透明关系，再进行目录清理。
