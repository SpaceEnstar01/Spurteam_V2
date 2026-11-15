# 视频生成接入 MiniMaxAI/MiniMax-H3

日期：2026年11月14日。

## 需求与适配依据

用户要求增加并更换视频模型为 `MiniMaxAI/MiniMax-H3`。核对 SiliconFlow 官方说明，新请求使用 `/v1/video/submit`，H3 参数为 `duration`（5–15秒整数，默认5）、`resolution`（480p/768p，默认768p）、`ratio`（1:1、3:4、4:3、9:16、16:9、21:9）。不继续发送旧 `image_size`。

官方资料：

- https://api-docs.siliconflow.cn/docs/api/video-submit-post
- https://docs.siliconflow.cn/docs/userguide/capabilities/video

## 改动位置

路径相对 `/Users/x/X/space/spur/`：

- `V2/agent/tools/video-generation/client.cjs`：新增公共videoRequest构造与参数校验，支持H3；旧size映射为比例，不能把它宣称为H3精确像素尺寸。旧模型请求格式仍保持兼容，以便既有代码及历史查询不受此次参数变更影响。
- `V2/agent/tools/video-generation/index.cjs`：工具暴露duration/resolution/ratio；提交前校验并保存请求参数，继续使用原异步队列、任务去重和查询机制。
- `V2/agent/tools/openmontage/produce.cjs`：已有的H3部分适配改为复用公共请求构造；新生成不再回退到已退役Wan2.2模型。
- `V2/web/server.mjs`：DSH提示补充H3实际时长、分辨率和比例能力。
- `V2/agent/deploy/docker/agent.env.example`：示例默认改为H3。
- `V2/agent/config/siliconflow.env`：本地忽略配置仅替换视频模型字段，保持其他凭据；权限600，未输出任何密钥。
- `V2/agent/tools/video-generation/video.test.cjs`：增加H3参数、比例映射、提交前拒绝无效参数验证，保留状态与去重回归。

## 实际验证

- 现有Key只读请求 `/v1/models?type=video` 返回HTTP200，列表包含 `MiniMaxAI/MiniMax-H3`。没有输出Key或其他凭据。
- 视频生成与视频流测试共8项通过。参数验证测试使用mock网络，不发生付费生成。
- 相关JS语法检查通过。
- 本机4173端口检查未发现监听服务，没有重启本地服务；下次启动读取新本地配置。
- 没有提交付费视频生成，未验证真实成片质量或耗时。
- 未构建/推送Docker镜像，未连接或更新ECS，不能宣称云端手机调用已切换。

## 后续部署

本地Web下次启动使用H3默认配置。云端需使用包含本轮适配的新镜像，并将其受限env中的 `SPUR_VIDEO_T2V_MODEL` 更新为 `MiniMaxAI/MiniMax-H3`；不能只替换旧镜像的模型名，因为旧客户端仍会发送image_size。沿用现有API Key、域名、HTTPS、运行卷和异步任务机制。图生视频的参考图参数不属于此次接入范围。
