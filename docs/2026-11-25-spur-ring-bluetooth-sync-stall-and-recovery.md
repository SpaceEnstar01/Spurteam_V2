# Spur V2 戒指蓝牙同步卡顿与恢复记录

## 背景

项目为 Spur V2，真机为 eFLY（iPhone 12），本次取证使用 Spur Codex 测试版（`com.spur.recordingring.codexvalidation`）。本机语音识别恢复后，戒指录音同步再次卡住。录音的 BLE 同步、iPhone 本机转写、Codex 任务执行是先后发生的三个阶段。

## 卡点与证据

- 13:42，一条录音收到 24/24 个音频包，SDK 记录文件接收完成并发送 ACK。
- 13:45:20，App 发起 `fetchLargeAudioFile`。随后 SDK 一处记录「validate 没有丢包」，另一处报告 46/46 包丢失，并记录「没有找到对应的音频分包数据」「文件拼接失败」。这些记录说明故障发生在 BLE 收包或拼接阶段，尚未交给转写。日志不足以确认实际空口丢包率。
- 同一台 iPhone 当时有 Spur 正式版、Spur Codex 测试版和 Enstar 进程同时运行。多个 App 可能争用戒指连接，此次未独立验证根因。

## 最后如何恢复

排查时给出的操作是：打开 iPhone 的 App 切换器，划掉 Spur 正式版和 Enstar，只保留实际在测试的 Spur Codex 版在前台，再用戒指录一段约 5 秒的音频。随后用户确认恢复瞬间同步。本次恢复阶段未改代码。没有保存恢复那次的收包日志，因此将「单 App 前台复测」作为优先排查步骤，具体根因仍待确认。

## 下次怎么查

1. 先确认测试的是哪个 App 和 Bundle ID，关闭其他可能连接戒指的 App，再复测一条短录音。
2. 若仍卡住，记录录音和同步的具体时间、进度及提示。读取实际测试 App 的蓝牙 SDK 日志，依次找工作状态、`fetchLargeAudioFile`、`AC22` 音频收包、文件拼接和 `AC25` ACK。
3. 找到文件接收完成并成功入库后，再排查 Apple Speech。若没有发起同步、收不到包或拼接失败，沿蓝牙阶段继续排查。

本次日志读取命令（日期和 Bundle ID 按复现调整）：

```bash
dev=00008101-00014DA214FA001E
log_dir=$(mktemp -d /tmp/spur-ble.XXXXXX)
xcrun devicectl device copy from --device "$dev" \
  --domain-type appDataContainer \
  --domain-identifier com.spur.recordingring.codexvalidation \
  --source Documents/EveryDayLog/App_log_3/AppLog_BTAudioManager/Audio2026-11-25.txt \
  --destination "$log_dir/ble.log"
rg -n 'fetchLargeAudioFile|AC22|AC25|丢包率|文件拼接失败|文件接收完成' "$log_dir/ble.log" | tail -40
```
