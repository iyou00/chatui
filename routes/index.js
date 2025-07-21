/**
 * 主页面路由
 * 
 * 功能：
 * 1. 处理主页面访问
 * 2. 处理设置页面路由
 * 3. 处理报告页面路由
 * 4. 处理其他页面路由
 */

const express = require('express');
const router = express.Router();
const { checkFirstRun } = require('../utils/startup');
const logger = require('../utils/logger');

/**
 * 主页面 - 任务列表
 */
router.get('/', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        
        if (isFirstRun) {
            // 首次运行重定向到设置页面
            return res.redirect('/settings');
        }

        // 重定向到任务列表页面
        res.redirect('/tasks');
    } catch (error) {
        logger.error('访问主页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 设置页面
 */
router.get('/settings', async (req, res) => {
    try {
        res.render('settings', {
            title: '系统设置 - 微信群聊智能分析平台',
            currentPage: 'settings'
        });
    } catch (error) {
        logger.error('访问设置页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 任务管理页面
 */
router.get('/tasks', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        
        if (isFirstRun) {
            return res.redirect('/settings');
        }

        res.render('tasks', {
            title: '任务管理 - 微信群聊智能分析平台',
            currentPage: 'tasks'
        });
    } catch (error) {
        logger.error('访问任务管理页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 创建任务页面
 */
router.get('/tasks/create', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        
        if (isFirstRun) {
            return res.redirect('/settings');
        }

        res.render('task-form', {
            title: '创建任务 - 微信群聊智能分析平台',
            currentPage: 'tasks',
            mode: 'create'
        });
    } catch (error) {
        logger.error('访问创建任务页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 编辑任务页面
 */
router.get('/tasks/:id/edit', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        
        if (isFirstRun) {
            return res.redirect('/settings');
        }

        const taskId = req.params.id;
        
        res.render('task-form', {
            title: '编辑任务 - 微信群聊智能分析平台',
            currentPage: 'tasks',
            mode: 'edit',
            taskId: taskId
        });
    } catch (error) {
        logger.error('访问编辑任务页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 报告中心页面
 */
router.get('/reports', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        
        if (isFirstRun) {
            return res.redirect('/settings');
        }

        res.render('reports', {
            title: '报告中心 - 微信群聊智能分析平台',
            currentPage: 'reports'
        });
    } catch (error) {
        logger.error('访问报告中心页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 报告详情页面
 */
router.get('/reports/:id', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        
        if (isFirstRun) {
            return res.redirect('/settings');
        }

        const reportId = req.params.id;
        
        res.render('report-detail', {
            title: '报告详情 - 微信群聊智能分析平台',
            currentPage: 'reports',
            reportId: reportId
        });
    } catch (error) {
        logger.error('访问报告详情页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

/**
 * 帮助页面
 */
router.get('/help', (req, res) => {
    res.render('help', {
        title: '帮助 - 微信群聊智能分析平台',
        currentPage: 'help'
    });
});

/**
 * 关于页面
 */
router.get('/about', (req, res) => {
    res.render('about', {
        title: '关于 - 微信群聊智能分析平台',
        currentPage: 'about'
    });
});

/**
 * 提示词管理页面
 */
router.get('/prompt-templates', async (req, res) => {
    try {
        // 检查是否首次运行
        const isFirstRun = await checkFirstRun();
        if (isFirstRun) {
            return res.redirect('/settings');
        }
        res.render('prompt-templates', {
            title: '提示词管理 - 微信群聊智能分析平台',
            currentPage: 'prompt-templates'
        });
    } catch (error) {
        logger.error('访问提示词管理页面失败:', error);
        res.status(500).render('error', {
            message: '服务器内部错误',
            error: error
        });
    }
});

module.exports = router; 