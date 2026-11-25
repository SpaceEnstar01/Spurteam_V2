# Spur V2 戒指转写接入 ChatGPT

ChatGPT 页右上角的 Ring 开关默认关闭。页面失焦时关闭接入。开启后，页面每秒检查已入库的录音，仅当 App 在前台、戒指状态回到 connected、录音确认为开启后由戒指录制、且本机转写完成时，才提交全文。同一条录音的网络重试复用任务 ID。关闭接入会取消客户端提交或重试，服务端已接收的任务继续执行。

涉及文件为移动端 CodexScreens.tsx、services/ringCodex.ts 和 services/codexApi.ts。语音与手输走现有 /api/codex/tasks 入口，沿用当前任务列表、Markdown 报告和会话。同步服务、原生蓝牙 SDK、转写服务及后端未修改。

## 验证

    cd /Users/x/X/space/spur/V2/appV2/app_mobile
    ./node_modules/.bin/tsc --noEmit
    npm test -- --runInBand --watchman=false __tests__/RingConnection.test.ts __tests__/RecordingPipeline.test.ts

类型检查和 21 项回归测试通过。真机验收时只运行 Spur Codex 测试版，分别在 Ring 开关关闭和开启时用戒指录制短音频。对比同步时间，再检查开启时完整转写只产生一个任务、报告能打开、追问沿用同一线程。异常时参考同目录的蓝牙同步恢复记录。

## 回退与手动闭环

自动提交测试版真机再次出现 0% 卡住。SDK 日志记录 89 包全部判丢失及文件拼接失败，原因尚未确认。已撤回 Ring 开关和录音轮询。当前版只在录音详情有已保存的转写时提供「发送到 ChatGPT」，把转写填进输入框，等用户确认发送。TypeScript 检查、21 项回归、签名构建、安装和启动通过。实物录音及任务回传待真机验收。

## 基于同步修复的自动提交

同步修复提交 8d8abfef2 装机后，用户确认同步恢复并完成手动发送验收。自动提交只在 ChatGPT 页获得焦点且用户开启 Ring 后注册事件监听，使用录音库更新、戒指恢复 connected 和 App 回到前台触发检查。没有周期扫描。同步、录音 SDK 和转写代码沿用当前版本。发送要求新戒指录音已完成转写，透传 ring 来源，失败重试沿用任务 ID 和文本。退出页面或关闭开关停止监听并取消客户端请求，服务端已接收的任务仍可完成。

TypeScript 检查与 RingConnection、RecordingPipeline 共 23 项回归通过。真机要连续录短音频，对比关开时的同步时间，并核对报告和同一个线程的连续互动。

## 保留开关选择与测试语音简短回复

Ring 开关通过 AsyncStorage 保存，监听从任务页移到 App 初始化。离开 ChatGPT 页面仍可在 App 前台自动提交。退出 App 后重新打开会恢复选择，已保存的历史录音不会重新发送。服务地址变更时需要手动关闭再开启接入。

Spur 派发戒指转写时提示 Codex 对单纯测试、数数和无明确任务的片段只简短确认，保留数字作为真实任务数据的情形。Mac 已载入新版提示词。本地真实 Codex 测试以戒指标记提交「一二三四五六七八九，测试」，完成并只返回一句。TypeScript 检查、23 项回归、签名构建和真机安装启动通过。跨页和重启后的实物录音待真机复测。
