# Android setup and phone verification

This repository includes the Gradle wrapper. On this Windows machine the SDK is installed at `C:\Users\micha\AppData\Local\Android\Sdk` and the project has been built successfully with JDK 22.

## Required SDK packages

Install Android SDK Platform 35, Android SDK Build-Tools 35.0.0, Android SDK Platform-Tools, and Android SDK Command-line Tools (latest). Set `ANDROID_HOME` to the SDK directory and add `%ANDROID_HOME%\platform-tools` to `PATH`.

## Phone checks

With Developer Options and USB debugging enabled, accept the computer's RSA prompt on the phone, then run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb shell getprop ro.product.model
```

The device must appear as `device`, not `unauthorized`.

## Build, install, and retrieve data

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-22'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
.\gradlew.bat assembleDebug
& $adb install -r .\app\build\outputs\apk\debug\app-debug.apk
& $adb pull /sdcard/Android/data/ca.htn2026.pocketgait/files/Documents/gait_sessions .\data
```
