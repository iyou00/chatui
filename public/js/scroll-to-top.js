/**
 * 返回顶部功能
 * 提供平滑滚动到页面顶部的功能
 */

class ScrollToTop {
    constructor() {
        this.button = null;
        this.threshold = 300; // 显示按钮的滚动阈值
        this.init();
    }

    init() {
        this.createButton();
        this.bindEvents();
        this.handleScroll(); // 初始检查
    }

    createButton() {
        // 创建返回顶部按钮
        this.button = document.createElement('button');
        this.button.className = 'scroll-to-top';
        this.button.innerHTML = '↑';
        this.button.setAttribute('aria-label', '返回顶部');
        this.button.setAttribute('title', '返回顶部');
        
        // 添加样式
        this.addStyles();
        
        // 添加到页面
        document.body.appendChild(this.button);
    }

    addStyles() {
        // 如果样式还没有添加，则添加CSS样式
        if (!document.getElementById('scroll-to-top-styles')) {
            const style = document.createElement('style');
            style.id = 'scroll-to-top-styles';
            style.textContent = `
                .scroll-to-top {
                    position: fixed;
                    bottom: var(--spacing-6);
                    right: var(--spacing-6);
                    width: 48px;
                    height: 48px;
                    background-color: var(--color-primary);
                    color: var(--text-inverse);
                    border: none;
                    border-radius: var(--radius-full);
                    font-size: var(--font-size-lg);
                    font-weight: var(--font-weight-bold);
                    cursor: pointer;
                    box-shadow: var(--shadow-lg);
                    z-index: var(--z-fixed);
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(20px);
                    transition: all var(--transition-base);
                }

                .scroll-to-top:hover {
                    background-color: var(--color-primary-hover);
                    transform: translateY(0) scale(1.1);
                    box-shadow: var(--shadow-xl);
                }

                .scroll-to-top:focus {
                    outline: 2px solid var(--border-focus);
                    outline-offset: 2px;
                }

                .scroll-to-top.visible {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }

                .scroll-to-top:active {
                    transform: translateY(0) scale(0.95);
                }
            `;
            document.head.appendChild(style);
        }
    }

    bindEvents() {
        // 监听滚动事件
        window.addEventListener('scroll', this.throttle(this.handleScroll.bind(this), 100));
        
        // 监听按钮点击事件
        this.button.addEventListener('click', this.scrollToTop.bind(this));
    }

    handleScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > this.threshold) {
            this.showButton();
        } else {
            this.hideButton();
        }
    }

    showButton() {
        this.button.classList.add('visible');
    }

    hideButton() {
        this.button.classList.remove('visible');
    }

    scrollToTop() {
        // 平滑滚动到顶部
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    // 节流函数，优化滚动事件性能
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
}

// 初始化返回顶部功能
document.addEventListener('DOMContentLoaded', () => {
    window.scrollToTop = new ScrollToTop();
});