/**
 * 测试配置文件验证逻辑
 * 验证修改后的validateConfig方法是否正确处理API密钥检查
 */

const settingsManager = require('./services/settingsManager');

console.log('🧪 测试配置文件验证逻辑...\n');

// 测试用例1：当前配置（所有API密钥为空）
console.log('📋 测试用例1：当前配置（所有API密钥为空）');
const currentConfig = {
    chatlogUrl: "http://127.0.0.1:5030",
    llmApiKeys: {
        deepseek: "",
        gemini: "",
        kimi: ""
    },
    isFirstRun: false,
    nextTemplateId: 6,
    nextTaskId: 2,
    nextReportId: 1
};

console.log('配置:', JSON.stringify(currentConfig, null, 2));
console.log('validateConfig结果:', settingsManager.validateConfig(currentConfig));
console.log('isFirstRun结果:', settingsManager.isFirstRun());
console.log('');

// 测试用例2：只有一个API密钥
console.log('📋 测试用例2：只有一个API密钥（deepseek）');
const configWithOneKey = {
    ...currentConfig,
    llmApiKeys: {
        deepseek: "sk-test-key-123",
        gemini: "",
        kimi: ""
    }
};

console.log('配置:', JSON.stringify(configWithOneKey, null, 2));
console.log('validateConfig结果:', settingsManager.validateConfig(configWithOneKey));
console.log('isFirstRun结果:', settingsManager.isFirstRun());
console.log('');

// 测试用例3：两个API密钥
console.log('📋 测试用例3：两个API密钥（deepseek + gemini）');
const configWithTwoKeys = {
    ...currentConfig,
    llmApiKeys: {
        deepseek: "sk-test-key-123",
        gemini: "gemini-test-key-456",
        kimi: ""
    }
};

console.log('配置:', JSON.stringify(configWithTwoKeys, null, 2));
console.log('validateConfig结果:', settingsManager.validateConfig(configWithTwoKeys));
console.log('isFirstRun结果:', settingsManager.isFirstRun());
console.log('');

// 测试用例4：所有API密钥都有值
console.log('📋 测试用例4：所有API密钥都有值');
const configWithAllKeys = {
    ...currentConfig,
    llmApiKeys: {
        deepseek: "sk-test-key-123",
        gemini: "gemini-test-key-456",
        kimi: "kimi-test-key-789"
    }
};

console.log('配置:', JSON.stringify(configWithAllKeys, null, 2));
console.log('validateConfig结果:', settingsManager.validateConfig(configWithAllKeys));
console.log('isFirstRun结果:', settingsManager.isFirstRun());
console.log('');

// 测试用例5：缺少chatlogUrl
console.log('📋 测试用例5：缺少chatlogUrl');
const configWithoutChatlog = {
    llmApiKeys: {
        deepseek: "sk-test-key-123",
        gemini: "",
        kimi: ""
    }
};

console.log('配置:', JSON.stringify(configWithoutChatlog, null, 2));
console.log('validateConfig结果:', settingsManager.validateConfig(configWithoutChatlog));
console.log('isFirstRun结果:', settingsManager.isFirstRun());
console.log('');

console.log('✅ 测试完成！');
console.log('\n📝 总结：');
console.log('- 修改前：需要所有API密钥都填写才认为配置完整');
console.log('- 修改后：只要至少有一个API密钥填写就认为配置完整');
console.log('- 这样用户可以选择性地填写需要的API密钥，更加灵活'); 