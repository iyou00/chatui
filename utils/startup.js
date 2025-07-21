/**
 * 启动工具模块
 * 
 * 功能：
 * 1. 检查首次运行状态
 * 2. 验证配置文件完整性
 * 3. 自动打开浏览器
 * 4. 处理启动相关的辅助功能
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');
const settingsManager = require('../services/settingsManager');

/**
 * 检查.env文件是否存在
 */
function checkEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    return fs.existsSync(envPath);
}

/**
 * 验证配置文件完整性
 */
function validateConfig() {
    const envPath = path.join(__dirname, '..', '.env');

    if (!fs.existsSync(envPath)) {
        return false;
    }

    try {
        // 读取.env文件内容
        const envContent = fs.readFileSync(envPath, 'utf-8');

        // 检查必要的配置项
        const requiredKeys = [
            'CHATLOG_BASE_URL',
            'DEEPSEEK_API_KEY',
            'GEMINI_API_KEY',
            'KIMI_API_KEY'
        ];

        const missingKeys = [];
        requiredKeys.forEach(key => {
            if (!envContent.includes(`${key}=`)) {
                missingKeys.push(key);
            }
        });

        if (missingKeys.length > 0) {
            logger.warn('配置文件缺少必要配置项:', missingKeys);
            return false;
        }

        // 检查配置项是否有值
        const lines = envContent.split('\n');
        const emptyKeys = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, value] = trimmed.split('=');
                if (requiredKeys.includes(key) && (!value || value.trim() === '')) {
                    emptyKeys.push(key);
                }
            }
        });

        if (emptyKeys.length > 0) {
            logger.warn('配置文件存在空值配置项:', emptyKeys);
            return false;
        }

        logger.info('配置文件验证通过');
        return true;

    } catch (error) {
        logger.error('读取配置文件失败:', error);
        return false;
    }
}

/**
 * 检查首次运行状态
 */
async function checkFirstRun() {
    try {
        // 使用settingsManager的isFirstRun方法
        const isFirst = settingsManager.isFirstRun();

        if (isFirst) {
            logger.info('未找到配置文件，标记为首次运行');
        } else {
            logger.info('配置文件完整，非首次运行');
        }

        return isFirst;

    } catch (error) {
        logger.error('检查首次运行状态失败:', error);
        return true; // 出错时默认为首次运行
    }
}

/**
 * 在不同平台上打开浏览器
 */
function openBrowser(url) {
    try {
        const platform = process.platform;
        let command;
        let args;

        switch (platform) {
            case 'darwin': // macOS
                command = 'open';
                args = [url];
                break;
            case 'win32': // Windows
                command = 'start';
                args = ['', url];
                break;
            default: // Linux等
                command = 'xdg-open';
                args = [url];
                break;
        }

        logger.info(`正在打开浏览器访问: ${url}`);

        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            shell: true
        });

        child.unref();
        logger.info('浏览器启动成功');

    } catch (error) {
        logger.error('打开浏览器失败:', error);
        console.log(`\n📱 请手动在浏览器中打开：${url}`);
    }
}

/**
 * 创建默认的.env文件模板
 */
function createEnvTemplate() {
    const envPath = path.join(__dirname, '..', '.env');
    const template = `# 微信群聊智能分析平台配置文件
# 请填写以下配置项以启用相关功能

# ChatLog服务配置
CHATLOG_BASE_URL=http://127.0.0.1:5030

# LLM API配置
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
KIMI_API_KEY=

# 服务器配置
PORT=8080
NODE_ENV=production

# 日志配置
LOG_LEVEL=info
`;

    try {
        fs.writeFileSync(envPath, template);
        logger.info('创建默认配置文件成功');
        return true;
    } catch (error) {
        logger.error('创建默认配置文件失败:', error);
        return false;
    }
}

/**
 * 检查端口是否可用
 */
function checkPort(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();

        server.listen(port, (err) => {
            if (err) {
                resolve(false);
            } else {
                server.once('close', () => {
                    resolve(true);
                });
                server.close();
            }
        });

        server.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * 检查系统环境
 */
async function checkEnvironment() {
    const checks = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        port8080Available: await checkPort(8080)
    };

    logger.info('系统环境检查:', checks);

    if (!checks.port8080Available) {
        logger.warn('端口8080被占用，可能影响服务启动');
    }

    return checks;
}

/**
 * 启动时的系统检查
 */
async function performStartupChecks() {
    try {
        logger.info('开始启动检查...');

        // 检查系统环境
        const envChecks = await checkEnvironment();

        // 检查首次运行状态
        const isFirstRun = await checkFirstRun();

        // 如果是首次运行且没有配置文件，创建模板
        if (isFirstRun && !checkEnvFile()) {
            createEnvTemplate();
        }

        logger.info('启动检查完成');

        return {
            isFirstRun,
            environment: envChecks
        };

    } catch (error) {
        logger.error('启动检查失败:', error);
        throw error;
    }
}

