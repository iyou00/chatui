// settings.js
// 首次运行设置页前端逻辑，负责表单预填、校验、保存配置、反馈提示

// 全局变量
let serviceStatusCache = {
    chatlogUrl: null,
    deepseek: null,
    gemini: null,
    kimi: null
};

/**
 * 页面加载时获取配置并填充表单
 */
window.addEventListener('DOMContentLoaded', function() {
    // 时间范围选择交互
    const defaultTimeRangeSelect = document.getElementById('defaultTimeRange');
    const customTimeRangeCard = document.getElementById('customTimeRangeCard');
    
    if (defaultTimeRangeSelect && customTimeRangeCard) {
        defaultTimeRangeSelect.addEventListener('change', function() {
            if (this.value === 'custom') {
                customTimeRangeCard.style.display = 'block';
                // 设置默认的自定义时间范围（最近7天）
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - 7);
                
                document.getElementById('customStartDate').value = startDate.toISOString().split('T')[0];
                document.getElementById('customEndDate').value = endDate.toISOString().split('T')[0];
            } else {
                customTimeRangeCard.style.display = 'none';
            }
        });
    }
    
    // 绑定事件
    bindEvents();
    
    // 加载配置（配置加载完成后会自动检查服务状态）
    loadConfig();
});

function loadConfig() {
    const feedback = document.getElementById('feedback');
    
    fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const config = data.data;
                
                // 填充基础配置
                document.getElementById('chatlogUrl').value = config.chatlogUrl || '';
                document.getElementById('deepseek').value = config.llmApiKeys?.deepseek || '';
                document.getElementById('gemini').value = config.llmApiKeys?.gemini || '';
                document.getElementById('kimi').value = config.llmApiKeys?.kimi || '';
                
                // 填充时间范围配置
                if (document.getElementById('defaultTimeRange')) {
                    document.getElementById('defaultTimeRange').value = config.defaultTimeRange || 'recent_7d';
                    
                    // 如果是自定义时间范围，显示自定义输入框并填充值
                    if (config.defaultTimeRange === 'custom' && config.customStartDate && config.customEndDate) {
                        const customTimeRangeCard = document.getElementById('customTimeRangeCard');
                        if (customTimeRangeCard) {
                            customTimeRangeCard.style.display = 'block';
                        }
                        document.getElementById('customStartDate').value = config.customStartDate;
                        document.getElementById('customEndDate').value = config.customEndDate;
                    }
                }
                
                feedback.textContent = '';
                
                // 配置加载完成后，检查服务状态
                setTimeout(() => {
                    checkAllServiceStatus();
                }, 200);
            }
        })
        .catch(err => {
            console.error('加载配置失败:', err);
            feedback.textContent = '加载配置失败，请刷新页面重试';
            feedback.className = 'feedback error';
        });
}

/**
 * 显示反馈消息的帮助函数
 */
function showFeedback(message, type) {
    const feedback = document.getElementById('feedback');
    if (feedback) {
        feedback.textContent = message;
        feedback.className = type ? `feedback-compact ${type} show` : 'feedback-compact show';
        
        // 自动隐藏信息类消息
        if (type === 'info' || type === 'success') {
            setTimeout(() => {
                feedback.className = 'feedback-compact';
            }, 3000);
        }
    }
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
    // 保存配置按钮
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfig);
    }
    
    // 各个服务的独立测试按钮
    const testChatlogBtn = document.getElementById('testChatlogBtn');
    if (testChatlogBtn) {
        testChatlogBtn.addEventListener('click', () => testChatlogConnection());
    }
    
    const testDeepseekBtn = document.getElementById('testDeepseekBtn');
    if (testDeepseekBtn) {
        testDeepseekBtn.addEventListener('click', () => testApiKey('deepseek'));
    }
    
    const testGeminiBtn = document.getElementById('testGeminiBtn');
    if (testGeminiBtn) {
        testGeminiBtn.addEventListener('click', () => testApiKey('gemini'));
    }
    
    const testKimiBtn = document.getElementById('testKimiBtn');
    if (testKimiBtn) {
        testKimiBtn.addEventListener('click', () => testApiKey('kimi'));
    }
    
    // 输入框变化时检查状态
    const inputs = ['chatlogUrl', 'deepseek', 'gemini', 'kimi'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                setTimeout(() => checkServiceStatus(id), 500); // 延迟检查，避免频繁请求
            });
        }
    });
}

