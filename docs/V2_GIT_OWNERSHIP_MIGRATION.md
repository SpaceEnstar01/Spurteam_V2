# V2 原位置独立 Git 管理记录

日期：2026年11月14日。

## 目标与当前状态

- 日常开发位置不变：`/Users/x/X/space/spur/V2`。
- V2现在拥有独立 `.git`，初始分支为 `main`，没有创建第二套工程。
- 父仓库停止在索引中跟踪V2，并通过 `/V2/` 排除；V2不是父仓库的子模块。
- 尚未创建提交或推送。随后根据用户提供的地址，将V2的origin绑定到 `https://github.com/SpaceEnstar01/Spurteam_V2.git`；只读 `git ls-remote --heads origin` 成功且未返回分支。父仓库GitHub历史仍保留V2，需之后提交退管变更才会更新远程。
- 业务源码、依赖、运行数据未移动或删除；没有运行构建、重启服务或部署。

## 实际操作

1. 检查父仓库暂存区为空，确认现有未提交改动；V2原先没有独立Git。
2. 备份父仓库索引、Git配置、忽略文件及子模块登记文件。
3. 在父仓库执行 `git rm -r --cached -- V2`，只从索引移除79888个条目，不删除工作文件。
4. 父 `.gitignore` 添加 `/V2/`；只将本轮这条规则加入暂存区，没有把队友原先的忽略文件改动一起暂存。
5. 父 `.gitmodules` 移除原属V2的五项登记，保留说明注释；清理相应父仓库本地子模块配置。
6. V2初始化独立Git；将原五个第三方子模块以去掉 `V2/` 前缀的路径登记到V2自己的 `.gitmodules`。
7. 扩充V2忽略规则，覆盖运行目录、私人环境文件、本机依赖、平台登录目录、签名文件及大体积生成媒体。

父仓库索引变更和V2的元数据变更已暂存；没有全量暂存V2业务源码，避免把待审阅内容直接纳入首个提交。

## 内部子模块

V2独立仓库保留以下既有第三方子模块，不建立V2与父仓库的子模块关系：

| V2内路径 | 当前固定提交 |
| --- | --- |
| `agent/runtime/Agent-Reach` | `47898829204ad27521d8a1719e3aeca3b8a3e0ca` |
| `agent/runtime/MediaCrawler` | `54a3d92412f4b20c06b45f1d542b78dd92049d6d` |
| `agent/runtime/dsh-superagent-prototype` | `6337fc823ce20251c8de8085948165c81aaa701e` |
| `agent/runtime/mcp-servers/playwright-mcp` | `f6807605220f8c69f564feb3f83b5a3a330d0458` |
| `agent/runtime/nanoMuse` | `14fc6aeda0152ebec7759cae820044e837db1156` |

这些项目的Git元数据原本就在V2内部，因此无需移动或重新克隆。新V2仓库已登记并执行本地submodule init，没有联网更新它们。以后队友克隆需要 `--recurse-submodules`；远程可用性与新机器完整克隆仍待验证。

## 复核命令

```bash
# 父仓库：应无输出；暂存区的大量V2删除表示解除跟踪，不是文件丢失
git -C /Users/x/X/space/spur ls-files -- V2

# V2：应返回原开发目录自身
git -C /Users/x/X/space/spur/V2 rev-parse --show-toplevel

# V2：应列出五个已有第三方子模块
git -C /Users/x/X/space/spur/V2 submodule status

# 分开查看两个仓库，不要在父仓库提交V2业务代码
git -C /Users/x/X/space/spur diff --cached --stat
git -C /Users/x/X/space/spur/V2 status --short
```

## 尚未完成的发布准备

1. 新GitHub地址已由用户提供并绑定为origin：`https://github.com/SpaceEnstar01/Spurteam_V2.git`。本轮未创建远程仓库，未上传任何内容；远程未返回分支不等于已验证所有发布设置。
2. 审阅V2首批提交的源码、配置模板、历史文档、许可证与敏感信息，不执行未经检查的 `git add .`。
3. 生成媒体和私人运行数据保留在本机但不纳入默认提交。OpenMontage构建依赖的精选片段/音乐需要单独制品恢复或明确的版本管理规则；本次没有解决远程克隆后的完整媒体复现。
4. 父仓库退管提交与V2首次提交分别审阅、分别确认，不混入父仓库原有其他改动。
5. 未来从新远程做一次隔离克隆验收；App既有4项测试失败与Docker/完整部署未验证边界仍保留，本次Git整理不代表其已修复。

## 回滚依据

仅Git元数据和原配置的私有备份位于：

`/Users/x/X/space/spur/.git/v2-detach-backup-20261114-231015/`

包含原父索引、配置、两层忽略文件及原子模块登记等，不是第二套源码。不要上传此目录。若之后有人暂存、提交或继续开发，不能直接用旧索引覆盖；先检查后续变化，再制定回滚操作，避免抹掉队友状态。


## 2026年11月15日候选策略更新

首次提交候选已按源码优先策略整理，详情见 `FIRST_COMMIT_REVIEW.md`。当前只保留 Agent-Reach、MediaCrawler、Playwright MCP 三个内部子模块；nanoMuse 与 dsh-superagent-prototype 不再注册为候选子模块，本地目录仍保留。此前关于演示素材待决和仅暂存少量元数据的描述属于历史阶段，当前以最新审查报告为准。未提交、未推送。
