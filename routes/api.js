/**
 * API路由
 * 
 * 功能：
 * 1. 提供配置管理API
 * 2. 提供任务管理API
 * 3. 提供报告管理API
 * 4. 提供系统状态API
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getDatabase } = require('../utils/database');
const settingsManager = require('../services/settingsManager');
const chatlogService = require('../services/chatlogService');
const scheduler = require('../services/scheduler');
const path = require('path');
const fs = require('fs');

/**
 * 生成聊天记录txt文件内容
 */
async function generateChatlogTxt(report) {
    try {
        logger.info(`开始生成聊天记录，报告ID: ${report.id}, 群聊: ${report.chatroom_name}`);

        // 获取任务信息
        const db = getDatabase();
        const task = db.getTask(report.task_id);
        if (!task) {
            throw new Error('任务信息不存在');
        }

        logger.info(`找到任务: ${task.id} - ${task.name}, 时间范围: ${JSON.stringify(task.time_range)}`);

        // 获取聊天记录
        const config = settingsManager.loadConfig();
        logger.info(`ChatLog配置: ${config.chatlogUrl}`);

        if (!config.chatlogUrl) {
            throw new Error('ChatLog服务地址未配置');
        }

        const chatlogData = await scheduler.fetchChatlogFromExternal(
            config.chatlogUrl,
            report.chatroom_name,
            task.time_range
        );

        logger.info(`获取聊天记录结果:`, {
            hasData: !!chatlogData,
            hasMessages: !!(chatlogData && chatlogData.messages),
            messageCount: chatlogData?.messages?.length || 0
        });

        if (!chatlogData || !chatlogData.messages || !Array.isArray(chatlogData.messages)) {
            throw new Error('无法获取聊天记录数据');
        }

        // 按时间范围过滤消息
        const filteredMessages = scheduler.filterMessagesByTimeRange(
            chatlogData.messages,
            task.time_range
        );

        logger.info(`过滤后消息数量: ${filteredMessages.length}`);

        // 生成txt内容
        let content = '';
        content += `群聊名称：${report.chatroom_name || '未知群聊'}\n`;
        content += `导出时间：${new Date().toLocaleString('zh-CN')}\n`;
        content += `消息总数：${filteredMessages.length}条\n`;

        // 添加时间范围信息
        if (task.time_range) {
            if (task.time_range.type === 'custom' && task.time_range.start_date && task.time_range.end_date) {
                content += `时间范围：${task.time_range.start_date} 至 ${task.time_range.end_date}\n`;
            } else {
                content += `时间范围：${task.time_range.type || '未知'}\n`;
            }
        }

        content += '\n=== 消息记录 ===\n\n';

        // 添加消息内容
        for (const message of filteredMessages) {
            const timestamp = new Date(message.timestamp).toLocaleString('zh-CN');
            const sender = message.sender || '未知用户';
            const text = message.text || message.content || '';

            content += `[${timestamp}] ${sender}：${text}\n`;
        }

        logger.info(`成功生成聊天记录内容，总长度: ${content.length} 字符`);
        return content;

    } catch (error) {
        logger.error('生成聊天记录txt失败:', error);
        throw new Error(`生成聊天记录失败: ${error.message}`);
    }
}

/**
 * 通用API响应格式
 */
function apiResponse(res, success, data = null, message = '', code = 200) {
    res.status(code).json({
        success,
        data,
        message,
        timestamp: new Date().toISOString()
    });
}

/**
 * 通用错误处理
 */
function handleApiError(res, error, message = '操作失败') {
    logger.error(`API错误: ${message}`, error);
    apiResponse(res, false, null, message, 500);
}

// ==================== 系统状态 API ====================

/**
 * 获取系统状态
 */
router.get('/status', (req, res) => {
    try {
        const db = getDatabase();
        const stats = db.getStats();

        const status = {
            version: '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            nodeVersion: process.version,
            timestamp: new Date().toISOString(),
            database: stats
        };

        apiResponse(res, true, status, '系统状态获取成功');
    } catch (error) {
        handleApiError(res, error, '获取系统状态失败');
    }
});

// ==================== 设置管理 API（B1） ====================

/**
 * 获取当前平台配置
 */
router.get('/settings', (req, res) => {
    try {
        const config = settingsManager.loadConfig();
        apiResponse(res, true, config, '配置获取成功');
    } catch (err) {
        handleApiError(res, err, '读取配置失败');
    }
});

/**
 * 保存平台配置（新版JSON配置，兼容前端字段）
 */
