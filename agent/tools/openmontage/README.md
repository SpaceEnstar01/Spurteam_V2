# DSH → OpenMontage 最小视频工具

2026-11-09，本地真实验证成功。功能默认关闭；固定8秒、两个4秒分镜、9:16、Sonia英文配音。不是通用编辑器，也尚未上线云端。

DSH 从用户输入中理解记录，调用 `montage_assets` 获取合法素材目录，自主编写标题、两句旁白、选材理由，调用 `montage_generate`。工具将计划持久化后立即返回。Node 后台队列（每实例1个渲染）调用固定 Python 执行器，生成新配音、新字幕、音乐合成，调用 OpenMontage `VideoCompose.execute` → Remotion，最后 FFmpeg 完整解码验证。网站复用 `/api/creator-agent/videos/:id` 与 `/file` 播放下载。

创作内容来自 DSH，执行器不包含预写旁白。现阶段从已审核素材目录选择镜头，不做新素材互联网检索，也不读取 Ring 记忆数据库。第三方风景不能当作用户亲自拍摄。字幕为估算语句时序，非强制对齐。

## 本地启动（已有验证环境）

以下在仓库 `/Users/x/X/space/spur` 执行，使用已安装的隔离环境，不安装或更换模型。模型密钥沿用 `V2/agent/config/siliconflow.env`，不得打印、提交或发送给浏览器。

```bash
python3 V2/agent/tools/openmontage/prepare-alps-catalog.py \
  --source "$PWD/V2/docs/OpenMontage阿尔卑斯山十五条记录制作六十秒旅行视频验证-2026年11月09日" \
  --output "$HOME/.local/share/spur/openmontage-validation/catalog.json"

export PATH="/opt/homebrew/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export SPUR_OPENMONTAGE_ENABLED=1
export SPUR_OPENMONTAGE_ROOT="$PWD/V2/agent/runtime/OpenMontage-main"
export SPUR_OPENMONTAGE_CATALOG="$HOME/.local/share/spur/openmontage-validation/catalog.json"
export SPUR_OPENMONTAGE_PYTHON="$HOME/.local/share/spur/openmontage-validation/venv/bin/python"
export SPUR_RENDER_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export SPUR_FFMPEG=/opt/homebrew/bin/ffmpeg
export SPUR_FFPROBE=/opt/homebrew/bin/ffprobe
# 本次实测硅基流动直连正常、VPN代理失败，故仅该模型域名绕过代理。
export NO_PROXY="localhost,127.0.0.1,::1,api.siliconflow.cn"
# 本机当前代理端口；其他电脑应替换或清空该值。
export SPUR_TTS_PROXY=http://127.0.0.1:7897
cd V2/web
npm start
```

另一终端启动网页，并明确关闭原有硅谷桥接；已有服务运行时不要重复启动：

```bash
cd /Users/x/X/space/spur/V2/web
SPUR_WEB_CLOUD=0 npm run dev
```

打开 http://127.0.0.1:5174/，确认显示“本机 Agent”。粘贴15条记录，要求生成8秒英文旅行视频。后台输出在 `V2/web/.runtime/video-jobs/`，任务与渲染错误日志在同目录；不要为查询进度再次提交生成。

## 状态和边界

- JSON持久化、同一DSH任务去重；每实例单渲染。失败进入 `failed`，不会自动重做付费/配音调用。
- 渲染子进程不接收模型API Key，也不允许模型输入任意源文件路径或执行代码。
- 重启时原 `generating` 状态显式失败，现阶段不支持中途恢复渲染；已完成MP4保留。
- 原SiliconFlow视频worker忽略 `provider=openmontage`，避免误发给原付费服务。
- 渲染最长10分钟；关闭服务会停止该渲染进程组。
- 云端15个访客不能各自同时渲染；上线前仍需服务器级渲染并发限制、资源配额与访客隔离验证。
- 现有Dockerfile仅增加工具目录COPY保证关闭功能时仍可构建；并未包含OpenMontage、其渲染依赖或素材，不能把该改动当作云端功能已可用。

## 检查

```bash
node --test V2/agent/tools/openmontage/openmontage.test.cjs \
  V2/agent/tools/video-generation/video.test.cjs V2/web/video-stream.test.mjs
cd V2/web
npm run build
```

真实验收记录：`V2/docs/DSH自主调用OpenMontage生成八秒视频并完成网页交付验证-2026年11月09日/`。
