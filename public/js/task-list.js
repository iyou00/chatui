// task-list.js
// 任务管理页前端逻辑，负责任务列表加载、状态展示、操作按钮等

/**
 * 格式化时间显示
 */
function formatTime(isoStr) {
    if (!isoStr) return '-';
    const date = new Date(isoStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 格式化计划执行时间
 */
function formatScheduleTime(task) {
    const scheduleType = task.schedule_type || 'once';
    
    // 获取时间字符串
    let timeStr = task.schedule_time;
    if (!timeStr && task.schedule_config?.time) {
        // 如果没有 schedule_time，从 schedule_config.time 构建
        timeStr = `2025-01-01T${task.schedule_config.time}:00`;
    }
    
    if (!timeStr) return '-';
    
    switch(scheduleType) {
        case 'once':
            return formatTime(timeStr); // 2024-01-15 10:30
        case 'daily':
            return `每天 ${formatTimeOnly(timeStr)}`; // 每天 10:30
        case 'weekly':
            // 处理 weekdays 可能是字符串数组的情况
            let weekday = task.schedule_config?.weekdays?.[0];
            if (weekday !== undefined) {
                // 如果是字符串，转换为数字
                const weekdayNum = parseInt(weekday);
                weekday = getWeekdayName(weekdayNum);
            } else {
                weekday = '一'; // 默认值
            }
            return `每周${weekday} ${formatTimeOnly(timeStr)}`; // 每周一 10:30
        default:
            return formatTime(timeStr);
    }
}

/**
 * 只格式化时间部分
 */
function formatTimeOnly(dateTimeStr) {
    if (!dateTimeStr) return '';
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 获取星期名称
 */
function getWeekdayName(weekday) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return weekdays[weekday] || '一';
}

/**
 * 获取状态显示样式
 */
function getStatusDisplay(status) {
    const statusMap = {
        'enabled': { text: '✅ 启用', class: 'status-enabled' },
        'disabled': { text: '⚪ 禁用', class: 'status-disabled' },
        'running': { text: '🔄 执行中', class: 'status-running' },
        'completed': { text: '🎉 已完成', class: 'status-completed' },
        'failed': { text: '💥 执行失败', class: 'status-failed' }
    };
    return statusMap[status] || { text: '❓ ' + status, class: 'status-unknown' };
}

/**
 * 获取进度显示样式
 */
function getProgressDisplay(progressStatus) {
    const progressMap = {
        'not_started': { text: '⏳ 未开始', class: 'progress-not-started' },
        'analyzing': { text: '🔄 正在分析中', class: 'progress-analyzing' },
        'completed': { text: '🎉 已完成', class: 'progress-completed' },
        'failed': { text: '💥 执行失败', class: 'progress-failed' }
    };
    return progressMap[progressStatus] || { text: '⏳ 未开始', class: 'progress-not-started' };
}

/**
 * 获取友好的模型显示名称
 */
function getModelDisplayName(modelId) {
    const modelNames = {
        'deepseek-chat': 'DeepSeek Chat',
        'deepseek-reasoner': 'DeepSeek Reasoner',
        'gemini-2.5-pro': 'Gemini 2.5 Pro',
        'gemini-2.0-flash': 'Gemini 2.0 Flash',
        'kimi-k2-0711-preview': 'Kimi K2',
        // 兼容旧版本
        'DeepSeek': 'DeepSeek',
        'Gemini': 'Gemini',
        'Kimi': 'Kimi',
        'deepseek-r1': 'DeepSeek R1',
        'deepseek-v3': 'DeepSeek V3',
        'gemini-2.0-flash-exp': 'Gemini 2.0 Flash',
        'gemini-1.5-pro': 'Gemini 1.5 Pro',
        'gemini-1.5-flash': 'Gemini 1.5 Flash',
        'moonshot-v1-8k': 'Kimi K1 (8K)',
        'moonshot-v1-32k': 'Kimi K1 (32K)',
        'moonshot-v1-128k': 'Kimi K1 (128K)'
    };
    return modelNames[modelId] || modelId;
}

// 全局变量
let currentPage = 1;
let pageSize = 10;
let totalCount = 0;
let currentFilters = {};

/**
 * 渲染任务列表
 */
function renderTaskList(tasks) {
    const tbody = document.getElementById('task-list-body');
    const feedback = document.getElementById('task-feedback');
    
    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    暂无任务，<a href="/tasks/create">点击创建第一个任务</a>
                </td>
            </tr>
        `;
        feedback.textContent = '';
        return;
    }
    
    tbody.innerHTML = '';
    
    tasks.forEach(task => {
        const statusDisplay = getStatusDisplay(task.status);
        const progressDisplay = getProgressDisplay(task.progress_status);
        const modelDisplayName = getModelDisplayName(task.llm_model);
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td class="task-name">
                <div class="name">${escapeHtml(task.name)}</div>
                <div class="model">🤖 模型: ${escapeHtml(modelDisplayName)}</div>
            </td>
            <td class="chatrooms">
                ${task.chatrooms ? task.chatrooms.map(room => `<span class="chatroom-tag">👥 ${escapeHtml(room)}</span>`).join('') : '-'}
            </td>
            <td class="schedule-time">${formatScheduleTime(task)}</td>
            <td class="status">
                <span class="status-badge ${statusDisplay.class}">${statusDisplay.text}</span>
            </td>
            <td class="progress">
                <span class="progress-badge ${progressDisplay.class}" data-task-id="${task.id}">${progressDisplay.text}</span>
                ${task.progress_status === 'analyzing' ? 
                    `<button class="btn-reset-status" onclick="resetTaskStatus(${task.id})" title="重置状态">🔄</button>` : 
                    ''}
            </td>
            <td class="actions">
                <button class="btn-action btn-toggle" onclick="toggleTask(${task.id})" 
                        title="${task.status === 'enabled' ? '禁用任务' : '启用任务'}">
                    ${task.status === 'enabled' ? '⏸️ 禁用' : '▶️ 启用'}
                </button>
                <button class="btn-action btn-execute" onclick="executeTask(${task.id})" title="立即执行">
                    ⚡ 执行
                </button>
                <a href="/tasks/${task.id}/edit" class="btn-action btn-edit" title="编辑任务">
                    ⚡ 编辑
                </a>
                <button class="btn-action btn-delete" onclick="deleteTask(${task.id})" title="删除任务">
                    🗑️ 删除
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    feedback.textContent = '';
}

/**
 * 渲染分页控件
 */
function renderPagination() {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(totalCount / pageSize);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHtml = '';
    
    // 上一页
    paginationHtml += `
        <button ${currentPage === 1 ? 'disabled' : ''} 
                onclick="loadTasks(${currentPage - 1})">
            ← 上一页
        </button>
    `;
    
    // 页码
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        paginationHtml += `<button onclick="loadTasks(1)">1</button>`;
        if (startPage > 2) {
            paginationHtml += `<span>...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
            <button class="${i === currentPage ? 'current-page' : ''}" 
                    onclick="loadTasks(${i})">
                ${i}
            </button>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHtml += `<span>...</span>`;
        }
        paginationHtml += `<button onclick="loadTasks(${totalPages})">${totalPages}</button>`;
    }
    
    // 下一页
    paginationHtml += `
        <button ${currentPage === totalPages ? 'disabled' : ''} 
                onclick="loadTasks(${currentPage + 1})">
            下一页 →
        </button>
    `;
    
    pagination.innerHTML = paginationHtml;
}

