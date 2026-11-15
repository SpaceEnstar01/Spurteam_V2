# Spurteam_V2 首次提交候选文件审查

日期：2026年11月15日。范围：仅整理 Git 候选与忽略规则，未提交、未推送、未部署，未修改业务代码，未删除本地原始文件。

## 保留与排除

| 类别 | 当前策略 |
| --- | --- |
| Agent、App、Web、Cloud | 保留源码、依赖清单与锁文件、配置模板、Dockerfile、构建脚本 |
| DSH、OpenMontage | 保留现有依赖源码及许可证；不整理其业务实现 |
| 实际使用的外部子模块 | Agent-Reach、MediaCrawler、Playwright MCP，保留固定提交引用 |
| 未使用的运行时项目 | openclaw、OpenMausBot-main、nanoMuse、dsh-superagent-prototype 不进入候选，本地目录保留 |
| 音视频 | 候选中为零；历史成片、录音、音乐、示例片段全部排除 |
| 图片 | 保留 App 图标、App 界面素材、DSH 必需资源和小型测试夹具；排除历史截图、OpenMontage 示例图片及文档展示图片 |
| 运行数据 | 不纳入 node_modules、Pods、构建缓存、浏览器状态、会话、环境密钥、压缩包和生成文件 |
| 文档 | 保留 docs 顶层 Markdown；历史附件子目录不纳入 |
| 原生 SDK | 保留 App 使用的 framework/xcframework 等必要依赖；它们不是可随意删除的缓存 |

## 统计与安全检查

最终精确统计见下方。大小是本仓库候选 blob 的未压缩总量，不包括子模块仓库内容，也不是 GitHub 上传流量。

- 当前音视频候选：0。
- 超过 10 MiB 的单个候选 blob：0。
- 扫描候选文本中的私钥头、常见 API Key、GitHub Token、AWS Key 模式：3 个匹配，均为 OpenMontage/DSH 的测试凭据夹具；已查看测试上下文，未发现真实凭据。模式扫描不能保证识别所有凭据格式。
- 子模块内容不在主仓库 blob 扫描范围内，首次发布前还需分别检查其固定提交及许可证。
- git diff --cached --check 发现已有源码、许可证与 SDK 头文件的空白格式问题；本轮不修改这些业务/第三方文件。

## 克隆后的限制

1. 必须使用 `git clone --recurse-submodules <仓库地址>`，或克隆后执行 `git submodule update --init --recursive`；三个外部项目不是被复制进主仓库的完整源码。
2. 不分发任何私人环境变量、平台登录态、邮箱与 OAuth 授权，开发者需自行配置。
3. `agent/deploy/docker/prepare-openmontage-context.py` 和 `test-openmontage-linux.py` 仍引用历史 docs 演示目录及本机环境。示例音乐、分镜视频、清单与测试 JSON 未随仓库分发，因此旧 OpenMontage 演示打包/验收脚本不能直接在干净克隆中运行。部分上游示例图片模板也不完整。后续应改为下载合法测试素材或显式提供输入；本轮按要求不改脚本、不上传素材。
4. OpenMontage Dockerfile 仍以已有 research-async-v3 镜像为基础；不等于已验证从零 Docker 构建。
5. 本轮未重新安装依赖、构建、运行 App、Docker 或云端验收，不将候选整理等同于完整独立复现通过。

## 复核命令

在 V2 目录执行，只读检查：

```bash
cd /Users/x/X/space/spur/V2
git diff --cached --stat
git ls-files --stage
git submodule status
git status --short
```

不要直接运行 `git add .` 绕过候选审查。子模块工作目录、历史附件和本地密钥仍保留在电脑上；忽略规则只决定是否进入版本控制。

## 当前统计

- 候选条目：10,784，其中普通文件 10,781，子模块引用 3。
- 候选 blob 总量：约 85.03 MiB（未压缩，不含子模块内容）。
- 相比整理前约 1,015.94 MiB，减少约 91.6%。


## 2026年11月15日首次发布前复核

用户已授权：验证后提交并推送至 SpaceEnstar01/Spurteam_V2。此前“未提交/未推送”的描述是候选整理阶段状态。

| 检查 | 实际结果 |
| --- | --- |
| 三个子模块 | 分别向全新临时 bare 仓库 fetch 固定 SHA，全部成功；本地 HEAD 与索引引用一致 |
| Web | npm run build 通过 |
| DSH | Node 24.22.1 完整 build 通过，生成 200 个客户端构建文件；无初始 HEAD 时显式设置测试元数据 DSH_CLIENT_COMMIT_HASH=0000000，首次提交后使用正常 HEAD 再次完整构建也已通过 |
| 独立 Agent | check-v2-dependencies 无失败；verify-independent-agent --deny-parent 通过，真实 DSH 工具调用、文件交付通过，模型使用本地确定性夹具，无付费调用 |
| Web/工具测试 | 97 项通过，0 失败 |
| App 静态检查 | TypeScript 与 ESLint 通过 |
| App JS 生产包 | iOS 与 Android Metro bundle 均通过，资源复制成功 |
| App iOS 原生 | Xcode 27.2，Debug iOS Simulator，无签名，BUILD SUCCEEDED |
| App Jest | 275 通过、4 失败，仍为此前已记录的 AgentDashboard 与 CreatorAgentIntegration 两个测试套件；本轮没有修改业务源码，不将其标记为全绿 |
| Android 原生 APK | 本机缺少 Android SDK，未验证 |
| Docker/线上 | 本轮不构建、不部署，旧演示素材缺失限制仍适用 |

构建仅使用已有依赖；DSH 构建过程中 pnpm 尝试同步其包管理工具环境。临时日志和产物均不纳入提交。工作树已追踪文件与候选索引无业务源码差异，候选文件没有缺失。

Android 的 app/debug.keystore 是已有 React Native 调试签名资源，保留用于开发构建，不是生产签名凭据；生产密钥不得使用此文件，也不纳入仓库。三个外部子模块的克隆网络可用性已验证，不代表所有平台登录或外部服务均已端到端验证。

复核命令（项目根目录，使用 Node 24）：

```bash
npm --prefix web run build
node scripts/check-v2-dependencies.mjs
node scripts/verify-independent-agent.mjs --deny-parent
cd agent/runtime/deepseek-harness
npm run build
```

App 在 appV2/app_mobile 执行 `npx tsc --noEmit`、`npm run lint`、`npm test -- --runInBand --watchman=false`；iOS 在 ios 目录执行：

```bash
xcodebuild -workspace SuprRing.xcworkspace -scheme SuprRing \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/spur-v2-native-build CODE_SIGNING_ALLOWED=NO build
```
