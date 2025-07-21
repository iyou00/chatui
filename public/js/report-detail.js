// report-detail.js
// 报告详情页前端逻辑，实现报告详情加载、元数据渲染、预览、下载、失败原因展示

/**
 * 工具函数：格式化时间
 */
function formatTime(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return d.toLocaleString();
}

/**
 * 渲染报告元数据
 */
function renderReportMeta(report) {
    const metaDiv = document.getElementById('report-meta');
    let html = `<ul>`;
    html += `<li><b>任务名称：</b>${report.task_name || '-'}</li>`;
    html += `<li><b>执行时间：</b>${formatTime(report.execution_time)}</li>`;
    html += `<li><b>状态：</b><span class="status ${report.status}">${report.status === 'success' ? '成功' : report.status === 'failed' ? '失败' : '处理中'}</span></li>`;
    if (report.status === 'failed' && report.error_message) {
        html += `<li><b>失败原因：</b><span class="fail-reason">${report.error_message}</span></li>`;
    }
    html += `</ul>`;
    metaDiv.innerHTML = html;
}

/**
 * 渲染操作按钮
 */
function renderActions(report) {
    const actionsDiv = document.getElementById('report-actions');
    let html = '';
    if (report.status === 'success') {
        html += `<a href="/api/reports/${report.id}/preview" target="_blank" class="btn-preview">在线预览</a>`;
        html += `<a href="/api/reports/${report.id}/download" class="btn-download">下载报告</a>`;
        html += `<button id="btn-load-preview" class="btn-load-preview">在本页预览</button>`;
    }
    actionsDiv.innerHTML = html;
    if (report.status === 'success') {
        document.getElementById('btn-load-preview').onclick = function () {
            loadReportPreview(report.id);
        };
    }
}

/**
 * 加载报告HTML内容并在本页预览
 */
function loadReportPreview(reportId) {
    const previewDiv = document.getElementById('report-preview');
    previewDiv.innerHTML = '加载中...';
    fetch(`/api/reports/${reportId}/preview`)
        .then(res => res.text())
        .then(html => {
            previewDiv.innerHTML = html;
        })
        .catch(() => {
            previewDiv.innerHTML = '<span class="fail-reason">报告预览加载失败</span>';
        });
}

/**
 * 加载报告详情
 */
function loadReportDetail() {
    const feedback = document.getElementById('report-feedback');
    feedback.textContent = '';
    if (!window.REPORT_ID) {
        feedback.textContent = '报告ID无效';
        feedback.className = 'feedback error';
        return;
    }
    fetch(`/api/reports/${window.REPORT_ID}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                renderReportMeta(data.data);
                renderActions(data.data);
            } else {
                feedback.textContent = data.message || '加载失败';
                feedback.className = 'feedback error';
            }
        });
}

// 页面加载时自动加载详情
window.addEventListener('DOMContentLoaded', loadReportDetail); 