@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==== 提交并推送，触发 OpenWrt 编译 ====
echo 目录: %cd%
echo.

git status --short
if errorlevel 1 goto fail

git add -A
if errorlevel 1 goto fail

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Update K2P easy Shadowsocks page and build."
  if errorlevel 1 goto fail
) else (
  echo 没有新的改动需要提交，直接推送。
)

git push origin main
if errorlevel 1 goto fail

echo.
echo 已推送到 main。打开下面页面，等 OpenWrt Builder 跑完再刷机：
echo https://github.com/GbGuo/OpenWrt-K2P/actions
echo.
pause
exit /b 0

:fail
echo.
echo 失败。请看上面的 git 报错。
echo.
pause
exit /b 1