router.post('/settings', (req, res) => {
    try {
        console.log('收到前端配置提交:', req.body); // 自动诊断日志
        const config = req.body;
        // 临时放宽校验，直接保存所有内容
        settingsManager.saveConfig(config);
        settingsManager.setFirstRunFlag(false);
        apiResponse(res, true, null, '配置保存成功');
    } catch (err) {
        handleApiError(res, err, '保存配置失败');
    }
});

/**
 * 检查是否首次运行
 */
router.get('/first-run', (req, res) => {
    try {
        const isFirst = settingsManager.isFirstRun();
        apiResponse(res, true, { isFirstRun: isFirst }, '首次运行状态获取成功');
    } catch (err) {
        handleApiError(res, err, '检测首次运行失败');
    }
});

// ==================== 任务管理 API ====================

/**
 * 获取任务列表，支持分页和筛选
 * @apiParam {Number} [page=1] 页码
 * @apiParam {Number} [limit=20] 分页大小
 * @apiParam {String} [status] 按状态筛选
 * @apiParam {String} [llm_model] 按模型筛选
 * @apiParam {String} [search] 按名称搜索
 */
router.get('/tasks', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            llm_model,
            search
        } = req.query;

        const db = getDatabase();

        // 构建筛选条件
        const filters = {};
        if (status) filters.status = status;
        if (llm_model) filters.llm_model = llm_model;
        if (search) filters.search = search;

        // 计算分页
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // 获取任务列表和总数
        const { tasks, total } = db.getTasksWithPagination(limitNum, offset, filters);

        const response = {
            tasks,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        };

        apiResponse(res, true, response, '任务列表获取成功');
    } catch (error) {
        handleApiError(res, error, '获取任务列表失败');
    }
});

/**
 * 获取任务详情
 */
router.get('/tasks/:id', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);

        const db = getDatabase();
        const task = db.getTask(taskId);

        if (!task) {
            return apiResponse(res, false, null, '任务不存在', 404);
        }

        apiResponse(res, true, task, '任务详情获取成功');
    } catch (error) {
        handleApiError(res, error, '获取任务详情失败');
    }
});

/**
 * 创建任务
 */
router.post('/tasks', async (req, res) => {
    try {
        const {
            name,
            chatrooms,
            schedule_type = 'once',  // 新增：执行类型
            schedule_time,           // 单次执行时间
            cron_expression,         // 定时执行的cron表达式
            schedule_config,         // 定时配置详细信息
            time_range,              // 新增：时间范围配置
            llmModel,                // 兼容旧参数名
            llm_model,               // 新参数名
            prompt,                  // 向后兼容
            prompt_template_id
        } = req.body;

        // 验证必要参数
        if (!name || !chatrooms || (!schedule_time && !cron_expression) || !(llmModel || llm_model)) {
            return apiResponse(res, false, null, '缺少必要的任务参数', 400);
        }

        // 验证提示词相关参数
        if (!prompt && !prompt_template_id) {
            return apiResponse(res, false, null, '请选择提示词模板或输入自定义提示词', 400);
        }

        // 验证定时配置
        if (schedule_type === 'once' && !schedule_time) {
            return apiResponse(res, false, null, '单次执行需要指定执行时间', 400);
        }

        if ((schedule_type === 'daily' || schedule_type === 'weekly') && !cron_expression) {
            return apiResponse(res, false, null, '定时执行需要cron表达式', 400);
        }

        const db = getDatabase();
        const taskId = db.createTask({
            name,
            chatrooms,
            schedule_type,
            schedule_time,
            cron_expression,
            schedule_config,
            time_range: time_range || { type: 'recent_7d' },
            llm_model: llm_model || llmModel,
            prompt: prompt || '',  // 向后兼容
            prompt_template_id: prompt_template_id || null,
            status: 'enabled'
        });

        const newTask = db.getTask(taskId);

        // 添加安全检查，确保任务创建成功
        if (!newTask) {
            logger.error('❌ 任务创建后无法找到:', { taskId, type: typeof taskId });
            throw new Error(`任务创建失败，无法找到ID为${taskId}的任务`);
        }

        // 如果是启用状态的任务，立即注册到调度器
        if (newTask.status === 'enabled') {
            scheduler.registerTask(newTask);
        }

        logger.info(`创建任务: ${name}, 类型: ${schedule_type}, 模板ID: ${prompt_template_id || '无'}`);
        apiResponse(res, true, newTask, '任务创建成功');

    } catch (error) {
        handleApiError(res, error, '创建任务失败');
    }
});

/**
 * 更新任务
 */
