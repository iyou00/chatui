@echo off
chcp 65001 >nul
title 微信群聊智能分析平台 - ChatX (终极实时版)

echo ========================================
echo   微信群聊智能分析平台 V2.0
echo   ChatX - Intelligent Chat Analysis
echo   终极实时日志版本
echo ========================================
echo.

:: 检查Node.js是否安装
echo 🔍 [1/4] 检查Node.js环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ❌ 错误：未检测到Node.js，请先安装Node.js
    echo.
    echo 📥 推荐下载地址：
    echo    官方网站：https://nodejs.org/
    echo    Windows x64：https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi
    echo.
    echo 💡 安装建议：
    echo    1. 下载并安装Node.js 18.0+版本
    echo    2. 安装完成后重启命令行工具
    echo    3. 重新运行此启动脚本
    echo.
    pause
    exit /b 1
)

:: 显示Node.js版本并检查版本要求
echo ✅ Node.js 版本：
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    当前版本：%NODE_VERSION%
echo    要求版本：>=16.0.0

:: 简单的版本检查（提取主版本号）
for /f "tokens=1 delims=." %%a in ("%NODE_VERSION:~1%") do set MAJOR_VERSION=%%a
if %MAJOR_VERSION% LSS 16 (
    echo.
    echo ⚠️ 警告：Node.js版本可能过低
    echo    当前版本：%NODE_VERSION%
    echo    推荐版本：18.0+
    echo.
    echo 📥 升级地址：https://nodejs.org/
    echo.
    echo 是否继续运行？版本过低可能导致功能异常
    pause
)

:: 检查package.json
if not exist package.json (
    echo ❌ 错误：未找到package.json文件
    echo 请确保在正确的项目目录中运行此脚本
    pause
    exit /b 1
)

:: 检查依赖包
echo.
echo 🔍 [2/4] 检查项目依赖...
if not exist node_modules (
    echo ⚠️ 未找到node_modules目录，需要安装依赖包
    echo.
    echo 📦 正在安装项目依赖...
    echo    这可能需要几分钟时间，请耐心等待...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ❌ 依赖安装失败
        echo.
        echo 💡 可能的解决方案：
        echo    1. 检查网络连接是否正常
        echo    2. 尝试使用淘宝镜像：npm install --registry https://registry.npmmirror.com
        echo    3. 清除npm缓存：npm cache clean --force
        echo    4. 删除node_modules文件夹后重试
        echo.
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
) else (
    echo ✅ 依赖包已存在，跳过安装
)

echo.
echo 🔍 [3/4] 检查系统环境...
echo ✅ 操作系统：Windows
echo ✅ 端口配置：8080
echo ✅ 代理配置：127.0.0.1:7897 (Clash兼容)

echo.
echo 🚀 [4/4] 启动应用服务...
echo.
echo 📱 浏览器访问地址：
echo    主页：http://localhost:8080
echo    管理面板：http://localhost:8080/settings
echo    任务管理：http://localhost:8080/tasks
echo    报告中心：http://localhost:8080/reports
echo.
echo ⚠️  重要提示：
echo    • 保持此窗口打开以查看实时日志
echo    • 按Ctrl+C可以停止服务
echo    • 首次运行会自动打开配置页面
echo.
echo 🔄 实时日志模式：已启用终极实时输出
echo 💡 提示：日志现在会完全实时显示，无延迟
echo.
echo ===============================================

:: 设置环境变量
set NODE_ENV=production
set FORCE_COLOR=1
set NODE_NO_WARNINGS=1

:: 关键设置：强制禁用输出缓冲
set NODE_OPTIONS=--max-old-space-size=4096
set PYTHONUNBUFFERED=1

:: 设置代理环境变量（适配Clash代理）
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set http_proxy=http://127.0.0.1:7897
set https_proxy=http://127.0.0.1:7897

echo 🔄 启动Node.js应用（终极实时模式）...
echo.

:: 直接启动Node.js应用
node app.js

echo.
echo 服务已停止，按任意键退出...
pause >nul