/**
 * 检查Node.js版本是否满足要求
 */
function checkNodeVersion() {
    const requiredVersion = '16.0.0';
    const currentVersion = process.version.slice(1); // 去掉'v'前缀

    try {
        const [reqMajor, reqMinor] = requiredVersion.split('.').map(Number);
        const [curMajor, curMinor] = currentVersion.split('.').map(Number);

        const isValid = curMajor > reqMajor ||
            (curMajor === reqMajor && curMinor >= reqMinor);

        return {
            current: process.version,
            required: `>=${requiredVersion}`,
            valid: isValid,
            message: isValid ?
                `✅ Node.js版本符合要求 (${process.version})` :
                `❌ Node.js版本过低 (当前: ${process.version}, 要求: >=${requiredVersion})`
        };
    } catch (error) {
        return {
            current: process.version,
            required: `>=${requiredVersion}`,
            valid: false,
            message: `⚠️ 无法验证Node.js版本: ${error.message}`
        };
    }
}

/**
 * 检查关键依赖包是否正确安装
 */
async function checkDependencies() {
    const criticalDeps = [
        'express',
        'node-cron',
        'axios',
        'ejs',
        'moment',
        'archiver'
    ];

    const results = {
        total: criticalDeps.length,
        installed: 0,
        missing: [],
        details: []
    };

    for (const dep of criticalDeps) {
        try {
            const pkg = require(dep);
            results.installed++;
            results.details.push({
                name: dep,
                status: 'installed',
                message: `✅ ${dep}`
            });
        } catch (error) {
            results.missing.push(dep);
            results.details.push({
                name: dep,
                status: 'missing',
                message: `❌ ${dep} - 未安装或损坏`
            });
        }
    }

    results.allInstalled = results.missing.length === 0;
    results.message = results.allInstalled ?
        `✅ 所有依赖包已正确安装 (${results.installed}/${results.total})` :
        `❌ 缺少依赖包: ${results.missing.join(', ')}`;

    return results;
}

/**
 * 获取平台特定的Node.js下载链接
 */
function getNodeDownloadLinks() {
    const platform = process.platform;
    const arch = process.arch;

    const links = {
        win32: {
            x64: 'https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi',
            x86: 'https://nodejs.org/dist/v18.19.0/node-v18.19.0-x86.msi'
        },
        darwin: {
            x64: 'https://nodejs.org/dist/v18.19.0/node-v18.19.0.pkg',
            arm64: 'https://nodejs.org/dist/v18.19.0/node-v18.19.0.pkg'
        },
        linux: {
            x64: 'https://nodejs.org/en/download/package-manager',
            arm64: 'https://nodejs.org/en/download/package-manager'
        }
    };

    return {
        platform,
        arch,
        downloadUrl: links[platform]?.[arch] || 'https://nodejs.org/en/download/',
        officialSite: 'https://nodejs.org/',
        packageManager: platform === 'linux' ?
            'https://nodejs.org/en/download/package-manager' : null
    };
}

/**
 * 生成环境诊断报告
 */
async function generateDiagnosticReport() {
    const nodeCheck = checkNodeVersion();
    const depsCheck = await checkDependencies();
    const envCheck = await checkEnvironment();
    const downloadLinks = getNodeDownloadLinks();

    return {
        timestamp: new Date().toISOString(),
        system: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version
        },
        checks: {
            nodeVersion: nodeCheck,
            dependencies: depsCheck,
            environment: envCheck
        },
        downloadLinks,
        recommendations: generateRecommendations(nodeCheck, depsCheck)
    };
}

/**
 * 生成修复建议
 */
function generateRecommendations(nodeCheck, depsCheck) {
    const recommendations = [];

    if (!nodeCheck.valid) {
        recommendations.push({
            type: 'critical',
            title: 'Node.js版本需要升级',
            description: `当前版本 ${nodeCheck.current} 低于要求的 ${nodeCheck.required}`,
            actions: [
                '访问 https://nodejs.org/ 下载最新LTS版本',
                '安装完成后重启命令行工具',
                '运行 node --version 验证安装'
            ]
        });
    }

    if (!depsCheck.allInstalled) {
        recommendations.push({
            type: 'warning',
            title: '依赖包不完整',
            description: `缺少 ${depsCheck.missing.length} 个关键依赖包`,
            actions: [
                '在项目目录运行: npm install',
                '如果失败，尝试: npm install --force',
                '或删除 node_modules 后重新安装'
            ]
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            type: 'success',
            title: '环境检查通过',
            description: '所有检查项目都正常，可以正常使用',
            actions: ['环境配置完整，无需额外操作']
        });
    }

    return recommendations;
}

module.exports = {
    checkFirstRun,
    checkEnvFile,
    validateConfig,
    openBrowser,
    createEnvTemplate,
    checkPort,
    checkEnvironment,
    performStartupChecks,
    // 新增的检查函数
    checkNodeVersion,
    checkDependencies,
    getNodeDownloadLinks,
    generateDiagnosticReport
}; 