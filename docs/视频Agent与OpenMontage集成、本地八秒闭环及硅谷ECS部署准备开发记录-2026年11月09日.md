# 视频Agent与OpenMontage开发记录

日期：2026年11月09日。主工程：`/Users/x/X/space/spur/V2`。本文记录已完成操作，并列出尚待验证的部署命令；不包含凭据。

## 一、目标与实际链路

用户在Spur网页输入15条模拟徒步语音记录 → DSH使用工程现有模型API → 自主写英文标题、两句旁白、选择两个分镜 → `montage_generate`提交持久化任务 → Python固定执行器 → Sonia配音、字幕、音乐 → OpenMontage `VideoCompose.execute` → Remotion → FFmpeg校验 → 网页播放、下载MP4。

Codex负责工具接入和排错；本次8秒作品的创作参数由DSH生成。复用的是合法原始镜头与原创音乐，不是旧成片。素材尚未接入自动互联网搜索，15条记录尚非Ring数据库读取。

## 二、状态

| 项目 | 截至本文状态 |
| --- | --- |
| 60秒旅行视频及Sonia英文版 | 已生成；此前由Codex编排OpenMontage，不代表DSH独立闭环 |
| DSH自主创作8秒视频 | 本地已通过，用户已确认 |
| 本地网页播放、下载、Range与重启后保留 | 已通过 |
| 工具与视频回归测试、前端构建 | 已通过，共10项相关测试 |
| Linux/amd64镜像构建 | 用户已确认成功 |
| Linux镜像实际渲染 | 已给出命令，等待结果，不标记通过 |
| 上传ECS、ECS渲染、云端Web接入 | 尚未执行 |

本地成功任务：`d90d61e1-9b91-4436-8a61-403533a1aeb1`。
视频任务：`54546044-a50a-4a3e-a386-cec3b4b5bf08`。
模型：`deepseek-ai/DeepSeek-V4.1-Flash`。DSH约11.95秒，渲染约30.14秒；8秒、1080×1920、30fps、240帧、H.264/AAC，完整解码通过。

DSH生成旁白：

1. Legs heavy, doubts loud, I almost turned back.
2. Slow steps found the rhythm I had lost.

证据目录：`V2/docs/DSH自主调用OpenMontage生成八秒视频并完成网页交付验证-2026年11月09日/`，含MP4、截图、工具事件、模型usage、检查点和验证记录。usage按assistant/message去重：inputTokens=11889、outputTokens=497、cacheReadTokens=5760；缓存计数单列，未核对供应商实际账单。

## 三、代码与环境

- 新工具：`agent/tools/openmontage/index.cjs`，提供`montage_assets`、`montage_generate`。
- 后台：`worker.cjs`，每实例1个渲染；固定执行器`render.py`。
- 配置目录生成：`prepare-alps-catalog.py`；说明与测试同目录。
- 接入：`web/server.mjs`、`agent/tools/video-generation/jobs.cjs`、`web/src/VideoTask.tsx`。
- 构建：`agent/deploy/docker/OpenMontage.Dockerfile`、`prepare-openmontage-context.py`、`test-openmontage-linux.py`；原Dockerfile和`.dockerignore`补充新工具目录。
- 本机：Node 24.22.1、Python 3.12.14隔离环境、FFmpeg 9.0.2、Remotion 4.0.484、edge-tts 7.3.1、Chrome。
- Docker Desktop服务：29.9.2。基础镜像：`spur-agent:research-async-v3`。
- 模型凭据沿用`agent/config/siliconflow.env`；不得打印、打包或提交该文件。

## 四、本地运行命令

以下是依照当前源码整理的重启复现命令，依赖与素材此前已安装准备，**不是新电脑从零安装清单**。已有服务运行时跳过启动，避免占用4173/5174。

### 1. Mac：检查环境

```bash
cd /Users/x/X/space/spur/V2
export PATH="/opt/homebrew/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
"$HOME/.local/share/spur/openmontage-validation/venv/bin/python" --version
ffmpeg -version
```

### 2. Mac：生成素材目录与启动本机Agent

```bash
cd /Users/x/X/space/spur/V2
python3 agent/tools/openmontage/prepare-alps-catalog.py \
  --source "$PWD/docs/OpenMontage阿尔卑斯山十五条记录制作六十秒旅行视频验证-2026年11月09日" \
  --output "$HOME/.local/share/spur/openmontage-validation/catalog.json"

export SPUR_OPENMONTAGE_ENABLED=1
export SPUR_OPENMONTAGE_ROOT="$PWD/agent/runtime/OpenMontage-main"
export SPUR_OPENMONTAGE_CATALOG="$HOME/.local/share/spur/openmontage-validation/catalog.json"
export SPUR_OPENMONTAGE_PYTHON="$HOME/.local/share/spur/openmontage-validation/venv/bin/python"
export SPUR_RENDER_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export SPUR_FFMPEG=/opt/homebrew/bin/ffmpeg
export SPUR_FFPROBE=/opt/homebrew/bin/ffprobe
export NO_PROXY="localhost,127.0.0.1,::1,api.siliconflow.cn"
export SPUR_TTS_PROXY=http://127.0.0.1:7897
cd web
npm start
```