/**
 * HTML转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 加载任务列表
 */
function loadTasks(page = 1) {
    // 防御：如果page是事件对象，重置为1
    if (typeof page !== 'number' || isNaN(page)) {
        page = 1;
    }
    console.log('🔄 开始加载任务列表，页码:', page);
    
    const feedback = document.getElementById('task-feedback');
    
    feedback.textContent = '正在加载任务列表...';
    feedback.className = 'feedback';
    
    // 构建查询参数
    const params = new URLSearchParams({
        page: page,
        limit: pageSize,
        ...currentFilters
    });
    
    console.log('📋 请求参数:', params.toString());
    
    fetch(`/api/tasks?${params}`)
        .then(res => {
            console.log('📊 API响应状态:', res.status);
            return res.json();
        })
        .then(data => {
            console.log('📄 API响应数据:', data);
            
            if (data.success) {
                const responseData = data.data || {};
                const tasks = responseData.tasks || [];
                totalCount = responseData.total || 0;
                currentPage = page;
                
                console.log('📋 解析后的数据:', {
                    tasksCount: tasks.length,
                    totalCount: totalCount,
                    currentPage: currentPage
                });
                
                renderTaskList(tasks);
                renderPagination();
                console.log(`✅ 成功加载 ${tasks.length} 个任务，总计 ${totalCount} 个`);
            } else {
                throw new Error(data.message || '加载失败');
            }
        })
        .catch(err => {
            console.error('❌ 加载任务列表失败:', err);
            feedback.textContent = `加载失败: ${err.message}`;
            feedback.className = 'feedback error';
            
            const tbody = document.getElementById('task-list-body');
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state error">
                        加载失败，<button onclick="loadTasks(1)" class="btn-retry">点击重试</button>
                    </td>
                </tr>
            `;
        });
}

/**
 * 切换任务状态
 */
function toggleTask(taskId) {
    const feedback = document.getElementById('task-feedback');
    
    fetch(`/api/tasks/${taskId}/toggle`, {
        method: 'POST'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                feedback.textContent = '任务状态切换成功';
                feedback.className = 'feedback success';
                loadTasks(); // 重新加载列表
            } else {
                throw new Error(data.message || '操作失败');
            }
        })
        .catch(err => {
            console.error('切换任务状态失败:', err);
            feedback.textContent = `操作失败: ${err.message}`;
            feedback.className = 'feedback error';
        });
}

/**
 * 立即执行任务
 */
function executeTask(taskId) {
    const feedback = document.getElementById('task-feedback');
    
    if (!confirm('确定要立即执行这个任务吗？')) {
        return;
    }
    
    // 立即更新进度显示为"正在分析中"
    updateTaskProgress(taskId, 'analyzing');
    
    feedback.textContent = '正在执行任务...';
    feedback.className = 'feedback';
    
    fetch(`/api/tasks/${taskId}/execute`, {
        method: 'POST'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                feedback.textContent = '任务执行成功';
                feedback.className = 'feedback success';
                // 更新进度为"已完成"
                updateTaskProgress(taskId, 'completed');
                // 开始轮询检查进度状态
                startProgressPolling(taskId);
            } else {
                throw new Error(data.message || '执行失败');
            }
        })
        .catch(err => {
            console.error('执行任务失败:', err);
            feedback.textContent = `执行失败: ${err.message}`;
            // 更新进度为"执行失败"
            updateTaskProgress(taskId, 'failed');
        });
}

/**
 * 更新任务进度显示
 */
function updateTaskProgress(taskId, progressStatus) {
    const progressElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (progressElement) {
        const progressDisplay = getProgressDisplay(progressStatus);
        progressElement.textContent = progressDisplay.text;
        progressElement.className = `progress-badge ${progressDisplay.class}`;
    }
}

/**
 * 开始轮询检查任务进度
 */
function startProgressPolling(taskId) {
    const pollInterval = setInterval(() => {
        fetch(`/api/tasks/${taskId}/progress`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const progressStatus = data.data.progress_status;
                    updateTaskProgress(taskId, progressStatus);
                    
                    // 如果任务已完成或失败，停止轮询
                    if (progressStatus === 'completed' || progressStatus === 'failed') {
                        clearInterval(pollInterval);
                    }
                }
            })
            .catch(err => {
                console.error('获取任务进度失败:', err);
                clearInterval(pollInterval);
            });
    }, 2000); // 每2秒检查一次
    
    // 5分钟后自动停止轮询
    setTimeout(() => {
        clearInterval(pollInterval);
    }, 5 * 60 * 1000);
}

/**
 * 重置任务状态
 */
function resetTaskStatus(taskId) {
    const feedback = document.getElementById('task-feedback');
    
    if (!confirm('确定要重置这个任务的状态吗？这将把任务状态从"正在分析中"重置为"未开始"。')) {
        return;
    }
    
    feedback.textContent = '正在重置任务状态...';
    feedback.className = 'feedback';
    
    fetch(`/api/tasks/${taskId}/reset-status`, {
        method: 'POST'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                feedback.textContent = '任务状态重置成功';
                feedback.className = 'feedback success';
                loadTasks(); // 重新加载列表
            } else {
                throw new Error(data.message || '重置失败');
            }
        })
        .catch(err => {
            console.error('重置任务状态失败:', err);
            feedback.textContent = `重置失败: ${err.message}`;
            feedback.className = 'feedback error';
        });
}

/**
 * 删除任务
 */
function deleteTask(taskId) {
    const feedback = document.getElementById('task-feedback');
    
    if (!confirm('确定要删除这个任务吗？删除后无法恢复。')) {
        return;
    }
    
    fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                feedback.textContent = '任务删除成功';
                feedback.className = 'feedback success';
                loadTasks(); // 重新加载列表
            } else {
                throw new Error(data.message || '删除失败');
            }
        })
        .catch(err => {
            console.error('删除任务失败:', err);
            feedback.textContent = `删除失败: ${err.message}`;
            feedback.className = 'feedback error';
        });
}

// 页面加载时自动加载任务列表
window.addEventListener('DOMContentLoaded', loadTasks); 