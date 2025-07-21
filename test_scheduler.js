/**
 * 调度器LLM集成测试脚本
 * 测试调度器是否能正确集成LLM服务进行聊天记录分析
 */

const { getDatabase } = require('./utils/database');
const scheduler = require('./services/scheduler');
const logger = require('./utils/logger');

async function testSchedulerLLMIntegration() {
    console.log('开始测试调度器LLM集成...\n');
    
    try {
        const db = getDatabase();
        
        // 获取第一个启用的任务
        const tasks = db.getTasks();
        const enabledTask = tasks.find(t => t.status === 'enabled');
        
        if (!enabledTask) {
            console.log('❌ 没有找到启用状态的任务');
            console.log('可用任务:');
            tasks.forEach(task => {
                console.log(`  - ID: ${task.id}, 名称: ${task.name}, 状态: ${task.status}`);
            });
            return;
        }
        
        console.log('🎯 找到测试任务:');
        console.log(`  - ID: ${enabledTask.id}`);
        console.log(`  - 名称: ${enabledTask.name}`);
        console.log(`  - 群聊: ${enabledTask.chatrooms.join(', ')}`);
        console.log(`  - LLM模型: ${enabledTask.llm_model || '未设置'}`);
        console.log(`  - 提示词: ${enabledTask.prompt || '未设置'}`);
        console.log();
        
        // 启动调度器
        scheduler.start();
        
        // 手动执行任务流程
        console.log('🚀 开始执行任务流程...\n');
        await scheduler.executeTaskNow(enabledTask.id);
        
        console.log('\n✅ 任务执行完成！');
        
        // 查看生成的报告
        const reports = db.getReports();
        const latestReport = reports[reports.length - 1];
        
        if (latestReport) {
            console.log('\n📊 最新报告信息:');
            console.log(`  - 报告ID: ${latestReport.id}`);
            console.log(`  - 任务名称: ${latestReport.task_name}`);
            console.log(`  - 执行时间: ${latestReport.execution_time}`);
            console.log(`  - 状态: ${latestReport.status}`);
            console.log(`  - 报告文件: ${latestReport.report_file || '无'}`);
            
            if (latestReport.error_message) {
                console.log(`  - 错误信息: ${latestReport.error_message}`);
            }
        }
        
        scheduler.stop();
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        scheduler.stop();
    }
}

// 运行测试
if (require.main === module) {
    testSchedulerLLMIntegration();
}

module.exports = { testSchedulerLLMIntegration }; 