/**
 * 任务表单交互逻辑
 * 
 * 功能：
 * 1. 群聊选择（搜索、多选）
 * 2. 定时配置（单次、每天、每周）
 * 3. 提示词模板管理
 * 4. 表单验证和提交
 */

// 全局变量
let selectedChatrooms = [];
let allChatrooms = [];
let currentTaskStatus = 'enabled'; // 保存当前任务状态，默认为启用

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function () {
    initTaskForm();
    loadChatrooms();
    loadPromptTemplates();
    bindEvents();

    // 如果是编辑模式，加载任务数据
    if (window.TASK_FORM_MODE === 'edit' && window.TASK_ID) {
        loadTaskData(window.TASK_ID);
    }
});

/**
 * 绑定事件监听器
 */
function bindEvents() {
    // 群聊搜索
    document.getElementById('chatroomSearch').addEventListener('input', filterChatrooms);
    document.getElementById('refreshChatrooms').addEventListener('click', loadChatrooms);
    document.getElementById('clearAllChatrooms').addEventListener('click', clearAllChatrooms);

    // 定时类型切换
    document.querySelectorAll('input[name="scheduleType"]').forEach(radio => {
        radio.addEventListener('change', toggleScheduleConfig);
    });

    // 表单提交
    document.getElementById('task-form').addEventListener('submit', handleFormSubmit);

    // 时间范围切换
    document.getElementById('timeRange').addEventListener('change', toggleCustomTimeRange);

    // 提示词模板变化
    document.getElementById('promptTemplate').addEventListener('change', handleTemplateChange);
}

/**
 * 初始化表单默认值
 */
function initTaskForm() {
    // 设置默认执行时间为明天9点
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    document.getElementById('scheduleTime').value = formatDateTimeLocal(tomorrow);

    // 默认选择单次执行
    document.querySelector('input[name="scheduleType"][value="once"]').checked = true;
    toggleScheduleConfig();
}

/**
 * 加载群聊列表
 */
