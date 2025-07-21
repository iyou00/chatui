/**
 * 微信群聊智能分析平台 - 主应用入口
 * 
 * 功能概述：
 * 1. 初始化Express应用和基础中间件
 * 2. 配置静态文件服务和模板引擎
 * 3. 检查首次运行状态并处理配置
 * 4. 启动定时任务调度系统
 * 5. 启动HTTP服务器
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

// 导入工具模块
const logger = require('./utils/logger');
const { initDatabase } = require('./utils/database');
const { checkFirstRun, openBrowser } = require('./utils/startup');
const scheduler = require('./services/scheduler');

// 导入路由模块
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

// 创建Express应用实例
const app = express();
const PORT = process.env.PORT || 8080;

/**
 * 配置Express应用中间件
 */
function configureApp() {
    // 启用CORS
    app.use(cors());
    
    // 解析请求体
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    
    // 设置模板引擎
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    
    // 静态文件服务
    app.use(express.static(path.join(__dirname, 'public')));
    
    // 日志中间件
    app.use((req, res, next) => {
        logger.info(`${req.method} ${req.url}`);
        next();
    });
}

/**
 * 配置路由
 */
function configureRoutes() {
    // 主页路由
    app.use('/', indexRouter);
    
    // API路由
    app.use('/api', apiRouter);
    
    // 404处理
    app.use((req, res) => {
        res.status(404).render('error', { 
            message: '页面未找到',
            error: { status: 404, stack: '' }
        });
    });
    
    // 错误处理中间件
    app.use((err, req, res, next) => {
        logger.error('应用错误:', err);
        res.status(err.status || 500).render('error', {
            message: err.message || '内部服务器错误',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    });
}

/**
 * 强制启用实时输出（解决Windows控制台缓冲问题）
 */
function enableRealTimeOutput() {
    // 设置stdout为非缓冲模式
    if (process.stdout.setEncoding) {
        process.stdout.setEncoding('utf8');
    }
    
    // 禁用输出缓冲
    if (process.stdout._flush) {
        // 定期强制刷新输出
        setInterval(() => {
            process.stdout._flush();
            if (process.stderr._flush) {
                process.stderr._flush();
            }
        }, 500); // 每500ms刷新一次
    }
    
    // 重写console方法，确保立即输出
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = function(...args) {
        originalLog.apply(console, args);
        if (process.stdout._flush) process.stdout._flush();
    };
    
    console.error = function(...args) {
        originalError.apply(console, args);
        if (process.stderr._flush) process.stderr._flush();
    };
    
    console.warn = function(...args) {
        originalWarn.apply(console, args);
        if (process.stderr._flush) process.stderr._flush();
    };
    
    console.log('🔄 实时输出模式已启用');
}

/**
 * 检查端口是否被占用
 */
function checkPortInUse(port) {
    return new Promise((resolve) => {
        const server = require('net').createServer();
        server.listen(port, () => {
            server.once('close', () => resolve(false));
            server.close();
        });
        server.on('error', () => resolve(true));
    });
}

/**
 * 查找可用端口
 */
async function findAvailablePort(startPort = 8080) {
    let port = startPort;
    while (await checkPortInUse(port)) {
        port++;
        if (port > 9000) { // 防止无限循环
            throw new Error('无法找到可用端口');
        }
    }
    return port;
}

/**
 * 强制关闭占用端口的进程
 */
async function killPortProcess(port) {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        console.log(`🔍 检查端口 ${port} 的占用情况...`);
        
        // Windows系统查找并关闭占用端口的进程
        if (process.platform === 'win32') {
            try {
                const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
                if (stdout) {
                    const lines = stdout.trim().split('\n');
                    const pids = new Set();
                    
                    lines.forEach(line => {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 5) {
                            const pid = parts[parts.length - 1];
                            if (pid && pid !== '0' && !isNaN(pid)) {
                                pids.add(pid);
                            }
                        }
                    });
                    
                    for (const pid of pids) {
                        try {
                            await execAsync(`taskkill /F /PID ${pid}`);
                            console.log(`✅ 已关闭占用端口 ${port} 的进程 (PID: ${pid})`);
                        } catch (killError) {
                            console.log(`⚠️ 无法关闭进程 ${pid}:`, killError.message);
                        }
                    }
                    
                    // 等待一下让端口释放
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.log(`ℹ️ 端口 ${port} 未被占用或查询失败`);
            }
        }
    } catch (error) {
        console.log(`⚠️ 处理端口占用时出错:`, error.message);
    }
}

/**
 * 应用启动函数
 */
async function startApp() {
    try {
        // 首先启用实时输出
        enableRealTimeOutput();
        
        console.log('🚀 启动微信群聊智能分析平台...');
        
        // 1. 初始化数据库
        console.log('📦 初始化数据库...');
        await initDatabase();
        logger.info('数据库初始化完成');
        
        // 2. 配置应用
        console.log('⚙️ 配置应用...');
        configureApp();
        configureRoutes();
        
        // 3. 检查首次运行状态
        console.log('🔍 检查配置状态...');
        const isFirstRun = await checkFirstRun();
        
        // 4. 启动定时任务调度器
        console.log('⏰ 启动定时任务调度器...');
        scheduler.start();
        
        // 5. 处理端口占用问题
        let finalPort = PORT;
        console.log(`🔌 检查端口 ${PORT} 可用性...`);
        
        if (await checkPortInUse(PORT)) {
            console.log(`⚠️ 端口 ${PORT} 已被占用，尝试自动处理...`);
            
            // 尝试关闭占用端口的进程
            await killPortProcess(PORT);
            
            // 再次检查端口是否可用
            if (await checkPortInUse(PORT)) {
                console.log(`🔍 端口 ${PORT} 仍被占用，寻找其他可用端口...`);
                finalPort = await findAvailablePort(PORT + 1);
                console.log(`✅ 找到可用端口: ${finalPort}`);
            } else {
                console.log(`✅ 端口 ${PORT} 现在可用`);
            }
        }
        
        // 6. 启动HTTP服务器
        const server = app.listen(finalPort, () => {
            console.log(`\n✅ 服务器启动成功！`);
            console.log(`🌐 本地访问地址: http://127.0.0.1:${finalPort}`);
            console.log(`📱 用户界面: http://127.0.0.1:${finalPort}`);
            
            if (finalPort !== PORT) {
                console.log(`ℹ️ 注意：由于端口 ${PORT} 被占用，已自动切换到端口 ${finalPort}`);
            }
            
            // 首次运行自动打开浏览器
            if (isFirstRun) {
                console.log('🔧 检测到首次运行，即将打开配置页面...');
                setTimeout(() => {
                    openBrowser(`http://127.0.0.1:${finalPort}/settings`);
                }, 1000);
            } else {
                console.log('💡 提示：在浏览器中打开上述地址即可使用');
            }
            
            console.log('\n按 Ctrl+C 关闭服务器');
        });
        
        // 优雅关闭处理
        process.on('SIGINT', () => {
            console.log('\n🔄 正在关闭服务器...');
            server.close(() => {
                console.log('✅ 服务器已关闭');
                scheduler.stop();
                process.exit(0);
            });
        });
        
        // 处理未捕获的异常
        server.on('error', async (error) => {
            if (error.code === 'EADDRINUSE') {
                console.log(`❌ 端口 ${finalPort} 仍然被占用`);
                console.log('🔄 尝试寻找其他可用端口...');
                
                try {
                    const newPort = await findAvailablePort(finalPort + 1);
                    console.log(`✅ 找到新的可用端口: ${newPort}`);
                    
                    // 重新启动服务器
                    const newServer = app.listen(newPort, () => {
                        console.log(`\n✅ 服务器在端口 ${newPort} 启动成功！`);
                        console.log(`🌐 本地访问地址: http://127.0.0.1:${newPort}`);
                        console.log(`📱 用户界面: http://127.0.0.1:${newPort}`);
                        console.log('\n按 Ctrl+C 关闭服务器');
                    });
                } catch (portError) {
                    console.error('❌ 无法找到可用端口:', portError);
                    process.exit(1);
                }
            } else {
                console.error('❌ 服务器启动失败:', error);
                process.exit(1);
            }
        });
        
    } catch (error) {
        console.error('❌ 启动失败:', error);
        logger.error('应用启动失败:', error);
        process.exit(1);
    }
}

// 启动应用
startApp();

module.exports = app; 