router.put('/tasks/:id', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const {
            name,
            chatrooms,
            scheduleTime,
            schedule_time,
            llmModel,
            llm_model,
            prompt,  // 向后兼容
            prompt_template_id,

            time_range,
            schedule_type,
            cron_expression,
            schedule_config,
            status
        } = req.body;

        const db = getDatabase();
        const updated = db.updateTask(taskId, {
            name,
            chatrooms,
            schedule_time: schedule_time || scheduleTime,
            llm_model: llm_model || llmModel,
            prompt: prompt || '',  // 向后兼容
            prompt_template_id: prompt_template_id,

            time_range: time_range,
            schedule_type: schedule_type,
            cron_expression: cron_expression,
            schedule_config: schedule_config,
            status
        });

        if (!updated) {
            return apiResponse(res, false, null, '任务不存在或更新失败', 404);
        }

        const updatedTask = db.getTask(taskId);

        logger.info(`更新任务: ${taskId}, 模板ID: ${prompt_template_id || '无'}`);
        apiResponse(res, true, updatedTask, '任务更新成功');

    } catch (error) {
        handleApiError(res, error, '更新任务失败');
    }
});

/**
 * 删除任务
 */
router.delete('/tasks/:id', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);

        const db = getDatabase();
        const deleted = db.deleteTask(taskId);

        if (!deleted) {
            return apiResponse(res, false, null, '任务不存在或删除失败', 404);
        }

        logger.info(`删除任务: ${taskId}`);
        apiResponse(res, true, null, '任务删除成功');

    } catch (error) {
        handleApiError(res, error, '删除任务失败');
    }
});

/**
 * 立即执行任务（真正触发调度与报告生成）
 */
router.post('/tasks/:id/execute', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const db = getDatabase();
        const task = db.getTask(taskId);
        if (!task) {
            return apiResponse(res, false, null, '任务不存在', 404);
        }

        // 更新任务进度状态为"正在分析中"
        db.updateTaskProgress(taskId, 'analyzing');

        // 调用调度主流程
        await scheduler.runTaskProcess(taskId);

        // 更新任务进度状态为"已完成"
        db.updateTaskProgress(taskId, 'completed');

        apiResponse(res, true, null, '任务已执行，报告生成中');
    } catch (error) {
        // 如果执行失败，更新进度状态为"失败"
        const db = getDatabase();
        db.updateTaskProgress(parseInt(req.params.id), 'failed');
        handleApiError(res, error, '立即执行任务失败');
    }
});

/**
 * 切换任务启用/暂停状态
 * @api {post} /api/tasks/:id/toggle
 * @apiParam {Number} id 任务ID
 * @apiSuccess {Object} task 切换后的任务对象
 */
router.post('/tasks/:id/toggle', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const db = getDatabase();
        const ok = db.toggleTaskStatus(taskId);
        if (!ok) {
            return apiResponse(res, false, null, '任务不存在或切换失败', 404);
        }
        const task = db.getTask(taskId);
        logger.info(`切换任务状态: ${taskId} -> ${task.status}`);
        apiResponse(res, true, task, '任务状态切换成功');
    } catch (error) {
        handleApiError(res, error, '切换任务状态失败');
    }
});

/**
 * 获取任务进度状态
 * @api {get} /api/tasks/:id/progress
 * @apiParam {Number} id 任务ID
 * @apiSuccess {Object} progress 任务进度信息
 */
router.get('/tasks/:id/progress', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const db = getDatabase();
        const task = db.getTask(taskId);
        if (!task) {
            return apiResponse(res, false, null, '任务不存在', 404);
        }

        const progress = {
            id: taskId,
            progress_status: db.getTaskProgress(taskId)
        };

        apiResponse(res, true, progress, '任务进度获取成功');
    } catch (error) {
        handleApiError(res, error, '获取任务进度失败');
    }
});

/**
 * 重置任务状态
 * @api {post} /api/tasks/:id/reset-status
 * @apiParam {Number} id 任务ID
 * @apiSuccess {Object} task 重置后的任务对象
 */
router.post('/tasks/:id/reset-status', async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const db = getDatabase();
        const task = db.getTask(taskId);

        if (!task) {
            return apiResponse(res, false, null, '任务不存在', 404);
        }

        // 重置任务状态为"未开始"
        const updated = db.updateTaskProgress(taskId, 'not_started');

        if (!updated) {
            return apiResponse(res, false, null, '重置任务状态失败', 500);
        }

        const updatedTask = db.getTask(taskId);
        logger.info(`重置任务状态: ${taskId} -> not_started`);
        apiResponse(res, true, updatedTask, '任务状态重置成功');
    } catch (error) {
        handleApiError(res, error, '重置任务状态失败');
    }
});

