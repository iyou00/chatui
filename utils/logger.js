/**
 * 日志工具模块
 * 
 * 功能：
 * 1. 提供统一的日志记录接口
 * 2. 支持不同日志级别（info, warn, error）
 * 3. 自动创建日志文件和目录
 * 4. 按日期滚动日志文件
 * 5. 强制控制台实时输出
 */

const fs = require('fs');
const path = require('path');
const moment = require('moment');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '..', 'logs');
        this.ensureLogDir();
        this.lastFlushTime = Date.now();
    }

    /**
     * 确保日志目录存在
     */
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * 获取当前日志文件路径
     */
    getLogFilePath() {
        const today = moment().format('YYYY-MM-DD');
        return path.join(this.logDir, `app-${today}.log`);
    }

    /**
     * 格式化日志消息
     */
    formatMessage(level, message, data) {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        let logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (data) {
            if (typeof data === 'object') {
                logLine += ' ' + JSON.stringify(data);
            } else {
                logLine += ' ' + data;
            }
        }
        
        return logLine;
    }

    /**
     * 写入日志文件
     */
    writeToFile(level, message, data) {
        try {
            const logMessage = this.formatMessage(level, message, data);
            const logFilePath = this.getLogFilePath();
            
            fs.appendFileSync(logFilePath, logMessage + '\n');
        } catch (error) {
            console.error('写入日志文件失败:', error);
        }
    }

    /**
     * 强制刷新控制台输出（增强版）
     */
    forceFlushConsole() {
        try {
            // 方法1：直接刷新stdout
            if (process.stdout && process.stdout._flush) {
                process.stdout._flush();
            }
            
            // 方法2：对于Windows系统的特殊处理
            if (process.platform === 'win32') {
                // 写入一个不可见字符并立即刷新
                process.stdout.write('\x1b[0m');
                
                // 强制刷新stderr（很多日志可能输出到stderr）
                if (process.stderr && process.stderr._flush) {
                    process.stderr._flush();
                }
            }
            
            // 方法3：使用setImmediate确保异步刷新
            setImmediate(() => {
                if (process.stdout.isTTY) {
                    process.stdout.write('');
                }
            });
            
        } catch (error) {
            // 忽略刷新错误，避免影响正常日志输出
        }
    }

    /**
     * 输出到控制台（增强版）
     */
    writeToConsole(level, message, data) {
        const timestamp = moment().format('HH:mm:ss');
        const prefix = `[${timestamp}]`;
        
        let output = '';
        let logFunction = console.log;
        
        switch (level) {
            case 'info':
                output = `${prefix} ℹ️  ${message}`;
                logFunction = console.log;
                break;
            case 'warn':
                output = `${prefix} ⚠️  ${message}`;
                logFunction = console.warn;
                break;
            case 'error':
                output = `${prefix} ❌ ${message}`;
                logFunction = console.error;
                break;
            default:
                output = `${prefix} ${message}`;
                logFunction = console.log;
        }
        
        // 输出主要信息
        if (data && data !== '') {
            logFunction(output, data);
        } else {
            logFunction(output);
        }
        
        // 强制刷新控制台输出
        this.forceFlushConsole();
        
        // 对于重要日志，额外等待确保输出
        if (level === 'error' || level === 'warn' || this.isImportantMessage(message)) {
            // 短暂延迟确保输出被处理
            setTimeout(() => {
                this.forceFlushConsole();
            }, 10);
        }
    }

    /**
     * 判断是否为重要消息（需要立即显示）
     */
    isImportantMessage(message) {
        const importantKeywords = [
            '开始执行任务', '任务执行完成', '任务执行失败',
            'LLM分析', 'API调用', '生成报告',
            '分片处理', '智能采样', '调度器',
            '🚀', '✅', '❌', '⚠️', '🔄'
        ];
        
        return importantKeywords.some(keyword => message.includes(keyword));
    }

    /**
     * 通用日志方法（增强版）
     */
    log(level, message, data) {
        // 先输出到控制台（实时显示）
        this.writeToConsole(level, message, data);
        
        // 再写入文件（异步处理避免阻塞）
        setImmediate(() => {
            this.writeToFile(level, message, data);
        });
        
        // 定期强制刷新
        const now = Date.now();
        if (now - this.lastFlushTime > 1000) {
            this.lastFlushTime = now;
            this.forceFlushConsole();
        }
    }

    /**
     * 任务开始日志（特殊格式）
     */
    taskStart(taskId, taskName) {
        const line = '='.repeat(60);
        this.info(line);
        this.info(`🚀 任务开始执行: ${taskId} - ${taskName}`);
        this.info(line);
        this.forceFlushConsole();
    }

    /**
     * 任务完成日志（特殊格式）
     */
    taskComplete(taskId, taskName, status = 'success') {
        const line = '='.repeat(60);
        const emoji = status === 'success' ? '✅' : '❌';
        const statusText = status === 'success' ? '成功完成' : '执行失败';
        
        this.info(line);
        this.info(`${emoji} 任务${statusText}: ${taskId} - ${taskName}`);
        this.info(line);
        this.forceFlushConsole();
    }

    /**
     * 进度日志（带进度指示）
     */
    progress(step, message) {
        this.info(`📊 [步骤 ${step}] ${message}`);
        this.forceFlushConsole();
    }

    /**
     * 信息日志
     */
    info(message, data) {
        this.log('info', message, data);
    }

    /**
     * 警告日志
     */
    warn(message, data) {
        this.log('warn', message, data);
    }

    /**
     * 错误日志
     */
    error(message, data) {
        this.log('error', message, data);
    }

    /**
     * 清理旧日志文件（保留最近30天）
     */
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const thirtyDaysAgo = moment().subtract(30, 'days');
            
            files.forEach(file => {
                if (file.match(/^app-\d{4}-\d{2}-\d{2}\.log$/)) {
                    const dateStr = file.match(/(\d{4}-\d{2}-\d{2})/)[1];
                    const fileDate = moment(dateStr);
                    
                    if (fileDate.isBefore(thirtyDaysAgo)) {
                        const filePath = path.join(this.logDir, file);
                        fs.unlinkSync(filePath);
                        this.info(`已删除旧日志文件: ${file}`);
                    }
                }
            });
        } catch (error) {
            this.error('清理旧日志文件失败:', error);
        }
    }
}

// 创建单例实例
const logger = new Logger();

// 定期清理旧日志（每天执行一次）
setInterval(() => {
    logger.cleanOldLogs();
}, 24 * 60 * 60 * 1000);

// 设置进程级别的强制输出刷新
process.on('beforeExit', () => {
    logger.forceFlushConsole();
});

// 定期强制刷新输出（每2秒，更频繁）
setInterval(() => {
    logger.forceFlushConsole();
}, 2000);

// 在重要日志后立即刷新
const originalLog = logger.log;
logger.log = function(level, message, data) {
    originalLog.call(this, level, message, data);
    
    // 对于重要日志立即刷新
    if (level === 'error' || level === 'warn' || this.isImportantMessage(message)) {
        setImmediate(() => {
            this.forceFlushConsole();
        });
    }
};

module.exports = logger; 