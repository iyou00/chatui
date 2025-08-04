/*
settingsManager.js

本模块负责平台配置项的加载、保存、首次运行判断等功能。
所有配置项持久化于 data/config.json，支持首次运行检测和配置校验。
*/

const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../data/config.json');

// 默认配置结构
const DEFAULT_CONFIG = {
    isFirstRun: true,
    chatlogUrl: '',
    llmApiKeys: {
        deepseek: '',
        gemini: '',
        kimi: ''
    }
};

/**
 * 加载配置文件，如不存在则自动创建默认配置。
 * @returns {Object} 当前配置对象
 */
function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
    }
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        // 读取或解析失败时恢复默认配置
        saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * 保存配置到文件（智能合并，保护系统字段）
 * @param {Object} config - 要保存的配置对象
 */
function saveConfig(config) {
    try {
        // 加载现有配置
        const existingConfig = loadConfig();
        
        // 定义系统保护字段（不应被用户配置覆盖）
        const systemFields = ['nextTaskId', 'nextReportId', 'nextTemplateId'];
        
        // 智能合并配置
        const mergedConfig = {
            ...existingConfig,  // 保留现有配置
            ...config           // 覆盖用户提交的配置
        };
        
        // 保护系统字段：如果用户配置中没有这些字段，保留原有值
        systemFields.forEach(field => {
            if (existingConfig[field] !== undefined && config[field] === undefined) {
                mergedConfig[field] = existingConfig[field];
            }
        });
        
        // 确保系统字段的最小值（防止被重置为0或null）
        mergedConfig.nextTaskId = Math.max(mergedConfig.nextTaskId || 1, 1);
        mergedConfig.nextReportId = Math.max(mergedConfig.nextReportId || 1, 1);
        mergedConfig.nextTemplateId = Math.max(mergedConfig.nextTemplateId || 7, 7);
        
        // 写入文件
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf-8');
        
        console.log('配置保存成功，已保护系统字段:', systemFields);
        
    } catch (error) {
        console.error('保存配置失败:', error);
        throw error;
    }
}

/**
 * 判断是否首次运行（根据isFirstRun标志或配置完整性）。
 * @returns {boolean} 是否首次运行
 */
function isFirstRun() {
    const config = loadConfig();
    return config.isFirstRun || !validateConfig(config);
}

/**
 * 设置首次运行标志位。
 * @param {boolean} flag - 是否首次运行
 */
function setFirstRunFlag(flag) {
    const config = loadConfig();
    config.isFirstRun = !!flag;
    saveConfig(config);
}

/**
 * 校验配置完整性（增强版）
 * @param {Object} config - 配置对象
 * @returns {boolean} 配置是否完整
 */
function validateConfig(config) {
    if (!config) {
        console.log('配置验证失败: 配置对象为空');
        return false;
    }
    
    if (!config.chatlogUrl) {
        console.log('配置验证失败: ChatLog服务地址未配置');
        return false;
    }
    
    if (!config.llmApiKeys) {
        console.log('配置验证失败: LLM API密钥配置缺失');
        return false;
    }
    
    // 检查是否至少有一个API密钥填写
    const hasValidApiKey = ['deepseek', 'gemini', 'kimi'].some(key => 
        typeof config.llmApiKeys[key] === 'string' && 
        config.llmApiKeys[key].length > 0
    );
    
    if (!hasValidApiKey) {
        console.log('配置验证失败: 至少需要配置一个LLM API密钥');
        return false;
    }
    
    console.log('配置验证通过');
    return true;
}

/**
 * 获取配置完整性报告
 * @param {Object} config - 配置对象
 * @returns {Object} 完整性报告
 */
function getConfigIntegrityReport(config) {
    const report = {
        isValid: true,
        issues: [],
        systemFields: {},
        userFields: {}
    };
    
    if (!config) {
        report.isValid = false;
        report.issues.push('配置对象为空');
        return report;
    }
    
    // 检查用户配置字段
    if (!config.chatlogUrl) {
        report.isValid = false;
        report.issues.push('ChatLog服务地址未配置');
    } else {
        report.userFields.chatlogUrl = '✓';
    }
    
    if (!config.llmApiKeys) {
        report.isValid = false;
        report.issues.push('LLM API密钥配置缺失');
    } else {
        const apiKeys = ['deepseek', 'gemini', 'kimi'];
        const configuredKeys = apiKeys.filter(key => 
            config.llmApiKeys[key] && config.llmApiKeys[key].length > 0
        );
        
        if (configuredKeys.length === 0) {
            report.isValid = false;
            report.issues.push('至少需要配置一个LLM API密钥');
        } else {
            report.userFields.llmApiKeys = `✓ (${configuredKeys.join(', ')})`;
        }
    }
    
    // 检查系统字段
    const systemFields = ['nextTaskId', 'nextReportId', 'nextTemplateId'];
    systemFields.forEach(field => {
        if (config[field] !== undefined) {
            report.systemFields[field] = config[field];
        } else {
            report.issues.push(`系统字段 ${field} 缺失`);
        }
    });
    
    // 检查首次运行标志
    if (config.isFirstRun !== undefined) {
        report.systemFields.isFirstRun = config.isFirstRun;
    }
    
    return report;
}

module.exports = {
    loadConfig,
    saveConfig,
    isFirstRun,
    setFirstRunFlag,
    validateConfig,
    getConfigIntegrityReport
}; 