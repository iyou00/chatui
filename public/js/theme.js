/**
 * 主题管理系统
 * 支持明暗主题切换和用户偏好保存
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.init();
    }

    init() {
        // 从本地存储加载主题偏好
        this.loadThemePreference();
        
        // 应用主题
        this.applyTheme(this.currentTheme);
        
        // 绑定主题切换按钮事件
        this.bindThemeToggle();
        
        // 监听系统主题变化
        this.watchSystemTheme();
    }

    loadThemePreference() {
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme) {
            this.currentTheme = savedTheme;
        } else if (systemPrefersDark) {
            this.currentTheme = 'dark';
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        
        // 更新主题切换按钮图标
        this.updateThemeToggleIcon();
        
        // 保存到本地存储
        localStorage.setItem('theme', theme);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }

    updateThemeToggleIcon() {
        const toggleButtons = document.querySelectorAll('.theme-toggle');
        const icon = this.currentTheme === 'light' ? '🌙' : '☀️';
        const title = this.currentTheme === 'light' ? '切换到深色模式' : '切换到浅色模式';
        
        toggleButtons.forEach(button => {
            button.textContent = icon;
            button.setAttribute('title', title);
            button.setAttribute('aria-label', title);
        });
    }

    bindThemeToggle() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.theme-toggle')) {
                this.toggleTheme();
            }
        });
    }

    watchSystemTheme() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // 只有在用户没有手动设置主题时才跟随系统
            if (!localStorage.getItem('theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
}

// 初始化主题管理器
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
});