// ==================== 报告管理 API ====================

/**
 * 获取报告列表，支持分页和筛选
 * @apiParam {Number} [page=1] 页码
 * @apiParam {Number} [limit=20] 分页大小
 * @apiParam {String} [task_name] 按任务名筛选
 * @apiParam {String} [chatroom_name] 按群聊名筛选
 * @apiParam {String} [status] 按状态筛选
 * @apiParam {String} [is_summary] 按类型筛选(true/false)
 * @apiParam {String} [start_date] 起始日期
 * @apiParam {String} [end_date] 结束日期
 */
router.get('/reports', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            task_name,
            chatroom_name,
            status,
            is_summary,
            start_date,
            end_date
        } = req.query;

        const db = getDatabase();

        // 构建筛选条件
        const filters = {};
        if (task_name) filters.task_name = task_name;
        if (chatroom_name) filters.chatroom_name = chatroom_name;
        if (status) filters.status = status;
        if (is_summary !== undefined) {
            filters.is_summary = is_summary === 'true';
        }
        if (start_date) filters.start_date = start_date;
        if (end_date) filters.end_date = end_date;

        // 计算分页
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // 获取报告列表和总数
        const { reports, total } = db.getReportsWithPagination(limitNum, offset, filters);

        const response = {
            reports,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        };

        apiResponse(res, true, response, '报告列表获取成功');
    } catch (error) {
        handleApiError(res, error, '获取报告列表失败');
    }
});

/**
 * 获取报告详情，含失败原因
 */
router.get('/reports/:id', async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        const db = getDatabase();
        const report = db.getReport(reportId);
        if (!report) {
            return apiResponse(res, false, null, '报告不存在', 404);
        }
        apiResponse(res, true, report, '报告详情获取成功');
    } catch (error) {
        handleApiError(res, error, '获取报告详情失败');
    }
});

/**
 * 下载报告文件，文件不存在时友好提示
 */
router.get('/reports/:id/download', async (req, res) => {
    try {
        const reportId = req.params.id;
        const db = getDatabase();
        const report = db.getReport(reportId);
        if (!report || !report.report_file) {
            return apiResponse(res, false, null, '报告文件信息不存在', 404);
        }
        const reportPath = path.join(__dirname, '..', 'reports', report.report_file);
        if (!fs.existsSync(reportPath)) {
            return apiResponse(res, false, null, '报告文件不存在', 404);
        }
        res.download(reportPath, report.report_file);
    } catch (error) {
        handleApiError(res, error, '下载报告失败');
    }
});

/**
 * 在线预览报告HTML内容
 */
router.get('/reports/:id/preview', async (req, res) => {
    try {
        const reportId = req.params.id;
        const db = getDatabase();
        const report = db.getReport(reportId);
        if (!report || !report.report_file) {
            return res.status(404).send('报告文件信息不存在');
        }
        const reportPath = path.join(__dirname, '..', 'reports', report.report_file);
        if (!fs.existsSync(reportPath)) {
            return res.status(404).send('报告文件不存在');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.createReadStream(reportPath).pipe(res);
    } catch (error) {
        res.status(500).send('报告预览失败');
    }
});

/**
 * 查看报告（新接口，替代preview）
 */
router.get('/reports/:id/view', async (req, res) => {
    try {
        const reportId = req.params.id;
        const db = getDatabase();
        const report = db.getReport(reportId);
        if (!report || !report.report_file) {
            return res.status(404).send(`
                <html>
                    <head><meta charset="UTF-8"><title>报告不存在</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2>❌ 报告文件信息不存在</h2>
                        <p>请检查报告是否已被删除或URL是否正确</p>
                        <a href="/reports" style="color: #1976d2;">← 返回报告列表</a>
                    </body>
                </html>
            `);
        }
        const reportPath = path.join(__dirname, '..', 'reports', report.report_file);
        if (!fs.existsSync(reportPath)) {
            return res.status(404).send(`
                <html>
                    <head><meta charset="UTF-8"><title>报告文件不存在</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2>❌ 报告文件不存在</h2>
                        <p>报告文件可能已被删除或移动</p>
                        <a href="/reports" style="color: #1976d2;">← 返回报告列表</a>
                    </body>
                </html>
            `);
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.createReadStream(reportPath).pipe(res);
    } catch (error) {
        res.status(500).send(`
            <html>
                <head><meta charset="UTF-8"><title>报告查看失败</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2>❌ 报告查看失败</h2>
                    <p>服务器内部错误，请稍后重试</p>
                    <a href="/reports" style="color: #1976d2;">← 返回报告列表</a>
                </body>
            </html>
        `);
    }
});

/**
 * 删除报告
 */
router.delete('/reports/:id', async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        const db = getDatabase();
        const report = db.getReport(reportId);

        if (!report) {
            return apiResponse(res, false, null, '报告不存在', 404);
        }

        // 删除报告文件
        if (report.report_file) {
            const reportPath = path.join(__dirname, '..', 'reports', report.report_file);
            if (fs.existsSync(reportPath)) {
                try {
                    fs.unlinkSync(reportPath);
                    logger.info(`删除报告文件: ${report.report_file}`);
                } catch (fileError) {
                    logger.warn(`删除报告文件失败: ${report.report_file}`, fileError.message);
                }
            }
        }

        // 从数据库删除记录
        const deleted = db.deleteReport(reportId);

        if (!deleted) {
            return apiResponse(res, false, null, '删除报告记录失败', 500);
        }

        logger.info(`删除报告: ${reportId} - ${report.task_name}${report.chatroom_name ? ` (${report.chatroom_name})` : ''}`);
        apiResponse(res, true, null, '报告删除成功');

    } catch (error) {
        handleApiError(res, error, '删除报告失败');
    }
});

