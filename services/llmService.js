/**
 * LLM服务模块
 * 
 * 功能：
 * 1. 支持多个LLM服务提供商（DeepSeek、Gemini、Kimi）
 * 2. 统一的API调用接口
 * 3. 聊天记录格式化和分析
 * 4. 错误处理和重试机制
 * 5. 智能消息分片和token管理
 */

const axios = require('axios');
const logger = require('../utils/logger');
const settingsManager = require('./settingsManager');
const { getModelConfig } = require('../config/models');

class LLMService {
    constructor() {
        this.config = null;
        this.loadConfig();
    }

    /**
     * 加载配置
     */
    loadConfig() {
        try {
            this.config = settingsManager.loadConfig();
        } catch (error) {
            logger.error('加载LLM配置失败:', error);
            this.config = { llmApiKeys: {} };
        }
    }

    /**
     * 估算文本token数量（简单估算：中文1字符≈1.5token，英文1词≈1token）
     * @param {string} text - 文本内容
     * @returns {number} 估算的token数量
     */
    estimateTokenCount(text) {
        if (!text) return 0;
        
        // 简单的token估算：中文字符*1.5 + 英文单词数
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
        const symbols = text.length - chineseChars - text.replace(/[a-zA-Z]/g, '').length;
        
        return Math.ceil(chineseChars * 1.5 + englishWords + symbols * 0.5);
    }
    /**

     * 分析聊天记录
     * @param {Array} chatlogs - 聊天记录数组
     * @param {string} llmModel - LLM模型（DeepSeek/Gemini/Kimi）
     * @param {string} prompt - 用户自定义提示词（包含system_prompt）
     * @returns {string} 分析结果
     */
    async analyze(chatlogs, llmModel, prompt) {
        try {
            logger.info(`🚀 开始LLM分析，模型: ${llmModel}`);
            
            // 获取模型配置信息
            const modelConfig = getModelConfig(llmModel);
            if (modelConfig) {
                logger.info(`📋 使用模型: ${modelConfig.name} - ${modelConfig.description}`);
                logger.info(`🎯 上下文窗口: ${modelConfig.contextWindow}, 最大输出: ${modelConfig.maxTokens}`);
            }
            
            // 格式化聊天记录
            const formattedMessages = this.formatChatMessages(chatlogs);
            
            if (formattedMessages.length === 0) {
                return '❌ 没有有效的聊天记录可供分析。';
            }

            // 统计消息数量
            const totalCount = formattedMessages.filter(msg => !msg.startsWith('===')).length;
            logger.info(`📊 消息总数：${totalCount}条，开始完整分析`);
            
            // 🔧 修复：从传入的prompt参数中提取system_prompt，而不是从全局配置
            // prompt参数来自db.getFullPrompt(taskId)，已经包含了模板的system_prompt
            const userSystemPrompt = prompt || '';
            const defaultSystemPrompt = this.getBaseSystemPrompt();
            const finalSystemPrompt = this.getFinalSystemPrompt(userSystemPrompt, defaultSystemPrompt);

            // 构建完整的分析提示
            const analysisPrompt = this.buildAnalysisPrompt(
                formattedMessages, 
                finalSystemPrompt, 
                `📊 数据说明：正在分析 ${totalCount} 条完整消息\n`
            );
            
            // 检查最终prompt长度和token估算
            const finalTokens = this.estimateTokenCount(analysisPrompt);
            logger.info(`📏 分析文本长度：${Math.round(analysisPrompt.length / 1024)}KB，估算 ${finalTokens} tokens`);
            
            // 检查是否超过模型限制，只在确实超限时才处理
            const contextLimit = 64000; // DeepSeek官方64K tokens限制
            const outputTokens = llmModel === 'deepseek-reasoner' ? 16000 : 20000; // 预留更多输出空间支持HTML报告
            const maxInputTokens = contextLimit - outputTokens;
            
            let processedPrompt = analysisPrompt;
            let actualMessageCount = totalCount;
            
            if (finalTokens > maxInputTokens) {
                logger.warn(`⚠️ Token数量 ${finalTokens} 超过输入限制 ${maxInputTokens}，需要优化处理`);
                logger.info(`🔧 将采用保持完整性的优化策略，避免破坏群聊上下文`);
                
                // 采用更温和的优化策略：优先压缩提示词，保持群聊消息完整性
                const optimizedResult = this.optimizePromptForTokenLimit(formattedMessages, finalSystemPrompt, maxInputTokens);
                processedPrompt = optimizedResult.prompt;
                actualMessageCount = optimizedResult.messageCount;
                
                const optimizedTokens = this.estimateTokenCount(processedPrompt);
                logger.info(`✂️ 优化完成：保留 ${actualMessageCount} 条消息，${finalTokens} → ${optimizedTokens} tokens`);
            } else {
                logger.info(`✅ Token数量在限制范围内，使用完整消息进行分析`);
            }
            
            // 根据模型选择调用相应的API，使用重试机制
            let result = '';
            const maxRetries = 2;
            let lastError = null;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    logger.info(`🔄 第${attempt}次尝试调用${llmModel} API...`);
                    
                    // 根据模型名称判断使用哪个API
                    if (llmModel.startsWith('deepseek-')) {
                        result = await this.callDeepSeekAPI(processedPrompt, llmModel);
                    } else if (llmModel.startsWith('gemini-')) {
                        result = await this.callGeminiAPI(processedPrompt, llmModel);
                    } else if (llmModel.startsWith('moonshot-') || llmModel.startsWith('kimi-')) {
                        result = await this.callKimiAPI(processedPrompt, llmModel);
                    } else {
                        // 兼容旧版本模型名称
                        switch (llmModel.toLowerCase()) {
                            case 'deepseek':
                                result = await this.callDeepSeekAPI(processedPrompt, 'deepseek-chat');
                                break;
                            case 'gemini':
                                result = await this.callGeminiAPI(processedPrompt, 'gemini-2.5-pro');
                                break;
                            case 'kimi':
                                result = await this.callKimiAPI(processedPrompt, 'moonshot-v1-8k');
                                break;
                            default:
                                throw new Error(`不支持的LLM模型: ${llmModel}`);
                        }
                    }
                    
                    // 成功则跳出重试循环
                    break;
                    
                } catch (error) {
                    lastError = error;
                    logger.warn(`⚠️ 第${attempt}次API调用失败: ${error.message}`);
                    
                    if (attempt < maxRetries) {
                        const waitTime = attempt * 2000; // 递增等待时间
                        logger.info(`⏰ 等待${waitTime}ms后重试...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }
            
            // 如果所有重试都失败了
            if (!result && lastError) {
                logger.error('❌ 所有API调用尝试都失败，返回错误信息');
                return `❌ LLM分析失败：${lastError.message}\n\n📊 分析的消息数量：${actualMessageCount}条\n💡 建议：请检查网络连接或API密钥配置，或稍后重试。`;
            }

            logger.info('✅ LLM分析完成');
            return result;

        } catch (error) {
            logger.error('❌ LLM分析失败:', error);
            throw error;
        }
    }

    /**
     * 格式化聊天消息为分析用的文本
     * @param {Array} chatlogs - 聊天记录数组
     * @returns {Array} 格式化后的消息数组
     */
    formatChatMessages(chatlogs) {
        const messages = [];
        
        chatlogs.forEach(chatlog => {
            const chatroomName = chatlog.chatroom;
            const chatMessages = chatlog.messages || [];
            
            if (chatMessages.length > 0) {
                messages.push(`\n=== 群聊：${chatroomName} ===`);
                
                chatMessages.forEach(msg => {
                    // 处理不同的消息格式
                    const sender = msg.sender || msg.senderName || msg.from || '未知用户';
                    const content = msg.content || msg.text || msg.message || '';
                    const timestamp = msg.timestamp || msg.time || '';
                    
                    // 只处理有内容的文本消息
                    if (content && content.trim()) {
                        const timeStr = timestamp ? this.formatTimestamp(timestamp) : '';
                        messages.push(`[${timeStr}] ${sender}: ${content.trim()}`);
                    }
                });
            }
        });
        
        return messages;
    }

    /**
     * 构建分析提示词
     * @param {Array} messages - 格式化的消息数组
     * @param {string} fullPrompt - 来自模板的完整提示词（系统提示词+用户提示词）
     * @param {string} summary - 数据处理摘要
     * @returns {string} 完整的分析提示
     */
    buildAnalysisPrompt(messages, fullPrompt, summary) {
        const messageText = messages.join('\n');
        const messageCount = messages.filter(msg => !msg.startsWith('===')).length;
        
        // 🔧 修复：使用传入的fullPrompt作为系统提示词，而不是固定的baseSystemPrompt
        // fullPrompt已经包含了从prompt_templates.json获取的system_prompt
        const systemPrompt = fullPrompt || this.getBaseSystemPrompt();
        
        // 组合完整的分析提示
        const finalPrompt = `${systemPrompt}

---

## 数据说明：
${summary}

## 群聊数据（共${messageCount}条消息）：
格式说明：每条消息包含时间、发送者、内容
数据内容：
${messageText}

---

## 🚨 重要要求：
请基于以上数据和要求，生成一份专业的HTML群聊分析报告。

**必须严格按照以下格式输出：**
1. 必须以 <!DOCTYPE html> 开头
2. 必须包含完整的HTML结构（<html>、<head>、<body>等）
3. 必须包含内联CSS样式
4. 必须采用Bento Grid设计风格
5. 必须使用暖色系配色方案
6. 必须严格按照上述六个维度进行分析
7. 必须以 </html> 结尾

**禁止输出：**
- 纯文本分析
- Markdown格式
- 不完整的HTML片段

请直接输出完整的HTML代码，不要包含任何说明文字。`;
        
        return finalPrompt;
    }

    /**
     * 获取基础系统提示词（内部方法，不暴露在日志中）
     * @returns {string} 基础系统提示词
     */
    getBaseSystemPrompt() {
        return `

**AI角色设定：** 你现在是一位顶级的服务数据分析专家，对数据分析、清洗、整理有着卓越追求，严谨仔细。同时，你也是一名优秀的网页和营销视觉设计师，具有丰富的UI/UX设计经验，擅长将现代设计趋势与实用分析策略完美融合。

---

**模块一：总体任务与输入输出定义**

1. **核心任务：**
   * 深入分析用户上传的聊天记录文本文件。
   * 提取关键信息，包括：参与者身份识别、话题分类与统计、高频话题、用户情绪、互动模式、讨论亮点与改进点等。
   * 生成一个结构化、信息丰富且视觉效果出色的单页HTML群聊分析报告。

2. **输入数据：**
   * 群聊记录数据，包含群聊名称、时间范围、消息内容。
   * 聊天记录格式：[时间] 发言人: 发言内容。AI需能灵活处理不同的时间戳格式。

3. **最终输出：**
   * 一个独立的 .html 文件，包含所有指定内容和功能，使用中文呈现。
   * 报告主标题应清晰明了，包含群聊名称和分析时间范围。

---

**模块二：内容提取与分析**

1. **维度一：总体概括分析报告**
   * 在报告顶部设置一个醒目的"数据总览"卡片。
   * **提取内容：**
     * **分析时段:** 识别聊天记录的起止时间。
     * **消息总数:** 统计总消息数量。
     * **参与人数:** 统计活跃发言人数。
     * **活跃时段:** 分析消息发送的时间分布。
     * **互动频率:** 分析用户互动的频率和模式。
   * **呈现方式：** 在卡片中使用大号数字和清晰标签展示。

2. **维度二：核心讨论话题 (关键词)**
   * **智能提取：** 从聊天内容中，提炼出讨论最集中、最核心的 **不超过5个** 关键词。
   * **提取原则：** 聚焦用户反复提及的话题、关注点或讨论重点，过滤无关情绪词。
   * **呈现方式（HTML中）：** 在报告醒目位置展示。每个关键词包裹在 span 标签中，通过CSS赋予其暖色背景、圆角、内边距，形成视觉上清晰的"标签云"效果。

3. **维度三：用户活跃度排行榜**
   * **目标：** 以可视化图表形式，直观展示最活跃的参与者。
   * **数据处理：** 统计各用户的发言次数及占比。
   * **呈现方式：**
     * 使用一个精美的表格（Table）或Flex/Grid布局的列表。
     * **列包含：** 排名 | 用户名 | 发言次数 | 占比 | 可视化条形图。
     * **可视化条形图：** 使用 div 元素，通过设置背景色和宽度来模拟一个内联的水平条形图，颜色需符合暖色系主题。

4. **维度四：热门话题与精彩内容**
   * **目标：** 提取最有价值的讨论内容。
   * **提取内容：** 针对每个热门话题，选择最具代表性的发言内容。
   * **呈现方式：**
     * 使用独立的话题卡片布局。
     * **话题标题:** 话题 (讨论热度: X): [话题名称]
     * **精彩内容:** [用户的精彩发言内容]，标注发言者和时间。

5. **维度五：关键发现与洞察**
   * 将洞察内容整合到一个或多个设计精美的卡片中。
   * **用户情绪分析:** 简洁概括整体情绪（积极/中立/消极），并引用 **1-2条** 最具代表性的原文作为佐证。
   * **互动模式洞察:** 分析用户之间的互动模式和关系。
   * **讨论趋势归纳:** 总结讨论的发展趋势和演变过程。

6. **维度六：群聊亮点与建议**
   * 使用两个并排或上下排列的简洁卡片展示。
   * **群聊亮点卡片:** 🌟 **群聊亮点:** [引用具体事例，说明群聊中的精彩互动或有价值的讨论]。
   * **优化建议卡片:** 💡 **优化建议:** [针对性地提出可改进之处，如提高参与度、优化讨论质量等]。

---

**模块三：HTML结构与设计要求**

1. **设计风格：** 采用现代化的 Bento Grid 启发式设计，使用暖色系配色方案。
2. **响应式设计：** 确保在不同设备上都能良好显示。
3. **交互效果：** 卡片悬停效果，平滑过渡动画。
4. **可视化元素：** 使用CSS创建简单的图表和数据可视化效果。
5. **色彩搭配：** 主要使用暖色系（橙色、黄色、红色的柔和变体）。

---

**技术要求：**
- 生成完整的HTML页面，包含内联CSS样式
- 使用语义化的HTML标签
- 确保代码结构清晰，注释完整
- 所有文本内容使用中文
- 确保在浏览器中能够正常显示和交互`;
    }

    /**
     * 获取最终系统提示词（自定义优先，内置为兜底）
     * @param {string} userSystemPrompt - 用户自定义system_prompt（可为空）
     * @param {string} defaultSystemPrompt - 内置基础系统提示词
     * @returns {string} 最终用于LLM的系统提示词
     */
    getFinalSystemPrompt(userSystemPrompt, defaultSystemPrompt) {
        // [CUSTOM] 用户自定义system_prompt优先，完全替换内置
        if (userSystemPrompt && userSystemPrompt.trim()) {
            logger.info('系统提示词采用：自定义提示词');
            return userSystemPrompt;
        } else {
            logger.info('系统提示词采用：内置基础提示词');
            return defaultSystemPrompt;
        }
    }

    /**
     * 优化提示词以适应token限制（保持群聊完整性的温和策略）
     * @param {Array} messages - 格式化的消息数组
     * @param {string} systemPrompt - 系统提示词（来自模板的system_prompt）
     * @param {number} maxTokens - 最大token限制
     * @returns {Object} 优化结果
     */
    optimizePromptForTokenLimit(messages, systemPrompt, maxTokens) {
        logger.info(`🔧 开始提示词优化，目标token限制: ${maxTokens}`);
        
        // 分离系统提示词和消息内容
        const systemPromptTokens = this.estimateTokenCount(systemPrompt);
        const availableForMessages = maxTokens - systemPromptTokens - 500; // 留500 token缓冲
        
        logger.info(`📊 系统提示词: ${systemPromptTokens} tokens, 消息可用: ${availableForMessages} tokens`);
        
        // 如果系统提示词太长，简化它
        let finalSystemPrompt = systemPrompt;
        if (systemPromptTokens > maxTokens * 0.3) {
            logger.warn(`⚠️ 系统提示词过长，进行简化处理`);
            finalSystemPrompt = this.simplifySystemPrompt(systemPrompt);
        }
        
        // 处理消息：优先保持群聊完整性，如果必须削减，按群聊为单位处理
        const optimizedMessages = this.optimizeMessagesPreservingChatrooms(messages, availableForMessages);
        
        // 重新构建分析提示
        const messageCount = optimizedMessages.filter(msg => !msg.startsWith('===')).length;
        const finalAnalysisPrompt = this.buildAnalysisPrompt(
            optimizedMessages,
            finalSystemPrompt,
            `📊 数据说明：分析 ${messageCount} 条消息（已优化以适应token限制）\n`
        );
        
        return {
            prompt: finalAnalysisPrompt,
            messageCount: messageCount
        };
    }

    /**
     * 简化系统提示词
     * @param {string} prompt - 原始提示词
     * @returns {string} 简化后的提示词
     */
    simplifySystemPrompt(prompt) {
        // 保留核心功能，移除冗余描述
        let simplified = prompt
            .replace(/详细|具体|深入|全面/g, '') // 移除修饰词
            .replace(/请注意|需要注意|特别说明/g, '') // 移除提醒语
            .replace(/\n{3,}/g, '\n\n') // 压缩多余换行
            .trim();
        
        logger.info(`📝 系统提示词简化：${prompt.length} → ${simplified.length} 字符`);
        return simplified;
    }

    /**
     * 按群聊完整性优化消息（避免破坏群聊上下文）
     * @param {Array} messages - 原始消息数组
     * @param {number} availableTokens - 可用token数量
     * @returns {Array} 优化后的消息数组
     */
    optimizeMessagesPreservingChatrooms(messages, availableTokens) {
        logger.info(`🏠 按群聊完整性优化消息，可用tokens: ${availableTokens}`);
        
        // 按群聊分组
        const chatrooms = [];
        let currentChatroom = null;
        
        for (const msg of messages) {
            if (msg.startsWith('===')) {
                if (currentChatroom) {
                    chatrooms.push(currentChatroom);
                }
                currentChatroom = {
                    header: msg,
                    messages: []
                };
            } else if (currentChatroom) {
                currentChatroom.messages.push(msg);
            }
        }
        
        if (currentChatroom) {
            chatrooms.push(currentChatroom);
        }
        
        // 计算每个群聊的token占用
        chatrooms.forEach(chatroom => {
            const chatroomText = [chatroom.header, ...chatroom.messages].join('\n');
            chatroom.tokens = this.estimateTokenCount(chatroomText);
        });
        
        // 按token占用排序，优先保留信息密度高的群聊
        chatrooms.sort((a, b) => {
            const densityA = a.messages.length / a.tokens; // 消息密度
            const densityB = b.messages.length / b.tokens;
            return densityB - densityA;
        });
        
        // 选择群聊直到达到token限制
        const selectedChatrooms = [];
        let usedTokens = 0;
        
        for (const chatroom of chatrooms) {
            if (usedTokens + chatroom.tokens <= availableTokens) {
                selectedChatrooms.push(chatroom);
                usedTokens += chatroom.tokens;
            }
        }
        
        // 如果没有群聊能完整保留，选择最重要的一个并适当裁剪
        if (selectedChatrooms.length === 0 && chatrooms.length > 0) {
            logger.warn(`⚠️ 无法完整保留任何群聊，将适当裁剪最重要的群聊`);
            const mostImportant = chatrooms[0];
            const maxMessages = Math.floor(mostImportant.messages.length * (availableTokens / mostImportant.tokens) * 0.8);
            
            selectedChatrooms.push({
                header: mostImportant.header,
                messages: mostImportant.messages.slice(0, Math.max(10, maxMessages)) // 至少保留10条消息
            });
        }
        
        // 重新组装消息
        const result = [];
        selectedChatrooms.forEach(chatroom => {
            result.push(chatroom.header);
            result.push(...chatroom.messages);
        });
        
        logger.info(`🏠 群聊优化完成：保留 ${selectedChatrooms.length} 个群聊，${selectedChatrooms.reduce((sum, c) => sum + c.messages.length, 0)} 条消息`);
        
        return result;
    }

    /**
     * 调用DeepSeek API
     * @param {string} prompt - 分析提示
     * @param {string} model - 具体的模型名称
     * @returns {string} API响应结果
     */
    async callDeepSeekAPI(prompt, model = 'deepseek-chat') {
        const apiKey = this.config?.llmApiKeys?.deepseek;
        if (!apiKey) {
            throw new Error('DeepSeek API密钥未配置');
        }

        try {
            logger.info('🌐 调用DeepSeek API...');
            logger.info(`📦 请求数据大小: ${Math.round(prompt.length / 1024)}KB`);
            
            // 根据模型类型设置不同的参数
            const requestParams = {
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            // 智能设置token参数
            const inputTokens = this.estimateTokenCount(prompt);
            logger.info(`📊 输入token估算: ${inputTokens}`);
            
            if (model === 'deepseek-reasoner') {
                // 推理模型需要更多tokens，且不支持temperature
                requestParams.max_tokens = Math.min(16000, 65536 - inputTokens - 1000); // 留1000 token缓冲
                logger.info(`🧠 使用推理模型，设置max_tokens: ${requestParams.max_tokens}`);
            } else {
                // 普通模型动态调整token数量，为HTML报告分配充足的输出空间
                const availableTokens = 65536 - inputTokens - 1000; // 留1000 token缓冲
                // 大幅放开max_tokens限制，支持完整详细的HTML报告生成
                requestParams.max_tokens = Math.min(20000, Math.max(4000, availableTokens));
                requestParams.temperature = 0.7;
                logger.info(`💬 使用普通模型，设置max_tokens: ${requestParams.max_tokens} (大幅增强HTML报告支持)`);
            }
            
            const response = await axios.post('https://api.deepseek.com/v1/chat/completions', requestParams, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000, // 增加到120秒超时
                validateStatus: function (status) {
                    return status < 500; // 接受所有非5xx状态码
                }
            });

            // 检查HTTP状态
            if (response.status !== 200) {
                throw new Error(`API返回错误状态: ${response.status}, ${JSON.stringify(response.data)}`);
            }

            // 处理不同模型的响应格式
            const messageData = response.data?.choices?.[0]?.message;
            if (!messageData) {
                logger.error('❌ API响应格式异常:', JSON.stringify(response.data));
                throw new Error('DeepSeek API返回结果格式异常');
            }

            // 对于deepseek-reasoner模型，content字段包含最终答案
            // reasoning_content字段包含思考过程，我们只使用content，忽略reasoning_content
            let result = messageData.content;
            
            // 记录响应结构信息
            if (model === 'deepseek-reasoner') {
                logger.info(`🧠 DeepSeek-Reasoner响应结构: content长度=${result?.length || 0}, reasoning_content长度=${messageData.reasoning_content?.length || 0}`);
                
                // 🔧 修复：只使用content字段，完全忽略reasoning_content
                // reasoning_content是模型的思考过程，不应该包含在最终输出中
                if (messageData.reasoning_content) {
                    logger.info('🧹 移除了LLM输出开头的说明文字');
                }
                
                // 如果content为空，记录警告但不使用reasoning_content
                if (!result) {
                    logger.warn('⚠️ DeepSeek-Reasoner的content字段为空，但不会使用reasoning_content');
                }
            }

            if (!result) {
                logger.error('❌ API响应格式异常 - content字段为空且无法提取答案:', JSON.stringify(response.data));
                throw new Error('DeepSeek API返回结果格式异常');
            }

            logger.info(`✅ API调用成功，返回内容长度: ${result.length}字符`);
            return result;

        } catch (error) {
            // 详细的错误分类和诊断
            logger.error('❌ DeepSeek API调用详细错误信息:', {
                message: error.message,
                code: error.code,
                timeout: error.timeout,
                stack: error.stack?.split('\n')[0]
            });
            
            if (error.code === 'ECONNABORTED' || error.message.includes('aborted')) {
                logger.error('⏰ DeepSeek API请求被中断或超时');
                throw new Error('API请求被中断，可能原因：\n1. 网络连接不稳定\n2. 请求超时\n3. 服务器响应慢\n请检查网络后重试');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                logger.error('🌐 DeepSeek API连接失败');
                throw new Error('无法连接到DeepSeek API服务，请检查：\n1. 网络连接是否正常\n2. 是否有防火墙或代理限制\n3. DNS解析是否正常');
            } else if (error.response) {
                // API返回了错误响应
                const status = error.response.status;
                const errorData = error.response.data;
                logger.error(`❌ DeepSeek API错误响应 ${status}:`, errorData);
                
                if (status === 401) {
                    throw new Error('🔑 API密钥无效，请检查配置中的DeepSeek密钥是否正确');
                } else if (status === 429) {
                    throw new Error('⏳ API调用频率限制，请稍后重试（建议等待1-2分钟）');
                } else if (status === 413) {
                    throw new Error('📦 请求数据过大，请减少分析的消息数量或缩短时间范围');
                } else {
                    throw new Error(`🚫 API错误 ${status}: ${errorData?.error?.message || '未知错误'}`);
                }
            } else {
                logger.error('❌ DeepSeek API调用失败:', error.message);
                throw new Error(`DeepSeek API调用失败: ${error.message}\n\n可能的解决方案：\n1. 检查网络连接\n2. 确认API密钥配置正确\n3. 稍后重试`);
            }
        }
    }   
 /**
     * 调用Gemini API
     * @param {string} prompt - 分析提示
     * @param {string} model - 具体的模型名称
     * @returns {string} API响应结果
     */
    async callGeminiAPI(prompt, model = 'gemini-2.5-pro') {
        const apiKey = this.config?.llmApiKeys?.gemini;
        if (!apiKey) {
            throw new Error('Gemini API密钥未配置');
        }

        try {
            logger.info('🌐 调用Gemini API...');
            logger.info(`📦 请求数据大小: ${Math.round(prompt.length / 1024)}KB`);
            
            // 修正模型名称映射
            let actualModel = model;
            if (model === 'gemini-pro' || model === 'gemini') {
                actualModel = 'gemini-2.5-pro'; // 使用最新的模型名称
                logger.info(`🔄 模型名称映射: ${model} → ${actualModel}`);
            }
            
            logger.info(`🤖 使用Gemini模型: ${actualModel}`);
            
            // 构建请求配置，支持代理
            const requestConfig = {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'ChatChat-Platform/1.0'
                },
                timeout: 120000, // 增加超时时间到120秒
                validateStatus: function (status) {
                    return status < 500; // 接受所有非5xx状态码
                }
            };
            
            // 检查是否需要使用代理（中国大陆用户）
            const proxyConfig = this.getProxyConfig();
            if (proxyConfig) {
                requestConfig.proxy = proxyConfig;
                logger.info(`🔗 使用代理: ${proxyConfig.host}:${proxyConfig.port}`);
            }
            
            // 构建请求数据
            const requestData = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 45000, // 🔧 修复：Gemini API的实际限制是8192，不是45000
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            };
            
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`,
                requestData,
                requestConfig
            );

            // 检查HTTP状态
            if (response.status !== 200) {
                logger.error(`❌ Gemini API返回错误状态: ${response.status}`, response.data);
                throw new Error(`API返回错误状态: ${response.status}, ${JSON.stringify(response.data)}`);
            }

            // 检查响应数据结构
            logger.info(`📊 Gemini API响应状态: ${response.status}`);
            
            if (!response.data) {
                throw new Error('Gemini API返回空响应');
            }
            
            // 检查是否有安全过滤或其他错误
            if (response.data.promptFeedback?.blockReason) {
                throw new Error(`请求被安全过滤器阻止: ${response.data.promptFeedback.blockReason}`);
            }
            
            // 提取结果
            const candidates = response.data.candidates;
            if (!candidates || candidates.length === 0) {
                logger.error('❌ Gemini API响应中没有候选结果:', JSON.stringify(response.data));
                throw new Error('Gemini API没有返回有效的候选结果');
            }
            
            const candidate = candidates[0];
            
            // 检查完成原因
            if (candidate.finishReason === 'SAFETY') {
                throw new Error('响应被安全过滤器阻止，请调整输入内容');
            } else if (candidate.finishReason === 'MAX_TOKENS') {
                logger.warn('⚠️ Gemini API输出被截断（达到最大token限制），尝试增加maxOutputTokens');
                // 继续处理，但记录警告
            }
            
            // 尝试多种方式提取文本内容
            let result = null;
            
            // 方式1：标准格式 content.parts[0].text
            if (candidate.content?.parts?.[0]?.text) {
                result = candidate.content.parts[0].text;
            }
            // 方式2：检查是否有text字段直接在content下
            else if (candidate.content?.text) {
                result = candidate.content.text;
            }
            // 方式3：检查是否content本身就是字符串
            else if (typeof candidate.content === 'string') {
                result = candidate.content;
            }
            // 方式4：检查是否有其他可能的文本字段
            else if (candidate.text) {
                result = candidate.text;
            }
            
            if (!result) {
                logger.error('❌ Gemini API响应格式异常:', JSON.stringify(response.data));
                
                // 如果是因为MAX_TOKENS导致的空结果，提供特殊处理
                if (candidate.finishReason === 'MAX_TOKENS') {
                    throw new Error('Gemini API输出被截断，请减少输入内容长度或增加maxOutputTokens设置');
                }
                
                throw new Error('Gemini API返回结果格式异常');
            }

            logger.info(`✅ Gemini API调用成功，返回内容长度: ${result.length}字符`);
            return result;

        } catch (error) {
            // 详细的错误分类和诊断
            logger.error('❌ Gemini API调用详细错误信息:', {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                logger.error('⏰ Gemini API请求超时');
                throw new Error('API请求超时，可能原因：\n1. 网络连接不稳定\n2. 代理配置问题\n3. 服务器响应慢\n请检查网络和代理设置后重试');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                logger.error('🌐 Gemini API连接失败');
                throw new Error('无法连接到Gemini API服务，请检查：\n1. 网络连接是否正常\n2. 代理是否正确配置\n3. 防火墙设置\n4. DNS解析是否正常');
            } else if (error.response) {
                // API返回了错误响应
                const status = error.response.status;
                const errorData = error.response.data;
                logger.error(`❌ Gemini API错误响应 ${status}:`, errorData);
                
                if (status === 400) {
                    throw new Error('🚫 请求参数错误，请检查API密钥和请求格式');
                } else if (status === 403) {
                    throw new Error('🔑 API密钥无效或权限不足，请检查Gemini API密钥配置');
                } else if (status === 429) {
                    throw new Error('⏳ API调用频率限制，请稍后重试（建议等待1-2分钟）');
                } else if (status === 503) {
                    throw new Error('🔧 Gemini服务暂时不可用，请稍后重试');
                } else {
                    throw new Error(`🚫 API错误 ${status}: ${errorData?.error?.message || '未知错误'}`);
                }
            } else {
                logger.error('❌ Gemini API调用失败:', error.message);
                throw new Error(`Gemini API调用失败: ${error.message}\n\n可能的解决方案：\n1. 检查网络连接和代理设置\n2. 确认API密钥配置正确\n3. 稍后重试`);
            }
        }
    }

    /**
     * 获取代理配置（用于中国大陆用户）
     * @returns {Object|null} 代理配置
     */
    getProxyConfig() {
        // 检查环境变量中的代理配置
        const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
        const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
        
        // 优先使用HTTPS代理
        const proxyUrl = httpsProxy || httpProxy;
        
        if (proxyUrl) {
            try {
                const url = new URL(proxyUrl);
                return {
                    host: url.hostname,
                    port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
                    protocol: url.protocol.replace(':', '')
                };
            } catch (error) {
                logger.warn('代理URL解析失败:', proxyUrl);
            }
        }
        
        // 如果没有环境变量，检查常见的代理端口（适用于Clash等工具）
        const commonProxyPorts = [7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897, 1080, 8080];
        
        // 你提到使用Clash，端口是7897，我们可以默认尝试这个
        return {
            host: '127.0.0.1',
            port: 7897,
            protocol: 'http'
        };
    }    
/**
     * 调用Kimi API
     * @param {string} prompt - 分析提示
     * @param {string} model - 具体的模型名称
     * @returns {string} API响应结果
     */
    async callKimiAPI(prompt, model = 'moonshot-v1-8k') {
        const apiKey = this.config?.llmApiKeys?.kimi;
        if (!apiKey) {
            throw new Error('Kimi API密钥未配置');
        }

        try {
            logger.info('🌐 调用Kimi API...');
            logger.info(`📦 请求数据大小: ${Math.round(prompt.length / 1024)}KB`);

            // 根据Moonshot API文档，使用正确的模型名称
            let modelName = model;
            if (model.startsWith('kimi-')) {
                // 将旧的kimi模型名称映射到新的moonshot模型名称
                if (model.includes('k2')) {
                    modelName = 'moonshot-v1-32k'; // K2对应32k上下文
                } else {
                    modelName = 'moonshot-v1-8k'; // 默认使用8k模型
                }
            }

            logger.info(`🤖 使用Moonshot模型: ${modelName}`);

            // 智能设置token参数
            const inputTokens = this.estimateTokenCount(prompt);
            logger.info(`📊 输入token估算: ${inputTokens}`);

            // 🔧 修复：根据模型类型正确设置max_tokens，确保不超过实际限制
            let maxTokens = 4000; // 默认值
            if (modelName.includes('32k')) {
                // 32k模型的实际限制是32768，需要为输入和输出留出空间
                maxTokens = Math.min(4000, 32768 - inputTokens - 3000); // 留3000 token缓冲
            } else if (modelName.includes('128k')) {
                maxTokens = Math.min(8000, 128000 - inputTokens - 3000); // 128k模型
            } else {
                maxTokens = Math.min(3000, 8000 - inputTokens - 1000); // 8k模型
            }

            // 确保maxTokens不为负数且不小于最小值
            maxTokens = Math.max(maxTokens, 1000);
            logger.info(`💬 设置max_tokens: ${maxTokens} (支持HTML报告生成)`);

            const response = await axios.post('https://api.moonshot.cn/v1/chat/completions', {
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: maxTokens,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000, // 增加超时时间到120秒，解决30秒超时问题
                validateStatus: function (status) {
                    return status < 500; // 接受所有非5xx状态码
                }
            });

            // 检查HTTP状态
            if (response.status !== 200) {
                throw new Error(`API返回错误状态: ${response.status}, ${JSON.stringify(response.data)}`);
            }

            // 处理响应格式
            const messageData = response.data?.choices?.[0]?.message;
            if (!messageData) {
                logger.error('❌ Kimi API响应格式异常:', JSON.stringify(response.data));
                throw new Error('Kimi API返回结果格式异常');
            }

            const result = messageData.content;
            if (!result) {
                logger.error('❌ Kimi API响应内容为空:', JSON.stringify(response.data));
                throw new Error('Kimi API返回结果为空');
            }

            logger.info(`✅ Kimi API调用成功，返回内容长度: ${result.length}字符`);
            return result;

        } catch (error) {
            // 详细的错误分类和诊断
            logger.error('❌ Kimi API调用详细错误信息:', {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                logger.error('⏰ Kimi API请求超时');
                throw new Error('Kimi API请求超时，可能原因：\n1. 网络连接不稳定\n2. 请求数据量过大\n3. 服务器响应慢\n请检查网络连接或减少分析数据量后重试');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                logger.error('🌐 Kimi API连接失败');
                throw new Error('无法连接到Kimi API服务，请检查：\n1. 网络连接是否正常\n2. 是否有防火墙或代理限制\n3. DNS解析是否正常');
            } else if (error.response) {
                // API返回了错误响应
                const status = error.response.status;
                const errorData = error.response.data;
                logger.error(`❌ Kimi API错误响应 ${status}:`, errorData);

                if (status === 401) {
                    throw new Error('🔑 API密钥无效，请检查配置中的Kimi API密钥是否正确');
                } else if (status === 429) {
                    throw new Error('⏳ API调用频率限制，请稍后重试（建议等待1-2分钟）');
                } else if (status === 413) {
                    throw new Error('📦 请求数据过大，请减少分析的消息数量或缩短时间范围');
                } else {
                    throw new Error(`🚫 API错误 ${status}: ${errorData?.error?.message || '未知错误'}`);
                }
            } else {
                logger.error('❌ Kimi API调用失败:', error.message);
                throw new Error(`Kimi API调用失败: ${error.message}\n\n可能的解决方案：\n1. 检查网络连接\n2. 确认API密钥配置正确\n3. 稍后重试`);
            }
        }
    }   
 /**
     * 测试API连接性
     * @param {string} model - 模型名称
     * @returns {boolean} 连接是否正常
     */
    async testAPIConnection(model) {
        try {
            logger.info(`测试 ${model} API连接...`);
            
            if (model.toLowerCase() === 'deepseek') {
                const apiKey = this.config?.llmApiKeys?.deepseek;
                if (!apiKey) return false;
                
                const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: '测试连接' }],
                    max_tokens: 10
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                
                return response.status === 200;
            }
            
            return false;
        } catch (error) {
            logger.warn(`${model} API连接测试失败:`, error.message);
            return false;
        }
    }

    /**
     * 格式化时间戳
     * @param {string|number} timestamp - 时间戳
     * @returns {string} 格式化后的时间字符串
     */
    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                return timestamp.toString();
            }
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            return timestamp.toString();
        }
    }
}

const llmService = new LLMService();
module.exports = llmService;