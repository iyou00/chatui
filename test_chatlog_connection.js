/**
 * ChatLog API连接测试工具
 * 
 * 功能：
 * 1. 测试ChatLog服务的连接状态
 * 2. 验证API端点的可用性
 * 3. 测试数据格式兼容性
 * 4. 提供详细的调试信息
 */

const axios = require('axios');

class ChatLogTester {
    constructor(chatlogUrl = 'http://127.0.0.1:5030') {
        // 确保URL格式正确
        this.baseUrl = chatlogUrl.startsWith('http') ? chatlogUrl : `http://${chatlogUrl}`;
        if (this.baseUrl.endsWith('/')) {
            this.baseUrl = this.baseUrl.slice(0, -1);
        }
        console.log('🔧 ChatLog测试器初始化');
        console.log('📍 目标地址:', this.baseUrl);
    }

    /**
     * 测试基本连接
     */
    async testBasicConnection() {
        console.log('\n🔍 [步骤1] 测试基本连接...');
        
        try {
            const response = await axios.get(this.baseUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'ChatChat-Platform/1.0'
                }
            });

            console.log('✅ 基本连接成功');
            console.log('📊 响应状态:', response.status);
            console.log('📋 响应头Content-Type:', response.headers['content-type']);
            console.log('📄 响应内容类型:', typeof response.data);
            