/**
 * 导出聊天记录
 */
router.post('/export-chatlogs', async (req, res) => {
    try {
        const { reportIds, exportType = 'txt' } = req.body;

        logger.info('导出聊天记录请求:', { reportIds, exportType });

        if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
            return apiResponse(res, false, null, '请选择要导出的报告', 400);
        }

        const db = getDatabase();
        const reports = [];

        // 获取报告信息
        for (const reportId of reportIds) {
            const report = db.getReport(parseInt(reportId));
            if (!report) {
                return apiResponse(res, false, null, `报告 ${reportId} 不存在`, 404);
            }
            reports.push(report);
            logger.info(`找到报告: ${report.id} - ${report.task_name} - ${report.chatroom_name}`);
        }

        // 如果是单个报告，直接导出txt
        if (reports.length === 1) {
            const report = reports[0];
            logger.info(`开始生成单个报告: ${report.id}`);

            try {
                const chatlogContent = await generateChatlogTxt(report);
                logger.info(`成功生成聊天记录内容，长度: ${chatlogContent.length}`);

                res.setHeader('Content-Type', 'text/plain; charset=utf-8');

                // 生成安全的文件名（移除特殊字符，使用英文）
                const safeFileName = (report.chatroom_name || 'unknown_chatroom')
                    .replace(/[^\w\s-]/g, '') // 移除特殊字符
                    .replace(/\s+/g, '_') // 空格替换为下划线
                    .substring(0, 50); // 限制长度

                const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const fileName = `${safeFileName}_${timestamp}.txt`;

                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(report.chatroom_name || '未知群聊')}_${timestamp}.txt`);
                res.send(chatlogContent);
                return;
            } catch (error) {
                logger.error(`生成单个报告失败:`, error);
                throw error;
            }
        }

        // 多个报告，打包成zip
        const archiver = require('archiver');
        const archive = archiver('zip', {
            zlib: { level: 9 } // 设置压缩级别
        });

        res.setHeader('Content-Type', 'application/zip');

        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const zipFileName = `chatlog_export_${timestamp}.zip`;

        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"; filename*=UTF-8''群聊消息导出_${timestamp}.zip`);

        archive.pipe(res);

        // 为每个报告生成txt文件
        for (const report of reports) {
            try {
                const chatlogContent = await generateChatlogTxt(report);

                // 生成安全的文件名
                const safeFileName = (report.chatroom_name || 'unknown_chatroom')
                    .replace(/[^\w\s-]/g, '') // 移除特殊字符
                    .replace(/\s+/g, '_') // 空格替换为下划线
                    .substring(0, 50); // 限制长度

                const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const fileName = `${safeFileName}_${timestamp}.txt`;

                archive.append(chatlogContent, { name: fileName });
            } catch (error) {
                logger.error(`生成报告 ${report.id} 的聊天记录失败:`, error);
                // 继续处理其他报告
            }
        }

        await archive.finalize();

    } catch (error) {
        logger.error('导出聊天记录失败:', error);
        handleApiError(res, error, '导出聊天记录失败');
    }
});

// ==================== Chatlog服务 API（B3） ====================

/**
 * 导入chatlog数据
 */