/**
 * 检查所有服务状态
 */
function checkAllServiceStatus() {
    // 延迟执行状态检查，确保DOM完全加载
    setTimeout(() => {
        checkServiceStatus('chatlogUrl');
        checkServiceStatus('deepseek');
        checkServiceStatus('gemini');
        checkServiceStatus('kimi');
        updateConfigProgress();
    }, 100);
}

/**
 * 检查单个服务状态
 */
function checkServiceStatus(serviceId) {
    const input = document.getElementById(serviceId);
    const statusElement = document.getElementById(serviceId + 'Status');
    
    if (!input || !statusElement) return;
    
    const value = input.value.trim();
    
    if (!value) {
        updateServiceStatus(serviceId, 'unconfigured');
        return;
    }
    
    // 根据服务类型检查状态
    switch (serviceId) {
        case 'chatlogUrl':
            // 页面加载时的状态检查，跳过保存配置步骤
            checkChatlogConnection(value, true);
            break;
        case 'deepseek':
        case 'gemini':
        case 'kimi':
            // 对于API密钥，先显示为已配置，但不自动验证（避免频繁API调用）
            // 用户可以手动点击验证按钮进行实际验证
            const formatValidation = validateApiKeyFormat(serviceId, value);
            if (formatValidation.valid) {
                updateServiceStatus(serviceId, 'configured');
            } else {
                updateServiceStatus(serviceId, 'error');
            }
            break;
    }
}

/**
 * 检查ChatLog连接状态
 */
function checkChatlogConnection(url, skipSave = false) {
    if (!url) {
        updateServiceStatus('chatlogUrl', 'unconfigured');
        return;
    }
    
    // 格式化URL - 如果没有协议前缀，自动添加http://
    let formattedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        formattedUrl = 'http://' + url;
    }
    
    // 简单的URL格式验证
    try {
        new URL(formattedUrl);
    } catch (e) {
        console.error('URL格式错误:', e);
        updateServiceStatus('chatlogUrl', 'error');
        return;
    }
    
    updateServiceStatus('chatlogUrl', 'checking');
    console.log('开始测试ChatLog连接:', formattedUrl);
    
    // 如果是页面加载时的状态检查，跳过保存配置步骤
    const testPromise = skipSave ? 
        Promise.resolve() : 
        fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatlogUrl: formattedUrl,
                // 保持其他配置不变
                llmApiKeys: {
                    deepseek: document.getElementById('deepseek').value.trim(),
                    gemini: document.getElementById('gemini').value.trim(),
                    kimi: document.getElementById('kimi').value.trim()
                }
            })
        });
    
    testPromise
        .then(() => {
            // 测试连接
            return fetch('/api/chatlog/test');
        })
        .then(res => res.json())
        .then(data => {
            console.log('ChatLog测试结果:', data);
            if (data.success && data.data.connected) {
                updateServiceStatus('chatlogUrl', 'connected');
                if (!skipSave) {
                    showFeedback('ChatLog连接测试成功', 'success');
                }
            } else {
                updateServiceStatus('chatlogUrl', 'error');
                if (!skipSave) {
                    showFeedback('ChatLog连接测试失败: ' + (data.message || '未知错误'), 'error');
                }
            }
        })
        .catch(err => {
            console.error('ChatLog连接测试失败:', err);
            updateServiceStatus('chatlogUrl', 'error');
            if (!skipSave) {
                showFeedback('ChatLog连接测试失败: ' + err.message, 'error');
            }
        });
}

/**
 * 更新服务状态显示
 */
function updateServiceStatus(serviceId, status) {
    // 修复ID映射问题
    let statusElementId;
    if (serviceId === 'chatlogUrl') {
        statusElementId = 'chatlogStatus';
    } else {
        statusElementId = serviceId + 'Status';
    }
    
    const statusElement = document.getElementById(statusElementId);
    console.log(`更新状态: ${serviceId} -> ${status}, 元素ID: ${statusElementId}, 元素:`, statusElement);
    
    if (!statusElement) {
        console.error(`状态元素未找到: ${statusElementId}`);
        return;
    }
    
    // 移除所有状态类
    statusElement.className = 'setting-status-icon';
    
    switch (status) {
        case 'connected':
        case 'configured':
            statusElement.textContent = '✅';
            statusElement.classList.add('success');
            break;
        case 'checking':
            statusElement.textContent = '🔄';
            statusElement.classList.add('checking');
            break;
        case 'error':
            statusElement.textContent = '❌';
            statusElement.classList.add('error');
            break;
        case 'unconfigured':
        default:
            statusElement.textContent = '❌';
            statusElement.classList.add('error');
            break;
    }
    
    updateConfigProgress();
}