本次实测模型通过VPN代理连接失败、直连正常，因此仅模型域名加入NO_PROXY。7897为本机现有代理端口，其他电脑应按实际调整；不关闭TLS校验。

### 3. Mac另一终端：启动网页

```bash
cd /Users/x/X/space/spur/V2/web
SPUR_WEB_CLOUD=0 npm run dev
```

打开`http://127.0.0.1:5174/`，确认“本机Agent”，提交15条记录和8秒英文视频要求。任务完成后点“查看交付成果”。实际请求链路：

```text
POST /api/creator-agent/chat  {async:true, message:...}
GET  /api/creator-agent/tasks/<任务编号>
GET  /api/creator-agent/videos/<视频编号>
GET  /api/creator-agent/videos/<视频编号>/file
```

### 4. Mac：测试与构建

```bash
cd /Users/x/X/space/spur/V2
node --test agent/tools/openmontage/openmontage.test.cjs \
  agent/tools/video-generation/video.test.cjs web/video-stream.test.mjs
cd web
npm run build
```

预期测试全部通过、前端构建成功。覆盖输入约束、同任务去重、供应商队列隔离、执行器启动失败、原视频服务与Range响应。

### 5. Mac：只读查看本次任务与日志

```bash
cd /Users/x/X/space/spur/V2
cat web/.runtime/runs/d90d61e1-9b91-4436-8a61-403533a1aeb1/timing.json
cat web/.runtime/video-jobs/54546044-a50a-4a3e-a386-cec3b4b5bf08.render.log
```

健康检查必须符合本机Origin约定：

```bash
curl -sS -H 'Origin: http://127.0.0.1:4173' \
  http://127.0.0.1:4173/api/creator-agent/health
```

## 五、Linux镜像准备与构建：已执行

### 1. Mac：Docker检查

```bash
open -a Docker
cd /Users/x/X/space/spur/V2
docker info --format 'DOCKER_READY={{.ServerVersion}}'
docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'
```

`open -a Docker`仅启动后台，已运行可跳过。确认已有`spur-agent:research-async-v3`，约4.47GB。

### 2. ECS：只读资源检查

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
free -h
df -h /
```

用户回传：15个访客worker健康，使用v3；个人正式Agent仍为v2。总内存7.4GiB、available约5.7GiB；磁盘可用26GB。这只能支持先试单任务，不能推断15路渲染可同时运行。

### 3. Mac：准备独立构建上下文

本轮已由Codex执行；若目录存在，脚本会停止保护旧上下文，**无需重复执行**。

```bash
cd /Users/x/X/space/spur/V2
python3 agent/deploy/docker/prepare-openmontage-context.py
```

预期：`OPENMONTAGE_BUILD_CONTEXT_READY=/private/tmp/spur-openmontage-cloud-v1`。约46MB，包含源代码、前端、8段合法源镜头与音乐；无模型密钥、个人登录态或旧成片。

如需重新生成，用新目录，不删除旧上下文：

```bash
python3 agent/deploy/docker/prepare-openmontage-context.py \
  --output /tmp/spur-openmontage-cloud-v1-next
```

后续构建命令的上下文路径也须改为新目录。

### 4. Mac：构建与核对

```bash
cd /Users/x/X/space/spur/V2
docker build --platform linux/amd64 --pull=false \
  -t spur-agent:openmontage-v1 /tmp/spur-openmontage-cloud-v1

docker image inspect spur-agent:openmontage-v1 \
  --format 'ID={{.Id}} PLATFORM={{.Os}}/{{.Architecture}}'
```

用户已回传：

```text
ID=sha256:9eb0b5b45c161b4352cb4ab6783a0714d537fb12c9684320e555edc09f0de898 PLATFORM=linux/amd64
```

镜像增加FFmpeg、隔离Python、OpenMontage与Remotion依赖，默认`SPUR_OPENMONTAGE_ENABLED=0`。构建成功不等于实际渲染成功。

## 六、Linux真实渲染验收：等待用户输出

在Mac执行，脚本使用此前DSH真实计划，不调用模型；新生成配音与MP4：

```bash
cd /Users/x/X/space/spur/V2
python3 agent/deploy/docker/test-openmontage-linux.py
```

脚本实际启动`linux/amd64`容器，UID/GID为10001，限制3GB内存、2CPU，1GB共享内存，单独挂载`/tmp/spur-openmontage-linux-<随机编号>`。这个目录仅含非敏感计划和成品，为容器写入设置开放权限，不得放凭据。

成功才会输出：

```text
LINUX_OPENMONTAGE_RENDER_PASS
VIDEO=/tmp/spur-openmontage-linux-.../<编号>.rendered.mp4
DURATION=8 RESOLUTION=1080x1920 FULL_DECODE=true
```

失败保留`render.log`；停止并分析，不重复构建。如果明确定位为Mac容器访问配音服务的网络问题，可改用本机代理再测试（**本分支尚未验证**）：

```bash
python3 agent/deploy/docker/test-openmontage-linux.py \
  --tts-proxy http://host.docker.internal:7897