router.post('/chatlogs/import', (req, res) => {
    try {
        const chatlog = req.body;
        if (!chatlog || !chatlog.chatroom || !Array.isArray(chatlog.messages)) {
            return apiResponse(res, false, null, '参数格式错误', 400);
        }
        const result = chatlogService.importChatlog(chatlog);
        apiResponse(res, true, result, 'chatlog导入成功');
    } catch (err) {
        handleApiError(res, err, 'chatlog导入失败');
    }
});

/**
 * 获取所有chatlog
 */
router.get('/chatlogs', (req, res) => {
    try {
        const logs = chatlogService.getChatlogs();
        apiResponse(res, true, logs, 'chatlog获取成功');
    } catch (err) {
        handleApiError(res, err, 'chatlog获取失败');
    }
});

/**
 * 获取所有群聊名称
 */
router.get('/chatrooms', async (req, res) => {
    try {
        const rooms = await chatlogService.getChatrooms();
        apiResponse(res, true, rooms, '群聊名称获取成功');
    } catch (err) {
        handleApiError(res, err, '群聊名称获取失败');
    }
});

/**
 * 测试ChatLog连接
 */
router.get('/chatlog/test', async (req, res) => {
    try {
        const settingsManager = require('../services/settingsManager');
        const config = settingsManager.loadConfig();

        console.log('ChatLog测试 - 当前配置:', config);

        if (!config.chatlogUrl) {
            return apiResponse(res, false, { connected: false }, '未配置ChatLog服务地址');
        }

        const axios = require('axios');
        const fullUrl = config.chatlogUrl.startsWith('http') ? config.chatlogUrl : `http://${config.chatlogUrl}`;

        console.log('ChatLog测试 - 尝试连接:', fullUrl);

        // 简单测试基本连接
        try {
            console.log(`ChatLog测试 - 尝试连接: ${fullUrl}`);

            const response = await axios.get(fullUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'ChatChat-Platform/1.0'
                },
                // 绕过代理设置，因为ChatLog是本地服务
                proxy: false
            });

            if (response.status === 200) {
                console.log(`ChatLog测试 - 连接成功`, response.status);
                return apiResponse(res, true, {
                    connected: true,
                    url: fullUrl,
                    status: response.status
                }, 'ChatLog服务连接正常');
            } else {
                console.log(`ChatLog测试 - 响应异常:`, response.status);
                return apiResponse(res, false, {
                    connected: false,
                    url: fullUrl,
                    status: response.status
                }, `ChatLog服务响应异常: ${response.status}`);
            }
        } catch (error) {
            console.error('ChatLog测试 - 连接失败:', error.message);
            return apiResponse(res, false, {
                connected: false,
                url: fullUrl,
                error: error.message,
                code: error.code
            }, `ChatLog服务连接失败: ${error.message}`);
        }

    } catch (error) {
        const settingsManager = require('../services/settingsManager');
        const config = settingsManager.loadConfig();
        const testUrl = config.chatlogUrl ?
            (config.chatlogUrl.startsWith('http') ? config.chatlogUrl : `http://${config.chatlogUrl}`) :
            '未配置';

        apiResponse(res, false, {
            connected: false,
            url: testUrl,
            error: error.message
        }, `ChatLog服务连接失败: ${error.message}`);
    }
});

/**
 * 完整的ChatLog连接和API测试
 */
router.get('/chatlog/test-full', async (req, res) => {
    try {
        const ChatLogTester = require('../test_chatlog_connection');
        const settingsManager = require('../services/settingsManager');
        const config = settingsManager.loadConfig();

        if (!config.chatlogUrl) {
            return apiResponse(res, false, { connected: false }, '未配置ChatLog服务地址');
        }

        const tester = new ChatLogTester(config.chatlogUrl);
        const testResults = await tester.runFullTest();

        return apiResponse(res, true, testResults, 'ChatLog完整测试完成');

    } catch (error) {
        console.error('ChatLog完整测试失败:', error.message);
        return apiResponse(res, false, {
            error: error.message,
            stack: error.stack
        }, `ChatLog完整测试失败: ${error.message}`);
    }
});

/**
 * 测试特定群聊的聊天记录获取
 */
