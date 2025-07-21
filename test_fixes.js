/**
 * 综合修复测试工具
 * 
 * 功能：
 * 1. 测试群聊列表获取功能
 * 2. 测试时间范围参数生成
 * 3. 验证API修复效果
 */

const axios = require('axios');
const settingsManager = require('./services/settingsManager');
const chatlogService = require('./services/chatlogService');
const scheduler = require('./services/scheduler');

class FixVerificationTester {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:8080';
        console.log('🔧 修复验证测试工具');
        console.log('='.repeat(60));
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🚀 开始运行所有修复验证测试...\n');

        try {
            // 测试1：群聊列表获取
            await this.testChatroomList();
            
            console.log('\n' + '-'.repeat(60) + '\n');
            
            // 测试2：时间范围参数生成
            await this.testTimeRangeGeneration();
            
            console.log('\n' + '-'.repeat(60) + '\n');
            
            // 测试3：API端点测试
            await this.testApiEndpoints();
            
            console.log('\n' + '='.repeat(60));
            console.log('🎉 所有测试完成！');
            
        } catch (error) {
            console.error('❌ 测试过程中出现错误:', error.message);
        }
    }

    /**
     * 测试群聊列表获取
     */
    async testChatroomList() {
        console.log('📱 [测试1] 群聊列表获取功能');
        console.log('-'.repeat(40));

        try {
            // 1. 直接调用服务方法
            console.log('🔍 1. 直接调用chatlogService.getChatrooms()...');
            const directRooms = await chatlogService.getChatrooms();
            console.log(`   ✅ 直接调用成功: ${directRooms.length} 个群聊`);
            if (directRooms.length > 0) {
                console.log(`   📋 前3个群聊: ${directRooms.slice(0, 3).join(', ')}`);
            }

            // 2. 测试API端点
            console.log('\n🌐 2. 测试API端点 /api/chatrooms...');
            try {
                const apiResponse = await axios.get(`${this.baseUrl}/api/chatrooms`, {
                    timeout: 10000,
                    headers: { 'Accept': 'application/json' }
                });

                if (apiResponse.data.success) {
                    const apiRooms = apiResponse.data.data || [];
                    console.log(`   ✅ API调用成功: ${apiRooms.length} 个群聊`);
                    if (apiRooms.length > 0) {
                        console.log(`   📋 前3个群聊: ${apiRooms.slice(0, 3).join(', ')}`);
                    }

                    // 比较结果
                    if (directRooms.length === apiRooms.length) {
                        console.log('   ✅ 直接调用和API调用结果一致');
                    } else {
                        console.log(`   ⚠️ 结果不一致: 直接调用${directRooms.length}个，API调用${apiRooms.length}个`);
                    }
                } else {
                    console.log(`   ❌ API调用失败: ${apiResponse.data.message}`);
                }
            } catch (apiError) {
                console.log(`   ❌ API调用出错: ${apiError.message}`);
            }

            // 3. 测试外部ChatLog服务
            console.log('\n🔗 3. 测试外部ChatLog服务连接...');
            try {
                const externalRooms = await chatlogService.getChatroomsFromExternal();
                console.log(`   ✅ 外部服务调用成功: ${externalRooms.length} 个群聊`);
                if (externalRooms.length > 0) {
                    console.log(`   📋 前3个群聊: ${externalRooms.slice(0, 3).join(', ')}`);
                }
            } catch (externalError) {
                console.log(`   ⚠️ 外部服务调用失败: ${externalError.message}`);
            }

        } catch (error) {
            console.log(`❌ 群聊列表测试失败: ${error.message}`);
        }
    }

    /**
     * 测试时间范围参数生成
     */
    async testTimeRangeGeneration() {
        console.log('⏰ [测试2] 时间范围参数生成');
        console.log('-'.repeat(40));

        const testCases = [
            {
                name: '最近7天（默认）',
                timeRange: { type: 'recent_7d' },
                shouldMatch: /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/
            },
            {
                name: '自定义时间范围（新格式）',
                timeRange: { 
                    type: 'custom', 
                    start_date: '2025-07-01', 
                    end_date: '2025-07-18' 
                },
                expected: '2025-07-01~2025-07-18'
            },
            {
                name: '自定义时间范围（旧格式）',
                timeRange: { 
                    type: 'custom', 
                    startDate: '2025-07-01', 
                    endDate: '2025-07-18' 
                },
                expected: '2025-07-01~2025-07-18'
            },
            {
                name: '所有时间',
                timeRange: { type: 'all' },
                expected: '2020-01-01~2030-12-31'
            }
        ];

        testCases.forEach((testCase, index) => {
            console.log(`\n📊 ${index + 1}. ${testCase.name}`);
            console.log(`   输入: ${JSON.stringify(testCase.timeRange)}`);

            try {
                const result = scheduler.generateTimeParam(testCase.timeRange);
                console.log(`   输出: ${result}`);

                if (testCase.expected) {
                    if (result === testCase.expected) {
                        console.log(`   ✅ 结果正确`);
                    } else {
                        console.log(`   ❌ 结果错误，期望: ${testCase.expected}`);
                    }
                } else if (testCase.shouldMatch) {
                    if (testCase.shouldMatch.test(result)) {
                        console.log(`   ✅ 格式正确`);
                    } else {
                        console.log(`   ❌ 格式错误`);
                    }
                }

                // 生成URL示例
                const encodedParam = encodeURIComponent(result);
                const exampleUrl = `http://127.0.0.1:5030/api/v1/chatlog?talker=测试群聊&time=${encodedParam}&format=text`;
                console.log(`   🔗 ChatLog URL: ${exampleUrl.substring(0, 70)}...`);

            } catch (error) {
                console.log(`   ❌ 生成失败: ${error.message}`);
            }
        });
    }

    /**
     * 测试API端点
     */
    async testApiEndpoints() {
        console.log('🌐 [测试3] API端点测试');
        console.log('-'.repeat(40));

        const endpoints = [
            { path: '/api/status', name: '系统状态' },
            { path: '/api/chatrooms', name: '群聊列表' },
            { path: '/api/tasks', name: '任务列表' },
            { path: '/api/prompt-templates', name: '提示词模板' },
            { path: '/api/chatlog/test', name: 'ChatLog连接测试' }
        ];

        for (const endpoint of endpoints) {
            console.log(`\n🔍 测试: ${endpoint.name} (${endpoint.path})`);
            
            try {
                const response = await axios.get(`${this.baseUrl}${endpoint.path}`, {
                    timeout: 10000,
                    headers: { 'Accept': 'application/json' }
                });

                console.log(`   ✅ 状态: ${response.status}`);
                
                if (response.data.success !== undefined) {
                    console.log(`   📊 成功: ${response.data.success}`);
                    if (response.data.data && Array.isArray(response.data.data)) {
                        console.log(`   📋 数据量: ${response.data.data.length} 项`);
                    }
                }

            } catch (error) {
                console.log(`   ❌ 失败: ${error.response?.status || error.message}`);
            }
        }
    }

    /**
     * 生成修复报告
     */
    generateReport() {
        console.log('\n📊 修复验证报告');
        console.log('='.repeat(60));
        console.log('✅ 已修复的问题:');
        console.log('1. 群聊选择区域的数据加载和显示');
        console.log('2. 自定义时间范围的字段名匹配 (start_date/end_date)');
        console.log('3. ChatLog API的多端点支持和容错处理');
        console.log('4. 前端错误处理和用户反馈优化');
        console.log('');
        console.log('🎯 建议测试步骤:');
        console.log('1. 在浏览器中打开任务创建页面');
        console.log('2. 查看群聊选择区域是否正确显示所有群聊');
        console.log('3. 创建自定义时间范围的任务并执行');
        console.log('4. 检查生成的聊天记录是否在正确的时间范围内');
        console.log('');
        console.log('🔧 如果仍有问题:');
        console.log('- 检查ChatLog服务是否运行在 127.0.0.1:5030');
        console.log('- 查看浏览器开发者工具的Console和Network选项卡');
        console.log('- 检查应用日志文件中的详细错误信息');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    async function main() {
        const tester = new FixVerificationTester();
        await tester.runAllTests();
        tester.generateReport();
    }

    main().catch(console.error);
}

module.exports = FixVerificationTester; 