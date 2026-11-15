# 执行任务主动进入 Workspace 与 DSH 行为修正

日期：2026年11月10日。

## 用户需求与真实问题

用户录音请求分析自己的YouTube频道播放量，却只收到分析计划与范围追问。用户要求所有执行任务在Workspace主动展示；缺少必要条件时在那里询问，不能把计划或提问当完成。想法不自动成为执行授权。

核实当前源码发现：

1. `V2/appV2/app_mobile/src/services/automaticReplies.ts` 只将execution=research派发到执行阶段，读取已连接应用数据的任务停留在分类与内容准备。
2. `src/adaptive/ChatWorkspaceHome.tsx` 把真实任务放在大量示例之后，且只给出“已分析好”式提示；clarification框架未完整纳入展示。
3. 同文件的withoutReverseQuestions函数会截掉“待确认”段落，使必要问题在详情和后续上下文中丢失。
4. `V2/agent/tools/connectors/youtube/index.cjs` 与client.cjs已有youtube_my_analytics，范围是最近28个完整UTC日；无需为默认范围再次询问。

## 本轮修改

- `src/intent/model.ts` 新增execution=connected_read，只接受高置信instruction/report、逐字原文证据且没有阻塞问题的只读请求；不授予写操作或低置信执行权限。
- `src/intent/prompt.ts` 新增任务执行规则，自己的授权频道读取不追问已知账号链接；可选范围采用明确默认，不生成虚构数据或用计划代替结果。
- `src/services/automaticReplies.ts` 把connected_read与公开research派发至现有Personal Agent；执行提示明确授权读取、YouTube默认28个完整UTC日、禁止外部写操作。
- 新增 `src/components/WorkspaceTaskUpdate.tsx`：任务状态、进展、阻塞、回复预览、可选确认及直接输入回答；接口返回仅显示“Agent有更新”，不据此声称任务完成。
- `src/adaptive/ChatWorkspaceHome.tsx` 把真实任务放到主页面前部，纳入instruction/确认事项；不再删除待确认问题。用户在主页面补充要求后使用同一录音任务更新执行进展和结果，写回已有录音存储。保留原文变化校验。
- `V2/web/server.mjs` 的makePrompt和DSH运行时persona补充结果优先、可选范围默认、权限/目标阻塞才询问规则；不修改上游DSH vendor，不替换Harness。

## 边界

只读自动执行不等于授权发送、发布、删除、交易或任意写入。没有账号授权或云端对应工具时必须如实说明。只收到模型回答不证明已经读到真实Analytics；实际取数与报告仍需手机和云端端到端验证。

本轮是手机App现有前台录音执行链路的Workspace主动展示；不是新建云端持久任务调度系统、系统推送或闭App也保证执行完成的后台服务。想法、观点不因展示变化自动执行。旧录音不会批量重发，新指令或用户指定重试才走新协议。

## 实际验证与交付

- TypeScript与改动文件ESLint通过。
- 4套App专项36项通过，覆盖授权读取执行分流、想法和低置信不升级执行、主页面确认输入、返回更新不伪称完成、提醒回归。
- 后端34项及YouTube客户端2项通过；server.mjs语法检查通过。
- iOS1049 Release构建、签名验证、devicectl安装和启动成功，设备查询确认1.0.2 (1049)。
- Linux amd64镜像task-workspace-v1构建成功；ACR推送结果随后记录。
- 自动SSH鉴权失败，不能宣称新DSH策略已切换至ECS。
- 新增已有ECS更新脚本：`V2/agent/deploy/docker/update-task-workspace-20261110.sh`。保留Caddy、域名、端口、原env和运行卷；停止旧容器后备份卷，保留旧容器，失败尝试回滚。脚本不会输出凭据。metadata备份包含env，禁止粘贴其内容。无状态迁移，失败回滚不自动恢复卷快照。

## 真机验收

云端更新成功后，新录音说“请分析我已连接的YouTube频道最近28天的视频播放表现，给出数据和结论”。Workspace应显示任务和执行反馈；如授权已失效，显示具体阻塞并在主页面补充/连接，不编造数字。确认真实数据日期范围；无数据也应明确报告无数据，不输出空泛计划。无私有真实取数验收前，不将此闭环标记为通过。

## 后续完善与发布阻塞

- 新增 `src/intent/taskReply.ts`，任务回复可携带受校验的确认问题，界面清除协议标记，保留人类可读结果；状态元数据不授予工具权限，不证明执行完成。
- `src/ring/types.ts`、`src/ring/store/useRecordingStore.ts` 保存执行反馈的确认问题。
- `src/intent/model.ts`、`src/intent/store.ts` 增加事项级executionUpdate及来源校验更新接口。进度、回复与问题关联同一个事项，界面状态不等于改变业务事项为completed。原文变化后旧执行更新被拒绝。
- Workspace也读取note来源的事项；用户从主页面继续任务时，结果写回同一事项，而非只留在组件临时聊天状态。
- 最终5套App专项共40项通过，TypeScript和改动文件ESLint通过。此前36项为中间阶段结果。
- ACR标签task-workspace-v1的两次推送均因连接超时失败；独立curl检查ACR_HTTP=000。镜像仅在本机已构建，digest为sha256:de084ee5255de3c6780788fa0015919a7eabb0539a169c5423983c9b3950f461，不能把该digest存在本地当作远端发布成功。
- 更新脚本语法检查通过，但仅当镜像成功推送后才能执行。没有运行云端更新脚本，ECS原服务保持。
- iOS1049为中间已安装版本；最终1051构建安装结果随后补记。1050只构建、未安装。

网络恢复后，Mac终端可重试：

```bash
docker push aed-acr-registry.cn-hangzhou.cr.aliyuncs.com/spur/spur-agent:task-workspace-v1 && ssh root@47.254.17.22 'bash -s' < /Users/x/X/space/spur/V2/agent/deploy/docker/update-task-workspace-20261110.sh
```

SSH由用户在自己终端输入密码；不可把密码发到聊天。只有脚本输出WORKSPACE_AGENT_UPDATE_OK才能记录云端切换成功。新版手机已包含读取任务默认范围与确认规则的请求提示，但云端通用DSH策略仍须镜像切换才生效。

最终1051 Release构建成功、签名验证通过；devicectl安装与启动成功，设备查询确认1.0.2 (1051)。云端推送及真机私有Analytics验收仍未完成，不记为端到端成功。
