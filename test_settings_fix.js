/**
 * 设置保存修复验证工具
 * 
 * 功能：
 * 1. 测试配置保存的完整性
 * 2. 验证系统字段保护机制
 * 3. 模拟用户设置保存场景
 * 4. 生成配置完整性报告
 */

const settingsManager = require('./services/settingsManager');
const fs = require('fs');
const path = require('path');

class SettingsFixTester {
    constructor() {
        this.configPath = path.join(__dirname, 'data/config.json');
        console.log('🔧 设置保存修复验证工具');
        console.log('='.repeat(60));
    }

    /**
     * 备份当前配置
     */
    backupCurrentConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const backupPath = this.configPath + '.backup.' + Date.now();
                fs.copyFileSync(this.configPath, backupPath);
                console.log(`📦 已备份当前配置到: ${backupPath}`);
                return backupPath;
            }
        } catch (error) {
            console.error('备份配置失败:', error.message);
        }
        return null;
    }

    /**
     * 恢复配置
     */
    restoreConfig(backupPath) {
        try {
            if (backupPath && fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, this.configPath);
                fs.unlinkSync(backupPath);
                console.log('🔄 已恢复原始配置');
            }
        } catch (error) {
            console.error('恢复配置失败:', error.message);
        }
    }

    /**
     * 测试1：基础配置保存
     */
    testBasicConfigSave() {
        console.log('\n📝 [测试1] 基础配置保存');
        console.log('-'.repeat(40));

        // 模拟用户提交的配置（只包含用户字段）
        const userConfig = {
            chatlogUrl: 'http://127.0.0.1:5030',
            llmApiKeys: {
                deepseek: 'sk-test-deepseek-key',
                gemini: '',
                kimi: 'sk-test-kimi-key'
            }
        };

        console.log('用户提交的配置:', JSON.stringify(userConfig, null, 2));

        // 保存配置
        settingsManager.saveConfig(userConfig);

        // 验证保存结果
        const savedConfig = settingsManager.loadConfig();
        console.log('保存后的完整配置:', JSON.stringify(savedConfig, null, 2));

        // 检查系统字段是否被保护
        const hasSystemFields = savedConfig.nextTaskId && savedConfig.nextReportId && savedConfig.nextTemplateId;
        console.log('系统字段保护:', hasSystemFields ? '✅ 成功' : '❌ 失败');

        return hasSystemFields;
    }

    /**
     * 测试2：系统字段保护
     */
    testSystemFieldProtection() {
        console.log('\n🛡️ [测试2] 系统字段保护');
        console.log('-'.repeat(40));

        // 先设置一些系统字段值
        const initialConfig = {
            chatlogUrl: 'http://127.0.0.1:5030',
            llmApiKeys: {
                deepseek: 'sk-test-key',
                gemini: '',
                kimi: ''
            },
            nextTaskId: 10,
            nextReportId: 5,
            nextTemplateId: 15
        };

        settingsManager.saveConfig(initialConfig);
        console.log('初始配置已设置，系统字段值:', {
            nextTaskId: 10,
            nextReportId: 5,
            nextTemplateId: 15
        });

        // 模拟用户只提交用户字段（不包含系统字段）
        const userOnlyConfig = {
            chatlogUrl: 'http://127.0.0.1:5030',
            llmApiKeys: {
                deepseek: 'sk-updated-key',
                gemini: 'sk-new-gemini-key',
                kimi: ''
            }
        };

        settingsManager.saveConfig(userOnlyConfig);

        // 验证系统字段是否被保护
        const finalConfig = settingsManager.loadConfig();
        const systemFieldsPreserved = 
            finalConfig.nextTaskId === 10 &&
            finalConfig.nextReportId === 5 &&
            finalConfig.nextTemplateId === 15;

        console.log('用户字段更新后的配置:', JSON.stringify(finalConfig, null, 2));
        console.log('系统字段保护结果:', systemFieldsPreserved ? '✅ 成功' : '❌ 失败');

        return systemFieldsPreserved;
    }

    /**
     * 测试3：首次运行标志处理
     */
    testFirstRunFlag() {
        console.log('\n🚀 [测试3] 首次运行标志处理');
        console.log('-'.repeat(40));

        // 模拟首次运行场景
        const firstRunConfig = {
            isFirstRun: true,
            chatlogUrl: '',
            llmApiKeys: {
                deepseek: '',
                gemini: '',
                kimi: ''
            }
        };

        settingsManager.saveConfig(firstRunConfig);
        console.log('首次运行状态:', settingsManager.isFirstRun() ? '是' : '否');

        // 模拟用户完成配置
        const completedConfig = {
            chatlogUrl: 'http://127.0.0.1:5030',
            llmApiKeys: {
                deepseek: 'sk-configured-key',
                gemini: '',
                kimi: ''
            }
        };

        settingsManager.saveConfig(completedConfig);
        settingsManager.setFirstRunFlag(false);

        const isStillFirstRun = settingsManager.isFirstRun();
        console.log('配置完成后首次运行状态:', isStillFirstRun ? '是' : '否');
        console.log('首次运行标志处理:', !isStillFirstRun ? '✅ 成功' : '❌ 失败');

        return !isStillFirstRun;
    }

    /**
     * 测试4：配置完整性报告
     */
    testConfigIntegrityReport() {
        console.log('\n📊 [测试4] 配置完整性报告');
        console.log('-'.repeat(40));

        const currentConfig = settingsManager.loadConfig();
        const report = settingsManager.getConfigIntegrityReport(currentConfig);

        console.log('配置完整性报告:');
        console.log('- 配置有效性:', report.isValid ? '✅ 有效' : '❌ 无效');
        console.log('- 用户字段:', JSON.stringify(report.userFields, null, 2));
        console.log('- 系统字段:', JSON.stringify(report.systemFields, null, 2));
        
        if (report.issues.length > 0) {
            console.log('- 发现问题:', report.issues);
        }

        return report.isValid;
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🚀 开始运行设置保存修复验证测试...\n');

        const backupPath = this.backupCurrentConfig();
        const results = [];

        try {
            // 运行所有测试
            results.push({ name: '基础配置保存', passed: this.testBasicConfigSave() });
            results.push({ name: '系统字段保护', passed: this.testSystemFieldProtection() });
            results.push({ name: '首次运行标志处理', passed: this.testFirstRunFlag() });
            results.push({ name: '配置完整性报告', passed: this.testConfigIntegrityReport() });

            // 生成测试报告
            this.generateTestReport(results);

        } catch (error) {
            console.error('测试执行失败:', error);
        } finally {
            // 恢复原始配置
            if (backupPath) {
                this.restoreConfig(backupPath);
            }
        }
    }

    /**
     * 生成测试报告
     */
    generateTestReport(results) {
        console.log('\n📋 测试报告');
        console.log('='.repeat(60));

        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;

        results.forEach(result => {
            const status = result.passed ? '✅ 通过' : '❌ 失败';
            console.log(`${result.name}: ${status}`);
        });

        console.log('-'.repeat(40));
        console.log(`总体结果: ${passedTests}/${totalTests} 测试通过`);

        if (passedTests === totalTests) {
            console.log('🎉 所有测试通过！设置保存修复成功！');
            console.log('\n✅ 修复效果:');
            console.log('1. 用户配置保存时不会丢失系统字段');
            console.log('2. 系统字段受到保护，不会被意外重置');
            console.log('3. 首次运行标志正确处理');
            console.log('4. 配置完整性检查正常工作');
        } else {
            console.log('⚠️ 部分测试失败，需要进一步检查');
        }
    }
}

// 运行测试
if (require.main === module) {
    const tester = new SettingsFixTester();
    tester.runAllTests();
}

module.exports = SettingsFixTester;