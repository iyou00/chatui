/**
 * 测试时间范围数据迁移功能 - chatui项目
 */

const { getDatabase } = require('./utils/database');

async function testMigration() {
    console.log('🧪 开始测试chatui项目的时间范围数据迁移...');
    
    try {
        // 获取数据库实例
        const db = getDatabase();
        
        // 获取所有报告
        const reports = db.reports;
        console.log(`📊 当前报告总数: ${reports.length}`);
        
        // 检查每个报告的时间范围信息
        reports.forEach((report, index) => {
            console.log(`\n📋 报告 ${index + 1}:`);
            console.log(`   ID: ${report.id}`);
            console.log(`   任务名称: ${report.task_name}`);
            console.log(`   群聊名称: ${report.chatroom_name}`);
            console.log(`   时间范围: ${JSON.stringify(report.time_range)}`);
            
            if (!report.time_range) {
                console.log(`   ⚠️ 缺少时间范围信息`);
            } else {
                console.log(`   ✅ 时间范围信息完整`);
            }
        });
        
        // 手动触发迁移
        console.log('\n🔄 手动触发数据迁移...');
        const migratedCount = db.migrateReportData();
        console.log(`✅ 迁移完成，更新了 ${migratedCount} 个报告`);
        
        // 再次检查
        console.log('\n📊 迁移后的报告状态:');
        reports.forEach((report, index) => {
            console.log(`   报告 ${index + 1}: ${report.time_range ? '✅' : '❌'} ${JSON.stringify(report.time_range)}`);
        });
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
}

// 运行测试
testMigration();