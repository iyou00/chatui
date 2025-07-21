/**
 * 提示词模板管理页面JavaScript
 * 
 * 功能：
 * 1. 模板列表加载和渲染
 * 2. 新建、编辑、删除模板
 * 3. 模板表单验证和提交
 * 4. 用户反馈处理
 */

// 全局变量
let currentEditingTemplateId = null;

/**
 * 页面加载时初始化
 */
window.addEventListener('DOMContentLoaded', function() {
    loadPromptTemplates();
    initTemplateEvents();
});

// ==================== 模板列表管理 ====================

/**
 * 加载提示词模板列表
 */
function loadPromptTemplates() {
    fetch('/api/prompt-templates')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderTemplatesList(data.data || []);
                updateTemplateCount(data.data ? data.data.length : 0);
            } else {
                console.error('加载模板列表失败:', data.message);
                showError('加载模板列表失败: ' + data.message);
            }
        })
        .catch(err => {
            console.error('加载模板列表失败:', err);
            const container = document.getElementById('templatesList');
            container.innerHTML = '<div class="loading-compact" style="color: var(--color-danger);">❌ 加载失败，请刷新重试</div>';
            showError('加载模板列表失败，请刷新重试');
        });
}

/**
 * 渲染模板列表
 */
function renderTemplatesList(templates) {
    const container = document.getElementById('templatesList');
    const emptyState = document.getElementById('empty-state');
    
    // 清除加载状态
    container.innerHTML = '';
    
    if (templates.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = templates.map(template => `
        <div class="template-card-compact ${template.is_default ? 'is-default' : ''}">
            <div class="template-header-compact">
                <h3 class="template-name-compact">${escapeHtml(template.name)}</h3>
                <span class="template-category-compact">${getCategoryName(template.category)}</span>
            </div>
            <div class="template-description-compact">${escapeHtml(template.description || '暂无描述')}</div>
            <div class="template-actions-compact">
                <button class="btn-action-compact edit" onclick="editTemplate(${template.id})" title="编辑">
                    ✏️ 编辑
                </button>
                <button class="btn-action-compact" onclick="duplicateTemplate(${template.id})" title="复制">
                    📋 复制
                </button>
                <button class="btn-action-compact delete" onclick="deleteTemplate(${template.id})" title="删除">
                    🗑️ 删除
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * 更新模板数量显示
 */
function updateTemplateCount(count) {
    document.getElementById('templateCount').textContent = `${count} 个模板`;
}

/**
 * 获取分类中文名称
 */
function getCategoryName(category) {
    const categoryMap = {
        'analysis': '通用分析',
        'topic': '话题分析',
        'behavior': '用户行为',
        'business': '商务分析',
        'sentiment': '情感分析',
        'custom': '自定义'
    };
    return categoryMap[category] || category;
}

// ==================== 模板操作 ====================

/**
 * 初始化模板相关事件
 */
function initTemplateEvents() {
    // 新建模板按钮
    document.getElementById('newTemplateBtn').addEventListener('click', () => {
        currentEditingTemplateId = null;
        openTemplateModal('新建提示词模板');
        resetTemplateForm();
    });
    
    // 保存模板按钮
    document.getElementById('saveTemplateBtn').addEventListener('click', saveTemplate);
    
    // 表单提交事件
    document.getElementById('template-form').addEventListener('submit', function(e) {
        e.preventDefault();
        saveTemplate();
    });
    
    // 点击弹窗背景关闭
    document.getElementById('templateModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeTemplateModal();
        }
    });
    
    // ESC键关闭弹窗
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.getElementById('templateModal').style.display !== 'none') {
            closeTemplateModal();
        }
    });
}

/**
 * 打开模板弹窗
 */
function openTemplateModal(title) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('templateModal').style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 防止背景滚动
    clearTemplateFeedback();
}

/**
 * 关闭模板弹窗
 */
function closeTemplateModal() {
    document.getElementById('templateModal').style.display = 'none';
    document.body.style.overflow = ''; // 恢复滚动
    currentEditingTemplateId = null;
    clearTemplateFeedback();
}

/**
 * 重置模板表单
 */
function resetTemplateForm() {
    document.getElementById('templateName').value = '';
    document.getElementById('templateDescription').value = '';
    document.getElementById('templateCategory').value = 'analysis';
    document.getElementById('templateSystemPrompt').value = '';
    document.getElementById('templateIsDefault').checked = false;
    clearTemplateFeedback();
}

/**
 * 编辑模板
 */
function editTemplate(templateId) {
    fetch(`/api/prompt-templates/${templateId}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                const template = data.data;
                currentEditingTemplateId = templateId;
                
                // 填充表单
                document.getElementById('templateName').value = template.name;
                document.getElementById('templateDescription').value = template.description || '';
                document.getElementById('templateCategory').value = template.category;
                document.getElementById('templateSystemPrompt').value = template.system_prompt;
                document.getElementById('templateIsDefault').checked = template.is_default;
                
                openTemplateModal('编辑提示词模板');
            } else {
                showError('加载模板详情失败：' + (data.message || '未知错误'));
            }
        })
        .catch(err => {
            console.error('加载模板详情失败:', err);
            showError('加载模板详情失败，请重试');
        });
}

