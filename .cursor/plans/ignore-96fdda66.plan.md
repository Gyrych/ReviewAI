<!-- 96fdda66-f920-4e9f-8d79-76033e6b7e6b 73da5c73-db87-49ba-802c-00525cb9598f -->
# 忽略并移除运行时工件与对话数据

目标：将运行时生成的 LLM 对话工件、sessions、临时上传与日志从代码仓库中移除并添加 `.gitignore` 规则，防止将来再次提交。

步骤（可直接执行）：

1. 在仓库根的 `.gitignore` 中追加以下行：
```text
# 运行时存储与工件
/services/**/storage/
/services/**/storage/**

# artifacts / sessions / tmp (显式)
/services/**/storage/artifacts/
/services/**/storage/sessions/
/services/**/storage/tmp/

# uploads（网络检索 & 解析工件）
**/uploads/

# 日志文件
*.log
**/*.log

# 本地 env
.env
.env.*

# 可选：构建产物（如团队不提交）
/dist/
/build/
```

2. 删除当前仓库中已存在的运行时工件文件/目录（按下列模式）

   - `services/*/storage/artifacts/*`
   - `services/*/storage/sessions/*`
   - `services/*/storage/tmp/*`
   - 根目录或任意子目录下的 `*.log` 文件（例如 `circuit-agent-dev.log`, `frontend-dev.log`, `start-all*.log` 等）

注意：我将仅删除工作区中当前存在的这些文件/目录，不会修改提交历史（你会在本地再次执行 git add/commit/push）。

3. 更新 `CURSOR.md`：在变更记录中追加本次操作的条目，说明目的、变更内容与受影响路径。

4. 验证：列出被删除文件/目录的最终清单并返回给你供记录。

变更影响（简短）

- 会从仓库工作区移除对话/报告/检索工件与日志，避免敏感数据进入 Git 历史。你需要在本地运行 `git add -A && git commit -m "chore: remove runtime artifacts and add .gitignore"` 将这些变更提交到仓库。

如果存在特定文件你希望保留的一小部分工件，请在我执行前列出（或回复 "全部删除"）。

### To-dos

- [ ] 追加 `.gitignore` 条目，忽略 services/*/storage、uploads、logs、.env 等运行时文件
- [ ] 删除仓库中当前存在的运行时工件：`services/*/storage/artifacts/*`、`services/*/storage/sessions/*`、`services/*/storage/tmp/*`、根目录 `*.log` 文件
- [ ] 在 `CURSOR.md` 中追加变更记录，说明删除工件和添加 .gitignore 的原因