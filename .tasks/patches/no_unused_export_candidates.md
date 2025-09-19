# 未发现可安全删除的导出

经仓库静态扫描（检索 `export` 及各导出符号的引用），当前代码库中主要导出符号均有被引用：

- 后端：`deepseekTextDialog`, `generateMarkdownReview`, `extractCircuitJsonFromImages`, `webSearch`, `logInfo`, `logError`, `readRecentLines`。
- 前端：`App`, `ReviewForm`, `ResultView`, `FileUpload`。

结论：没有发现可以在不破坏功能的情况下自动删除的导出符号。

建议：如需更精确地检测“未使用导出/文件”，可运行以下工具之一以获得更深入的结果（需安装/运行额外依赖）：

- `ts-prune`：检测 TypeScript 中未被引用的导出
- `depcheck`：检测未使用的 npm 依赖与文件引用


下一步提议（请在下方选择并回复）：

1. 我运行 `npx -y ts-prune` 并生成结果（会在项目中临时执行命令）。
2. 我运行 `npx -y depcheck` 并生成结果（会在项目中临时执行命令）。
3. 停止扫描，开始人工审核由你指定的文件/模块。

如果同意我执行 1 或 2，请回复对应数字（例如 `1` 或 `2`），我将进入执行并返回详细报告及自动生成的删除补丁草案（补丁将先写入 `.tasks/patches/` 供你确认，实际源码不会直接修改，除非你再确认应用）。