async function loadChatrooms() {
    const loadingIndicator = document.getElementById('chatroomLoadingIndicator');
    const chatroomList = document.getElementById('chatroomList');
    const emptyState = document.getElementById('chatroomEmptyState');

    try {
        console.log('🔍 开始加载群聊列表...');

        // 显示加载状态
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = '正在从ChatLog服务获取群聊列表...';
        chatroomList.style.display = 'none';
        emptyState.style.display = 'none';

        const response = await fetch('/api/chatrooms', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        console.log('📊 群聊API响应状态:', response.status);

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // 检查响应是否为 JSON 格式
        const contentType = response.headers.get('content-type');
        console.log('📋 响应Content-Type:', contentType);

        if (!contentType || !contentType.includes('application/json')) {
            const responseText = await response.text();
            console.error('❌ 非JSON响应内容:', responseText.substring(0, 200));
            throw new Error('服务器返回了非JSON格式的响应，可能是ChatLog服务配置问题');
        }

        const result = await response.json();
        console.log('📦 群聊API响应数据:', result);

        loadingIndicator.style.display = 'none';

        if (result.success && result.data) {
            allChatrooms = Array.isArray(result.data) ? result.data : [];
            console.log(`✅ 成功获取群聊列表: ${allChatrooms.length} 个`);

            if (allChatrooms.length > 0) {
                // 移除敏感数据预览，只显示统计信息
                console.log('📊 群聊数据状态: 列表加载成功');
                renderChatroomList(allChatrooms);
                showMessage(`✅ 成功加载 ${allChatrooms.length} 个群聊`, 'success');
            } else {
                console.warn('⚠️ 群聊列表为空');
                emptyState.style.display = 'block';
                emptyState.innerHTML = `
                    <div class="empty-icon">📭</div>
                    <h3>暂无可用的群聊</h3>
                    <p>可能的原因：</p>
                    <ul style="text-align: left; margin: 10px 0;">
                        <li>ChatLog服务未启动 (请确认 127.0.0.1:5030 可访问)</li>
                        <li>ChatLog服务中没有群聊数据</li>
                        <li>群聊数据格式不匹配</li>
                    </ul>
                    <button onclick="loadChatrooms()" class="btn btn-primary btn-sm">🔄 重新加载</button>
                `;
                showMessage('群聊列表为空，请检查ChatLog服务状态', 'warning');
            }
        } else {
            console.error('❌ API响应失败:', result);
            emptyState.style.display = 'block';
            emptyState.innerHTML = `
                <div class="empty-icon">❌</div>
                <h3>加载群聊列表失败</h3>
                <p>错误原因: ${result.message || '未知错误'}</p>
                <button onclick="loadChatrooms()" class="btn btn-primary btn-sm">🔄 重新尝试</button>
            `;
            showMessage('加载群聊列表失败：' + (result.message || '未知错误'), 'error');
        }

    } catch (error) {
        console.error('❌ 加载群聊失败:', error);
        loadingIndicator.style.display = 'none';
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
                <div class="empty-icon">🌐</div>
                <h3>ChatLog服务连接失败</h3>
                <p>错误详情: ${error.message}</p>
                <p>请检查：</p>
                <ul style="text-align: left; margin: 10px 0;">
                    <li>ChatLog服务是否运行在 127.0.0.1:5030</li>
                    <li>网络连接是否正常</li>
                    <li>防火墙是否阻止了连接</li>
                </ul>
                <button onclick="loadChatrooms()" class="btn btn-primary btn-sm">🔄 重新加载</button>
            `;
        showMessage('网络错误：' + error.message, 'error');
    }
}

/**
 * 渲染群聊列表
 */
function renderChatroomList(chatrooms) {
    const container = document.getElementById('chatroomList');

    if (!chatrooms || chatrooms.length === 0) {
        document.getElementById('chatroomEmptyState').style.display = 'block';
        return;
    }

    container.innerHTML = '';

    chatrooms.forEach(chatroom => {
        const item = document.createElement('div');
        item.className = 'chatroom-item';
        // 强制设置内联样式确保左对齐
        item.style.cssText = 'display: flex !important; justify-content: flex-start !important; align-items: center !important; gap: 8px !important;';
        item.innerHTML = `
            <input type="checkbox" id="chatroom_${chatroom}" value="${chatroom}">
            <label for="chatroom_${chatroom}" class="chatroom-name">${chatroom}</label>
            <span class="chatroom-info">群聊</span>
        `;

        // 设置选中状态
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (selectedChatrooms.includes(chatroom)) {
            checkbox.checked = true;
            item.classList.add('selected');
        }

        // 绑定点击事件
        item.addEventListener('click', function (e) {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
            }
            toggleChatroomSelection(chatroom, checkbox.checked);
            item.classList.toggle('selected', checkbox.checked);
        });

        container.appendChild(item);
    });

    container.style.display = 'block';
    updateSelectedSummary();
}

/**
 * 切换群聊选择状态
 */
function toggleChatroomSelection(chatroom, isSelected) {
    if (isSelected) {
        if (!selectedChatrooms.includes(chatroom)) {
            selectedChatrooms.push(chatroom);
        }
    } else {
        selectedChatrooms = selectedChatrooms.filter(c => c !== chatroom);
    }
    updateSelectedSummary();
}

/**
 * 更新选择摘要
 */
function updateSelectedSummary() {
    const summary = document.getElementById('selectedChatroomsSummary');
    const count = document.getElementById('selectedChatroomsCount');

    count.textContent = selectedChatrooms.length;
    summary.style.display = selectedChatrooms.length > 0 ? 'block' : 'none';
}

/**
 * 清除所有选择
 */
function clearAllChatrooms() {
    selectedChatrooms = [];
    document.querySelectorAll('.chatroom-item input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
        checkbox.closest('.chatroom-item').classList.remove('selected');
    });
    updateSelectedSummary();
}

/**
 * 筛选群聊
 */
function filterChatrooms() {
    console.log('🔍 filterChatrooms 函数被调用');

    const searchInput = document.getElementById('chatroomSearch');
    if (!searchInput) {
        console.error('❌ 搜索框元素未找到');
        return;
    }

    const searchTerm = searchInput.value.toLowerCase();
    console.log('🔍 搜索关键词:', searchTerm);

    const items = document.querySelectorAll('.chatroom-item');
    console.log('📋 找到群聊项数量:', items.length);

    if (items.length === 0) {
        console.warn('⚠️ 没有找到任何群聊项，可能群聊列表还未加载');
        return;
    }

    let visibleCount = 0;
    let hiddenCount = 0;

    items.forEach((item, index) => {
        const chatroomNameElement = item.querySelector('.chatroom-name');
        if (!chatroomNameElement) {
            console.error(`❌ 群聊项 ${index} 中未找到 .chatroom-name 元素`);
            return;
        }

        const chatroomName = chatroomNameElement.textContent.toLowerCase();
        const matches = chatroomName.includes(searchTerm);

        console.log(`📊 群聊 "${chatroomName}" ${matches ? '匹配' : '不匹配'} 搜索词 "${searchTerm}"`);

        if (matches) {
            // 恢复原有的flex显示，保持所有对齐样式
            item.style.cssText = 'display: flex !important; justify-content: flex-start !important; align-items: center !important; gap: 8px !important;';
            visibleCount++;
        } else {
            // 隐藏元素，完全重写样式
            item.style.cssText = 'display: none !important;';
            hiddenCount++;
        }
    });

    console.log(`✅ 筛选完成: ${visibleCount} 个显示, ${hiddenCount} 个隐藏`);
}

/**
 * 切换定时配置界面
 */
function toggleScheduleConfig() {
    const scheduleType = document.querySelector('input[name="scheduleType"]:checked').value;

    // 隐藏所有配置
    document.getElementById('onceScheduleConfig').style.display = 'none';
    document.getElementById('dailyScheduleConfig').style.display = 'none';
    document.getElementById('weeklyScheduleConfig').style.display = 'none';

    // 显示对应配置
    switch (scheduleType) {
        case 'once':
            document.getElementById('onceScheduleConfig').style.display = 'block';
            break;
        case 'daily':
            document.getElementById('dailyScheduleConfig').style.display = 'block';
            break;
        case 'weekly':
            document.getElementById('weeklyScheduleConfig').style.display = 'block';
            break;
    }
}

/**
 * 切换自定义时间范围
 */
function toggleCustomTimeRange() {
    const timeRange = document.getElementById('timeRange').value;
    const customTimeRange = document.getElementById('customTimeRange');
    customTimeRange.style.display = timeRange === 'custom' ? 'block' : 'none';
}

/**
 * 格式化日期时间为本地格式
 */
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 生成cron表达式
 */
function generateCronExpression(scheduleType, config) {
    switch (scheduleType) {
        case 'daily':
            const [dailyHour, dailyMinute] = config.time.split(':');
            return `${dailyMinute} ${dailyHour} * * *`;

        case 'weekly':
            const [weeklyHour, weeklyMinute] = config.time.split(':');
            const weekdays = config.weekdays.join(',');
            return `${weeklyMinute} ${weeklyHour} * * ${weekdays}`;

        default:
            return null;
    }
}

/**
 * 收集表单数据
 */
function collectFormData() {
    const scheduleType = document.querySelector('input[name="scheduleType"]:checked').value;

    const data = {
        name: document.getElementById('name').value.trim(),
        chatrooms: selectedChatrooms,
        llm_model: document.getElementById('llmModel').value,
        prompt_template_id: document.getElementById('promptTemplate').value,

        time_range: {
            type: document.getElementById('timeRange').value
        },
        schedule_type: scheduleType,
        status: currentTaskStatus  // 保持当前任务状态
    };

    // 自定义时间范围
    if (data.time_range.type === 'custom') {
        data.time_range.start_date = document.getElementById('startDate').value;
        data.time_range.end_date = document.getElementById('endDate').value;
    }

    // 定时配置
    switch (scheduleType) {
        case 'once':
            data.schedule_time = document.getElementById('scheduleTime').value;
            break;

        case 'daily':
            const dailyTime = document.getElementById('dailyTime').value;
            data.cron_expression = generateCronExpression('daily', { time: dailyTime });
            data.schedule_config = { type: 'daily', time: dailyTime };
            break;

        case 'weekly':
            const weeklyTime = document.getElementById('weeklyTime').value;
            const weekdays = Array.from(document.querySelectorAll('input[name="weeklyDays"]:checked'))
                .map(cb => cb.value);
            data.cron_expression = generateCronExpression('weekly', { time: weeklyTime, weekdays });
            data.schedule_config = { type: 'weekly', time: weeklyTime, weekdays };
            break;
    }

    return data;
}

/**
 * 验证表单
 */
function validateForm(data) {
    const errors = [];

    if (!data.name) {
        errors.push('请输入任务名称');
    }

    if (data.chatrooms.length === 0) {
        errors.push('请至少选择一个群聊');
    }

    if (!data.llm_model) {
        errors.push('请选择LLM模型');
    }

    if (!data.prompt_template_id) {
        errors.push('请选择提示词模板');
    }

    // 验证定时配置
    switch (data.schedule_type) {
        case 'once':
            if (!data.schedule_time) {
                errors.push('请设置执行时间');
            }
            break;

        case 'weekly':
            if (!data.schedule_config.weekdays || data.schedule_config.weekdays.length === 0) {
                errors.push('请选择执行的星期');
            }
            break;
    }

    // 验证自定义时间范围
    if (data.time_range.type === 'custom') {
        if (!data.time_range.start_date || !data.time_range.end_date) {
            errors.push('请设置自定义时间范围');
        }
    }

    return errors;
}

/**
 * 处理表单提交
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.querySelector('#task-form button[type="submit"]');
    const originalText = submitBtn.textContent;

    try {
        // 收集数据
        const formData = collectFormData();
        console.log('提交的表单数据:', formData);

        // 验证数据
        const errors = validateForm(formData);
        if (errors.length > 0) {
            showMessage('表单验证失败：\n' + errors.join('\n'), 'error');
            return;
        }

        // 显示加载状态
        submitBtn.disabled = true;
        const isEditMode = window.TASK_FORM_MODE === 'edit';
        submitBtn.textContent = isEditMode ? '⏳ 保存中...' : '⏳ 创建中...';

        // 提交表单
        const url = isEditMode ? `/api/tasks/${window.TASK_ID}` : '/api/tasks';
        const method = isEditMode ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            const successMessage = isEditMode ? '✅ 任务修改成功！' : '✅ 任务创建成功！';
            showMessage(successMessage, 'success');
            setTimeout(() => {
                window.location.href = '/tasks';
            }, 1500);
        } else {
            const errorMessage = isEditMode ? '修改任务失败' : '创建任务失败';
            throw new Error(result.message || errorMessage);
        }

    } catch (error) {
        console.error('提交失败:', error);
        showMessage('❌ ' + error.message, 'error');

    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * 加载提示词模板
 */
async function loadPromptTemplates(selectedTemplateId) {
    const sel = document.getElementById('promptTemplate');

    try {
        // 显示加载状态
        sel.innerHTML = '<option disabled>正在加载模板列表...</option>';

        const response = await fetch('/api/prompt-templates');
        const result = await response.json();

        sel.innerHTML = '<option value="">请选择分析模板</option>';

        if (!result.success) {
            throw new Error(result.message || '获取模板列表失败');
        }

        const templates = result.data || [];

        if (templates.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '暂无可用模板';
            opt.disabled = true;
            sel.appendChild(opt);
            return;
        }

        // 渲染模板选项
        templates.forEach(template => {
            const opt = document.createElement('option');
            opt.value = template.id;
            opt.textContent = `${template.name}`;
            opt.setAttribute('data-description', template.description);
            opt.setAttribute('data-system-prompt', template.system_prompt);

            if (template.is_default) {
                opt.textContent += ' (默认)';
            }

            if (selectedTemplateId && template.id == selectedTemplateId) {
                opt.selected = true;
                showTemplatePreview(template);
            }

            sel.appendChild(opt);
        });

        // 如果没有选中模板但有默认模板，自动选择默认模板
        if (!selectedTemplateId) {
            const defaultTemplate = templates.find(t => t.is_default);
            if (defaultTemplate) {
                sel.value = defaultTemplate.id;
                showTemplatePreview(defaultTemplate);
            }
        }

    } catch (error) {
        console.error('加载模板列表失败:', error);
        sel.innerHTML = '<option value="">加载失败，请刷新重试</option>';
        showMessage('❌ 加载模板列表失败: ' + error.message, 'error');
    }
}

/**
 * 显示模板预览
 */
function showTemplatePreview(template) {
    const actionsDiv = document.getElementById('templateActions');
    const descEl = document.getElementById('templateDescription');
    const promptEl = document.getElementById('templateSystemPrompt');

    if (template && actionsDiv && descEl && promptEl) {
        descEl.textContent = template.description || '暂无描述';
        promptEl.textContent = template.system_prompt;
        actionsDiv.style.display = 'flex';
    } else if (actionsDiv) {
        if (descEl) descEl.textContent = '请选择模板查看描述';
        if (promptEl) promptEl.textContent = '暂无模板内容';
        actionsDiv.style.display = 'flex'; // 保持显示，但显示默认文字
    }
}

/**
 * 处理模板选择变化
 */
function handleTemplateChange() {
    const sel = document.getElementById('promptTemplate');
    const selectedOption = sel.options[sel.selectedIndex];

    if (selectedOption && selectedOption.value) {
        const template = {
            id: parseInt(selectedOption.value),
            name: selectedOption.textContent,
            description: selectedOption.getAttribute('data-description'),
            system_prompt: selectedOption.getAttribute('data-system-prompt')
        };
        showTemplatePreview(template);
    } else {
        showTemplatePreview(null);
    }
}

/**
 * 加载任务数据（编辑模式）
 */
async function loadTaskData(taskId) {
    try {
        showMessage('正在加载任务数据...', 'info');

        const response = await fetch(`/api/tasks/${taskId}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || '加载任务数据失败');
        }

        const task = result.data;
        console.log('加载的任务数据:', task);

        // 保存当前任务状态
        currentTaskStatus = task.status || 'enabled';

        // 填充基础信息
        document.getElementById('name').value = task.name || '';

        // 填充群聊选择
        if (task.chatrooms && Array.isArray(task.chatrooms)) {
            selectedChatrooms = [...task.chatrooms];
            // 等待群聊列表加载完成后再更新选择状态
            setTimeout(() => {
                updateChatroomSelection();
            }, 1000);
        }

        // 填充LLM模型
        if (task.llm_model) {
            document.getElementById('llmModel').value = task.llm_model;
        }

        // 填充时间范围
        if (task.time_range) {
            document.getElementById('timeRange').value = task.time_range.type || 'recent_7d';

            if (task.time_range.type === 'custom') {
                document.getElementById('startDate').value = task.time_range.start_date || '';
                document.getElementById('endDate').value = task.time_range.end_date || '';
                toggleCustomTimeRange();
            }
        }

        // 填充用户提示词


        // 填充定时配置
        if (task.schedule_type) {
            const scheduleRadio = document.querySelector(`input[name="scheduleType"][value="${task.schedule_type}"]`);
            if (scheduleRadio) {
                scheduleRadio.checked = true;
                toggleScheduleConfig();

                // 根据定时类型填充具体配置
                switch (task.schedule_type) {
                    case 'once':
                        if (task.schedule_time) {
                            document.getElementById('scheduleTime').value = task.schedule_time;
                        }
                        break;

                    case 'daily':
                        if (task.schedule_config && task.schedule_config.time) {
                            document.getElementById('dailyTime').value = task.schedule_config.time;
                        }
                        break;

                    case 'weekly':
                        if (task.schedule_config) {
                            if (task.schedule_config.time) {
                                document.getElementById('weeklyTime').value = task.schedule_config.time;
                            }
                            if (task.schedule_config.weekdays && Array.isArray(task.schedule_config.weekdays)) {
                                task.schedule_config.weekdays.forEach(day => {
                                    const checkbox = document.querySelector(`input[name="weeklyDays"][value="${day}"]`);
                                    if (checkbox) {
                                        checkbox.checked = true;
                                    }
                                });
                            }
                        }
                        break;
                }
            }
        }

        // 填充提示词模板（需要等待模板加载完成）
        if (task.prompt_template_id) {
            setTimeout(() => {
                loadPromptTemplates(task.prompt_template_id);
            }, 500);
        }

        showMessage('任务数据加载完成', 'success');

    } catch (error) {
        console.error('加载任务数据失败:', error);
        showMessage('❌ 加载任务数据失败: ' + error.message, 'error');
    }
}

/**
 * 更新群聊选择状态
 */
function updateChatroomSelection() {
    document.querySelectorAll('.chatroom-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const chatroomName = checkbox.value;

        if (selectedChatrooms.includes(chatroomName)) {
            checkbox.checked = true;
            item.classList.add('selected');
        }
    });
    updateSelectedSummary();
}

/**
 * 显示消息提示
 */
function showMessage(message, type = 'info') {
    const feedback = document.getElementById('form-feedback');
    if (feedback) {
        feedback.textContent = message;
        feedback.className = `feedback ${type}`;

        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                feedback.textContent = '';
                feedback.className = 'feedback';
            }, 3000);
        }
    } else {
        // 如果没有feedback元素，使用alert
        alert(message);
    }
} 