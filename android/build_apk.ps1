# 构建安卓 APK（Windows PowerShell）
# 依赖：JDK 17+、Android SDK（platform 34、build-tools 34）
# 用法：
#   $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
#   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
#   powershell -ExecutionPolicy Bypass -File .\build_apk.ps1

$ErrorActionPreference = "Stop"

$ANDROID_DIR = $PSScriptRoot
$ROOT = Split-Path $ANDROID_DIR -Parent
$WEB = Join-Path $ROOT "web"
$ASSETS = Join-Path $ANDROID_DIR "assets"
$OUT = Join-Path $ANDROID_DIR "build"
$DIST = Join-Path $ROOT "dist"

$SDK = $env:ANDROID_HOME
if (-not $SDK) { $SDK = $env:ANDROID_SDK_ROOT }
if (-not $SDK) { $SDK = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path $SDK)) { throw "找不到 Android SDK，请设置 ANDROID_HOME" }
if (-not $env:JAVA_HOME) { throw "请设置 JAVA_HOME 指向 JDK 17 或更高版本" }

$JAVA = Join-Path $env:JAVA_HOME "bin"
$BT = (Get-ChildItem (Join-Path $SDK "build-tools") -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$PLATFORM = (Get-ChildItem (Join-Path $SDK "platforms") -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$ANDROID_JAR = Join-Path $PLATFORM "android.jar"
if (-not (Test-Path $ANDROID_JAR)) { throw "找不到 $ANDROID_JAR" }

$env:PATH = "$JAVA;$BT;$env:PATH"

Write-Output "[0/6] 同步网页资源到 assets"
if (Test-Path $ASSETS) { Remove-Item $ASSETS -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ASSETS | Out-Null
Copy-Item "$WEB\index.html", "$WEB\app.js", "$WEB\engine.js", "$WEB\style.css", "$WEB\mqtt.min.js" $ASSETS

Remove-Item $OUT -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$OUT\gen", "$OUT\classes", "$OUT\dex" | Out-Null

Write-Output "[1/6] aapt2 compile"
& "$BT\aapt2.exe" compile --dir "$ANDROID_DIR\res" -o "$OUT\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Output "[2/6] aapt2 link"
& "$BT\aapt2.exe" link -o "$OUT\base.apk" -I $ANDROID_JAR --manifest "$ANDROID_DIR\AndroidManifest.xml" -R "$OUT\res.zip" --auto-add-overlay --java "$OUT\gen" -A $ASSETS --min-sdk-version 21 --target-sdk-version 34 --version-code 1 --version-name "1.0"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Output "[3/6] javac"
$javaFiles = Get-ChildItem "$OUT\gen", "$ANDROID_DIR\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
& "$JAVA\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $ANDROID_JAR -d "$OUT\classes" $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Output "[4/6] d8"
$classes = Get-ChildItem "$OUT\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName }
& "$BT\d8.bat" --lib $ANDROID_JAR --release --min-api 21 --output "$OUT\dex" $classes
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Output "[5/6] package + sign"
Copy-Item "$OUT\base.apk" "$OUT\unsigned.apk" -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$OUT\unsigned.apk", "Update")
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$OUT\dex\classes.dex", "classes.dex") | Out-Null
$zip.Dispose()

& "$BT\zipalign.exe" -f -p 4 "$OUT\unsigned.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

$KEYSTORE = Join-Path $ANDROID_DIR "debug.keystore"
if (-not (Test-Path $KEYSTORE)) {
    & "$JAVA\keytool.exe" -genkeypair -keystore $KEYSTORE -alias androiddebugkey -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000 | Out-Null
}
& "$BT\apksigner.bat" sign --ks $KEYSTORE --ks-pass pass:android --key-pass pass:android --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out "$OUT\signed.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

Remove-Item "$OUT\base.apk", "$OUT\unsigned.apk", "$OUT\aligned.apk" -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DIST | Out-Null
Copy-Item "$OUT\signed.apk" (Join-Path $DIST "德州扑克.apk") -Force

Write-Output "[6/6] verify"
& "$BT\apksigner.bat" verify --verbose (Join-Path $DIST "德州扑克.apk")
Get-Item (Join-Path $DIST "德州扑克.apk") | Select-Object FullName, Length