/**
 * 更新配置完成度
 */
function updateConfigProgress() {
    const services = ['chatlogUrl', 'deepseek', 'gemini', 'kimi'];
    let configuredCount = 0;
    
    services.forEach(serviceId => {
        const input = document.getElementById(serviceId);
        if (input && input.value.trim()) {
            configuredCount++;
        }
    });
    
    const progress = Math.round((configuredCount / services.length) * 100);
    const configStatus = document.getElementById('configStatus');
    if (configStatus) {
        configStatus.textContent = `配置完成度 ${progress}%`;
    }
}

/**
 * 测试ChatLog连接
 */
function testChatlogConnection() {
    console.log('testChatlogConnection 被调用');
    
    const testBtn = document.getElementById('testChatlogBtn');
    const chatlogUrl = document.getElementById('chatlogUrl').value.trim();
    
    console.log('ChatLog URL:', chatlogUrl);
    console.log('测试按钮:', testBtn);
    
    if (!chatlogUrl) {
        showFeedback('请先输入ChatLog服务地址', 'error');
        return;
    }
    
    // 设置按钮状态
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerHTML = '🔄 测试中...';
    }
    
    // 更新状态为检测中
    updateServiceStatus('chatlogUrl', 'checking');
    showFeedback('正在测试ChatLog连接...', 'info');
    
    // 测试连接
    checkChatlogConnection(chatlogUrl);
    
    // 重置按钮状态
    setTimeout(() => {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerHTML = '🔗 测试连接';
        }
    }, 3000);
}

/**
 * 测试API密钥
 */
function testApiKey(serviceType) {
    const testBtn = document.getElementById(`test${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)}Btn`);
    const apiKeyInput = document.getElementById(serviceType);
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
        showFeedback(`请先输入${getServiceName(serviceType)} API密钥`, 'error');
        return;
    }
    
    // 设置按钮状态
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerHTML = '🔄 验证中...';
    }
    
    // 更新状态为检测中
    updateServiceStatus(serviceType, 'checking');
    
    // 验证API密钥格式和有效性
    validateApiKey(serviceType, apiKey).then(isValid => {
        if (isValid) {
            updateServiceStatus(serviceType, 'configured');
            showFeedback(`${getServiceName(serviceType)} API密钥验证成功`, 'success');
        } else {
            updateServiceStatus(serviceType, 'error');
            showFeedback(`${getServiceName(serviceType)} API密钥验证失败`, 'error');
        }
    }).catch(err => {
        console.error(`${serviceType} API密钥验证失败:`, err);
        updateServiceStatus(serviceType, 'error');
        showFeedback(`${getServiceName(serviceType)} API密钥验证失败`, 'error');
    }).finally(() => {
        // 重置按钮状态
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerHTML = '🔍 验证密钥';
        }
    });
}

/**
 * 验证API密钥
 */
async function validateApiKey(serviceType, apiKey) {
    // 基本格式验证
    const formatValidation = validateApiKeyFormat(serviceType, apiKey);
    if (!formatValidation.valid) {
        showFeedback(formatValidation.message, 'error');
        return false;
    }
    
    // 实际调用API验证密钥有效性
    try {
        const response = await fetch('/api/validate-api-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                serviceType: serviceType,
                apiKey: apiKey
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`${serviceType} API密钥验证成功:`, result);
            return true;
        } else {
            console.log(`${serviceType} API密钥验证失败:`, result.message);
            showFeedback(`${getServiceName(serviceType)} API密钥验证失败: ${result.message}`, 'error');
            return false;
        }
    } catch (error) {
        console.error(`${serviceType} API密钥验证出错:`, error);
        showFeedback(`${getServiceName(serviceType)} API密钥验证出错: ${error.message}`, 'error');
        return false;
    }
}

