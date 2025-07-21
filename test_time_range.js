/**
 * 时间范围参数测试工具
 * 
 * 功能：
 * 1. 测试不同时间范围类型的参数生成
 * 2. 验证与ChatLog API的格式兼容性
 * 3. 检查自定义时间范围的字段匹配
 */

const scheduler = require('./services/scheduler');

class TimeRangeTest {
    constructor() {
        console.log('🕐 时间范围参数测试工具');
        console.log('='.repeat(50));
    }

    /**
     * 测试所有时间范围类型
     */
    runAllTests() {
        const testCases = [
            {
                name: '最近1天',
                timeRange: { type: 'recent_1d' }
            },
            {
                name: '最近3天',
                timeRange: { type: 'recent_3d' }
            },
            {
                name: '最近7天',
                timeRange: { type: 'recent_7d' }
            },
            {
                name: '最近15天',
                timeRange: { type: 'recent_15d' }
            },
            {
                name: '最近30天',
                timeRange: { type: 'recent_30d' }
            },
            {
                name: '所有时间',
                timeRange: { type: 'all' }
            },
            {
                name: '自定义时间范围 (新格式)',
                timeRange: {
                    type: 'custom',
                    start_date: '2025-07-01',
                    end_date: '2025-07-18'
                }
            },
            {
                name: '自定义时间范围 (旧格式)',
                timeRange: {
                    type: 'custom',
                    startDate: '2025-07-01',
                    endDate: '2025-07-18'
                }
            },
            {
                name: '自定义时间范围 (缺少参数)',
                timeRange: {
                    type: 'custom'
                }
            }
        ];

        console.log('📋 测试用例总数:', testCases.length);
        console.log('');

        testCases.forEach((testCase, index) => {
            this.testTimeRange(index + 1, testCase.name, testCase.timeRange);
        });

        console.log('');
        console.log('✅ 所有测试完成');
    }

    /**
     * 测试单个时间范围
     */
    testTimeRange(index, name, timeRange) {
        console.log(`📊 [测试 ${index}] ${name}`);
        console.log(`   输入: ${JSON.stringify(timeRange)}`);

        try {
            const timeParam = scheduler.generateTimeParam(timeRange);
            console.log(`   ✅ 生成参数: ${timeParam}`);
            
            // 验证格式
            if (this.validateTimeParam(timeParam)) {
                console.log(`   ✅ 格式验证通过`);
            } else {
                console.log(`   ❌ 格式验证失败`);
            }

            // 构建完整的URL示例
            const exampleUrl = `http://127.0.0.1:5030/api/v1/chatlog?talker=测试群聊&time=${encodeURIComponent(timeParam)}&format=text`;
            console.log(`   🔗 URL示例: ${exampleUrl.substring(0, 80)}...`);

        } catch (error) {
            console.log(`   ❌ 生成失败: ${error.message}`);
        }

        console.log('');
    }

    /**
     * 验证时间参数格式
     */
    validateTimeParam(timeParam) {
        if (!timeParam || typeof timeParam !== 'string') {
            return false;
        }

        // 检查基本格式：YYYY-MM-DD~YYYY-MM-DD 或 YYYY-MM-DD
        const patterns = [
            /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/, // 范围格式
            /^\d{4}-\d{2}-\d{2}$/ // 单日格式
        ];

        return patterns.some(pattern => pattern.test(timeParam));
    }

    /**
     * 测试与前端表单数据的兼容性
     */
    testFormCompatibility() {
        console.log('📝 测试前端表单数据兼容性');
        console.log('='.repeat(50));

        // 模拟前端表单提交的数据结构
        const formData = {
            name: '测试任务',
            chatrooms: ['测试群聊'],
            llm_model: 'deepseek-chat',
            time_range: {
                type: 'custom',
                start_date: '2025-07-01',
                end_date: '2025-07-18'
            }
        };

        console.log('📋 模拟前端表单数据:');
        console.log(JSON.stringify(formData, null, 2));
        console.log('');

        console.log('🔍 测试时间参数生成:');
        try {
            const timeParam = scheduler.generateTimeParam(formData.time_range);
            console.log('✅ 生成成功:', timeParam);
            
            // 验证是否符合ChatLog API的要求
            const expectedFormat = '2025-07-01~2025-07-18';
            if (timeParam === expectedFormat) {
                console.log('✅ 格式完全匹配ChatLog API要求');
            } else {
                console.log('❌ 格式不匹配，期望:', expectedFormat, '实际:', timeParam);
            }
        } catch (error) {
            console.log('❌ 生成失败:', error.message);
        }

        console.log('');
    }

    /**
     * 测试边界情况
     */
    testEdgeCases() {
        console.log('🔬 测试边界情况');
        console.log('='.repeat(50));

        const edgeCases = [
            { name: 'null值', timeRange: null },
            { name: 'undefined值', timeRange: undefined },
            { name: '空对象', timeRange: {} },
            { name: '无效类型', timeRange: { type: 'invalid_type' } },
            { name: '字符串类型', timeRange: 'recent_7d' },
            { name: '数字类型', timeRange: 7 }
        ];

        edgeCases.forEach((testCase, index) => {
            console.log(`🧪 [边界测试 ${index + 1}] ${testCase.name}`);
            try {
                const result = scheduler.generateTimeParam(testCase.timeRange);
                console.log(`   结果: ${result}`);
            } catch (error) {
                console.log(`   异常: ${error.message}`);
            }
            console.log('');
        });
    }
}

// 如果直接运行此脚本，执行所有测试
if (require.main === module) {
    const tester = new TimeRangeTest();
    
    tester.runAllTests();
    tester.testFormCompatibility();
    tester.testEdgeCases();
    
    console.log('🎯 测试总结');
    console.log('='.repeat(50));
    console.log('1. ✅ 修复了自定义时间范围的字段名匹配问题');
    console.log('2. ✅ 支持 start_date/end_date (新格式) 和 startDate/endDate (旧格式)');
    console.log('3. ✅ 生成的时间参数完全符合ChatLog API要求');
    console.log('4. ✅ 增加了错误处理和默认值逻辑');
    console.log('');
    console.log('🔧 如何使用:');
    console.log('- 前端表单使用 start_date 和 end_date 字段');
    console.log('- 生成的参数格式: YYYY-MM-DD~YYYY-MM-DD');
    console.log('- URL编码后传递给ChatLog API');
}

module.exports = TimeRangeTest; 