router.post('/chatlog/test-chatlog', async (req, res) => {
    try {
        const { talker, timeRange } = req.body;

        if (!talker) {
            return apiResponse(res, false, null, '请提供群聊名称', 400);
        }

        const settingsManager = require('../services/settingsManager');
        const config = settingsManager.loadConfig();

        if (!config.chatlogUrl) {
            return apiResponse(res, false, { connected: false }, '未配置ChatLog服务地址');
        }

        const ChatLogTester = require('../test_chatlog_connection');
        const tester = new ChatLogTester(config.chatlogUrl);

        const chatlogResult = await tester.testChatlogRetrieval(talker);

        if (chatlogResult) {
            return apiResponse(res, true, {
                talker: talker,
                messageCount: chatlogResult.messages?.length || 0,
                hasData: !!chatlogResult.messages && chatlogResult.messages.length > 0,
                sampleMessage: chatlogResult.messages && chatlogResult.messages.length > 0 ? chatlogResult.messages[0] : null
            }, `群聊 ${talker} 聊天记录测试成功`);
        } else {
            return apiResponse(res, false, {
                talker: talker,
                messageCount: 0,
                hasData: false
            }, `群聊 ${talker} 聊天记录获取失败`);
        }

    } catch (error) {
        console.error('聊天记录测试失败:', error.message);
        return apiResponse(res, false, {
            error: error.message
        }, `聊天记录测试失败: ${error.message}`);
    }
});

// ==================== 提示词模板管理 API ====================

/**
 * 获取提示词模板列表
 */
router.get('/prompt-templates', async (req, res) => {
    try {
        const db = getDatabase();
        const templates = db.getPromptTemplates();
        apiResponse(res, true, templates, '提示词模板列表获取成功');
    } catch (error) {
        handleApiError(res, error, '获取提示词模板列表失败');
    }
});

/**
 * 获取单个提示词模板详情
 */
router.get('/prompt-templates/:id', async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const db = getDatabase();
        const template = db.getPromptTemplate(templateId);

        if (!template) {
            return apiResponse(res, false, null, '提示词模板不存在', 404);
        }

        apiResponse(res, true, template, '提示词模板详情获取成功');
    } catch (error) {
        handleApiError(res, error, '获取提示词模板详情失败');
    }
});

/**
 * 创建提示词模板
 */
router.post('/prompt-templates', async (req, res) => {
    try {
        const { name, description, system_prompt, category, is_default } = req.body;

        if (!name || !system_prompt) {
            return apiResponse(res, false, null, '模板名称和系统提示词为必填项', 400);
        }

        const db = getDatabase();
        const templateId = db.createPromptTemplate({
            name,
            description,
            system_prompt,
            category,
            is_default
        });

        apiResponse(res, true, { id: templateId }, '提示词模板创建成功');
    } catch (error) {
        handleApiError(res, error, '创建提示词模板失败');
    }
});

/**
 * 更新提示词模板
 */
router.put('/prompt-templates/:id', async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const { name, description, system_prompt, category, is_default } = req.body;

        if (!name || !system_prompt) {
            return apiResponse(res, false, null, '模板名称和系统提示词为必填项', 400);
        }

        const db = getDatabase();
        const success = db.updatePromptTemplate(templateId, {
            name,
            description,
            system_prompt,
            category,
            is_default
        });

        if (success) {
            apiResponse(res, true, { id: templateId }, '提示词模板更新成功');
        } else {
            apiResponse(res, false, null, '提示词模板不存在', 404);
        }
    } catch (error) {
        handleApiError(res, error, '更新提示词模板失败');
    }
});

/**
 * 删除提示词模板
 */
router.delete('/prompt-templates/:id', async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const db = getDatabase();
        const success = db.deletePromptTemplate(templateId);

        if (success) {
            apiResponse(res, true, { id: templateId }, '提示词模板删除成功');
        } else {
            apiResponse(res, false, null, '提示词模板不存在', 404);
        }
    } catch (error) {
        handleApiError(res, error, '删除提示词模板失败');
    }
});

/**
 * 验证API密钥
 */
router.post('/validate-api-key', async (req, res) => {
    try {
        const { serviceType, apiKey } = req.body;

        if (!serviceType || !apiKey) {
            return apiResponse(res, false, null, '缺少必要参数', 400);
        }

        console.log(`开始验证 ${serviceType} API密钥...`);

        let isValid = false;
        let errorMessage = '';

        switch (serviceType) {
            case 'deepseek':
                isValid = await validateDeepSeekApiKey(apiKey);
                break;
            case 'gemini':
                isValid = await validateGeminiApiKey(apiKey);
                break;
            case 'kimi':
                isValid = await validateKimiApiKey(apiKey);
                break;
            default:
                return apiResponse(res, false, null, '不支持的服务类型', 400);
        }

        if (isValid) {
            console.log(`${serviceType} API密钥验证成功`);
            apiResponse(res, true, { valid: true }, `${serviceType} API密钥验证成功`);
        } else {
            console.log(`${serviceType} API密钥验证失败`);
            apiResponse(res, false, { valid: false }, `${serviceType} API密钥验证失败`);
        }

    } catch (error) {
        console.error('API密钥验证出错:', error);
        handleApiError(res, error, 'API密钥验证失败');
    }
});