/**
 * 验证API密钥格式
 */
function validateApiKeyFormat(serviceType, apiKey) {
    switch (serviceType) {
        case 'deepseek':
            if (!apiKey.startsWith('sk-')) {
                return { valid: false, message: 'DeepSeek API密钥应以 sk- 开头' };
            }
            if (apiKey.length < 20) {
                return { valid: false, message: 'DeepSeek API密钥长度不足' };
            }
            break;
            
        case 'gemini':
            if (!apiKey.startsWith('AIza')) {
                return { valid: false, message: 'Gemini API密钥应以 AIza 开头' };
            }
            if (apiKey.length < 30) {
                return { valid: false, message: 'Gemini API密钥长度不足' };
            }
            break;
            
        case 'kimi':
            if (!apiKey.startsWith('sk-')) {
                return { valid: false, message: 'Kimi API密钥应以 sk- 开头' };
            }
            if (apiKey.length < 20) {
                return { valid: false, message: 'Kimi API密钥长度不足' };
            }
            break;
    }
    
    return { valid: true };
}

/**
 * 获取服务名称
 */
function getServiceName(serviceType) {
    const names = {
        'deepseek': 'DeepSeek',
        'gemini': 'Gemini',
        'kimi': 'Kimi'
    };
    return names[serviceType] || serviceType;
}

/**
 * 保存配置
 */
function saveConfig() {
    
    const formData = {
        chatlogUrl: document.getElementById('chatlogUrl').value.trim(),
        llmApiKeys: {
            deepseek: document.getElementById('deepseek').value.trim(),
            gemini: document.getElementById('gemini').value.trim(),
            kimi: document.getElementById('kimi').value.trim()
        }
    };
    
    // 添加时间范围配置
    if (document.getElementById('defaultTimeRange')) {
        formData.defaultTimeRange = document.getElementById('defaultTimeRange').value;
        
        // 如果是自定义时间范围，包含自定义日期
        if (formData.defaultTimeRange === 'custom') {
            const startDate = document.getElementById('customStartDate').value;
            const endDate = document.getElementById('customEndDate').value;
            
            if (!startDate || !endDate) {
                showFeedback('请选择自定义时间范围的开始和结束日期', 'error');
                return;
            }
            
            if (new Date(startDate) >= new Date(endDate)) {
                showFeedback('开始日期必须早于结束日期', 'error');
                return;
            }
            
            formData.customStartDate = startDate;
            formData.customEndDate = endDate;
        }
    }

    // 验证必填项
    if (!formData.chatlogUrl) {
        showFeedback('请填写ChatLog服务地址', 'error');
        return;
    }
    
    // 检查是否至少有一个API密钥
    const hasApiKey = formData.llmApiKeys.deepseek || 
                      formData.llmApiKeys.gemini || 
                      formData.llmApiKeys.kimi;
    if (!hasApiKey) {
        showFeedback('请至少填写一个LLM API密钥（DeepSeek、Gemini或Kimi任选其一）', 'error');
        return;
    }

    // 提交配置
    showFeedback('正在保存配置...', '');
    
    fetch('/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showFeedback('配置保存成功！页面即将跳转到任务管理...', 'success');
                setTimeout(() => {
                    window.location.href = '/tasks';
                }, 2000);
            } else {
                showFeedback(data.message || '保存失败', 'error');
            }
        })
        .catch(err => {
            console.error('保存配置失败:', err);
            showFeedback('保存失败，请重试', 'error');
        });
}

/**
 * 重置配置
 */
function resetConfig() {
    if (!confirm('确定要重置所有配置吗？此操作不可撤销。')) {
        return;
    }
    
    // 清空所有输入框
    document.getElementById('chatlogUrl').value = '';
    document.getElementById('deepseek').value = '';
    document.getElementById('gemini').value = '';
    document.getElementById('kimi').value = '';
    document.getElementById('defaultTimeRange').value = 'recent_7d';
    
    // 隐藏自定义时间范围
    const customTimeRangeCard = document.getElementById('customTimeRangeCard');
    if (customTimeRangeCard) {
        customTimeRangeCard.style.display = 'none';
    }
    
    // 重置所有状态
    checkAllServiceStatus();
    
    showFeedback('配置已重置', 'info');
}