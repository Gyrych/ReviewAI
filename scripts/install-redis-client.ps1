Set-Location -Path "$PSScriptRoot\\..\\services\\circuit-agent"
npm install redis

Set-Location -Path "$PSScriptRoot\\..\\services\\circuit-fine-agent"
npm install redis

Write-Host "Redis client installed for both services."

