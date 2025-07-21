/**
 * 微信群聊智能分析平台 - 通用JavaScript库
 * 
 * 功能：
 * 1. 提供API调用封装
 * 2. 通用UI交互功能
 * 3. 表单验证和处理
 * 4. 消息通知系统
 * 5. 工具函数集合
 */

// ==================== 全局变量 ====================

const App = {
    config: {
        apiBase: '/api',
        timeout: 10000,
        retryCount: 3
    },
    
    // 存储当前用户状态
    state: {
        isFirstRun: false,
        isConfigured: false,
        currentPage: ''
    },
    
    // 缓存DOM元素
    elements: {}
};

// ==================== API调用封装 ====================

/**
 * 通用API请求函数
 */
async function apiRequest(endpoint, options = {}) {
    const config = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        timeout: App.config.timeout,
        ...options
    };

    // 如果是POST/PUT请求且有数据，转换为JSON
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(App.config.apiBase + endpoint, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('API请求失败:', error);
        throw error;
    }
}

/**
 * GET请求
 */
async function apiGet(endpoint) {
    return apiRequest(endpoint, { method: 'GET' });
}

/**
 * POST请求
 */
async function apiPost(endpoint, data) {
    return apiRequest(endpoint, {
        method: 'POST',
        body: data
    });
}

/**
 * PUT请求
 */
async function apiPut(endpoint, data) {
    return apiRequest(endpoint, {
        method: 'PUT',
        body: data
    });
}

/**
 * DELETE请求
 */
async function apiDelete(endpoint) {
    return apiRequest(endpoint, { method: 'DELETE' });
}

// ==================== 消息通知系统 ====================

/**
 * 显示通知消息
 */
function showNotification(message, type = 'info', duration = 3000) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // 添加到页面
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // 自动隐藏
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }
}

/**
 * 成功消息
 */
function showSuccess(message, duration = 3000) {
    showNotification(message, 'success', duration);
}

/**
 * 错误消息
 */
function showError(message, duration = 5000) {
    showNotification(message, 'danger', duration);
}

/**
 * 警告消息
 */
function showWarning(message, duration = 4000) {
    showNotification(message, 'warning', duration);
}

/**
 * 信息消息
 */
function showInfo(message, duration = 3000) {
    showNotification(message, 'info', duration);
}

// ==================== 加载状态管理 ====================

/**
 * 显示加载状态
 */
