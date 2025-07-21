/**
 * 导航管理系统
 * 处理导航高亮、面包屑导航等功能
 */

class NavigationManager {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.init();
    }

    init() {
        this.updateActiveNavigation();
        this.createBreadcrumb();
        this.bindNavigationEvents();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('/tasks')) return 'tasks';
        if (path.includes('/reports')) return 'reports';
        if (path.includes('/prompt-templates')) return 'prompt-templates';
        if (path.includes('/settings')) return 'settings';
        return 'tasks'; // 默认
    }

    updateActiveNavigation() {
        // 移除所有活动状态
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // 添加当前页面的活动状态
        const currentLink = document.querySelector(`.nav-link[href*="${this.currentPage}"]`);
        if (currentLink) {
            currentLink.classList.add('active');
        }
    }

    createBreadcrumb() {
        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        if (!breadcrumbContainer) {
            // 如果没有面包屑容器，创建一个
            this.insertBreadcrumbContainer();
        }

        const breadcrumb = this.generateBreadcrumb();
        const container = document.querySelector('.breadcrumb-container');
        if (container && breadcrumb) {
            container.innerHTML = breadcrumb;
        }
    }

    insertBreadcrumbContainer() {
        const mainContent = document.querySelector('.task-list-container, .reports-container, .settings-container');
        if (mainContent) {
            const breadcrumbHtml = '<nav class="breadcrumb-container" aria-label="面包屑导航"></nav>';
            mainContent.insertAdjacentHTML('afterbegin', breadcrumbHtml);
        }
    }

    generateBreadcrumb() {
        const breadcrumbs = {
            'tasks': [
                { name: '首页', url: '/' },
                { name: '任务管理', url: '/tasks', active: true }
            ],
            'reports': [
                { name: '首页', url: '/' },
                { name: '报告中心', url: '/reports', active: true }
            ],
            'prompt-templates': [
                { name: '首页', url: '/' },
                { name: '提示词管理', url: '/prompt-templates', active: true }
            ],
            'settings': [
                { name: '首页', url: '/' },
                { name: '系统设置', url: '/settings', active: true }
            ]
        };

        const currentBreadcrumb = breadcrumbs[this.currentPage];
        if (!currentBreadcrumb) return '';

        const breadcrumbItems = currentBreadcrumb.map((item, index) => {
            if (item.active) {
                return `<span class="breadcrumb-item active" aria-current="page">${item.name}</span>`;
            } else {
                return `<a href="${item.url}" class="breadcrumb-item">${item.name}</a>`;
            }
        }).join('<span class="breadcrumb-separator">›</span>');

        return `<ol class="breadcrumb">${breadcrumbItems}</ol>`;
    }

    bindNavigationEvents() {
        // 为导航链接添加点击事件
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                // 添加点击效果
                link.style.transform = 'translateY(1px)';
                setTimeout(() => {
                    link.style.transform = '';
                }, 150);
            });
        });

        // 为面包屑链接添加点击事件
        document.addEventListener('click', (e) => {
            if (e.target.matches('.breadcrumb-item:not(.active)')) {
                e.target.style.transform = 'translateY(1px)';
                setTimeout(() => {
                    e.target.style.transform = '';
                }, 150);
            }
        });
    }

    // 添加导航样式
    addNavigationStyles() {
        if (!document.getElementById('navigation-styles')) {
            const style = document.createElement('style');
            style.id = 'navigation-styles';
            style.textContent = `
                .breadcrumb-container {
                    margin-bottom: var(--spacing-6);
                    padding: var(--spacing-4) 0;
                    border-bottom: 1px solid var(--border-secondary);
                }

                .breadcrumb {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-2);
                    margin: 0;
                    padding: 0;
                    list-style: none;
                    font-size: var(--font-size-sm);
                }

                .breadcrumb-item {
                    color: var(--text-secondary);
                    text-decoration: none;
                    transition: all var(--transition-fast);
                }

                .breadcrumb-item:not(.active):hover {
                    color: var(--color-primary);
                    text-decoration: underline;
                }

                .breadcrumb-item.active {
                    color: var(--text-primary);
                    font-weight: var(--font-weight-medium);
                }

                .breadcrumb-separator {
                    color: var(--text-tertiary);
                    font-size: var(--font-size-xs);
                    user-select: none;
                }

                /* 增强导航栏视觉效果 */
                .nav-link {
                    position: relative;
                    overflow: hidden;
                }

                .nav-link::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left var(--transition-base);
                }

                .nav-link:hover::before {
                    left: 100%;
                }

                .nav-link:focus {
                    outline: 2px solid var(--border-focus);
                    outline-offset: 2px;
                    border-radius: var(--radius-sm);
                }

                /* 导航栏阴影增强 */
                .main-nav {
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }

                /* 导航品牌悬停效果 */
                .nav-brand h2 {
                    transition: all var(--transition-fast);
                    cursor: pointer;
                }

                .nav-brand h2:hover {
                    transform: scale(1.02);
                    text-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// 初始化导航管理器
document.addEventListener('DOMContentLoaded', () => {
    const navManager = new NavigationManager();
    navManager.addNavigationStyles();
    window.navigationManager = navManager;
});