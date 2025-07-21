/**
 * UI管理器
 * 统一管理加载状态、通知、模态框等UI交互
 */

class UIManager {
    constructor() {
        this.toasts = [];
        this.modals = [];
        this.loadingStates = new Set();
        this.init();
    }

    init() {
        this.createToastContainer();
        this.bindGlobalEvents();
    }

    // ==================== 通知系统 ====================

    createToastContainer() {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    showToast(message, type = 'info', duration = 5000) {
        const toast = this.createToast(message, type);
        const container = document.getElementById('toast-container');
        
        container.appendChild(toast);
        this.toasts.push(toast);

        // 触发显示动画
        setTimeout(() => toast.classList.add('show'), 10);

        // 自动移除
        if (duration > 0) {
            setTimeout(() => this.removeToast(toast), duration);
        }

        return toast;
    }

    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: '✅',
            warning: '⚠️',
            danger: '❌',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="关闭通知">×</button>
        `;

        // 绑定关闭事件
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.removeToast(toast);
        });

        return toast;
    }

    removeToast(toast) {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 300);
    }

    // 便捷方法
    showSuccess(message, duration) {
        return this.showToast(message, 'success', duration);
    }

    showError(message, duration) {
        return this.showToast(message, 'danger', duration);
    }

    showWarning(message, duration) {
        return this.showToast(message, 'warning', duration);
    }

    showInfo(message, duration) {
        return this.showToast(message, 'info', duration);
    }

    // ==================== 加载状态管理 ====================

    showLoading(target, text = '加载中...') {
        if (typeof target === 'string') {
            target = document.querySelector(target);
        }

        if (!target) return;

        const loadingId = this.generateId();
        this.loadingStates.add(loadingId);

        // 如果是按钮，使用按钮加载状态
        if (target.tagName === 'BUTTON') {
            this.showButtonLoading(target, text);
        } else {
            this.showElementLoading(target, text);
        }

        return loadingId;
    }

    showButtonLoading(button, text) {
        button.setAttribute('data-loading', 'true');
        button.disabled = true;

        // 如果没有加载器元素，创建一个
        if (!button.querySelector('.btn-loader')) {
            const loader = document.createElement('span');
            loader.className = 'btn-loader';
            loader.innerHTML = `
                <div class="spinner spinner-sm"></div>
                ${text}
            `;
            button.appendChild(loader);
        }
    }

    showElementLoading(element, text) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <div class="loading-text">${text}</div>
            </div>
        `;

        element.style.position = 'relative';
        element.appendChild(overlay);
    }

    hideLoading(target, loadingId) {
        if (loadingId && !this.loadingStates.has(loadingId)) {
            return; // 已经被移除
        }

        if (typeof target === 'string') {
            target = document.querySelector(target);
        }

        if (!target) return;

        if (target.tagName === 'BUTTON') {
            this.hideButtonLoading(target);
        } else {
            this.hideElementLoading(target);
        }

        if (loadingId) {
            this.loadingStates.delete(loadingId);
        }
    }

    hideButtonLoading(button) {
        button.setAttribute('data-loading', 'false');
        button.disabled = false;
    }

    hideElementLoading(element) {
        const overlay = element.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // ==================== 模态框管理 ====================

    showModal(content, options = {}) {
        const modal = this.createModal(content, options);
        document.body.appendChild(modal);
        this.modals.push(modal);

        // 触发显示动画
        setTimeout(() => modal.classList.add('show'), 10);

        // 绑定关闭事件
        this.bindModalEvents(modal);

        return modal;
    }

    createModal(content, options) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        
        const modalContent = `
            <div class="modal">
                ${options.header ? `
                    <div class="modal-header">
                        <h3>${options.header}</h3>
                    </div>
                ` : ''}
                <div class="modal-body">
                    ${content}
                </div>
                ${options.footer ? `
                    <div class="modal-footer">
                        ${options.footer}
                    </div>
                ` : ''}
            </div>
        `;

        modal.innerHTML = modalContent;
        return modal;
    }

    bindModalEvents(modal) {
        // 点击遮罩关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });

        // ESC键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal(modal);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    closeModal(modal) {
        modal.classList.add('closing');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            const index = this.modals.indexOf(modal);
            if (index > -1) {
                this.modals.splice(index, 1);
            }
        }, 200);
    }

    // 确认对话框
    showConfirm(message, options = {}) {
        return new Promise((resolve) => {
            const footer = `
                <button class="btn btn-secondary" data-action="cancel">
                    ${options.cancelText || '取消'}
                </button>
                <button class="btn btn-danger" data-action="confirm">
                    ${options.confirmText || '确认'}
                </button>
            `;

            const modal = this.showModal(message, {
                header: options.title || '确认操作',
                footer: footer
            });

            // 绑定按钮事件
            modal.addEventListener('click', (e) => {
                if (e.target.dataset.action === 'confirm') {
                    resolve(true);
                    this.closeModal(modal);
                } else if (e.target.dataset.action === 'cancel') {
                    resolve(false);
                    this.closeModal(modal);
                }
            });
        });
    }

    // ==================== 工具方法 ====================

    generateId() {
        return 'ui_' + Math.random().toString(36).substr(2, 9);
    }

    bindGlobalEvents() {
        // 添加必要的CSS样式
        this.addGlobalStyles();
    }

    addGlobalStyles() {
        if (!document.getElementById('ui-manager-styles')) {
            const style = document.createElement('style');
            style.id = 'ui-manager-styles';
            style.textContent = `
                .toast.show {
                    animation: slideInRight 0.3s ease-out;
                }

                .toast.removing {
                    animation: slideOutRight 0.3s ease-in;
                }

                .modal-overlay.show {
                    animation: fadeIn 0.2s ease-out;
                }

                .modal-overlay.show .modal {
                    animation: scaleIn 0.2s ease-out;
                }

                .modal-overlay.closing {
                    animation: fadeOut 0.2s ease-in;
                }

                .loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: var(--bg-overlay);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: var(--z-modal);
                }

                .loading-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-3);
                    padding: var(--spacing-6);
                    background-color: var(--bg-primary);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-lg);
                }

                .loading-text {
                    font-size: var(--font-size-sm);
                    color: var(--text-secondary);
                }

                @keyframes slideOutRight {
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }

                @keyframes fadeOut {
                    to { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// 创建全局UI管理器实例
window.uiManager = new UIManager();

// 导出便捷方法到全局
window.showToast = (message, type, duration) => window.uiManager.showToast(message, type, duration);
window.showSuccess = (message, duration) => window.uiManager.showSuccess(message, duration);
window.showError = (message, duration) => window.uiManager.showError(message, duration);
window.showWarning = (message, duration) => window.uiManager.showWarning(message, duration);
window.showInfo = (message, duration) => window.uiManager.showInfo(message, duration);
window.showConfirm = (message, options) => window.uiManager.showConfirm(message, options);
window.showLoading = (target, text) => window.uiManager.showLoading(target, text);
window.hideLoading = (target, loadingId) => window.uiManager.hideLoading(target, loadingId);