$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
  if (-not (Test-Path -LiteralPath 'node_modules/electron/package.json')) { throw 'Run npm ci first.' }
  $electronPackage = Get-Content -LiteralPath 'node_modules/electron/package.json' -Raw | ConvertFrom-Json
  $runtimeVersion = $electronPackage.version
  $cacheDirectory = Join-Path $projectRoot '.npm-cache'
  New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
  if (-not (Test-Path -LiteralPath 'node_modules/electron/dist/electron.exe')) {
    $archiveName = "electron-v$runtimeVersion-win32-x64.zip"
    $archiveFile = Join-Path $cacheDirectory $archiveName
    Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$runtimeVersion/$archiveName" -OutFile $archiveFile -TimeoutSec 300
    $checksums = Get-Content -LiteralPath 'node_modules/electron/checksums.json' -Raw | ConvertFrom-Json
    $actualHash = (Get-FileHash -LiteralPath $archiveFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $checksums.$archiveName) { throw 'Electron SHA-256 verification failed.' }
    Expand-Archive -LiteralPath $archiveFile -DestinationPath 'node_modules/electron/dist' -Force
    Set-Content -LiteralPath 'node_modules/electron/path.txt' -Value 'electron.exe' -NoNewline
  }
  $ffmpegPackage = Get-Content -LiteralPath 'node_modules/ffmpeg-static/package.json' -Raw | ConvertFrom-Json
  $releaseTag = $ffmpegPackage.'ffmpeg-static'.'binary-release-tag'
  $releaseUrl = "https://github.com/eugeneware/ffmpeg-static/releases/download/$releaseTag"
  if (-not (Test-Path -LiteralPath 'node_modules/ffmpeg-static/ffmpeg.exe')) {
    $gzipFile = Join-Path $cacheDirectory 'ffmpeg-win32-x64.gz'
    Invoke-WebRequest -Uri "$releaseUrl/ffmpeg-win32-x64.gz" -OutFile $gzipFile -TimeoutSec 300
    $inputStream = [IO.File]::OpenRead($gzipFile)
    $gzipStream = [IO.Compression.GZipStream]::new($inputStream, [IO.Compression.CompressionMode]::Decompress)
    $outputStream = [IO.File]::Create((Join-Path $projectRoot 'node_modules/ffmpeg-static/ffmpeg.exe'))
    try { $gzipStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $gzipStream.Dispose(); $inputStream.Dispose() }
  }
  foreach ($suffix in @('LICENSE', 'README')) {
    $destination = "node_modules/ffmpeg-static/ffmpeg.exe.$suffix"
    if (-not (Test-Path -LiteralPath $destination)) { Invoke-WebRequest -Uri "$releaseUrl/win32-x64.$suffix" -OutFile $destination -TimeoutSec 60 }
  }
  node scripts/check-native.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Native modules are missing. Run npm rebuild koffi uiohook-napi.' }
  & 'node_modules/ffmpeg-static/ffmpeg.exe' -version
  if ($LASTEXITCODE -ne 0) { throw 'FFmpeg could not start.' }
  Write-Output 'Windows runtimes are ready.'
} finally { Pop-Location }
