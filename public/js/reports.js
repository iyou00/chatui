/**
 * 报告历史页面脚本
 * 功能：报告列表展示、筛选、分页、操作
 * 增强功能：支持按群聊分别显示报告
 */

class ReportsManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalCount = 0;
        this.filters = {};
        this.reports = [];
        
        this.initElements();
        this.bindEvents();
        this.loadReports();
    }

    initElements() {
        // 表格相关
        this.reportTbody = document.getElementById('report-tbody');
        this.emptyState = document.getElementById('empty-state');
        this.pagination = document.getElementById('pagination');
        

        
        // 筛选相关
        this.filterTask = document.getElementById('filter-task');
        this.filterChatroom = document.getElementById('filter-chatroom');
        this.filterStatus = document.getElementById('filter-status');
        this.filterStart = document.getElementById('filter-start');
        this.filterEnd = document.getElementById('filter-end');
        this.btnFilter = document.getElementById('btn-filter');
        this.btnClearFilter = document.getElementById('btn-clear-filter');
    }

    bindEvents() {
        // 筛选按钮
        this.btnFilter.addEventListener('click', () => this.applyFilters());
        this.btnClearFilter.addEventListener('click', () => this.clearFilters());
        
        // 回车键筛选
        [this.filterTask, this.filterChatroom].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.applyFilters();
            });
        });
        
        // 选择框变化时自动筛选
        this.filterStatus.addEventListener('change', () => this.applyFilters());
    }

    async loadReports(page = 1) {
        try {
            this.showLoading();
            
            const params = new URLSearchParams({
                page: page,
                limit: this.pageSize,
                ...this.filters
            });
            
            console.log('正在加载报告，参数:', params.toString());
            
            const response = await fetch(`/api/reports?${params}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('API响应状态:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('API响应数据:', data);
            
            if (data.success) {
                // API返回的数据结构是 data.data，其中包含 reports 和 total
                const responseData = data.data || {};
                this.reports = responseData.reports || [];
                this.totalCount = responseData.total || 0;
                this.currentPage = page;
                
                console.log('加载的报告数量:', this.reports.length);
                
                this.renderReports();
                this.renderPagination();
            } else {
                this.showError('加载报告列表失败: ' + data.message);
            }
        } catch (error) {
            console.error('加载报告失败:', error);
            this.showError('网络错误，请稍后重试: ' + error.message);
        }
    }

    renderReports() {
        if (!this.reports || this.reports.length === 0) {
            this.showEmpty();
            return;
        }
        
        this.hideEmpty();
        
        this.reportTbody.innerHTML = this.reports.map(report => {
            return this.createReportRow(report);
        }).join('');
        
        // 绑定操作按钮事件
        this.bindActionEvents();
    }

    createReportRow(report) {
        const statusClass = this.getStatusClass(report.status);
        const statusText = this.getStatusText(report.status);
        const chatroomDisplay = this.getChatroomDisplay(report);
        const messageCountDisplay = this.getMessageCountDisplay(report);
        const typeDisplay = this.getTypeDisplay(report);
        
        return `
            <tr data-report-id="${report.id}">
                <td>
                    <div class="task-name" title="${report.task_name}">
                        ${report.task_name}
                    </div>
                    ${typeDisplay}
                </td>
                <td>
                    <div class="${report.is_summary ? 'chatroom-name summary' : 'chatroom-name'}" 
                         title="${chatroomDisplay}">
                        ${chatroomDisplay}
                    </div>
                </td>
                <td>
                    <div class="message-count">
                        ${messageCountDisplay}
                    </div>
                </td>
                <td>
                    ${this.formatDateTime(report.execution_time)}
                </td>
                <td>
                    <span class="status ${statusClass}">${statusText}</span>
                </td>
                <td>
                    <div class="action-buttons">
                        ${this.createActionButtons(report)}
                    </div>
                </td>
            </tr>
        `;
    }

    getChatroomDisplay(report) {
        if (report.is_summary) {
            return '📋 执行摘要';
        }
        return report.chatroom_name || '未知群聊';
    }

    getMessageCountDisplay(report) {
        if (report.is_summary) {
            return '-';
        }
        return `<span class="number">${report.message_count || 0}</span> 条`;
    }

    getTypeDisplay(report) {
        if (report.is_summary) {
            return '<div class="report-type-badge report-type-summary">📋 摘要</div>';
        }
        return '<div class="report-type-badge report-type-chatroom">📱 群聊</div>';
    }

    getStatusClass(status) {
        const statusMap = {
            'success': 'success',
            'failed': 'failed',
            'processing': 'processing'
        };
        return statusMap[status] || 'processing';
    }

    getStatusText(status) {
        const statusMap = {
            'success': '🟢 成功',
            'failed': '🔴 失败',
            'processing': '🟡 处理中'
        };
        return statusMap[status] || '未知';
    }

    createActionButtons(report) {
        const buttons = [];
        
        if (report.status === 'success' && report.report_file) {
            // 查看报告
            buttons.push(`
                <a href="/api/reports/${report.id}/view" 
                   target="_blank" 
                   class="btn-action btn-view"
                   title="查看报告">
                    👀 查看
                </a>
            `);
            
            // 下载报告
            buttons.push(`
                <a href="/api/reports/${report.id}/download" 
                   class="btn-action btn-download"
                   title="下载报告"
                   download>
                    ⬇️ 下载
                </a>
            `);
            
            // 导出聊天记录
            buttons.push(`
                <button class="btn-action btn-export" 
                        data-action="export" 
                        data-report-id="${report.id}"
                        data-chatroom-name="${report.chatroom_name || ''}"
                        title="导出聊天记录">
                    📄 导出
                </button>
            `);
        }
        
        // 删除报告
        buttons.push(`
            <button class="btn-action btn-delete" 
                    data-action="delete" 
                    data-report-id="${report.id}"
                    title="删除报告">
                🗑️ 删除
            </button>
        `);
        
        return buttons.join('');
    }

    bindActionEvents() {
        // 删除按钮事件
        this.reportTbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reportId = e.target.dataset.reportId;
                this.deleteReport(reportId);
            });
        });
        
        // 导出按钮事件
        this.reportTbody.querySelectorAll('[data-action="export"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reportId = e.target.dataset.reportId;
                const chatroomName = e.target.dataset.chatroomName;
                this.exportChatlogs([reportId], [chatroomName]);
            });
        });
    }

    async deleteReport(reportId) {
        if (!confirm('确定要删除这个报告吗？此操作不可恢复。')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/reports/${reportId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('报告删除成功', 'success');
                this.loadReports(this.currentPage);
            } else {
                showNotification('删除失败: ' + data.message, 'error');
            }
        } catch (error) {
            console.error('删除报告失败:', error);
            showNotification('网络错误，请稍后重试', 'error');
        }
    }

    async exportChatlogs(reportIds, chatroomNames) {
        try {
            // 显示导出提示
            if (reportIds.length > 1) {
                showNotification(`正在导出 ${reportIds.length} 个群聊的聊天记录...`, 'info');
            } else {
                showNotification('正在导出聊天记录...', 'info');
            }
            
            const response = await fetch('/api/export-chatlogs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reportIds: reportIds,
                    exportType: 'txt'
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '导出失败');
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/zip')) {
                // 多文件，下载zip
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `群聊消息导出_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showNotification('聊天记录导出成功！', 'success');
            } else {
                // 单文件，直接下载
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const chatroomName = chatroomNames[0] || '未知群聊';
                a.download = `${chatroomName}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showNotification('聊天记录导出成功！', 'success');
            }
            
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            showNotification('导出失败: ' + error.message, 'error');
        }
    }

    applyFilters() {
        this.filters = {};
        
        // 任务名筛选
        const taskName = this.filterTask.value.trim();
        if (taskName) {
            this.filters.task_name = taskName;
        }
        
        // 群聊名筛选
        const chatroomName = this.filterChatroom.value.trim();
        if (chatroomName) {
            this.filters.chatroom_name = chatroomName;
        }
        
        // 状态筛选
        const status = this.filterStatus.value;
        if (status) {
            this.filters.status = status;
        }
        

        
        // 时间范围筛选
        const startDate = this.filterStart.value;
        const endDate = this.filterEnd.value;
        if (startDate) {
            this.filters.start_date = startDate;
        }
        if (endDate) {
            this.filters.end_date = endDate;
        }
        
        // 重新加载第一页
        this.loadReports(1);
    }

    clearFilters() {
        // 清空输入框
        this.filterTask.value = '';
        this.filterChatroom.value = '';
        this.filterStatus.value = '';
        this.filterStart.value = '';
        this.filterEnd.value = '';
        
        // 清空筛选条件
        this.filters = {};
        
        // 重新加载
        this.loadReports(1);
    }

    renderPagination() {
        const totalPages = Math.ceil(this.totalCount / this.pageSize);
        
        if (totalPages <= 1) {
            this.pagination.innerHTML = '';
            return;
        }
        
        let paginationHtml = '';
        
        // 上一页
        paginationHtml += `
            <button ${this.currentPage === 1 ? 'disabled' : ''} 
                    onclick="reportsManager.loadReports(${this.currentPage - 1})">
                ← 上一页
            </button>
        `;
        
        // 页码
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        if (startPage > 1) {
            paginationHtml += `<button onclick="reportsManager.loadReports(1)">1</button>`;
            if (startPage > 2) {
                paginationHtml += `<span>...</span>`;
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="${i === this.currentPage ? 'current-page' : ''}" 
                        onclick="reportsManager.loadReports(${i})">
                    ${i}
                </button>
            `;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHtml += `<span>...</span>`;
            }
            paginationHtml += `<button onclick="reportsManager.loadReports(${totalPages})">${totalPages}</button>`;
        }
        
        // 下一页
        paginationHtml += `
            <button ${this.currentPage === totalPages ? 'disabled' : ''} 
                    onclick="reportsManager.loadReports(${this.currentPage + 1})">
                下一页 →
            </button>
        `;
        
        this.pagination.innerHTML = paginationHtml;
    }



    showLoading() {
        this.reportTbody.innerHTML = '<tr><td colspan="6" class="loading">加载中...</td></tr>';
    }

    showEmpty() {
        this.reportTbody.innerHTML = '';
        this.emptyState.style.display = 'block';
        this.pagination.innerHTML = '';
    }

    hideEmpty() {
        this.emptyState.style.display = 'none';
    }

    showError(message) {
        this.reportTbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #c62828; padding: 40px;">
                    ❌ ${message}
                </td>
            </tr>
        `;
    }

    formatDateTime(dateTimeStr) {
        try {
            const date = new Date(dateTimeStr);
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            return '无效时间';
        }
    }
}

// 全局实例
let reportsManager;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    reportsManager = new ReportsManager();
});

// 导出到全局作用域供HTML使用
window.reportsManager = reportsManager; 