function showLoading(message = '加载中...') {
    let overlay = document.querySelector('.spinner-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'spinner-overlay';
        overlay.innerHTML = `
            <div style="text-align: center;">
                <div class="loading"></div>
                <div style="margin-top: 10px;">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
    const overlay = document.querySelector('.spinner-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// ==================== 表单处理 ====================

/**
 * 序列化表单数据
 */
function serializeForm(form) {
    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
        if (data[key]) {
            // 如果已存在，转换为数组
            if (!Array.isArray(data[key])) {
                data[key] = [data[key]];
            }
            data[key].push(value);
        } else {
            data[key] = value;
        }
    }
    
    return data;
}

/**
 * 表单验证
 */
function validateForm(form) {
    const fields = form.querySelectorAll('input, select, textarea');
    let isValid = true;
    
    fields.forEach(field => {
        const value = field.value.trim();
        const required = field.hasAttribute('required');
        
        // 清除之前的验证状态
        field.classList.remove('is-invalid', 'is-valid');
        
        // 必填验证
        if (required && !value) {
            field.classList.add('is-invalid');
            showFieldError(field, '此字段为必填项');
            isValid = false;
        } else if (value) {
            // 其他验证
            const type = field.type;
            
            if (type === 'email' && !isValidEmail(value)) {
                field.classList.add('is-invalid');
                showFieldError(field, '请输入有效的邮箱地址');
                isValid = false;
            } else if (type === 'url' && !isValidUrl(value)) {
                field.classList.add('is-invalid');
                showFieldError(field, '请输入有效的URL地址');
                isValid = false;
            } else {
                field.classList.add('is-valid');
                hideFieldError(field);
            }
        }
    });
    
    return isValid;
}

/**
 * 显示字段错误
 */
function showFieldError(field, message) {
    let errorElement = field.parentNode.querySelector('.invalid-feedback');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'invalid-feedback';
        field.parentNode.appendChild(errorElement);
    }
    errorElement.textContent = message;
}

/**
 * 隐藏字段错误
 */
function hideFieldError(field) {
    const errorElement = field.parentNode.querySelector('.invalid-feedback');
    if (errorElement) {
        errorElement.remove();
    }
}

// ==================== 工具函数 ====================

/**
 * 验证邮箱格式
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * 验证URL格式
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 格式化日期
 */
function formatDate(dateString, format = 'YYYY-MM-DD HH:mm:ss') {
    const date = new Date(dateString);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showSuccess('复制成功');
    } catch (err) {
        // fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('复制成功');
    }
}

/**
 * 确认对话框
 */
function confirmDialog(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// ==================== 页面初始化 ====================

/**
 * 初始化页面
 */
function initializePage() {
    // 设置当前页面
    const path = window.location.pathname;
    App.state.currentPage = path;
    
    // 高亮当前导航
    const navLinks = document.querySelectorAll('.navbar-nav a');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
    });
    
    // 初始化表单
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', handleFormSubmit);
    });
    
    // 初始化按钮
    const buttons = document.querySelectorAll('[data-action]');
    buttons.forEach(button => {
        button.addEventListener('click', handleButtonClick);
    });
    
    // 检查系统状态
    checkSystemStatus();
}

/**
 * 处理表单提交
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const action = form.getAttribute('data-action');
    
    if (!validateForm(form)) {
        return;
    }
    
    const formData = serializeForm(form);
    
    try {
        showLoading('提交中...');
        
        let response;
        switch (action) {
            case 'save-settings':
                response = await apiPost('/settings', formData);
                break;
            case 'create-task':
                response = await apiPost('/tasks', formData);
                break;
            case 'update-task':
                const taskId = form.getAttribute('data-task-id');
                response = await apiPut(`/tasks/${taskId}`, formData);
                break;
            default:
                throw new Error('未知的表单操作');
        }
        
        if (response.success) {
            showSuccess(response.message);
            
            // 根据操作类型处理后续逻辑
            if (action === 'save-settings') {
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else if (action === 'create-task' || action === 'update-task') {
                setTimeout(() => {
                    window.location.href = '/tasks';
                }, 1000);
            }
        } else {
            showError(response.message);
        }
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

/**
 * 处理按钮点击
 */
async function handleButtonClick(event) {
    const button = event.target;
    const action = button.getAttribute('data-action');
    const target = button.getAttribute('data-target');
    
    try {
        switch (action) {
            case 'delete-task':
                confirmDialog('确定要删除此任务吗？', async () => {
                    showLoading('删除中...');
                    const response = await apiDelete(`/tasks/${target}`);
                    if (response.success) {
                        showSuccess(response.message);
                        setTimeout(() => location.reload(), 1000);
                    } else {
                        showError(response.message);
                    }
                    hideLoading();
                });
                break;
                
            case 'execute-task':
                showLoading('执行中...');
                const response = await apiPost(`/tasks/${target}/execute`);
                if (response.success) {
                    showSuccess(response.message);
                } else {
                    showError(response.message);
                }
                hideLoading();
                break;
                
            case 'copy-text':
                copyToClipboard(target);
                break;
                
            default:
                console.warn('未知的按钮操作:', action);
        }
    } catch (error) {
        showError(error.message);
        hideLoading();
    }
}

/**
 * 检查系统状态
 */
async function checkSystemStatus() {
    try {
        const response = await apiGet('/status');
        if (response.success) {
            App.state.isConfigured = true;
        }
    } catch (error) {
        console.warn('系统状态检查失败:', error);
    }
}

// ==================== 页面加载完成后初始化 ====================

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    
    // 添加全局错误处理
    window.addEventListener('error', function(event) {
        console.error('全局错误:', event.error);
        showError('发生未知错误，请刷新页面重试');
    });
    
    // 添加网络错误处理
    window.addEventListener('online', function() {
        showSuccess('网络连接已恢复');
    });
    
    window.addEventListener('offline', function() {
        showWarning('网络连接已断开');
    });
});

// ==================== 导出全局函数 ====================

// 将主要函数添加到全局作用域
window.App = App;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.formatDate = formatDate;
window.copyToClipboard = copyToClipboard;
window.confirmDialog = confirmDialog; 