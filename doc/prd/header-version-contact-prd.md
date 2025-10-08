# PRD — 页眉版本号与联系方式展示

创建时间: 2025-10-08
负责人: 前端开发

一、背景

当前应用顶部页眉显示品牌（英文/中文）与若干全局设置控件（模型选择、API Key、语言/主题切换）。需在页眉中明确展示产品版本和作者联系方式，以便用户识别当前运行版本并能快速联系作者。PRD 要求按项目规范保存于 `doc/prd/` 目录。

二、目标

- 在顶部 logo 与标题区域的第二行（`AI评审助手` 右侧）展示简短型版本号（例如 `v1.2.3`），版本号来源于项目根目录的 `package.json` 的 `version` 字段。
- 在版本号后展示作者邮箱 `gyrych@gmail.com`（明文并为 `mailto:` 链接）。
- 样式与 `AI评审助手` 次行相同（使用现有的 `text-sm text-gray-600 dark:text-gray-300` 样式），兼容暗色/亮色主题与移动端折行。

三、功能需求（详述）

1. 版本来源
   - 读取项目根 `package.json` 的 `version` 字段。
   - 格式展示为简短型：`v{version}`（例如 `v0.1.0`）。

2. 联系方式
   - 明文显示 `gyrych@gmail.com`，并使用 `mailto:gyrych@gmail.com` 链接。
   - 不进行爬虫混淆，按产品要求原样展示。

3. 布局与样式
   - 放置位置：logo 标题的第二行（与 `AI评审助手` 同一行的右侧）。
   - 字体样式：使用 `text-sm text-gray-600 dark:text-gray-300`。
   - 在窄屏下允许换行，优先保证邮箱可读与可点击。

4. 无需后端改动，所有逻辑在前端渲染层实现。

四、实现细节

- 修改文件：`frontend/src/App.tsx`。
  - 在文件顶部通过 `import rootPkg from '../../package.json'` 读取根 package.json（TypeScript: 已启用 `resolveJsonModule`）。
  - 在品牌次行处添加一个并列元素展示 `v{rootPkg.version} · gyrych@gmail.com`，邮箱为 `mailto:` 链接。
 - 在品牌次行处展示版本 `v0.2.21`，并在第三行左对齐显示 `联系作者：gyrych@gmail.com`（邮箱使用 `mailto:` 链接）。
- 样式：复用 `text-sm text-gray-600 dark:text-gray-300`，并使用 `flex items-center gap-4` 保持间距。

五、兼容性与验收标准

- 页面顶部可见 `v{version} · gyrych@gmail.com`（版本从根 package.json 读取）。
- 在暗色主题下颜色与当前品牌次行保持一致。
- 点击邮箱能触发系统默认邮件客户端（mailto）。
- 不引入新的依赖或后端改动。

六、变更记录

- 2025-10-08: 创建 PRD，目标为在前端页眉展示版本号与作者联系方式，文件路径 `doc/prd/header-version-contact-prd.md`。