/**
 * 复制模板
 */
function duplicateTemplate(templateId) {
    fetch(`/api/prompt-templates/${templateId}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                const template = data.data;
                currentEditingTemplateId = null;
                
                // 填充表单，但修改名称
                document.getElementById('templateName').value = template.name + ' - 副本';
                document.getElementById('templateDescription').value = template.description || '';
                document.getElementById('templateCategory').value = template.category;
                document.getElementById('templateSystemPrompt').value = template.system_prompt;
                document.getElementById('templateIsDefault').checked = false; // 副本不设为默认
                
                openTemplateModal('复制提示词模板');
            } else {
                showError('加载模板详情失败：' + (data.message || '未知错误'));
            }
        })
        .catch(err => {
            console.error('加载模板详情失败:', err);
            showError('加载模板详情失败，请重试');
        });
}

/**
 * 删除模板
 */
function deleteTemplate(templateId) {
    if (!confirm('确定要删除这个模板吗？此操作不可撤销。')) {
        return;
    }
    
    fetch(`/api/prompt-templates/${templateId}`, {
        method: 'DELETE'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showSuccess('模板删除成功');
                loadPromptTemplates(); // 重新加载列表
            } else {
                showError('删除失败：' + (data.message || '未知错误'));
            }
        })
        .catch(err => {
            console.error('删除模板失败:', err);
            showError('删除失败，请重试');
        });
}

/**
 * 保存模板
 */
function saveTemplate() {
    const name = document.getElementById('templateName').value.trim();
    const description = document.getElementById('templateDescription').value.trim();
    const category = document.getElementById('templateCategory').value;
    const systemPrompt = document.getElementById('templateSystemPrompt').value.trim();
    const isDefault = document.getElementById('templateIsDefault').checked;
    
    // 验证必填字段
    if (!name) {
        showTemplateFeedback('请输入模板名称', 'error');
        return;
    }
    
    if (!systemPrompt) {
        showTemplateFeedback('请输入系统提示词', 'error');
        return;
    }
    
    const templateData = {
        name,
        description,
        category,
        system_prompt: systemPrompt,
        is_default: isDefault
    };
    
    const url = currentEditingTemplateId 
        ? `/api/prompt-templates/${currentEditingTemplateId}`
        : '/api/prompt-templates';
    const method = currentEditingTemplateId ? 'PUT' : 'POST';
    
    showTemplateFeedback('正在保存...', 'info');
    
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showTemplateFeedback('保存成功', 'success');
                setTimeout(() => {
                    closeTemplateModal();
                    loadPromptTemplates(); // 重新加载列表
                }, 1000);
            } else {
                showTemplateFeedback('保存失败：' + (data.message || '未知错误'), 'error');
            }
        })
        .catch(err => {
            console.error('保存模板失败:', err);
            showTemplateFeedback('保存失败，请重试', 'error');
        });
}

// ==================== 工具函数 ====================

// ==================== 工具函数 ====================

/**
 * HTML转义函数
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateString) {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 显示错误消息
 */
function showError(message) {
    console.error(message);
    alert('❌ ' + message);
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
    console.log(message);
    alert('✅ ' + message);
}

/**
 * 显示模板反馈消息
 */
function showTemplateFeedback(message, type = 'info') {
    const feedback = document.getElementById('templateFeedback');
    if (feedback) {
        feedback.textContent = message;
        feedback.className = `feedback ${type} show`;
        
        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                clearTemplateFeedback();
            }, 3000);
        }
    }
}

/**
 * 清除模板反馈消息
 */
function clearTemplateFeedback() {
    const feedback = document.getElementById('templateFeedback');
    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'feedback';
    }
}

// ==================== 全局函数 ====================

/**
 * 全局弹窗关闭函数（供HTML调用）
 */
window.closeTemplateModal = closeTemplateModal;