            // 检查是否是ChatLog服务
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
                console.log('ℹ️ 服务返回HTML页面，可能是Web界面');
            }

            return true;
        } catch (error) {
            console.error('❌ 基本连接失败:', error.message);
            if (error.code === 'ECONNREFUSED') {
                console.error('💡 建议: 请确认ChatLog服务是否已启动');
            }
            return false;
        }
    }

    /**
     * 测试API端点
     */
    async testApiEndpoints() {
        console.log('\n🔍 [步骤2] 测试API端点...');
        
        const endpoints = [
            '/api/v1/chatroom',
            '/api/v1/chatlog', 
            '/api/v1/contact',
            '/api/v1/session',
            '/api/chatroom',       // 可能的备选路径
            '/chatroom',           // 简化路径
            '/api/rooms',          // 其他可能的路径
        ];

        const workingEndpoints = [];

        for (const endpoint of endpoints) {
            try {
                console.log(`🔍 测试端点: ${endpoint}`);
                
                const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'ChatChat-Platform/1.0',
                        'Accept': 'application/json, text/plain, text/csv'
                    }
                });

                console.log(`✅ ${endpoint} - 状态: ${response.status}`);
                console.log(`📋 Content-Type: ${response.headers['content-type']}`);
                console.log(`📊 数据类型: ${typeof response.data}`);
                
                if (Array.isArray(response.data)) {
                    console.log(`📊 数组长度: ${response.data.length}`);
                } else if (typeof response.data === 'object') {
                    console.log(`📋 对象键: ${Object.keys(response.data).join(', ')}`);
                }

                workingEndpoints.push({
                    endpoint,
                    status: response.status,
                    dataType: typeof response.data,
                    isArray: Array.isArray(response.data),
                    contentType: response.headers['content-type']
                });

            } catch (error) {
                console.log(`❌ ${endpoint} - 失败: ${error.response?.status || error.message}`);
            }
        }

        console.log('\n📊 可用端点汇总:');
        workingEndpoints.forEach(ep => {
            console.log(`✅ ${ep.endpoint} (${ep.status}) - ${ep.dataType}${ep.isArray ? ' (数组)' : ''}`);
        });

        return workingEndpoints;
    }

    /**
     * 测试群聊列表获取
     */
    async testChatroomList() {
        console.log('\n🔍 [步骤3] 测试群聊列表获取...');
        
        const endpoints = ['/api/v1/chatroom', '/api/chatroom', '/chatroom'];
        
        for (const endpoint of endpoints) {
            try {
                console.log(`🔍 尝试获取群聊列表: ${endpoint}`);
                
                // 尝试不同的参数组合
                const paramCombinations = [
                    {},
                    { format: 'json' },
                    { format: 'csv' },
                    { limit: 100 }
                ];

                for (const params of paramCombinations) {
                    try {
                        const paramStr = Object.keys(params).length > 0 ? 
                            `?${new URLSearchParams(params).toString()}` : '';
                        
                        console.log(`  📋 参数: ${paramStr || '无参数'}`);
                        
                        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                            params,
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'ChatChat-Platform/1.0',
                                'Accept': 'application/json, text/csv, text/plain'
                            }
                        });

                        console.log(`  ✅ 成功 (${response.status})`);
                        console.log(`  📊 数据类型: ${typeof response.data}`);
                        
                        if (typeof response.data === 'string') {
                            console.log(`  📏 内容长度: ${response.data.length}`);
                            console.log(`  📄 内容预览: ${response.data.substring(0, 200)}...`);
                            
                            // 检查是否是CSV格式
                            if (response.data.includes(',') && response.data.includes('\n')) {
                                console.log('  📊 检测到CSV格式数据');
                                return this.parseCSVChatrooms(response.data, endpoint, params);
                            }
                        } else if (Array.isArray(response.data)) {
                            console.log(`  📊 数组长度: ${response.data.length}`);
                            if (response.data.length > 0) {
                                console.log(`  📋 数据样本:`, response.data[0]);
                                return { endpoint, params, data: response.data, format: 'json' };
                            }
                        } else if (typeof response.data === 'object') {
                            console.log(`  📋 对象结构:`, Object.keys(response.data));
                            return { endpoint, params, data: response.data, format: 'object' };
                        }

                    } catch (paramError) {
                        console.log(`  ❌ 参数 ${paramStr} 失败: ${paramError.response?.status || paramError.message}`);
                    }
                }

            } catch (error) {
                console.log(`❌ ${endpoint} 完全失败: ${error.message}`);
            }
        }

        console.log('⚠️ 未找到可用的群聊列表端点');
        return null;
    }

    /**
     * 测试聊天记录获取
     */
    async testChatlogRetrieval(testTalker = '这是一个小村子') {
        console.log('\n🔍 [步骤4] 测试聊天记录获取...');
        console.log('📱 测试群聊:', testTalker);
        
        const endpoint = '/api/v1/chatlog';
        const timeParam = '2025-07-01~2025-07-18'; // 使用用户提供的时间范围
        
        try {
            const params = {
                talker: testTalker,
                time: timeParam,
                format: 'text'
            };

            console.log('📋 请求参数:', params);
            console.log('🔗 完整URL:', `${this.baseUrl}${endpoint}?${new URLSearchParams(params).toString()}`);

            const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                params,
                timeout: 15000,
                headers: {
                    'User-Agent': 'ChatChat-Platform/1.0',
                    'Accept': 'text/plain, application/json'
                }
            });

            console.log('✅ 聊天记录获取成功');
            console.log('📊 响应状态:', response.status);
            console.log('📋 Content-Type:', response.headers['content-type']);
            console.log('📊 数据类型:', typeof response.data);
            console.log('📏 内容长度:', response.data?.length || 0);

            if (typeof response.data === 'string') {
                console.log('📄 内容预览:');
                console.log(response.data.substring(0, 500) + '...');
                
                // 检查是否是聊天记录格式
                if (this.isTextChatlogFormat(response.data)) {
                    console.log('✅ 检测到有效的聊天记录格式');
                    const parsed = this.parseTextChatlog(response.data, testTalker);
                    console.log(`📊 解析结果: ${parsed.messages.length}条消息`);
                    if (parsed.messages.length > 0) {
                        console.log('📝 消息样本:', parsed.messages[0]);
                    }
                    return parsed;
                } else {
                    console.log('⚠️ 数据格式不是预期的聊天记录格式');
                }
            }

            return response.data;

        } catch (error) {
            console.error('❌ 聊天记录获取失败:', error.message);
            if (error.response) {
                console.error('📊 响应状态:', error.response.status);
                console.error('📄 响应内容:', error.response.data?.substring(0, 200));
            }
            return null;
        }
    }

    /**
     * 检查是否是文本格式的聊天记录
     */
    isTextChatlogFormat(data) {
        if (typeof data !== 'string' || !data.trim()) {
            return false;
        }
        
        const timePatterns = [
            /\d{2}:\d{2}:\d{2}/, // HH:MM:SS
            /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/, // YYYY-MM-DD HH:MM:SS
        ];
        
        const lines = data.split('\n').slice(0, 10);
        
        for (const line of lines) {
            if (line.trim()) {
                for (const pattern of timePatterns) {
                    if (pattern.test(line)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * 解析文本格式的聊天记录
     */
    parseTextChatlog(textData, chatroomName) {
        const lines = textData.split('\n');
        const messages = [];
        let currentMessage = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const timeMatch1 = line.match(/^(.+?)\s+(\d{2}:\d{2}:\d{2})$/);
            const timeMatch2 = line.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})$/);
            
            if (timeMatch1 || timeMatch2) {
                if (currentMessage && currentMessage.content.trim()) {
                    messages.push({
                        sender: currentMessage.sender,
                        content: currentMessage.content.trim(),
                        timestamp: currentMessage.timestamp
                    });
                }
                
                const match = timeMatch1 || timeMatch2;
                let senderInfo = match[1].trim();
                const timeStr = match[2];
                
                const senderMatch = senderInfo.match(/^(.+?)\([^)]+\)$/) || [null, senderInfo];
                const sender = senderMatch[1] || senderInfo;
                
                let timestamp;
                if (timeMatch2) {
                    timestamp = new Date(timeStr).getTime();
                } else {
                    const today = new Date().toISOString().split('T')[0];
                    timestamp = new Date(`${today} ${timeStr}`).getTime();
                }
                
                currentMessage = {
                    sender: sender,
                    content: '',
                    timestamp: timestamp
                };
            } else if (currentMessage) {
                if (currentMessage.content) {
                    currentMessage.content += '\n' + line;
                } else {
                    currentMessage.content = line;
                }
            }
        }
        
        if (currentMessage && currentMessage.content.trim()) {
            messages.push({
                sender: currentMessage.sender,
                content: currentMessage.content.trim(),
                timestamp: currentMessage.timestamp
            });
        }
        
        return {
            chatroom: chatroomName,
            messages: messages
        };
    }

    /**
     * 解析CSV格式的群聊数据
     */
    parseCSVChatrooms(csvData, endpoint, params) {
        const lines = csvData.trim().split('\n');
        if (lines.length < 2) return null;

        const headers = lines[0].split(',').map(h => h.trim());
        console.log('📋 CSV表头:', headers);

        const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'));
        const nickNameIndex = headers.findIndex(h => h.toLowerCase().includes('nickname'));

        const chatrooms = [];
        for (let i = 1; i < lines.length; i++) {
            const fields = lines[i].split(',');
            if (fields.length >= headers.length) {
                const name = fields[nameIndex]?.trim() || '';
                const nickname = fields[nickNameIndex]?.trim() || '';
                if (name) {
                    chatrooms.push({
                        id: name,
                        name: nickname || name
                    });
                }
            }
        }

        console.log(`✅ CSV解析成功: ${chatrooms.length}个群聊`);
        return { endpoint, params, data: chatrooms, format: 'csv' };
    }

    /**
     * 运行完整测试
     */
    async runFullTest() {
        console.log('🚀 ChatLog API 完整连接测试开始');
        console.log('='.repeat(50));

        // 1. 基本连接测试
        const basicConnection = await this.testBasicConnection();
        if (!basicConnection) {
            console.log('\n❌ 基本连接失败，停止测试');
            return;
        }

        // 2. API端点测试
        const endpoints = await this.testApiEndpoints();

        // 3. 群聊列表测试
        const chatroomResult = await this.testChatroomList();

        // 4. 聊天记录测试
        const chatlogResult = await this.testChatlogRetrieval();

        // 生成测试报告
        console.log('\n' + '='.repeat(50));
        console.log('📊 测试报告总结');
        console.log('='.repeat(50));

        console.log('✅ 基本连接:', basicConnection ? '成功' : '失败');
        console.log('📊 可用端点数量:', endpoints.length);
        console.log('📱 群聊列表获取:', chatroomResult ? '成功' : '失败');
        console.log('💬 聊天记录获取:', chatlogResult ? '成功' : '失败');

        if (chatroomResult) {
            console.log('\n📋 推荐配置:');
            console.log(`   端点: ${chatroomResult.endpoint}`);
            console.log(`   参数: ${JSON.stringify(chatroomResult.params)}`);
            console.log(`   格式: ${chatroomResult.format}`);
        }

        return {
            basicConnection,
            endpoints,
            chatroomResult,
            chatlogResult
        };
    }
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
    async function main() {
        // 从配置文件读取ChatLog URL
        const settingsManager = require('./services/settingsManager');
        const config = settingsManager.loadConfig();
        const chatlogUrl = config.chatlogUrl || 'http://127.0.0.1:5030';

        const tester = new ChatLogTester(chatlogUrl);
        await tester.runFullTest();
    }

    main().catch(console.error);
}

module.exports = ChatLogTester; 