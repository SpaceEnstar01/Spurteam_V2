# V2 第一阶段代码统一与依赖迁移报告

日期：2026年11月14日。工程：`/Users/x/X/space/spur/V2`。

## 一、结论与验收边界

**核心目标已实际验证：V2 可以不读取根目录旧工程，独立构建 DSH 和 Web、启动 Agent，并完成异步任务、真实工具调用和文件下载。**

验证不是“文件搬完了”：测试在 macOS 沙箱中禁止服务及其子进程读取根目录 `agent/`、`app/`、`desktop/`，先验证禁读有效，再启动 V2 服务，实际执行 DSH → `save_document` → 文件交付。模型端为本地确定性测试服务，未使用私人 Key 或付费模型，不能据此宣称已重新验收真实模型效果或所有外部平台。

**尚不能标为全工程全部验收通过：** App 全量测试有4项现有断言失败；本机 Docker daemon 未运行，未完成本轮 Linux 镜像重建验收；未重新编译原生App、未真机验收、未部署云端。详情见后文。

本轮没有拆分模块，没有删除根目录旧代码，没有操作生产，没有自动提交或推送。

## 二、开始时的真实状态与保护措施

1. 阅读 `SPUR_ARCHITECTURE_AUDIT团队协作-工程文件具体剖析.md`，重新检查源码与 Git 状态。
2. 工作区已有来自 Cursor/Codex 的未提交改动，包括 Web、App、视频工具、Dockerfile，以及未跟踪的 OpenMontage、测试和部署脚本。没有执行 reset、clean、stash 或整目录覆盖。
3. 对开始时106个可检查的未提交／未跟踪普通文件记录 SHA-256；跳过名称涉及环境变量、密钥、凭据、私有文件的项。基线只保存在本机 `/tmp/spur-v2-migration-baseline-20261114.json`，未写入Git。
4. 结束复核：这些基线文件没有缺失，只有本轮明确修改的 `V2/web/server.mjs` 内容变化；其他原有未提交文件字节未变。该检查不涵盖已排除的敏感文件和所有原先干净的文件；本轮亦未打开或修改私人配置。
5. 根目录 `agent/`、`app/`、`desktop/` 没有本轮源码改动。未重启既有本地4173服务、前端或线上服务，任务验收使用随机本地端口及独立临时数据目录。

## 三、依赖检查结果与迁移决策

| 对象 | 检查结果 | 本轮处理 |
| --- | --- | --- |
| `V2/agent/runtime/deepseek-harness/` | 对照根目录7902个受Git管理的普通文件，排除环境文件后，本轮纳入7902项，缺失0、内容差异0 | 不重复复制源码 |
| V2 DSH依赖／构建产物 | 开始时没有 `node_modules`、没有 `apps/cli/lib/bin.js` | 在V2内独立安装依赖、构建CLI及库 |
| Web DSH选择 | 优先V2，缺失时使用根目录 | 删除根目录回退；缺少V2构建时明确不就绪 |
| 旧CLI研究入口 | `agent/integrations/creator-research/run.mjs` 也有父目录回退 | 删除回退，仅检查V2自身Harness |
| 办公工具／网关 | 必需的原工具已在V2；网关相对导入V2工具 | 不重复复制，不改固定办公流程 |
| 音频后端 | V2已有副本，`agent.ts`、`config.ts`保留V2有效分叉 | 不用旧副本覆盖，不恢复旧默认Agent命令 |
| V2 App | 源码、依赖与本地工具在V2；与旧App框架不同 | 不迁入旧Expo工程，不混合Pods或原生工程 |
| Desktop／旧H5 | 未发现其是当前V2主运行链所需源码依赖 | 不搬运无关独立应用，根目录保留 |
| Docker基础构建 | 上下文已是V2，COPY V2内Harness与工具 | 无需更改Dockerfile；保留队友现有内容 |
| 历史文件 | `V2/files/creator-research/*/run.json`记录旧根目录Harness路径 | 历史证据不是执行配置，保留原样 |

