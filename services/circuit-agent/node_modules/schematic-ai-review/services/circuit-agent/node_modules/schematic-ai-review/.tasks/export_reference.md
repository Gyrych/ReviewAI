# 导出引用地图

此文件列出后端与前端主要导出符号及其在仓库中的引用位置，帮助判断哪些导出可能未被使用。

## 后端导出

- deepseekTextDialog
  - 定义: backend/src/deepseek.ts
  - 引用:
    - backend/src/index.ts: lines containing deepseekTextDialog

- generateMarkdownReview
  - 定义: backend/src/llm.ts
  - 引用:
    - backend/src/index.ts

- extractCircuitJsonFromImages
  - 定义: backend/src/vision.ts
  - 引用:
    - backend/src/index.ts

- webSearch
  - 定义: backend/src/search.ts
  - 引用:
    - backend/src/vision.ts

- logInfo / logError / readRecentLines
  - 定义: backend/src/logger.ts
  - 引用:
    - backend/src/index.ts
    - backend/src/vision.ts
    - backend/src/deepseek.ts
    - backend/src/llm.ts

## 前端导出

- App
  - 定义: frontend/src/App.tsx
  - 引用: 应为应用入口

- ReviewForm
  - 定义: frontend/src/components/ReviewForm.tsx
  - 引用: frontend/src/App.tsx

- ResultView
  - 定义: frontend/src/components/ResultView.tsx
  - 引用: frontend/src/App.tsx

- FileUpload
  - 定义: frontend/src/components/FileUpload.tsx
  - 引用: frontend/src/components/ReviewForm.tsx