```

容器不能用`127.0.0.1:7897`访问Mac代理；ECS也不能照抄该地址。

## 七、上传与后续上线：计划，未执行

**仅Linux测试通过后执行以下归档传输命令。它们尚无本轮成功记录。**

Mac：

```bash
set -o pipefail
docker save spur-agent:openmontage-v1 | gzip > /tmp/spur-openmontage-v1.tar.gz
shasum -a 256 /tmp/spur-openmontage-v1.tar.gz
scp /tmp/spur-openmontage-v1.tar.gz \
  root@47.254.17.22:/root/spur-agent-upgrade/
```

ECS：先将SHA256与Mac核对，再载入并检查：

```bash
sha256sum /root/spur-agent-upgrade/spur-openmontage-v1.tar.gz
docker load -i /root/spur-agent-upgrade/spur-openmontage-v1.tar.gz
docker image inspect spur-agent:openmontage-v1 \
  --format 'ID={{.Id}} PLATFORM={{.Os}}/{{.Architecture}}'
```

完整导出会包含基础镜像层，上传包大小尚未测量，不保证为46MB。暂不沿用此前超时的杭州仓库推送路径。

后续必须先检查线上真实挂载与配置，制定独立ECS测试容器命令；目前不提供猜测性的正式切换命令。需验证：

1. ECS上的TTS访问、Chrome/FFmpeg与8秒真实渲染。
2. 保留访客独立数据卷、凭据、Node loader修复及现有挂载。
3. 全站渲染并发限制；不能将每worker单渲染误认为全站单渲染。
4. 网关视频路由、跨访客文件隔离、网页播放下载及失败反馈。
5. 备份和可回滚切换，保留`api.hispurring.com`与App服务。

截至本文：**本地产品闭环成功、Linux镜像构建成功；云端Web视频功能尚未上线。**

## 补充：Linux渲染崩溃与重试通过

首轮2渲染并发、3GiB限制下出现Chrome Page crashed。复用缓存音频和分镜，1并发、4GiB后真实渲染、8秒1080×1920音视频完整解码通过。两个参数同时改变，不能单独认定OOM或并发为根因。运行中内存接近4GiB，采样时无oom_kill记录。

Mac实际重试命令：

```bash
cd /Users/x/X/space/spur/V2
python3 agent/deploy/docker/retry-openmontage-linux.py /tmp/spur-openmontage-linux-ed1891fe-5192-4913-8382-03bbde7e4fe2
```

输出LINUX_OPENMONTAGE_RENDER_PASS；成片在原测试目录retry-single-page/final-8s.mp4。源码默认并发改1，测试内存改4GiB，已刷新原构建上下文；需重新build，复用安装层。镜像尚未重新构建或上传，云端仍未上线。

## 通用场景制作第二版：代码完成，等待云端验收

用户指出首版仅固定8秒山景，不满足任意场景。第二版新增video_produce工具、produce.cjs后台驱动、stock-search.py；支持5–30秒9:16，每分镜3–5秒，自动检索Wikimedia动态素材或调用现有硅基流动视频API生成，再由Sonia/Remotion/OpenMontage完成配音字幕音乐合成。仅做语法检查和前端构建，按用户要求不执行本地新渲染。

现有Key只读/models?type=video实查返回Wan2.2文生/图生视频模型；这不等于生成已成功。官方2026-11-03公告Wan2.2于11月10日下线，接口转MiniMax-H3；工具按实时可用列表选择已适配型号，不盲目提交未知模型。API凭据仅通过子进程标准输入传递，不写任务计划或浏览器。提交前持久化submitting，已有requestId不重提，避免重复扣费。

第二版云端包：/tmp/spur-openmontage-web-v2.tar.gz，136772字节；SHA256=1bc4652b348390a0eed1ac1c28122145dd02d4ae10c0168274ebd32810542b4a。复用已上传镜像，不重传镜像。隔离容器spur-openmontage-general-canary端口4391，独立数据卷；真实DSH验收案例是洛杉矶六位成人打3对3篮球、10秒英文视频，检索分支不在该案例中冒充验证。成功后deploy-ecs.py升级15访客并保留v1回滚容器。

尚未确认：付费视频生成权限与账户余额、生成成功率、自动素材检索实际可用性、人物数量与地点的视觉符合度。画面生成和库存素材均明确标注来源，程序通过不代表人物数量已视觉核实。第二版云端尚未部署。