本阶段不是“把所有旧目录搬进去”，而是收敛 V2 的有效依赖。实际需要补齐的是 V2 的运行依赖与构建输出，不存在必须再整体复制一次的 DSH源码。

## 四、实际修改与新增文件

| 路径（相对V2） | 变化 | 业务影响 |
| --- | --- | --- |
| `web/server.mjs` | 删除 `repoRoot` 与根目录Harness候选；只选择 `V2/agent/runtime/deepseek-harness`；改善未构建提示 | 只改变依赖选择与配置错误提示，不改API、模型、工具权限或鉴权 |
| `agent/integrations/creator-research/run.mjs` | 去掉 `../agent/runtime/deepseek-harness` 回退 | 研究CLI也必须使用V2内构建 |
| `scripts/check-v2-dependencies.mjs`（新增） | 检查产品源码相对导入、旧根目录绝对引用、安装依赖及Harness workspace符号链接、Docker越界COPY、已知回退 | 独立性静态检查；不启动服务、不读env/session |
| `scripts/verify-independent-agent.mjs`（新增） | 隔离配置、临时HOME/runtime、随机端口、本地模型测试服务；可启用macOS旧目录禁读沙箱 | 可重复验证真实DSH工具闭环，不调用收费API |
| `README.md` | 增加V2独立构建、启动、验证入口；纠正聊天API未接通的过时表述 | 文档更新，保留历史迁移章节 |
| `web/README.md` | 明确只使用V2 Harness；纠正默认Vite代理的后端端口说明 | 默认4173后端、5174前端；不改代理代码 |
| `docs/V2_MIGRATION_REPORT.md`（新增） | 本报告 | 交付与后续验收依据 |

此外在V2 Harness内生成被忽略的 `node_modules`、`lib` 等构建产物；没有复制根目录node_modules，没有更改Harness受版本管理源码、锁文件或业务配置。Web构建生成现有dist，测试使用临时目录。构建输出不替代源码和锁文件的交付。

## 五、实际执行的安装与构建

### 5.1 运行环境与版本

本机默认Node为20.20.2，不适合DSH。本轮选用已有的 Node24.22.1：

```bash
export PATH="/Users/x/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
# v24.22.1
```

这是本机工具位置，不是V2源码依赖。新机器可以使用自己安装的Node24，无需安装Codex。

首次 `pnpm install --frozen-lockfile` 由本机包装器实际使用11.25.0并安装成功。随后通过npm缓存安装并明确调用项目指定的 **pnpm11.7.0**，重新执行冻结安装和构建，均成功。没有修改锁文件以适配新版本。

本机指定版本的实际执行入口为：

```bash
# 在 /tmp 获取工具，避免 npm exec 扫描上游workspace的文档项
cd /tmp
npm exec --workspaces=false --yes --package=pnpm@11.7.0 -- pnpm --version
# 11.7.0

cd /Users/x/X/space/spur/V2/agent/runtime/deepseek-harness
CI=true node /Users/x/.npm/_npx/36898ac2e9783e89/node_modules/pnpm/bin/pnpm.mjs install --frozen-lockfile
CI=true node /Users/x/.npm/_npx/36898ac2e9783e89/node_modules/pnpm/bin/pnpm.mjs run build:lib
```

`_npx`哈希为本机缓存路径，不应写死到其他机器配置。安装期间有上游可选SDK下载重试、非当前平台包和构建前demo bin不存在的警告，最终指定版本安装与build退出码均为0。

一次在Harness目录直接执行 `npm exec` 的尝试因npm把 `vendor/CLAUDE.md` 当workspace目录而返回 `ENOTDIR`；改为在 `/tmp` 获取指定pnpm后直接调用其CLI成功。没有为这个工具调用问题改上游workspace。

