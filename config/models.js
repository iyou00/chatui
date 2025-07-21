/**
 * 大模型配置文件
 * 定义支持的各种大模型版本及其特性
 */

const MODEL_CONFIG = {
    // DeepSeek 系列
    'deepseek-chat': {
        provider: 'deepseek',
        name: 'DeepSeek Chat',
        description: '推荐模型，适合通用对话和分析任务',
        maxTokens: 4096,
        contextWindow: 64000,
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        recommended: ['通用分析', '文本理解', '对话生成', '内容分析']
    },
    'deepseek-reasoner': {
        provider: 'deepseek',
        name: 'DeepSeek Reasoner',
        description: '推理模型，适合复杂逻辑分析和推理任务',
        maxTokens: 4096,
        contextWindow: 64000,
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        recommended: ['逻辑推理', '复杂分析', '问题解决', '深度思考']
    },

    // Gemini 系列
    'gemini-2.5-pro': {
        provider: 'gemini',
        name: 'Gemini 2.5 Pro',
        description: '最新推荐模型，具备强大的多模态和推理能力',
        maxTokens: 8192,
        contextWindow: 1000000,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        recommended: ['专业分析', '长文本处理', '高质量输出', '多模态理解']
    },
    'gemini-2.0-flash': {
        provider: 'gemini',
        name: 'Gemini 2.0 Flash',
        description: '快速版本，响应速度快，适合实时应用',
        maxTokens: 8192,
        contextWindow: 1000000,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        recommended: ['快速分析', '实时处理', '高频调用', '响应式应用']
    },

    // Kimi 系列 (Moonshot)
    'kimi-k2-0711-preview': {
        provider: 'kimi',
        name: 'Kimi K2',
        description: '最新K2版本，具备强大的智能体能力和工具使用能力',
        maxTokens: 4096,
        contextWindow: 128000,
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        recommended: ['智能体任务', '工具调用', '复杂推理', '代码生成']
    }
};

/**
 * 获取模型配置
 * @param {string} modelId - 模型ID
 * @returns {object|null} 模型配置
 */
function getModelConfig(modelId) {
    return MODEL_CONFIG[modelId] || null;
}

/**
 * 获取所有模型
 * @returns {object} 所有模型配置
 */
function getAllModels() {
    return MODEL_CONFIG;
}

/**
 * 按提供商获取模型
 * @param {string} provider - 提供商名称
 * @returns {object} 该提供商的所有模型
 */
function getModelsByProvider(provider) {
    const models = {};
    for (const [modelId, config] of Object.entries(MODEL_CONFIG)) {
        if (config.provider === provider) {
            models[modelId] = config;
        }
    }
    return models;
}

/**
 * 获取推荐模型
 * @param {string} taskType - 任务类型
 * @returns {Array} 推荐的模型ID列表
 */
function getRecommendedModels(taskType) {
    const recommendations = [];
    for (const [modelId, config] of Object.entries(MODEL_CONFIG)) {
        if (config.recommended.some(rec => rec.includes(taskType))) {
            recommendations.push(modelId);
        }
    }
    return recommendations;
}

module.exports = {
    MODEL_CONFIG,
    getModelConfig,
    getAllModels,
    getModelsByProvider,
    getRecommendedModels
}; 