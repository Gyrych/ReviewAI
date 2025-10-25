#!/usr/bin/env bash
set -euo pipefail

# 检查仓库中 .ts .js .tsx .jsx 文件在前 20 行是否包含中文头部注释关键词（功能/用途/参数/返回/示例）
# 目的：确保公共函数/模块具有中文结构化头部注释，作为合规性自检脚本。

ROOT=${1:-.}
missing=()

while IFS= read -r -d '' file; do
  header=$(head -n 20 "$file" || true)
  if echo "$header" | grep -E -q "功能|用途|参数|返回|示例"; then
    continue
  else
    missing+=("$file")
  fi
done < <(find "$ROOT" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.tsx' -o -name '*.jsx' \) -print0)

if [ ${#missing[@]} -gt 0 ]; then
  echo "Files missing Chinese header comments (first 20 lines):"
  printf '%s\n' "${missing[@]}"
  exit 5
fi

echo "All checked files contain Chinese header keywords in the first 20 lines."
exit 0