### 5.2 其他机器的等价复现命令

以下是基于本轮验证的等价路径，替换V2位置，不复制本机缓存路径。前提是Node24、pnpm11.7.0已安装，网络能下载锁文件依赖：

```bash
cd /你的工程/V2/agent/runtime/deepseek-harness
pnpm --version                 # 必须确认11.7.0
CI=true pnpm install --frozen-lockfile
pnpm run build:lib

cd ../../../web
npm ci
npm run build
npm start                     # 默认4173；真实任务需服务端配置
```

新机器的Playwright MCP依赖与浏览器、Python工具和可选媒体引擎，仍应按 `agent/deploy/docker/README.md` 等对应运行文档准备；本轮复用了V2已有的这些依赖，未重新安装所有平台工具。不要把“消除根目录依赖”理解为无需Node、浏览器、网络或外部服务。

## 六、测试结果

| 项目 | 实际操作 | 结果 |
| --- | --- | --- |
| DSH源码完整性 | 根目录Git跟踪文件逐字节比较 | 7902项，缺失0、差异0 |
| 独立依赖安装 | pnpm11.7.0 frozen install | 通过，锁文件未改变 |
| DSH构建 | `pnpm run build:lib` | 通过，CLI已生成 |
| DSH隔离构建 | 禁读根目录三处旧工程后再次build | 通过，退出码0 |
| Web构建 | `npm run build` | TypeScript及Vite通过 |
| Web隔离构建 | 相同禁读策略下build | 通过，退出码0 |
| Web回归 | `node --test *.test.mjs email/*.test.mjs guest/*.test.mjs tests/*.test.mjs`（在web目录） | 95通过，0失败 |
| 工具回归 | personal-workspace、video-generation、image-generation、playwright-browser、research-adapter、openmontage、YouTube的 `*.test.cjs/mjs` | 33通过，0失败 |
| 音频服务 | 在 `cloud/audio-agent` 执行 `../../.tools/node_modules/.bin/bun --no-env-file test tests` | 5通过、13断言、0失败 |
| App常规检查 | `bash scripts/check-mobile.sh` | lint、类型检查通过；Jest为275通过、4失败，42套通过、2套失败 |
| App隔离类型检查 | 禁读旧工程后执行其 `node_modules/typescript/bin/tsc --noEmit` | 通过，退出码0 |
| 源码/链接检查 | `node scripts/check-v2-dependencies.mjs` | 297个源码/配置文件、5700个链接，检查结果failures为空 |
| 独立Agent任务 | `node scripts/verify-independent-agent.mjs --deny-parent` | 通过，详见下节 |
| 语法和差异格式 | 两个修改入口 `node --check`、相关跟踪改动 `git diff --check` | 通过 |
| Docker运行条件 | `docker info` | 失败：本机daemon未启动；未执行本轮镜像重建 |

静态检查不是任意动态路径的形式化证明：它重点检查产品入口、部署脚本、安装图和已知回退；历史文档、运行证据、私人配置、所有外部项目内部行为不在该扫描的完整证明范围内。因此另用操作系统禁读策略验证实际构建和任务。

### 6.1 独立运行的实测证据

```text
PARENT_AGENT_APP_DESKTOP_READ_DENIED=true
V2_INDEPENDENT_AGENT_PASS model_calls=2
```

本次任务：`b0384a48-2aaa-4b89-88b6-1246d5621f1d`。

实测覆盖：服务health正常；匿名请求401；异步提交202；另一连接身份查任务404；真实DSH完成两轮模型HTTP交互和 `save_document` 工具调用；任务finished；读取持久化result；文件下载200且字节正确；动态注册的插件路径均在V2内。

结果目录（系统临时目录可能被清理）：

```text
/var/folders/6j/911w8p554qv3ctgwplsb8s6c0000gn/T/spur-v2-independent-y2cH9L/
  verification.json
  server.log
  runtime/runs/<任务编号>/result.json
  runtime/runs/<任务编号>/harness.patch.json
```

