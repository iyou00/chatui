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
 * 保存配置到文件。
 * @param {Object} config - 要保存的配置对象
 */
function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
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
 * 校验配置完整性。
 * @param {Object} config - 配置对象
 * @returns {boolean} 配置是否完整
 */
function validateConfig(config) {
    if (!config) return false;
    if (!config.chatlogUrl) return false;
    if (!config.llmApiKeys) return false;
    
    // 检查是否至少有一个API密钥填写
    const hasValidApiKey = ['deepseek', 'gemini', 'kimi'].some(key => 
        typeof config.llmApiKeys[key] === 'string' && 
        config.llmApiKeys[key].length > 0
    );
    
    return hasValidApiKey;
}

module.exports = {
    loadConfig,
    saveConfig,
    isFirstRun,
    setFirstRunFlag,
    validateConfig
}; 