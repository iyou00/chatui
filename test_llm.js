/**
 * LLM服务测试脚本
 * 用于验证LLM API连接和分析功能
 */

const llmService = require('./services/llmService');
const logger = require('./utils/logger');

async function testLLMService() {
    try {
        logger.info('=== LLM服务测试开始 ===');
        
        // 测试数据：模拟少量聊天记录
        const testChatlogs = [
            {
                chatroom: "测试群聊",
                messages: [
                    {
                        sender: "张三",
                        content: "大家好，今天讨论一下项目进展",
                        timestamp: Date.now() - 3600000
                    },
                    {
                        sender: "李四",
                        content: "我这边已经完成了前端界面",
                        timestamp: Date.now() - 3000000
                    },
                    {
                        sender: "王五",
                        content: "后端API还需要两天时间",
                        timestamp: Date.now() - 1800000
                    }
                ]
            }
        ];
        
        const testPrompt = "请分析这个群聊的主要讨论内容";
        const testModel = "deepseek";
        
        logger.info(`测试模型: ${testModel}`);
        logger.info(`测试提示: ${testPrompt}`);
        logger.info(`测试数据: ${testChatlogs[0].messages.length}条消息`);
        
        // 调用LLM分析
        const result = await llmService.analyze(testChatlogs, testModel, testPrompt);
        
        logger.info('=== 测试结果 ===');
        logger.info(result);
        logger.info('=== LLM服务测试完成 ===');
        
        return true;
        
    } catch (error) {
        logger.error('LLM服务测试失败:', error);
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testLLMService().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = testLLMService; 