脚本在结束时停止自己启动的测试进程，不切换既有浏览器页面使用的服务。不读取个人模型配置、邮箱或平台授权。

### 6.2 App失败项与暂停范围

| 测试文件 | 失败断言／现象 | 本轮处理 |
| --- | --- | --- |
| `appV2/app_mobile/__tests__/AgentDashboard.test.tsx` | 空工作区说明、来源支撑的想法卡、实际执行结果展示，共3项；当前首页展示与旧断言不一致 | App相关现有修改字节保持不变，不猜测队友预期，不改UI或断言 |
| `appV2/app_mobile/__tests__/CreatorAgentIntegration.test.ts` | 预期 `personalAgentProgress` 为“任务完成”，当前返回“Agent 已返回执行反馈” | 不更改业务状态语义来凑通过，留待队友确认 |

这4项来自本轮未修改的App实现/测试组合；不将其标为通过，也不据此宣称所有App功能无回归。移动端整体验收需先确认展示与状态文案的有效基线，再处理对应测试。

## 七、日志与复核

安装、构建和测试日志位于本机：

```text
/tmp/spur-v2-dsh-install.log
/tmp/spur-v2-dsh-install-pinned.log
/tmp/spur-v2-dsh-build.log
/tmp/spur-v2-dsh-independent-build.log
/tmp/spur-v2-web-build.log
/tmp/spur-v2-web-independent-build.log
/tmp/spur-v2-web-tests.log
/tmp/spur-v2-tool-tests.log
/tmp/spur-v2-audio-tests.log
/tmp/spur-v2-mobile-check.log
/tmp/spur-v2-app-independent-typecheck.log
/tmp/spur-v2-dependency-check.json
/tmp/spur-v2-independent-agent.log
/tmp/spur-v2-docker-check.log
```

复跑关键验收（V2目录，Node24）：

```bash
node scripts/check-v2-dependencies.mjs
node scripts/verify-independent-agent.mjs --deny-parent  # macOS
# 其他系统可不带--deny-parent运行闭环，但不能宣称有macOS禁读验证
```

## 八、剩余风险与下一步

1. **全工程验收尚有边界。** 先对齐App4项失败的产品预期；原生编译/真机、真实模型、外部平台会话与Linux容器未在本轮重新验收。
2. **Docker daemon不可用。** `docker info`退出1，提示无法连接 `/Users/x/.docker/run/docker.sock`。本轮未启动Docker Desktop，也未冒充镜像构建成功。基础Dockerfile已以V2为上下文；OpenMontage派生镜像仍依赖本地 `research-async-v3` 基础镜像标签。
3. **既有构建耦合保留。** OpenMontage准备脚本读取V2内部docs素材和本机Python隔离环境，未涉及根目录源码，但跨机器完整复现仍需准备这些输入；本阶段不重设计媒体资产和模块边界。
4. **私人配置未审阅。** 未读取私人env、平台登录态、令牌；用户显式设置的外部路径覆盖值不在本次无密钥测试的保证范围内。实际接回个人环境时应只核对非敏感路径参数，不复制旧凭据。
5. **既有本地进程未切换。** 已在运行的Node进程可能仍持有启动时选择的旧Harness；以后从V2重新启动的新服务才应用本轮路径规则。生产未改变。
6. **未提交内容仍需交付管理。** 当前工作区原有未跟踪工具和发布脚本被保留；不能只拿一个旧Git提交代表本次V2工作目录。发布前需队友共同确认纳入版本管理的文件清单。

本阶段结论：**根目录DSH隐式依赖已消除，V2独立构建/启动/任务交付核心闭环通过；完整App、容器与生产验收仍有明确未完成项。** 根目录旧工程继续保留作为对照和回滚依据，暂不进入第二阶段拆分。
