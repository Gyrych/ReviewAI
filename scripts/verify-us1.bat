@echo off
setlocal enableextensions
if "%~1"=="" (
  echo Usage: %~nx0 API_KEY
  exit /b 1
)
set APIKEY=%~1
set BASE=http://localhost:4001/api/v1/circuit-agent
if not exist tmp mkdir tmp >nul 2>nul

rem 复制示例图片到 ASCII 路径，避免中文路径造成上传问题
copy /y "test\实例电路.png" "tmp\sample.png" >nul 2>nul

rem 1) 禁用检索
curl.exe -sS -m 120 -H "Authorization: Bearer %APIKEY%" ^
  -F "files=@tmp/sample.png;type=image/png" ^
  -F "requirements=请根据规范输出 Markdown 评审" ^
  -F "specs=PCB 走线与电源去耦规范" ^
  -F "dialog=首次提交" ^
  -F "enableSearch=false" ^
  -F "language=zh" ^
  -F "directReview=true" ^
  -F "apiUrl=https://openrouter.ai/api/v1/chat/completions" ^
  -F "model=openai/gpt-4o-mini" ^
  %BASE%/orchestrate/review > tmp\us1_no_search.json

rem 2) 启用检索（topN=2）
curl.exe -sS -m 180 -H "Authorization: Bearer %APIKEY%" ^
  -F "files=@tmp/sample.png;type=image/png" ^
  -F "requirements=请根据规范输出 Markdown 评审" ^
  -F "specs=PCB 走线与电源去耦规范" ^
  -F "dialog=启用搜索" ^
  -F "enableSearch=true" ^
  -F "searchTopN=2" ^
  -F "language=zh" ^
  -F "directReview=true" ^
  -F "apiUrl=https://openrouter.ai/api/v1/chat/completions" ^
  -F "model=openai/gpt-4o-mini" ^
  %BASE%/orchestrate/review > tmp\us1_search.json

rem 3) 列出 artifacts
curl.exe -sS %BASE%/artifacts > tmp\artifacts_list.json

echo [verify-us1] Outputs:
echo  - tmp\us1_no_search.json
echo  - tmp\us1_search.json
echo  - tmp\artifacts_list.json
exit /b 0

