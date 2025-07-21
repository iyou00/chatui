/**
 * 定时任务调度服务
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const { getDatabase } = require('../utils/database');
const llmService = require('./llmService');

class TaskScheduler {
    constructor() {
        this.tasks = new Map();
        this.runningTasks = new Set();
        this.isStarted = false;
    }

    start() {
        if (this.isStarted) {
            logger.warn('调度器已经启动');
            return;
        }
        this.isStarted = true;
        logger.info('定时任务调度器启动成功');
        this.scheduleSystemTasks();
        this.loadExistingTasks();
    }

    stop() {
        if (!this.isStarted) return;
        this.tasks.forEach((task, taskId) => {
            if (task.cronJob) task.cronJob.stop();
        });
        this.tasks.clear();
        this.runningTasks.clear();
        this.isStarted = false;
        logger.info('定时任务调度器已停止');
    }

    addTask(taskId, scheduleTime, executionFunction) {
        try {
            this.removeTask(taskId);
            const cronJob = cron.schedule(scheduleTime, async () => {
                await this.executeTask(taskId, executionFunction);
            }, { scheduled: false, timezone: 'Asia/Shanghai' });

            this.tasks.set(taskId, {
                cronJob, scheduleTime, executionFunction, createdAt: new Date()
            });
            cronJob.start();
            logger.info(`定时任务已添加: ${taskId}, 执行时间: ${scheduleTime}`);
            return true;
        } catch (error) {
            logger.error(`添加定时任务失败: ${taskId}`, error);
            return false;
        }
    }

    removeTask(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            if (task.cronJob) task.cronJob.stop();
            this.tasks.delete(taskId);
            logger.info(`定时任务已移除: ${taskId}`);
            return true;
        }
        return false;
    }

    async executeTask(taskId, executionFunction) {
        if (this.runningTasks.has(taskId)) {
            logger.warn(`任务 ${taskId} 正在执行中，跳过本次执行`);
            return;
        }
        this.runningTasks.add(taskId);
        logger.info(`开始执行任务: ${taskId}`);
        try {
            await executionFunction();
            logger.info(`任务执行完成: ${taskId}`);
        } catch (error) {
            logger.error(`任务执行失败: ${taskId}`, error);
        } finally {
            this.runningTasks.delete(taskId);
        }
    }

    registerTask(task) {
        try {
            let cronExpr = null;
            switch (task.schedule_type) {
                case 'once':
                    if (task.schedule_time) {
                        cronExpr = this.convertToCronExpression(task.schedule_time);
                    }
                    break;
                case 'daily':
                case 'weekly':
                    if (task.cron_expression) {
                        cronExpr = task.cron_expression;
                    }
                    break;
                default:
                    if (task.schedule_time) {
                        cronExpr = this.convertToCronExpression(task.schedule_time);
                    }
                    break;
            }

            if (cronExpr) {
                this.addTask(task.id, cronExpr, async () => {
                    await this.runTaskProcess(task.id);
                });
                logger.info(`动态注册任务成功: ${task.id}, 执行时间: ${cronExpr}`);
                return true;
            } else {
                logger.warn(`任务 ${task.id} 没有有效的定时配置，无法注册`);
                return false;
            }
        } catch (error) {
            logger.error(`注册任务失败: ${task.id}`, error);
            return false;
        }
    }

    async loadExistingTasks() {
        try {
            logger.info('加载已存在的任务...');
            const db = getDatabase();
            const tasks = db.getTasks();

            tasks.filter(t => t.status === 'enabled').forEach(task => {
                let cronExpr = null;
                switch (task.schedule_type) {
                    case 'once':
                        if (task.schedule_time) {
                            cronExpr = this.convertToCronExpression(task.schedule_time);
                        }
                        break;
                    case 'daily':
                    case 'weekly':
                        if (task.cron_expression) {
                            cronExpr = task.cron_expression;
                        }
                        break;
                    default:
                        if (task.schedule_time) {
                            cronExpr = this.convertToCronExpression(task.schedule_time);
                        }
                        break;
                }

                if (cronExpr) {
                    this.addTask(task.id, cronExpr, async () => {
                        await this.runTaskProcess(task.id);
                    });
                    logger.info(`定时任务已添加: ${task.id}, 执行时间: ${cronExpr}`);
                } else {
                    logger.warn(`任务 ${task.id} 没有有效的定时配置`);
                }
            });

            logger.info(`已注册${this.tasks.size}个定时任务`);
        } catch (error) {
            logger.error('加载已存在的任务失败:', error);
        }
    }

    async runTaskProcess(taskId) {
        const db = getDatabase();
        const task = db.getTask(taskId);
        if (!task) {
            logger.error(`任务不存在: ${taskId}`);
            return;
        }

        // 更新任务进度状态为"正在分析中"
        db.updateTaskProgress(taskId, 'analyzing');
        logger.taskStart(taskId, task.name);

        let chatlogs = [];
        let totalMessages = 0;

        try {
            logger.progress(1, '获取群聊数据');
            logger.info('任务配置的群聊:', task.chatrooms);

            // 🔄 优先从外部ChatLog服务获取真实数据
            const settingsManager = require('./settingsManager');
            const config = settingsManager.loadConfig();

            if (config.chatlogUrl) {
                logger.info('🌐 优先从外部ChatLog服务获取真实群聊数据...');

                for (const chatroomName of task.chatrooms) {
                    logger.info(`🔗 从外部服务获取群聊: ${chatroomName}`);

                    try {
                        const externalData = await this.fetchChatlogFromExternal(config.chatlogUrl, chatroomName, task.time_range);
                        if (externalData && externalData.messages?.length > 0) {
                            // 对获取的消息进行本地时间过滤，确保符合指定时间范围
                            const filteredMessages = this.filterMessagesByTimeRange(externalData.messages, task.time_range);

                            if (filteredMessages.length > 0) {
                                chatlogs.push({
                                    id: Date.now() + Math.random(), // 确保唯一ID
                                    chatroom: chatroomName,
                                    messages: filteredMessages
                                });
                                totalMessages += filteredMessages.length;
                                logger.info(`✅ 从外部服务获取群聊 ${chatroomName}：原始 ${externalData.messages.length} 条，时间过滤后 ${filteredMessages.length} 条真实消息`);
                            } else {
                                logger.warn(`⚠️ 群聊 ${chatroomName} 在指定时间范围内无有效消息`);
                            }
                        } else {
                            logger.warn(`⚠️ 外部服务中群聊 ${chatroomName} 在指定时间范围内无消息数据`);
                        }
                    } catch (fetchError) {
                        logger.error(`❌ 从外部服务获取群聊 ${chatroomName} 失败:`, fetchError.message);
                        logger.warn(`🔄 将尝试使用本地备用数据...`);
                    }
                }

                logger.info(`🌐 外部数据获取完成: 共获得 ${chatlogs.length} 个群聊，${totalMessages} 条消息`);
            } else {
                logger.warn('⚠️ 未配置外部chatlog服务地址，将使用本地数据');
            }

            // 📂 如果外部服务获取失败或无数据，回退到本地数据作为备用
            if (chatlogs.length === 0 || totalMessages === 0) {
                logger.warn('🔄 外部数据获取失败或无数据，回退到本地备用数据...');

                const allLogs = require('./chatlogService').getChatlogs();
                logger.info('📂 本地chatlog数据总数:', allLogs.length);
                logger.info('📂 本地可用群聊:', allLogs.map(log => log.chatroom));

                const localChatlogs = allLogs.filter(log => {
                    const isMatch = task.chatrooms.includes(log.chatroom);
                    if (isMatch) {
                        logger.info(`✅ 找到本地匹配群聊: ${log.chatroom}, 消息数: ${log.messages?.length || 0}`);
                    }
                    return isMatch;
                });

                if (localChatlogs.length > 0) {
                    chatlogs = localChatlogs;
                    totalMessages = chatlogs.reduce((sum, log) => sum + (log.messages?.length || 0), 0);
                    logger.warn(`⚠️ 使用本地备用数据: ${chatlogs.length} 个群聊，${totalMessages} 条消息（注意：这可能是测试数据）`);
                } else {
                    logger.error(`❌ 既无法从外部服务获取数据，也没有本地备用数据`);
                }
            }

        } catch (err) {
            logger.error('拉取chatlog失败:', err);
        }

        if (chatlogs.length === 0) {
            logger.error('❌ 没有找到任何群聊数据，任务执行失败');
            db.createReport({
                task_id: taskId,
                task_name: task.name,
                execution_time: new Date().toISOString(),
                status: 'failed',
                report_file: null,
                error_message: '没有找到任何群聊数据'
            });
            logger.taskComplete(taskId, task.name, 'failed');
            return;
        }

        logger.progress(2, `开始分别分析 ${chatlogs.length} 个群聊`);

        const results = [];
        const successCount = { value: 0 };
        const failedCount = { value: 0 };

        const fullPrompt = db.getFullPrompt(taskId);

        for (let i = 0; i < chatlogs.length; i++) {
            const chatlog = chatlogs[i];
            const chatroomName = chatlog.chatroom;
            const messageCount = chatlog.messages?.length || 0;

            logger.info(`📱 [${i + 1}/${chatlogs.length}] 开始分析群聊: ${chatroomName} (${messageCount}条消息)`);

            try {
                const analysisResult = await this.analyzeSingleChatroom(
                    chatlog,
                    task.llm_model || 'deepseek',
                    fullPrompt,
                    chatroomName,
                    messageCount
                );

                const reportResult = await this.generateChatroomReport(
                    taskId,
                    task.name,
                    chatroomName,
                    analysisResult,
                    messageCount
                );

                if (reportResult.success) {
                    successCount.value++;
                    results.push({
                        chatroom: chatroomName,
                        status: 'success',
                        reportFile: reportResult.reportFile,
                        reportId: reportResult.reportId,
                        messageCount: messageCount
                    });

                    logger.info(`✅ [${i + 1}/${chatlogs.length}] 群聊 ${chatroomName} 分析完成，报告: ${reportResult.reportFile}`);
                } else {
                    failedCount.value++;
                    results.push({
                        chatroom: chatroomName,
                        status: 'failed',
                        error: reportResult.error,
                        messageCount: messageCount
                    });

                    logger.error(`❌ [${i + 1}/${chatlogs.length}] 群聊 ${chatroomName} 分析失败: ${reportResult.error}`);
                }

            } catch (error) {
                failedCount.value++;
                results.push({
                    chatroom: chatroomName,
                    status: 'failed',
                    error: error.message,
                    messageCount: messageCount
                });

                logger.error(`❌ [${i + 1}/${chatlogs.length}] 群聊 ${chatroomName} 处理异常:`, error.message);
            }

            if (i < chatlogs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const overallStatus = failedCount.value === 0 ? 'success' : (successCount.value === 0 ? 'failed' : 'partial');
        logger.progress(3, `任务完成：成功 ${successCount.value} 个，失败 ${failedCount.value} 个`);

        // 更新任务进度状态为最终状态
        const finalProgressStatus = overallStatus === 'success' ? 'completed' : 'failed';
        db.updateTaskProgress(taskId, finalProgressStatus);

        logger.taskComplete(taskId, task.name, overallStatus);
    }

    async analyzeSingleChatroom(chatlog, llmModel, prompt, chatroomName, messageCount) {
        try {
            logger.info(`🤖 使用模型 ${llmModel} 分析群聊: ${chatroomName}`);
            const singleChatroomArray = [chatlog];
            const analysisResult = await llmService.analyze(singleChatroomArray, llmModel, prompt);
            logger.info(`✅ 群聊 ${chatroomName} LLM分析完成，结果长度: ${analysisResult.length}字符`);
            return analysisResult;
        } catch (error) {
            logger.error(`❌ 群聊 ${chatroomName} LLM分析失败:`, error.message);
            return `❌ 群聊 ${chatroomName} 分析失败: ${error.message}

调试信息：
- 群聊名称：${chatroomName}
- 消息数量：${messageCount}
- 使用模型：${llmModel}
- 错误详情：${error.message}

建议：
1. 检查网络连接
2. 确认API密钥配置正确
3. 稍后重试`;
        }
    }

    async generateChatroomReport(taskId, taskName, chatroomName, analysisContent, messageCount, isSummary = false) {
        try {
            // 清理LLM输出中的多余文案
            let cleanedContent = this.cleanLLMOutput(analysisContent);

            // 检测LLM是否直接输出了完整的HTML
            const isCompleteHtml = cleanedContent.includes('<!DOCTYPE html>') &&
                cleanedContent.includes('<html') &&
                cleanedContent.includes('</html>');

            const hasHtmlInMarkdown = cleanedContent.includes('```html') && cleanedContent.includes('<!DOCTYPE html>');

            let reportHtml = '';

            if (isCompleteHtml && !hasHtmlInMarkdown) {
                // LLM直接输出了完整的HTML文档
                reportHtml = cleanedContent.trim();
                logger.info(`✅ 检测到LLM直接输出的完整HTML报告: ${chatroomName}`);
            } else if (hasHtmlInMarkdown) {
                // HTML包装在markdown代码块中
                const htmlMatch = cleanedContent.match(/```html\s*([\s\S]*?)```/);
                if (htmlMatch && htmlMatch[1]) {
                    reportHtml = htmlMatch[1].trim();
                    logger.info(`✅ 从markdown代码块中提取HTML: ${chatroomName}`);
                } else {
                    reportHtml = cleanedContent;
                }
            } else {
                // 需要包装的情况
                const hasPartialHtml = cleanedContent.includes('<html') || cleanedContent.includes('<body') || cleanedContent.includes('<div');

                if (hasPartialHtml) {
                    logger.warn(`⚠️ 检测到不完整的HTML内容，尝试修复: ${chatroomName}`);
                    reportHtml = this.repairIncompleteHtml(cleanedContent, taskName, chatroomName, messageCount, isSummary);
                } else {
                    logger.info(`📝 LLM输出纯文本内容，使用系统模板包装: ${chatroomName}`);
                    reportHtml = this.wrapInBasicHtml(cleanedContent, taskName, chatroomName, messageCount, isSummary);
                }
            }

            const fs = require('fs');
            const path = require('path');
            const reportsDir = path.join(__dirname, '../reports');
            if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

            const timestamp = Date.now();
            const safeCharoomName = chatroomName.replace(/[<>:"/\\|?*]/g, '_');
            const reportFile = isSummary
                ? `summary_${taskId}_${timestamp}.html`
                : `${safeCharoomName}_${taskId}_${timestamp}.html`;

            const reportPath = path.join(reportsDir, reportFile);
            fs.writeFileSync(reportPath, reportHtml, 'utf-8');

            const db = getDatabase();
            const reportId = db.createReport({
                task_id: taskId,
                task_name: taskName,
                chatroom_name: chatroomName,
                execution_time: new Date().toISOString(),
                status: 'success',
                report_file: reportFile,
                message_count: messageCount,
                is_summary: isSummary,
                error_message: null
            });

            return {
                success: true,
                reportFile: reportFile,
                reportId: reportId
            };

        } catch (error) {
            logger.error(`生成群聊 ${chatroomName} 报告失败:`, error.message);

            const db = getDatabase();
            db.createReport({
                task_id: taskId,
                task_name: taskName,
                chatroom_name: chatroomName,
                execution_time: new Date().toISOString(),
                status: 'failed',
                report_file: null,
                message_count: messageCount,
                is_summary: isSummary,
                error_message: `报告生成失败: ${error.message}`
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    async fetchChatlogFromExternal(chatlogUrl, chatroomName, timeRange = null) {
        const axios = require('axios');

        try {
            // 确保 URL 格式正确，移除末尾的斜杠
            let fullUrl = chatlogUrl.startsWith('http') ? chatlogUrl : `http://${chatlogUrl}`;
            if (fullUrl.endsWith('/')) {
                fullUrl = fullUrl.slice(0, -1);
            }

            const timeParam = this.generateTimeParam(timeRange);

            // 构建完整的请求URL，使用URL编码确保特殊字符正确传输
            const encodedTalker = encodeURIComponent(chatroomName);
            const encodedTime = encodeURIComponent(timeParam);
            const requestUrl = `${fullUrl}/api/v1/chatlog?talker=${encodedTalker}&time=${encodedTime}&format=text`;

            logger.info(`🔗 调用ChatLog API: ${fullUrl}/api/v1/chatlog`);
            logger.info(`📋 请求参数: talker=${chatroomName}, time=${timeParam}, format=text`);
            logger.info(`🌐 完整URL: ${requestUrl}`);

            const response = await axios.get(`${fullUrl}/api/v1/chatlog`, {
                params: {
                    talker: chatroomName,
                    time: timeParam,
                    format: 'text' // 使用 text 格式获取 TXT 聊天记录
                },
                timeout: 15000,
                headers: {
                    'User-Agent': 'ChatChat-Platform/1.0',
                    'Accept': 'text/plain, application/json'
                }
            });

            logger.info(`📊 ChatLog API响应 (时间范围: ${timeParam}):`, {
                status: response.status,
                hasData: !!response.data,
                dataType: typeof response.data,
                contentType: response.headers['content-type'],
                dataLength: response.data?.length || 0
            });

            // 检查响应内容类型
            const contentType = response.headers['content-type'] || '';
            logger.info(`📋 响应内容类型: ${contentType}`);

            let data = response.data;

            // 如果返回的是 HTML 页面，说明 API 端点或参数有问题
            if (typeof data === 'string' && (data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html'))) {
                logger.error('❌ ChatLog服务返回了HTML页面而不是数据');
                logger.error('🔧 尝试使用文本格式重新请求...');

                // 尝试使用文本格式重新请求
                try {
                    const textResponse = await axios.get(`${fullUrl}/api/v1/chatlog`, {
                        params: {
                            talker: chatroomName,
                            time: timeParam,
                            format: 'text' // 改为文本格式
                        },
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'ChatChat-Platform/1.0',
                            'Accept': 'text/plain'
                        }
                    });

                    if (textResponse.data && typeof textResponse.data === 'string') {
                        logger.info('✅ 成功获取文本格式数据，开始解析...');
                        return this.parseTextChatlog(textResponse.data, chatroomName);
                    }
                } catch (textError) {
                    logger.error('❌ 文本格式请求也失败:', textError.message);
                }

                return null;
            }

            // 如果是字符串格式，先检查是否是聊天记录文本格式
            if (typeof data === 'string') {
                // 检查是否是聊天记录文本格式
                if (this.isTextChatlogFormat(data)) {
                    logger.info('✅ 检测到文本格式的聊天记录，开始解析...');
                    return this.parseTextChatlog(data, chatroomName);
                }

                // 尝试解析为JSON
                try {
                    data = JSON.parse(data);
                    logger.info('✅ 成功解析JSON字符串响应');
                } catch (parseError) {
                    logger.error('❌ JSON解析失败:', parseError.message);
                    logger.error('📄 响应内容预览:', data.substring(0, 300) + '...');
                    return null;
                }
            }

            // 根据ChatLog API文档，响应应该是消息数组
            let messages = [];

            if (Array.isArray(data)) {
                // 直接是消息数组
                messages = data;
                logger.info(`✅ ChatLog API返回消息数组: ${messages.length}条`);
            } else if (data && typeof data === 'object') {
                // 可能包装在对象中
                if (Array.isArray(data.data)) {
                    messages = data.data;
                    logger.info(`✅ 从data字段提取消息: ${messages.length}条`);
                } else if (Array.isArray(data.messages)) {
                    messages = data.messages;
                    logger.info(`✅ 从messages字段提取消息: ${messages.length}条`);
                } else if (Array.isArray(data.records)) {
                    messages = data.records;
                    logger.info(`✅ 从records字段提取消息: ${messages.length}条`);
                } else {
                    logger.warn('⚠️ 响应格式不匹配，尝试使用整个对象');
                    logger.info('📋 响应结构:', Object.keys(data));
                    messages = [];
                }
            } else {
                logger.warn('⚠️ 无法识别的响应格式');
                logger.info('📋 响应类型:', typeof data);
                messages = [];
            }

            // 验证消息格式
            if (messages.length > 0) {
                const sampleMessage = messages[0];
                logger.info('📝 消息样本结构:', Object.keys(sampleMessage || {}));

                // 转换为标准格式
                const standardMessages = messages.map(msg => {
                    // 根据ChatLog可能的字段名进行映射
                    return {
                        sender: msg.sender || msg.from || msg.talker || msg.nickname || '未知用户',
                        content: msg.content || msg.message || msg.text || msg.msg || '',
                        timestamp: msg.timestamp || msg.time || msg.createTime || Date.now()
                    };
                }).filter(msg => msg.content && msg.content.trim()); // 过滤空消息

                logger.info(`✅ 标准化处理完成: ${standardMessages.length}条有效消息`);

                return {
                    chatroom: chatroomName,
                    messages: standardMessages
                };
            } else {
                logger.warn(`⚠️ 群聊 ${chatroomName} 没有找到消息数据`);
                return {
                    chatroom: chatroomName,
                    messages: []
                };
            }

        } catch (error) {
            logger.error(`从外部服务获取群聊 ${chatroomName} 失败:`, error.message);
            throw error;
        }
    }

    /**
     * 检查是否是文本格式的聊天记录
     * @param {string} data - 响应数据
     * @returns {boolean} 是否是文本格式
     */
    isTextChatlogFormat(data) {
        if (typeof data !== 'string' || !data.trim()) {
            return false;
        }

        // 检查是否包含典型的聊天记录格式
        // 格式1: 发言人(可选的wxid) HH:MM:SS
        // 格式2: 发言人(可选的wxid) YYYY-MM-DD HH:MM:SS  
        // 格式3: 发言人(可选的wxid) MM-DD HH:MM:SS (ChatLog格式)
        const timePatterns = [
            /\d{2}:\d{2}:\d{2}/, // HH:MM:SS
            /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/, // YYYY-MM-DD HH:MM:SS
            /\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/, // MM-DD HH:MM:SS (ChatLog)
        ];

        const lines = data.split('\n').slice(0, 10); // 检查前10行
        let hasTimePattern = false;

        for (const line of lines) {
            if (line.trim()) {
                for (const pattern of timePatterns) {
                    if (pattern.test(line)) {
                        hasTimePattern = true;
                        logger.info(`✅ 识别到聊天记录格式: ${line.substring(0, 50)}...`);
                        break;
                    }
                }
                if (hasTimePattern) break;
            }
        }

        return hasTimePattern;
    }

    /**
     * 解析文本格式的聊天记录
     * @param {string} textData - 文本格式的聊天记录
     * @param {string} chatroomName - 群聊名称
     * @returns {Object} 解析后的聊天记录对象
     */
    parseTextChatlog(textData, chatroomName) {
        try {
            const lines = textData.split('\n');
            const messages = [];
            let currentMessage = null;

            logger.info(`📝 解析文本聊天记录 (${lines.length}行)...`);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // 尝试匹配时间戳行 (按具体性顺序，避免误匹配)
                // 格式1: 发言人(可选的wxid) YYYY-MM-DD HH:MM:SS  
                // 格式2: 发言人(可选的wxid) MM-DD HH:MM:SS (ChatLog格式)
                // 格式3: 发言人(可选的wxid) HH:MM:SS (最宽泛，放最后)
                const timeMatch1 = line.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})$/);
                const timeMatch2 = line.match(/^(.+?)\s+(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})$/);
                const timeMatch3 = line.match(/^(.+?)\s+(\d{2}:\d{2}:\d{2})$/);

                if (timeMatch1 || timeMatch2 || timeMatch3) {
                    // 保存上一条消息
                    if (currentMessage && currentMessage.content.trim()) {
                        messages.push({
                            sender: currentMessage.sender,
                            content: currentMessage.content.trim(),
                            timestamp: currentMessage.timestamp
                        });
                    }

                    // 开始新消息
                    const match = timeMatch1 || timeMatch2 || timeMatch3;
                    let senderInfo = match[1].trim();
                    const timeStr = match[2];

                    // 提取发言人名称（去除可能的wxid）
                    const senderMatch = senderInfo.match(/^(.+?)\([^)]+\)$/) || [null, senderInfo];
                    const sender = senderMatch[1] || senderInfo;

                    // 转换时间戳
                    let timestamp;
                    if (timeMatch1) {
                        // 完整日期时间 YYYY-MM-DD HH:MM:SS
                        timestamp = new Date(timeStr).getTime();
                    } else if (timeMatch2) {
                        // ChatLog格式 MM-DD HH:MM:SS
                        const currentYear = new Date().getFullYear();
                        const fullTimeStr = `${currentYear}-${timeStr}`;
                        timestamp = new Date(fullTimeStr).getTime();
                    } else {
                        // 只有时间 HH:MM:SS，使用今天的日期
                        const today = new Date().toISOString().split('T')[0];
                        timestamp = new Date(`${today} ${timeStr}`).getTime();
                    }

                    currentMessage = {
                        sender: sender,
                        content: '',
                        timestamp: timestamp
                    };
                } else if (currentMessage) {
                    // 这是消息内容行
                    if (currentMessage.content) {
                        currentMessage.content += '\n' + line;
                    } else {
                        currentMessage.content = line;
                    }
                }
            }

            // 保存最后一条消息
            if (currentMessage && currentMessage.content.trim()) {
                messages.push({
                    sender: currentMessage.sender,
                    content: currentMessage.content.trim(),
                    timestamp: currentMessage.timestamp
                });
            }

            logger.info(`✅ 文本聊天记录解析完成: ${messages.length}条消息`);

            return {
                chatroom: chatroomName,
                messages: messages
            };

        } catch (error) {
            logger.error('❌ 解析文本聊天记录失败:', error.message);
            return {
                chatroom: chatroomName,
                messages: []
            };
        }
    }

    generateTimeParam(timeRange) {
        if (!timeRange || timeRange.type === 'all') {
            return '2020-01-01~2030-12-31';
        }

        const now = new Date();
        let startDate, endDate;

        switch (timeRange.type) {
            case 'recent_1d':
                startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_3d':
                startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_15d':
                startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'custom':
                if (timeRange.start_date && timeRange.end_date) {
                    // 使用 start_date 和 end_date (来自前端form)
                    startDate = new Date(timeRange.start_date);
                    endDate = new Date(timeRange.end_date);
                } else if (timeRange.startDate && timeRange.endDate) {
                    // 向后兼容旧字段名
                    startDate = new Date(timeRange.startDate);
                    endDate = new Date(timeRange.endDate);
                } else {
                    console.warn('自定义时间范围缺少日期参数，使用默认值');
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    endDate = now;
                }
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
        }

        const formatDate = (date) => {
            return date.toISOString().split('T')[0];
        };

        const timeParam = `${formatDate(startDate)}~${formatDate(endDate)}`;
        logger.info(`生成时间参数: ${timeParam} (类型: ${timeRange.type})`);

        return timeParam;
    }

    /**
     * 根据时间范围过滤消息数组
     * @param {Array} messages - 消息数组
     * @param {Object} timeRange - 时间范围配置
     * @returns {Array} 过滤后的消息数组
     */
    filterMessagesByTimeRange(messages, timeRange) {
        if (!timeRange || timeRange.type === 'all') {
            logger.info('📅 时间范围设置为"全部"，不进行时间过滤');
            return messages;
        }

        const now = new Date();
        let startDate, endDate;

        // 计算时间范围（与generateTimeParam保持一致）
        switch (timeRange.type) {
            case 'recent_1d':
                startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_3d':
                startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_15d':
                startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'recent_30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'custom':
                if (timeRange.start_date && timeRange.end_date) {
                    startDate = new Date(timeRange.start_date);
                    endDate = new Date(timeRange.end_date);
                } else if (timeRange.startDate && timeRange.endDate) {
                    startDate = new Date(timeRange.startDate);
                    endDate = new Date(timeRange.endDate);
                } else {
                    logger.warn('自定义时间范围缺少日期参数，使用默认值（最近7天）');
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    endDate = now;
                }
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
        }

        const startTimestamp = startDate.getTime();
        const endTimestamp = endDate.getTime();

        logger.info(`📅 本地时间过滤范围: ${startDate.toLocaleString()} 至 ${endDate.toLocaleString()}`);

        let invalidTimeCount = 0;
        let outOfRangeCount = 0;

        const filteredMessages = messages.filter(message => {
            let messageTime;

            // 处理不同的时间戳格式
            if (message.timestamp) {
                // 判断是秒级还是毫秒级时间戳
                if (message.timestamp.toString().length === 10) {
                    // 秒级时间戳，转换为毫秒
                    messageTime = message.timestamp * 1000;
                } else {
                    // 毫秒级时间戳
                    messageTime = message.timestamp;
                }
            } else if (message.time) {
                // 可能是字符串格式的时间
                messageTime = new Date(message.time).getTime();
            } else if (message.createTime) {
                messageTime = new Date(message.createTime).getTime();
            } else {
                // 没有时间信息，跳过此消息
                invalidTimeCount++;
                return false;
            }

            // 检查时间戳是否有效
            if (isNaN(messageTime)) {
                invalidTimeCount++;
                return false;
            }

            const isInRange = messageTime >= startTimestamp && messageTime <= endTimestamp;
            if (!isInRange) {
                outOfRangeCount++;
            }

            return isInRange;
        });

        // 输出过滤统计
        logger.info(`📅 时间过滤完成: 原始 ${messages.length} 条 → 过滤后 ${filteredMessages.length} 条 (${timeRange.type})`);
        if (invalidTimeCount > 0) {
            logger.warn(`⚠️ ${invalidTimeCount} 条消息缺少有效时间戳，已跳过`);
        }
        if (outOfRangeCount > 0) {
            logger.info(`📊 ${outOfRangeCount} 条消息不在时间范围内，已过滤`);
        }

        return filteredMessages;
    }

    repairIncompleteHtml(content, taskName, chatroomName, messageCount, isSummary) {
        try {
            let repairedHtml = content;

            if (!repairedHtml.includes('<!DOCTYPE html>')) {
                const reportTitle = isSummary ? `执行摘要 - ${taskName}` : `${chatroomName} - 分析报告`;
                const reportSubtitle = isSummary ? `任务执行概况` : `群聊消息分析 (${messageCount}条消息)`;

                repairedHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${reportTitle}</title>
    <style>
        body { 
            font-family: 'Microsoft YaHei', Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 { 
            color: #6a5acd; 
            text-align: center;
            border-bottom: 3px solid #6a5acd;
            padding-bottom: 15px;
            margin-bottom: 30px;
        }
        .meta { 
            color: #666; 
            font-size: 0.9em; 
            background: #f8f9ff;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 25px;
            border-left: 4px solid #6a5acd;
        }
        .content {
            background: #fdfdfd;
            padding: 25px;
            border-radius: 10px;
            border: 1px solid #e9ecef;
            white-space: pre-wrap;
            line-height: 1.8;
        }
        .chatroom-badge {
            display: inline-block;
            background: linear-gradient(45deg, #6a5acd, #9370db);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9em;
            margin-bottom: 15px;
            box-shadow: 0 2px 10px rgba(106, 90, 205, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 ${reportTitle}</h1>
        ${!isSummary ? `<div class="chatroom-badge">📱 ${chatroomName}</div>` : ''}
        <div class="meta">
            <strong>📊 ${reportSubtitle}</strong><br>
            🕒 生成时间：${new Date().toLocaleString('zh-CN')}<br>
            📋 任务名称：${taskName}<br>
            🤖 分析引擎：AI智能分析
        </div>
        <div class="content">
${content}
        </div>
    </div>
</body>
</html>
                `.trim();
            } else {
                if (!repairedHtml.includes('</html>')) {
                    repairedHtml += '\n</body>\n</html>';
                }
                if (!repairedHtml.includes('</body>') && repairedHtml.includes('<body')) {
                    repairedHtml = repairedHtml.replace('</html>', '</body>\n</html>');
                }
            }

            return repairedHtml;

        } catch (error) {
            logger.error('修复HTML失败:', error.message);
            return this.wrapInBasicHtml(content, taskName, chatroomName, messageCount, isSummary);
        }
    }

    wrapInBasicHtml(content, taskName, chatroomName, messageCount, isSummary) {
        const reportTitle = isSummary ? `执行摘要 - ${taskName}` : `${chatroomName} - 分析报告`;
        const reportSubtitle = isSummary ? `任务执行概况` : `群聊消息分析 (${messageCount}条消息)`;

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${reportTitle}</title>
    <style>
        body { 
            font-family: 'Microsoft YaHei', Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 { 
            color: #6a5acd; 
            text-align: center;
            border-bottom: 3px solid #6a5acd;
            padding-bottom: 15px;
            margin-bottom: 30px;
        }
        .meta { 
            color: #666; 
            font-size: 0.9em; 
            background: #f8f9ff;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 25px;
            border-left: 4px solid #6a5acd;
        }
        .content {
            background: #fdfdfd;
            padding: 25px;
            border-radius: 10px;
            border: 1px solid #e9ecef;
            white-space: pre-wrap;
            line-height: 1.8;
        }
        .chatroom-badge {
            display: inline-block;
            background: linear-gradient(45deg, #6a5acd, #9370db);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9em;
            margin-bottom: 15px;
            box-shadow: 0 2px 10px rgba(106, 90, 205, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 ${reportTitle}</h1>
        ${!isSummary ? `<div class="chatroom-badge">📱 ${chatroomName}</div>` : ''}
        <div class="meta">
            <strong>📊 ${reportSubtitle}</strong><br>
            🕒 生成时间：${new Date().toLocaleString('zh-CN')}<br>
            📋 任务名称：${taskName}<br>
            🤖 分析引擎：AI智能分析
        </div>
        <div class="content">
${content}
        </div>
    </div>
</body>
</html>
        `.trim();
    }

    async executeTaskNow(taskId) {
        await this.runTaskProcess(taskId);
        return true;
    }

    getTaskStatus(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            return {
                exists: true,
                isRunning: this.runningTasks.has(taskId),
                scheduleTime: task.scheduleTime,
                createdAt: task.createdAt
            };
        }
        return { exists: false };
    }

    getAllTasksStatus() {
        const status = {};
        this.tasks.forEach((task, taskId) => {
            status[taskId] = this.getTaskStatus(taskId);
        });
        return status;
    }

    scheduleSystemTasks() {
        cron.schedule('0 0 * * *', () => {
            logger.info('执行日志清理任务');
        });

        cron.schedule('0 * * * *', () => {
            const taskCount = this.tasks.size;
            const runningCount = this.runningTasks.size;
            logger.info(`任务状态检查: 总任务数 ${taskCount}, 运行中 ${runningCount}`);
        });
    }

    /**
     * 清理LLM输出中的多余文案和说明文字
     * @param {string} content - LLM原始输出
     * @returns {string} 清理后的内容
     */
    cleanLLMOutput(content) {
        if (!content) return content;

        let cleaned = content;

        // 🔧 修复：首先移除开头的```html标记（无论是否有说明文字）
        if (cleaned.trim().startsWith('```html')) {
            cleaned = cleaned.replace(/^```html\s*/, '');
            logger.info('🧹 移除了开头的```html标记');
        }

        // 移除常见的LLM介绍性文案
        const introPatterns = [
            /^.*?我将为您创建.*?以下是.*?HTML代码[：:]\s*```html\s*/i,
            /^.*?我将为您创建.*?完整的HTML.*?报告.*?```html\s*/i,
            /^.*?以下是.*?完整的HTML.*?代码[：:]\s*```html\s*/i,
            /^.*?为您生成.*?HTML.*?报告.*?```html\s*/i,
            /^.*?根据.*?数据.*?生成.*?HTML.*?```html\s*/i,
            /^.*?基于.*?群聊数据.*?HTML.*?```html\s*/i
        ];

        // 尝试匹配并移除介绍性文案
        for (const pattern of introPatterns) {
            if (pattern.test(cleaned)) {
                cleaned = cleaned.replace(pattern, '');
                logger.info('🧹 移除了LLM输出中的介绍性文案');
                break;
            }
        }

        // 移除开头的说明文字（更通用的模式）
        const generalIntroPatterns = [
            /^[^<]*?(?=<!DOCTYPE html>)/i,  // 移除<!DOCTYPE html>之前的所有内容
            /^.*?```html\s*(?=<!DOCTYPE html>)/i  // 移除```html标记和之前的内容
        ];

        for (const pattern of generalIntroPatterns) {
            const match = cleaned.match(pattern);
            if (match && match[0].length > 10) { // 只有当匹配的内容足够长时才移除
                cleaned = cleaned.replace(pattern, '');
                logger.info('🧹 移除了LLM输出开头的说明文字');
                break;
            }
        }

        // 🔧 修复：移除HTML结尾后的额外内容
        // 使用更精确的HTML结束检测
        // 首先尝试查找完整的HTML结束结构：</body></html>
        const htmlEndPattern = /<\/body>\s*<\/html>\s*$/i;
        const htmlEndMatch = cleaned.match(htmlEndPattern);

        if (htmlEndMatch) {
            // 找到标准的HTML结束，移除之后的所有内容
            const endIndex = htmlEndMatch.index + htmlEndMatch[0].length;
            cleaned = cleaned.substring(0, endIndex);
            logger.info('🧹 移除了HTML结尾后的额外内容');
        } else {
            // 如果没有找到标准结束，尝试查找最后一个</html>
            const lastHtmlEnd = cleaned.lastIndexOf('</html>');
            if (lastHtmlEnd !== -1) {
                cleaned = cleaned.substring(0, lastHtmlEnd + 7);
                logger.info('🧹 移除了HTML结尾后的额外内容（备用方案）');
            }
        }

        // 移除结尾的markdown代码块标记
        cleaned = cleaned.replace(/```\s*$/, '');

        // 移除多余的空白行
        cleaned = cleaned.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');

        return cleaned.trim();
    }

    convertToCronExpression(scheduleTime) {
        try {
            const date = new Date(scheduleTime);
            const minutes = date.getMinutes();
            const hours = date.getHours();
            const dayOfMonth = date.getDate();
            const month = date.getMonth() + 1;

            return `${minutes} ${hours} ${dayOfMonth} ${month} *`;
        } catch (error) {
            logger.error('转换cron表达式失败:', error);
            return null;
        }
    }
}

const scheduler = new TaskScheduler();
module.exports = scheduler;