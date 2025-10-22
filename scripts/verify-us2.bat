@echo off
setlocal enableextensions
if "%~1"=="" (
  echo Usage: %~nx0 API_KEY
  exit /b 1
)
set APIKEY=%~1
set BASE=http://localhost:4001/api/v1/circuit-agent
if not exist tmp mkdir tmp >nul 2>nul

set HISTORY=[{"role":"assistant","content":"ok"}]

curl.exe -sS -m 150 -H "Authorization: Bearer %APIKEY%" ^
  --form-string "history=%HISTORY%" ^
  -F "requirements=Please produce a revision review" ^
  -F "specs=Spec delta" ^
  -F "dialog=User objections" ^
  -F "enableSearch=false" ^
  -F "language=en" ^
  -F "directReview=true" ^
  -F "apiUrl=https://openrouter.ai/api/v1/chat/completions" ^
  -F "model=openai/gpt-4o-mini" ^
  %BASE%/orchestrate/review > tmp\us2_revision.json

echo [verify-us2] Output: tmp\us2_revision.json
exit /b 0

