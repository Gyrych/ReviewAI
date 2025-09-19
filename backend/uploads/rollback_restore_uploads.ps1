Get-ChildItem -Path  backend/uploads/archive -Filter *.enriched.json -File | ForEach-Object { Move-Item .FullName -Destination backend/uploads -Force }
