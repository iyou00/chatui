/**
 * 数据库工具模块（JSON文件存储版本）
 * 
 * 功能：
 * 1. 使用JSON文件存储数据
 * 2. 提供与SQLite相同的API接口
 * 3. 管理数据文件和目录
 * 
 * 注意：这是临时实现，后续可切换回SQLite
 */

const path = require('path');
const fs = require('fs');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.reportsDir = path.join(__dirname, '..', 'reports');
        this.tasksFile = path.join(this.dataDir, 'tasks.json');
        this.reportsFile = path.join(this.dataDir, 'reports.json');
        this.configFile = path.join(this.dataDir, 'config.json');
        this.promptTemplatesFile = path.join(this.dataDir, 'prompt_templates.json');
        
        this.tasks = [];
        this.reports = [];
        this.promptTemplates = [];
        this.config = { nextTaskId: 1, nextReportId: 1, nextTemplateId: 1 };
        
        this.ensureDirectories();
        this.loadData();
    }

    /**
     * 确保必要的目录存在
     */
    ensureDirectories() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
            logger.info('创建数据目录:', this.dataDir);
        }
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
            logger.info('创建报告目录:', this.reportsDir);
        }
    }

    /**
     * 加载数据文件
     */
    loadData() {
        try {
            // 加载任务数据
            if (fs.existsSync(this.tasksFile)) {
                const tasksData = fs.readFileSync(this.tasksFile, 'utf-8');
                this.tasks = JSON.parse(tasksData);
            }

            // 加载报告数据
            if (fs.existsSync(this.reportsFile)) {
                const reportsData = fs.readFileSync(this.reportsFile, 'utf-8');
                this.reports = JSON.parse(reportsData);
            }

            // 加载提示词模板数据
            if (fs.existsSync(this.promptTemplatesFile)) {
                const templatesData = fs.readFileSync(this.promptTemplatesFile, 'utf-8');
                this.promptTemplates = JSON.parse(templatesData);
            }

            // 加载配置数据
            if (fs.existsSync(this.configFile)) {
                const configData = fs.readFileSync(this.configFile, 'utf-8');
                this.config = JSON.parse(configData);
                
                // 🔧 修复：确保所有必要的ID字段都存在且有效
                let needsUpdate = false;
                
                // 检查并修复nextTaskId
                if (!this.config.nextTaskId || this.config.nextTaskId === null) {
                    const maxTaskId = this.tasks.length > 0 ? Math.max(...this.tasks.filter(t => t.id !== null).map(t => t.id)) : 0;
                    this.config.nextTaskId = maxTaskId + 1;
                    needsUpdate = true;
                    logger.info('🔧 修复nextTaskId:', this.config.nextTaskId);
                }
                
                // 检查并修复nextReportId
                if (!this.config.nextReportId || this.config.nextReportId === null) {
                    const maxReportId = this.reports.length > 0 ? Math.max(...this.reports.filter(r => r.id !== null).map(r => r.id)) : 0;
                    this.config.nextReportId = maxReportId + 1;
                    needsUpdate = true;
                    logger.info('🔧 修复nextReportId:', this.config.nextReportId);
                }
                
                // 检查并修复nextTemplateId
                if (!this.config.nextTemplateId || this.config.nextTemplateId === null) {
                    const maxTemplateId = this.promptTemplates.length > 0 ? Math.max(...this.promptTemplates.filter(t => t.id !== null).map(t => t.id)) : 0;
                    this.config.nextTemplateId = maxTemplateId + 1;
                    needsUpdate = true;
                    logger.info('🔧 修复nextTemplateId:', this.config.nextTemplateId);
                }
                
                // 如果有修复，保存配置
                if (needsUpdate) {
                    this.saveData();
                    logger.info('✅ 配置文件修复完成');
                }
            } else {
                // 配置文件不存在时，根据现有数据计算下一个ID
                const maxTaskId = this.tasks.length > 0 ? Math.max(...this.tasks.filter(t => t.id !== null).map(t => t.id)) : 0;
                const maxReportId = this.reports.length > 0 ? Math.max(...this.reports.filter(r => r.id !== null).map(r => r.id)) : 0;
                const maxTemplateId = this.promptTemplates.length > 0 ? Math.max(...this.promptTemplates.filter(t => t.id !== null).map(t => t.id)) : 0;
                
                this.config = { 
                    nextTaskId: maxTaskId + 1, 
                    nextReportId: maxReportId + 1,
                    nextTemplateId: maxTemplateId + 1
                };
                
                logger.info('配置文件不存在，自动计算ID:', this.config);
                this.saveData(); // 保存配置
            }

            logger.info('数据文件加载完成', {
                tasks: this.tasks.length,
                reports: this.reports.length,
                promptTemplates: this.promptTemplates.length,
                nextTaskId: this.config.nextTaskId
            });
        } catch (error) {
            logger.error('数据文件加载失败:', error);
            // 如果加载失败，使用默认值
            this.tasks = [];
            this.reports = [];
            this.promptTemplates = [];
            this.config = { nextTaskId: 1, nextReportId: 1, nextTemplateId: 1 };
        }
    }

    /**
     * 保存数据到文件
     */
    saveData() {
        try {
            fs.writeFileSync(this.tasksFile, JSON.stringify(this.tasks, null, 2));
            fs.writeFileSync(this.reportsFile, JSON.stringify(this.reports, null, 2));
            fs.writeFileSync(this.promptTemplatesFile, JSON.stringify(this.promptTemplates, null, 2));
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('数据文件保存失败:', error);
            throw error;
        }
    }

    /**
     * 生成当前时间戳
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    /**
     * 连接数据库（兼容API）
     */
    connect() {
        logger.info('数据存储连接成功（JSON文件模式）');
    }

    /**
     * 关闭数据库连接（兼容API）
     */
    close() {
        this.saveData();
        logger.info('数据存储连接已关闭');
    }

    /**
     * 任务CRUD操作
     */
    
    // 创建任务
    createTask(taskData) {
        const { 
            name, 
            chatrooms, 
            schedule_time,        // 单次执行时间
            cron_expression,      // 定时执行的cron表达式
            schedule_config,      // 定时配置详细信息
            schedule_type = 'once', // 执行类型：once/daily/weekly
            time_range,           // 分析时间范围
            llm_model, 
            prompt, // 保持向后兼容
            prompt_template_id,
            status = 'enabled' 
        } = taskData;
        
        const taskId = this.config.nextTaskId++;
        
        const newTask = {
            id: taskId,
            name,
            chatrooms: Array.isArray(chatrooms) ? chatrooms : JSON.parse(chatrooms),
            schedule_type,        // 新增：执行类型
            schedule_time,        // 单次执行时间
            cron_expression,      // 新增：cron表达式
            schedule_config,      // 新增：定时配置详情
            time_range: time_range || { type: 'recent_7d' }, // 默认最近7天
            llm_model,
            prompt_template_id: prompt_template_id || null,

            prompt: prompt || '', // 保持向后兼容，用于旧版本任务
            status,
            created_at: this.getCurrentTimestamp(),
            updated_at: this.getCurrentTimestamp()
        };

        this.tasks.push(newTask);
        this.saveData();
        
        logger.info('任务创建成功:', { 
            id: taskId, 
            name, 
            schedule_type,
            prompt_template_id 
        });
        return taskId;
    }

    // 获取任务列表
    getTasks() {
        return this.tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    /**
     * 获取任务列表（增强版），支持分页和筛选
     * @param {number} limit - 分页大小
     * @param {number} offset - 偏移量
     * @param {Object} filters - 筛选条件
     * @returns {Object} { tasks: Array, total: number }
     */
    getTasksWithPagination(limit = 20, offset = 0, filters = {}) {
        let tasks = [...this.tasks]; // 创建副本避免修改原数组
        
        // 按状态筛选
        if (filters.status) {
            tasks = tasks.filter(t => t.status === filters.status);
        }
        
        // 按模型筛选
        if (filters.llm_model) {
            const model = filters.llm_model.toLowerCase();
            tasks = tasks.filter(t => 
                (t.llm_model || '').toLowerCase().includes(model)
            );
        }
        
        // 按名称搜索
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            tasks = tasks.filter(t => 
                (t.name || '').toLowerCase().includes(searchTerm)
            );
        }
        
        // 按创建时间倒序排序
        const sortedTasks = tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // 分页
        const total = sortedTasks.length;
        const paginatedTasks = sortedTasks.slice(offset, offset + limit);
        
        return {
            tasks: paginatedTasks,
            total: total
        };
    }

    // 获取单个任务
    getTask(id) {
        // 确保ID类型匹配
        const numericId = typeof id === 'string' ? parseInt(id) : id;
        return this.tasks.find(task => task.id === numericId);
    }

    // 更新任务
    updateTask(id, taskData) {
        const taskIndex = this.tasks.findIndex(task => task.id === id);
        if (taskIndex === -1) {
            logger.warn('尝试更新不存在的任务:', id);
            return false;
        }

        const { 
            name, 
            chatrooms, 
            schedule_time, 
            timeRange, 
            time_range,
            llm_model, 
            prompt, // 保持向后兼容
            prompt_template_id,

            schedule_type,
            cron_expression,
            schedule_config,
            status 
        } = taskData;
        
        // 更新任务数据
        this.tasks[taskIndex] = {
            ...this.tasks[taskIndex],
            name,
            chatrooms: Array.isArray(chatrooms) ? chatrooms : (typeof chatrooms === 'string' ? JSON.parse(chatrooms) : chatrooms),
            schedule_time,
            time_range: time_range || timeRange || this.tasks[taskIndex].time_range || { type: 'recent_7d' },
            llm_model,
            prompt_template_id: prompt_template_id !== undefined ? prompt_template_id : this.tasks[taskIndex].prompt_template_id,

            prompt: prompt !== undefined ? prompt : this.tasks[taskIndex].prompt, // 保持向后兼容
            schedule_type: schedule_type !== undefined ? schedule_type : this.tasks[taskIndex].schedule_type,
            cron_expression: cron_expression !== undefined ? cron_expression : this.tasks[taskIndex].cron_expression,
            schedule_config: schedule_config !== undefined ? schedule_config : this.tasks[taskIndex].schedule_config,
            status,
            updated_at: this.getCurrentTimestamp()
        };

        this.saveData();
        
        logger.info('任务更新成功:', { id, name });
        return true;
    }

    // 删除任务
    deleteTask(id) {
        // 处理 id 为 null 或无效值的情况
        const targetId = parseInt(id);
        if (isNaN(targetId)) {
            logger.warn('删除任务失败: 无效的ID', { id });
            return false;
        }
        
        const taskIndex = this.tasks.findIndex(task => task.id === targetId);
        if (taskIndex === -1) {
            logger.warn('删除任务失败: 任务不存在', { id: targetId });
            return false;
        }

        const deletedTask = this.tasks[taskIndex];
        this.tasks.splice(taskIndex, 1);
        this.saveData();
        
        logger.info('任务删除成功:', { 
            id: targetId, 
            name: deletedTask.name,
            changes: 1 
        });
        return true;
    }

    /**
     * 切换任务启用/暂停状态
     * @param {number} id - 任务ID
     * @returns {boolean} 是否切换成功
     */
    toggleTaskStatus(id) {
        const taskIndex = this.tasks.findIndex(task => task.id === parseInt(id));
        if (taskIndex === -1) {
            return false;
        }
        const currentStatus = this.tasks[taskIndex].status;
        const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';
        this.tasks[taskIndex].status = newStatus;
        this.tasks[taskIndex].updated_at = this.getCurrentTimestamp();
        this.saveData();
        logger.info('任务状态切换:', { id, from: currentStatus, to: newStatus });
        return true;
    }

    /**
     * 更新任务进度状态
     * @param {number} id - 任务ID
     * @param {string} progressStatus - 进度状态：'not_started' | 'analyzing' | 'completed' | 'failed'
     * @returns {boolean} 是否更新成功
     */
    updateTaskProgress(id, progressStatus) {
        const taskIndex = this.tasks.findIndex(task => task.id === parseInt(id));
        if (taskIndex === -1) {
            logger.warn('更新任务进度失败: 任务不存在', { id });
            return false;
        }

        this.tasks[taskIndex].progress_status = progressStatus;
        this.tasks[taskIndex].updated_at = this.getCurrentTimestamp();
        this.saveData();
        
        logger.info('任务进度更新:', { 
            id, 
            name: this.tasks[taskIndex].name,
            progress_status: progressStatus 
        });
        return true;
    }

    /**
     * 获取任务进度状态
     * @param {number} id - 任务ID
     * @returns {string} 进度状态，默认为'not_started'
     */
    getTaskProgress(id) {
        const task = this.getTask(id);
        return task ? (task.progress_status || 'not_started') : 'not_started';
    }

    /**
     * 报告CRUD操作
     */
    
    // 创建报告记录
    createReport(reportData) {
        const { 
            task_id, 
            task_name, 
            chatroom_name = null,
            execution_time, 
            status, 
            report_file = null, 
            message_count = 0,
            is_summary = false,
            error_message = null 
        } = reportData;
        
        const reportId = this.config.nextReportId++;

        // 获取任务的时间范围信息
        const task = this.getTask(task_id);
        const time_range = task ? task.time_range : null;

        const newReport = {
            id: reportId,
            task_id,
            task_name,
            chatroom_name, // 新增：群聊名称
            time_range, // 新增：分析时间范围
            execution_time,
            status,
            report_file,
            message_count, // 新增：消息数量
            is_summary, // 新增：是否为摘要报告
            error_message,
            created_at: this.getCurrentTimestamp()
        };

        this.reports.push(newReport);
        this.saveData();
        
        logger.info('报告记录创建成功:', { 
            id: reportId, 
            task_id, 
            chatroom_name, 
            time_range,
            status,
            is_summary 
        });
        return reportId;
    }

    /**
     * 获取报告列表，支持按任务ID、状态、时间段筛选
     * @param {Object} [filter] - 可选筛选条件 { taskId, status, startTime, endTime }
     * @returns {Array} 报告数组
     */
    getReports(limit = 50, offset = 0, filter = {}) {
        let reports = this.reports;
        if (filter.taskId) {
            reports = reports.filter(r => r.task_id === parseInt(filter.taskId));
        }
        if (filter.status) {
            reports = reports.filter(r => r.status === filter.status);
        }
        if (filter.startTime) {
            reports = reports.filter(r => new Date(r.created_at) >= new Date(filter.startTime));
        }
        if (filter.endTime) {
            reports = reports.filter(r => new Date(r.created_at) <= new Date(filter.endTime));
        }
        const sortedReports = reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return sortedReports.slice(offset, offset + limit);
    }

    /**
     * 获取报告列表（增强版），支持更多筛选条件和分页
     * @param {number} limit - 分页大小
     * @param {number} offset - 偏移量
     * @param {Object} filters - 筛选条件
     * @returns {Object} { reports: Array, total: number }
     */
    getReportsWithPagination(limit = 20, offset = 0, filters = {}) {
        let reports = [...this.reports]; // 创建副本避免修改原数组
        
        // 按任务名筛选
        if (filters.task_name) {
            const taskName = filters.task_name.toLowerCase();
            reports = reports.filter(r => 
                (r.task_name || '').toLowerCase().includes(taskName)
            );
        }
        
        // 按群聊名筛选
        if (filters.chatroom_name) {
            const chatroomName = filters.chatroom_name.toLowerCase();
            reports = reports.filter(r => 
                (r.chatroom_name || '').toLowerCase().includes(chatroomName)
            );
        }
        
        // 按状态筛选
        if (filters.status) {
            reports = reports.filter(r => r.status === filters.status);
        }
        
        // 按报告类型筛选
        if (filters.is_summary !== undefined) {
            reports = reports.filter(r => !!r.is_summary === filters.is_summary);
        }
        
        // 按日期范围筛选
        if (filters.start_date) {
            const startDate = new Date(filters.start_date);
            startDate.setHours(0, 0, 0, 0);
            reports = reports.filter(r => new Date(r.created_at) >= startDate);
        }
        
        if (filters.end_date) {
            const endDate = new Date(filters.end_date);
            endDate.setHours(23, 59, 59, 999);
            reports = reports.filter(r => new Date(r.created_at) <= endDate);
        }
        
        // 按创建时间倒序排序
        const sortedReports = reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // 分页
        const total = sortedReports.length;
        const paginatedReports = sortedReports.slice(offset, offset + limit);
        
        return {
            reports: paginatedReports,
            total: total
        };
    }

    // 获取单个报告
    getReport(id) {
        return this.reports.find(report => report.id === parseInt(id));
    }

    // 删除报告
    deleteReport(id) {
        // 处理 id 为 null 或无效值的情况
        const targetId = parseInt(id);
        if (isNaN(targetId)) {
            logger.warn('删除报告失败: 无效的ID', { id });
            return false;
        }
        
        const reportIndex = this.reports.findIndex(report => report.id === targetId);
        if (reportIndex === -1) {
            logger.warn('删除报告失败: 报告不存在', { id: targetId });
            return false;
        }

        const deletedReport = this.reports[reportIndex];
        this.reports.splice(reportIndex, 1);
        this.saveData();
        
        logger.info('报告删除成功:', { 
            id: targetId, 
            task_name: deletedReport.task_name,
            changes: 1 
        });
        return true;
    }

    // 更新报告状态
    updateReportStatus(id, status, report_file = null, error_message = null) {
        const reportIndex = this.reports.findIndex(report => report.id === parseInt(id));
        if (reportIndex === -1) {
            return false;
        }

        this.reports[reportIndex] = {
            ...this.reports[reportIndex],
            status,
            report_file,
            error_message
        };

        this.saveData();
        logger.info('报告状态更新成功:', { id, status, changes: 1 });
        return true;
    }

    /**
     * 数据库统计信息
     */
    getStats() {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const recentReports = this.reports.filter(report => 
            new Date(report.created_at) > weekAgo
        );
        
        return {
            tasks: this.tasks.length,
            reports: this.reports.length,
            recentReports: recentReports.length,
            promptTemplates: this.promptTemplates.length
        };
    }

    /**
     * 提示词模板CRUD操作
     */
    
    // 创建提示词模板
    createPromptTemplate(templateData) {
        const { name, description, system_prompt, category = 'general', is_default = false } = templateData;
        const templateId = this.config.nextTemplateId++;

        const newTemplate = {
            id: templateId,
            name,
            description,
            system_prompt,
            category,
            is_default,
            created_at: this.getCurrentTimestamp(),
            updated_at: this.getCurrentTimestamp()
        };

        this.promptTemplates.push(newTemplate);
        this.saveData();
        
        logger.info('提示词模板创建成功:', { id: templateId, name });
        return templateId;
    }

    // 获取所有提示词模板
    getPromptTemplates() {
        return this.promptTemplates.sort((a, b) => {
            // 默认模板排在前面，然后按创建时间排序
            if (a.is_default && !b.is_default) return -1;
            if (!a.is_default && b.is_default) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });
    }

    // 获取单个提示词模板
    getPromptTemplate(id) {
        return this.promptTemplates.find(template => template.id === parseInt(id));
    }

    // 更新提示词模板
    updatePromptTemplate(id, templateData) {
        const index = this.promptTemplates.findIndex(template => template.id === parseInt(id));
        if (index === -1) {
            throw new Error('提示词模板不存在');
        }

        const { name, description, system_prompt, category, is_default } = templateData;
        
        this.promptTemplates[index] = {
            ...this.promptTemplates[index],
            name,
            description,
            system_prompt,
            category,
            is_default,
            updated_at: this.getCurrentTimestamp()
        };

        this.saveData();
        logger.info('提示词模板更新成功:', { id, name });
        return true;
    }

    // 删除提示词模板
    deletePromptTemplate(id) {
        const index = this.promptTemplates.findIndex(template => template.id === parseInt(id));
        if (index === -1) {
            throw new Error('提示词模板不存在');
        }

        const template = this.promptTemplates[index];
        this.promptTemplates.splice(index, 1);
        this.saveData();
        
        logger.info('提示词模板删除成功:', { id, name: template.name });
        return true;
    }

    // 获取默认提示词模板
    getDefaultPromptTemplate() {
        return this.promptTemplates.find(template => template.is_default) || null;
    }

    // 组合完整的提示词（系统提示词 + 用户提示词）
    getFullPrompt(taskId) {
        const task = this.getTask(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }

        // 如果任务使用旧版本的prompt字段，直接返回
        if (task.prompt && !task.prompt_template_id) {
            return task.prompt;
        }

        // 使用新版本的模板+用户提示词
        const template = task.prompt_template_id ? this.getPromptTemplate(task.prompt_template_id) : this.getDefaultPromptTemplate();
        
        if (!template) {
                    // 如果没有模板，回退到默认行为
        return '请分析以下群聊内容，提取关键信息和用户反馈，生成简要的分析报告。';
        }

        let fullPrompt = template.system_prompt;
        


        return fullPrompt;
    }

    /**
     * 插入默认数据
     */
    insertDefaultData() {
        // 插入默认提示词模板
        if (this.promptTemplates.length === 0) {
            const defaultTemplates = [
                {
                    name: '通用群聊分析',
                    description: '全面分析群聊活跃度、话题、用户参与度等基础信息',
                    system_prompt: `你是一位专业的群聊数据分析师。请分析以下群聊消息，提供详细的分析报告。

分析要求：
1. 消息统计：总消息数、活跃用户数、时间分布
2. 用户活跃度：发言排行、互动频率
3. 话题分析：主要讨论话题、热门关键词
4. 时间分析：活跃时段、消息频率变化

输出格式：使用HTML格式，结构清晰，样式美观，便于阅读。`,
                    category: 'analysis',
                    is_default: true
                },
                {
                    name: '话题深度挖掘',
                    description: '深入分析群聊中的具体话题和讨论内容',
                    system_prompt: `你是一位话题分析专家。请深入分析群聊中的讨论话题和内容。

重点关注：
1. 话题识别：自动识别和分类讨论话题
2. 观点提取：提取用户的主要观点和态度
3. 讨论热度：分析话题的讨论热度和参与度
4. 趋势分析：话题演变趋势和用户兴趣变化

请以专业、客观的角度进行分析，提供有价值的洞察。`,
                    category: 'topic',
                    is_default: false
                },
                {
                    name: '用户行为分析',
                    description: '分析群成员的发言模式、互动行为和社交特征',
                    system_prompt: `你是一位用户行为分析专家。请分析群聊中用户的行为模式和社交特征。

分析维度：
1. 发言特征：发言频率、时间习惯、内容偏好
2. 互动模式：回复行为、提及关系、社交网络
3. 角色识别：意见领袖、活跃者、潜水者等
4. 参与度分析：不同用户的参与深度和质量

注重保护用户隐私，以匿名化方式进行分析。`,
                    category: 'behavior',
                    is_default: false
                },
                {
                    name: '商务机会识别',
                    description: '识别群聊中的商业信息、合作机会和市场需求',
                    system_prompt: `你是一位商务分析师。请分析群聊内容中的商业价值和机会。

关注要点：
1. 需求识别：发现用户表达的需求和痛点
2. 机会挖掘：识别潜在的商业合作机会
3. 市场信息：提取行业动态和市场信息
4. 决策支持：为商务决策提供数据支持

请以商业视角进行专业分析，突出actionable insights。`,
                    category: 'business',
                    is_default: false
                },
                {
                    name: '情感氛围分析',
                    description: '分析群聊的整体情感倾向和氛围变化',
                    system_prompt: `你是一位情感分析专家。请分析群聊的情感氛围和变化趋势。

分析内容：
1. 情感分布：正面、负面、中性情感的比例
2. 情感演变：不同时间段的情感变化
3. 影响因素：导致情感变化的关键事件或话题
4. 氛围评估：整体群聊氛围的健康度评估

请客观分析，避免过度解读，注重数据支撑。`,
                    category: 'sentiment',
                    is_default: false
                }
            ];

            defaultTemplates.forEach(template => {
                this.createPromptTemplate(template);
            });
            
            logger.info('默认提示词模板插入完成:', defaultTemplates.length + '个模板');
        }

        // 插入示例任务
        if (this.tasks.length === 0) {
            const defaultTask = {
                name: '每日群聊分析示例',
                chatrooms: ['示例群聊1', '示例群聊2'],
                schedule_time: '2024-01-01T09:00:00',
                llm_model: 'DeepSeek',
                prompt_template_id: 1, // 使用默认模板

                status: 'disabled'
            };

            this.createTask(defaultTask);
            logger.info('默认任务数据插入完成');
        }
    }

    /**
     * 清理异常的任务状态
     */
    cleanupTaskStatus() {
        let cleanedCount = 0;
        
        this.tasks.forEach(task => {
            // 如果任务状态是"正在分析中"，重置为"未开始"
            if (task.progress_status === 'analyzing') {
                task.progress_status = 'not_started';
                task.updated_at = this.getCurrentTimestamp();
                cleanedCount++;
                logger.info(`清理任务状态: ${task.name} (ID: ${task.id}) - 从"正在分析中"重置为"未开始"`);
            }
        });
        
        if (cleanedCount > 0) {
            this.saveData();
            logger.info(`任务状态清理完成: ${cleanedCount} 个任务已重置`);
        } else {
            logger.info('无需清理任务状态');
        }
        
        return cleanedCount;
    }

    /**
     * 迁移报告数据，为现有报告添加时间范围信息
     */
    migrateReportData() {
        let migratedCount = 0;
        
        this.reports.forEach(report => {
            // 如果报告没有时间范围信息，从对应的任务中获取
            if (!report.time_range && report.task_id) {
                const task = this.getTask(report.task_id);
                if (task && task.time_range) {
                    report.time_range = task.time_range;
                    migratedCount++;
                    logger.info(`迁移报告数据: ${report.task_name} (ID: ${report.id}) - 添加时间范围信息`);
                } else {
                    // 如果任务不存在或没有时间范围，设置默认值
                    report.time_range = { type: 'recent_7d' };
                    migratedCount++;
                    logger.info(`迁移报告数据: ${report.task_name} (ID: ${report.id}) - 设置默认时间范围`);
                }
            }
        });
        
        if (migratedCount > 0) {
            this.saveData();
            logger.info(`报告数据迁移完成: ${migratedCount} 个报告已更新`);
        } else {
            logger.info('无需迁移报告数据');
        }
        
        return migratedCount;
    }

    /**
     * 初始化数据库
     */
    initialize() {
        try {
            this.connect();
            this.insertDefaultData();
            
            // 清理异常的任务状态
            this.cleanupTaskStatus();
            
            // 迁移报告数据，为现有报告添加时间范围信息
            this.migrateReportData();
            
            logger.info('数据存储初始化完成（JSON文件模式）');
        } catch (error) {
            logger.error('数据存储初始化失败:', error);
            throw error;
        }
    }

    /**
     * 获取数据库实例（兼容API）
     */
    getInstance() {
        return this;
    }

    /**
     * 兼容SQLite API的方法
     */
    run(sql, params = []) {
        // 这里可以实现简单的SQL解析，现在只是占位符
        logger.warn('SQL操作在JSON模式下不支持:', sql);
        return { lastID: null, changes: 0 };
    }

    get(sql, params = []) {
        logger.warn('SQL查询在JSON模式下不支持:', sql);
        return null;
    }

    all(sql, params = []) {
        logger.warn('SQL查询在JSON模式下不支持:', sql);
        return [];
    }
}

// 创建单例实例
const database = new DatabaseManager();

/**
 * 初始化数据库的导出函数
 */
async function initDatabase() {
    database.initialize();
}

/**
 * 获取数据库实例的导出函数
 */
function getDatabase() {
    return database;
}

module.exports = {
    initDatabase,
    getDatabase
}; 