/**
 * 智能代理配置 - 仅用于API验证
 * 检测代理是否可用，如果不可用则绕过代理
 */
async function getSmartProxyConfigForValidation() {
    const net = require('net');

    // 检测常见代理端口是否可用
    const proxyHost = '127.0.0.1';
    const proxyPort = 7897;

    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = 1000; // 1秒超时

        socket.setTimeout(timeout);
        socket.on('connect', () => {
            socket.destroy();
            // 代理可用，返回代理配置
            resolve({
                host: proxyHost,
                port: proxyPort,
                protocol: 'http'
            });
        });

        socket.on('timeout', () => {
            socket.destroy();
            // 代理不可用，返回false绕过代理
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            // 代理不可用，返回false绕过代理
            resolve(false);
        });

        socket.connect(proxyPort, proxyHost);
    });
}

/**
 * 验证DeepSeek API密钥
 */
async function validateDeepSeekApiKey(apiKey) {
    try {
        const axios = require('axios');

        // 智能代理配置
        const proxyConfig = await getSmartProxyConfigForValidation();
        const axiosConfig = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        // 如果代理可用，使用代理；否则绕过代理
        if (proxyConfig) {
            axiosConfig.proxy = proxyConfig;
            console.log('DeepSeek API验证使用代理: 127.0.0.1:7897');
        } else {
            axiosConfig.proxy = false;
            console.log('DeepSeek API验证绕过代理（代理不可用）');
        }

        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
        }, axiosConfig);

        return response.status === 200;
    } catch (error) {
        console.error('DeepSeek API验证失败:', error.response?.status, error.response?.data);
        return false;
    }
}

/**
 * 验证Gemini API密钥
 */
async function validateGeminiApiKey(apiKey) {
    try {
        const axios = require('axios');

        // 智能代理配置
        const proxyConfig = await getSmartProxyConfigForValidation();
        const axiosConfig = {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        };

        // 如果代理可用，使用代理；否则绕过代理
        if (proxyConfig) {
            axiosConfig.proxy = proxyConfig;
            console.log('Gemini API验证使用代理: 127.0.0.1:7897');
        } else {
            axiosConfig.proxy = false;
            console.log('Gemini API验证绕过代理（代理不可用）');
        }

        // 尝试多个可能的Gemini模型，优先使用最新版本
        const models = ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

        for (const model of models) {
            try {
                console.log(`尝试Gemini模型: ${model}`);

                const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    contents: [{
                        parts: [{ text: 'Hello' }]
                    }]
                }, axiosConfig);

                if (response.status === 200) {
                    console.log(`Gemini模型 ${model} 验证成功`);
                    return true;
                }
            } catch (modelError) {
                console.log(`Gemini模型 ${model} 验证失败:`, modelError.response?.status, modelError.response?.data?.error?.message);
                continue;
            }
        }

        return false;
    } catch (error) {
        console.error('Gemini API验证失败:', error.response?.status, error.response?.data);
        return false;
    }
}

/**
 * 验证Kimi API密钥
 */
async function validateKimiApiKey(apiKey) {
    try {
        const axios = require('axios');

        // 智能代理配置
        const proxyConfig = await getSmartProxyConfigForValidation();
        const axiosConfig = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        // 如果代理可用，使用代理；否则绕过代理
        if (proxyConfig) {
            axiosConfig.proxy = proxyConfig;
            console.log('Kimi API验证使用代理: 127.0.0.1:7897');
        } else {
            axiosConfig.proxy = false;
            console.log('Kimi API验证绕过代理（代理不可用）');
        }

        const response = await axios.post('https://api.moonshot.cn/v1/chat/completions', {
            model: 'moonshot-v1-8k',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
        }, axiosConfig);

        return response.status === 200;
    } catch (error) {
        console.error('Kimi API验证失败:', error.response?.status, error.response?.data);
        return false;
    }
}

/**
 * 获取默认提示词模板
 */
router.get('/prompt-templates/default/template', async (req, res) => {
    try {
        const db = getDatabase();
        const defaultTemplate = db.getDefaultPromptTemplate();

        if (!defaultTemplate) {
            return apiResponse(res, false, null, '未找到默认提示词模板', 404);
        }

        apiResponse(res, true, defaultTemplate, '默认提示词模板获取成功');
    } catch (error) {
        handleApiError(res, error, '获取默认提示词模板失败');
    }
});

module.exports = router; 