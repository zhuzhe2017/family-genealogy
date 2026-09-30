# ============================================================
# family-genealogy Android 环境一键修复脚本
# 跑法：PowerShell (管理员) → cd e:\family-genealogy\mobile-p0 → .\setup-android.ps1
# 覆盖：JDK 17 + Android SDK + NDK 26.1 + Gradle 构建验证
# ============================================================

$ErrorActionPreference = "Continue"
$root = "e:\family-genealogy\mobile-p0"

Write-Host "`n==== 1. 验证 JDK 17 ====" -ForegroundColor Cyan
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if ($javaCmd) {
  $javaVer = & java -version 2>&1 | Select-Object -First 1
  Write-Host "  java found: $javaVer" -ForegroundColor Green
} else {
  # 尝试常见安装路径
  $candidates = @(
    "C:\Program Files\Microsoft\jdk-17*\bin\java.exe",
    "C:\Program Files\Java\jdk-17*\bin\java.exe",
    "$env:LOCALAPPDATA\Microsoft\jdk-17*\bin\java.exe"
  )
  $found = $null
  foreach ($pat in $candidates) {
    $g = Get-Item $pat -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($g) { $found = $g.FullName; break }
  }
  if (-not $found) {
    Write-Host "  ✗ JDK 17 未找到！请手动：winget install Microsoft.OpenJDK.17" -ForegroundColor Red
    Write-Host "    或下载：https://adoptium.net/" -ForegroundColor Red
    exit 1
  }
  $javaHome = Split-Path (Split-Path $found)
  Write-Host "  found at: $found" -ForegroundColor Green
}

# --- 设置 JAVA_HOME + PATH ---
# 如果上一步没拿到，再试一次 glob
if (-not $javaHome) {
  $jh = Get-ChildItem "C:\Program Files\Microsoft" -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "jdk-17" } | Select-Object -First 1
  if ($jh) { $javaHome = $jh.FullName }
}
if ($javaHome) {
  Write-Host "  JAVA_HOME = $javaHome"
  [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$javaHome\bin*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$javaHome\bin", "User")
  }
  $env:JAVA_HOME = $javaHome
  $env:Path = "$env:Path;$javaHome\bin"
} else {
  Write-Host "  ✗ 无法确定 JAVA_HOME" -ForegroundColor Red
  exit 1
}

Write-Host "`n==== 2. 验证 Android SDK ====" -ForegroundColor Cyan
$sdkHome = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $sdkHome)) {
  Write-Host "  ✗ Android SDK 未找到！" -ForegroundColor Red
  Write-Host "  打开 Android Studio → More Actions → SDK Manager → 装：" -ForegroundColor Yellow
  Write-Host "    - Android SDK Platform 35"
  Write-Host "    - Android SDK Build-Tools 35.0.0"
  Write-Host "    - Android SDK Platform-Tools"
  Write-Host "    - NDK (Side by side) 26.1.10909125"
  exit 1
}
Write-Host "  SDK: $sdkHome" -ForegroundColor Green
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkHome, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkHome, "User")
$env:ANDROID_HOME = $sdkHome
$env:ANDROID_SDK_ROOT = $sdkHome

# --- 检查 SDK Platforms ---
$platforms = Get-ChildItem "$sdkHome\platforms" -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
Write-Host "  platforms: $($platforms -join ', ')"
if ($platforms -notmatch "android-35") {
  Write-Host "  ✗ 缺 android-35！SDK Manager 里补装" -ForegroundColor Red
}

# --- 检查 Build-Tools ---
$bt = Get-ChildItem "$sdkHome\build-tools" -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
Write-Host "  build-tools: $($bt -join ', ')"
if ($bt -notmatch "35") {
  Write-Host "  ✗ 缺 Build-Tools 35！SDK Manager 里补装" -ForegroundColor Red
}

# --- 检查 NDK ---
$ndk = Get-ChildItem "$sdkHome\ndk" -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
Write-Host "  ndk: $($ndk -join ', ')"
if ($ndk -notmatch "26\.1") {
  Write-Host "  ✗ 缺 NDK 26.1.10909125！SDK Manager → SDK Tools → NDK (Side by side)" -ForegroundColor Red
  Write-Host "    注意：app/build.gradle 硬编码 ndkVersion = 26.1.10909125" -ForegroundColor Yellow
}

# --- 把 platform-tools 加 PATH ---
$pt = "$sdkHome\platform-tools"
if (Test-Path $pt) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$pt*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$pt", "User")
  }
  $env:Path = "$env:Path;$pt"
}

Write-Host "`n==== 3. 验证 Node 工具链 ====" -ForegroundColor Cyan
cd $root
node -v
npm -v
npx eas-cli --version 2>&1

Write-Host "`n==== 4. 本地 Gradle assembleDebug ====" -ForegroundColor Cyan
cd "$root\android"
.\gradlew.bat assembleDebug --no-daemon --stacktrace 2>&1 | Tee-Object -FilePath "$root\gradle-build.log" | Select-Object -Last 60

Write-Host "`n==== 完成 ====" -ForegroundColor Cyan
Write-Host "  日志文件：$root\gradle-build.log"
Write-Host "  APK 输出：$root\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
