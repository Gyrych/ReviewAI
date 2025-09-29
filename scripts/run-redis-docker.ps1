# 启动 Redis Docker 容器（若已存在会尝试重用）
try {
  $existing = docker ps -a --filter "name=review-redis" --format "{{.Names}}" 2>$null
  if ($existing -ne "") {
    Write-Host "Found existing review-redis container. Starting it..."
    docker start review-redis | Out-Null
  } else {
    Write-Host "Creating and starting review-redis container..."
    docker run -d --name review-redis -p 6379:6379 redis:7 | Out-Null
  }
  Write-Host "Redis Docker container is running."
} catch {
  Write-Error "Failed to run Redis Docker container: $_"
}


