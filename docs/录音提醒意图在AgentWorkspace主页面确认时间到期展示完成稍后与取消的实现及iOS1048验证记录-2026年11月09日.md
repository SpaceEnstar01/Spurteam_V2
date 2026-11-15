# 录音提醒进入 Agent Workspace 的实现与验证

日期：2026年11月09日。

## 本轮用户确认

录音示例：明天下午联系摄影师 Jack，讨论苏州拍摄，请做提醒。Agent 应提取提醒事项，在 Workspace 主页面询问具体时间；用户确认后，同一事项显示提醒时间、修改与取消；到期展示“已完成”“稍后提醒”。录音详情只提供提醒已进入 Workspace 的回执和入口，不要求用户打开分析报告。

## 源码核实

- `src/intent/model.ts` 的 parseEnvelope 对 kind/frame/direction/change 执行严格枚举校验，失败会抛出 Invalid classification。截图不能确定具体哪个字段错误，不能据此假定已设置提醒。
- 提醒 frame、dueAt、dueTimezone、本机持久化以及状态迁移已经存在于 `src/intent/model.ts`、`src/intent/store.ts`，但当前聊天式 Workspace 没有接入时间确认与到期交互。
- 不将“已读”或模型自然语言承诺当作执行成功，也不自动联系 Jack。

## 本轮代码

路径均相对 `/Users/x/X/space/spur/V2/appV2/app_mobile/`。

- 新增 `src/intent/reminders.ts`：依据录音原始时间与原文日期词生成建议日期；时间不可信时不推算相对日期；严格校验自定义日期与未来时间。
- 新增 `src/components/WorkspaceReminders.tsx`：主页面提醒卡、按早晚提供可选时间、完整日期时间输入、到期展示、完成、稍后10分钟、取消。每秒刷新当前显示，回到前台刷新；重开页面直接计算已到期状态。
- `src/adaptive/ChatWorkspaceHome.tsx`：在主聊天区域显示提醒卡，并从通用任务展示排除提醒，避免同一事项重复卡片。
- `src/intent/prompt.ts`：新增提醒协议，明确 kind=instruction、frame=reminder，不输出研究报告或执行凭据。
- `src/services/automaticReplies.ts`：格式校验失败最多进行一次分类重试，仍不合格则保留原文、显示可理解错误；只有既有明确研究指令可进入后续执行。
- `src/intent/store.ts`：时间问题识别补充“几点”“何时”；重新理解且日期未变时保留已确认提醒时间与 pending 状态，完成或取消仍保留。
- `src/components/RecordingReplyCard.tsx`、`src/screens/NoteScreen.tsx`、`src/navigation/types.ts`、`src/screens/HomeScreen.tsx`：纯提醒录音显示 Workspace 回执与入口，进入主页切回 Workspace。

## 数据与能力边界

复用现有 intent ledger 的手机 AsyncStorage 持久化。不新增云端调度器，不修改硅谷 ECS、Docker、HTTPS、邮件或 OAuth 配置。本轮是 App 内提醒，前台到期自动更新、后台后重开可查看到期事项；不是 APNs、锁屏弹窗或系统闹钟。已有独立 AlarmKit 功能不作为此次提醒的替代。

模型仍负责语义理解，严格校验无法保证所有模型输出都成功，因此只做一次格式重试，失败不伪造任务。旧失败录音不会被无授权批量重传；用户可重试指定录音。

## 实际验证

- TypeScript 无错误，改动文件 ESLint 通过。
- WorkspaceReminders、AutomaticReplies、IntentModel 三套共32项测试通过。
- 覆盖时间确认、同一事项标识保持、到期展示、稍后与取消、重开后的到期计算、不可信录音时间、错误日期、过去时间、分类修复以及提醒不启动研究执行。
- 测试并未实际等待明天，也未证明云端定时通知或锁屏通知。
- 设备检查发现当前已安装1047，故本次构建使用1048，避免覆盖成更低构建号。
- iOS构建安装结果在实际完成后补记。
- 后续实际结果：1048 Release构建成功，codesign验证通过；devicectl安装并启动成功，设备查询确认1.0.2 (1048)。尚待用户完成提醒真机业务验收。

## 真机验收

指定失败录音点击重新理解；返回 Workspace 应看到提醒卡，点击14:00/15:00或输入完整时间。为快速验证，可输入手机当前时间之后约两分钟的完整日期时间，保持 Workspace 前台，观察到期后完成或稍后操作。重新打开页面确认状态保留；未确认时间时不得显示“已设置”。
