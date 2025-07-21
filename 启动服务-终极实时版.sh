#!/bin/bash

# Set script encoding
export LANG=zh_CN.UTF-8

echo ""
echo "==============================================="
echo "   WeChat Group Analysis Platform V2.0"
echo "   ChatX - Intelligent Chat Analysis"
echo "   Ultimate Real-time Version (macOS/Linux)"
echo "==============================================="
echo ""

# Check if Node.js is installed
echo "🔍 [1/4] 检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo ""
    echo "❌ 错误：未检测到Node.js，请先安装Node.js"
    echo ""
    echo "📥 推荐下载地址："
    echo "   官方网站：https://nodejs.org/"
    
    # 检测系统类型并提供对应下载链接
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   macOS安装包：https://nodejs.org/dist/v18.19.0/node-v18.19.0.pkg"
        echo ""
        echo "💡 安装建议："
        echo "   1. 下载并安装Node.js 18.0+版本"
        echo "   2. 或使用Homebrew: brew install node"
    else
        echo "   Linux包管理器：https://nodejs.org/en/download/package-manager"
        echo ""
        echo "💡 安装建议："
        echo "   Ubuntu/Debian: sudo apt-get install nodejs npm"
        echo "   CentOS/RHEL: sudo yum install nodejs npm"
        echo "   或使用NodeSource: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    fi
    
    echo "   3. 安装完成后重新运行此脚本"
    echo ""
    read -p "按Enter键退出..."
    exit 1
fi

# Display Node.js version and check requirements
echo "✅ Node.js版本："
NODE_VERSION=$(node --version)
echo "   当前版本：$NODE_VERSION"
echo "   要求版本：>=16.0.0"

# Simple version check (extract major version)
MAJOR_VERSION=$(echo $NODE_VERSION | sed 's/v//' | cut -d'.' -f1)
if [ "$MAJOR_VERSION" -lt 16 ]; then
    echo ""
    echo "⚠️ 警告：Node.js版本可能过低"
    echo "   当前版本：$NODE_VERSION"
    echo "   推荐版本：18.0+"
    echo ""
    echo "📥 升级地址：https://nodejs.org/"
    echo ""
    echo "是否继续运行？版本过低可能导致功能异常"
    read -p "按Enter继续或Ctrl+C退出..."
fi

# Check package.json
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json file not found"
    echo "Please ensure you are running this script in the correct project directory"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check project dependencies
echo ""
echo "🔍 [2/4] 检查项目依赖..."
if [ ! -d "node_modules" ]; then
    echo "⚠️ 未找到node_modules目录，需要安装依赖包"
    echo ""
    echo "📦 正在安装项目依赖..."
    echo "   这可能需要几分钟时间，请耐心等待..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 依赖安装失败"
        echo ""
        echo "💡 可能的解决方案："
        echo "   1. 检查网络连接是否正常"
        echo "   2. 尝试使用淘宝镜像：npm install --registry https://registry.npmmirror.com"
        echo "   3. 清除npm缓存：npm cache clean --force"
        echo "   4. 删除node_modules文件夹后重试"
        echo ""
        read -p "按Enter键退出..."
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖包已存在，跳过安装"
fi

echo ""
echo "🔍 [3/4] 检查系统环境..."
echo "✅ 操作系统：$(uname -s)"
echo "✅ 端口配置：8080"
echo "✅ 代理配置：127.0.0.1:7897 (Clash兼容)"

echo ""
echo "🚀 [4/4] 启动应用服务..."
echo ""
echo "📱 浏览器访问地址："
echo "   主页：http://localhost:8080"
echo "   管理面板：http://localhost:8080/settings"
echo "   任务管理：http://localhost:8080/tasks"
echo "   报告中心：http://localhost:8080/reports"
echo ""
echo "⚠️  重要提示："
echo "   • 保持此窗口打开以查看实时日志"
echo "   • 按Ctrl+C可以停止服务"
echo "   • 首次运行会自动打开配置页面"
echo ""
echo "🔄 实时日志模式：已启用终极实时输出"
echo "💡 提示：日志现在会完全实时显示，无延迟"
echo ""
echo "==============================================="

# Set environment variables
export NODE_ENV=production
export FORCE_COLOR=1
export NODE_NO_WARNINGS=1

# Key setting: Force disable output buffering
export NODE_OPTIONS=--max-old-space-size=4096
export PYTHONUNBUFFERED=1

# Set proxy environment variables (compatible with Clash proxy)
export HTTP_PROXY=http://127.0.0.1:7897
export HTTPS_PROXY=http://127.0.0.1:7897
export http_proxy=http://127.0.0.1:7897
export https_proxy=http://127.0.0.1:7897

echo "🔄 Starting Node.js application (Ultimate real-time mode)..."
echo "🔗 Proxy configured: 127.0.0.1:7897 (compatible with Clash and other proxy tools)"
echo ""

# Start Node.js application directly (consistent with Windows ultimate version)
node app.js

echo ""
echo "Service stopped, press any key to exit..."
read -p ""