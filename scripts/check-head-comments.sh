#!/usr/bin/env bash
set -euo pipefail

# 检查仓库中 .ts .js .tsx .jsx 文件在前 20 行是否包含中文头部注释关键词（功能/用途/参数/返回/示例）
# 目的：确保公共函数/模块具有中文结构化头部注释，作为合规性自检脚本。

ROOT=${1:-.}
REPORT=${2:-docs/comment-coverage-report.json}

# 临时文件用于跨子进程累积缺失项，避免管道子 shell 丢失数组的问题
TMP_FILE=${TMPDIR:-/tmp}/head_comment_missing_$$.txt
> "$TMP_FILE"

# 兼容 Windows 的方式：使用管道传递 -print0 结果，避免进程替代 < <()
# 仅扫描源代码目录，忽略 node_modules / dist / build 等
# 若调用方在仓库根目录执行，以下默认路径满足 T017 的范围要求
scan_paths=(
  "$ROOT/services/circuit-agent/src"
  "$ROOT/frontend/src"
)

for p in "${scan_paths[@]}"; do
  [ -d "$p" ] || continue
  find "$p" \
    -type d \( -name node_modules -o -name dist -o -name build -o -name storage -o -name coverage -o -name ".vite" \) -prune -o \
    -type f \( -name '*.ts' -o -name '*.js' -o -name '*.tsx' -o -name '*.jsx' \) \! -name '*.d.ts' -print0 \
    | while IFS= read -r -d '' file; do
        # 若存在对应的 TS/TSX 源文件，则跳过 JS/JSX 文件（避免重复/构建产物）
        case "$file" in
          *.js)
            [ -f "${file%.js}.ts" ] && continue
            [ -f "${file%.js}.tsx" ] && continue
            ;;
          *.jsx)
            [ -f "${file%.jsx}.tsx" ] && continue
            ;;
        esac
        # 仅对包含导出符号的文件执行头注检测（公共导出近似判断）
        if ! grep -E -q "(^|[^a-zA-Z0-9_])export[[:space:]]+(default|const|function|class|interface|type|\{)" "$file"; then
          continue
        fi
        header=$(head -n 20 "$file" || true)
        if echo "$header" | grep -E -q "功能|用途|参数|返回|示例"; then
          :
        else
          printf '%s\n' "$file" >> "$TMP_FILE"
        fi
      done
done

missing_count=0
if [ -f "$TMP_FILE" ]; then
  missing_count=$(wc -l < "$TMP_FILE" | tr -d '[:space:]')
fi

if [ "$missing_count" -gt 0 ]; then
  mkdir -p "$(dirname "$REPORT")"
  {
    echo '{'
    echo '  "missingCount":' "$missing_count",
    echo '  "files": ['
    if [ -s "$TMP_FILE" ]; then
      awk '{ printf "    \"%s\"%s\n", $0, (NR==ENVIRON["LNUM"]?"":",") }' LNUM=$(wc -l < "$TMP_FILE") "$TMP_FILE"
    fi
    echo '  ]'
    echo '}'
  } > "$REPORT"
  echo "缺少中文头部注释的条目数: $missing_count"
  echo "已生成报告: $REPORT"
  rm -f "$TMP_FILE" || true
  exit 5
fi

echo "All checked files contain Chinese header keywords in the first 20 lines."
rm -f "$TMP_FILE" || true
exit 0


