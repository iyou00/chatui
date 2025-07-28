/*
chatlogService.js

本模块负责chatlog数据的导入、解析、存储和查询。
所有chatlog数据持久化于 data/chatlogs.json，支持多格式兼容。
*/

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const settingsManager = require('./settingsManager');

// chatlog数据文件路径
const CHATLOG_PATH = path.join(__dirname, '../data/chatlogs.json');

// 保证chatlog数据文件存在
function ensureChatlogFile() {
    if (!fs.existsSync(CHATLOG_PATH)) {
        fs.writeFileSync(CHATLOG_PATH, '[]', 'utf-8');
    }
}

/**
 * 解析CSV格式的群聊数据
 * @param {string} csvData - CSV格式的数据
 * @returns {Array} 解析后的群聊数组
 */
function parseCSVChatrooms(csvData) {
    const lines = csvData.trim().split('\n');

    if (lines.length < 2) {
        console.warn('⚠️ CSV数据行数不足');
        return [];
    }

    // 解析表头
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('📋 CSV表头:', headers);

    // 预期的表头格式：Name,Remark,NickName,Owner,UserCount
    // 查找关键字段的索引
    const nameIndex = headers.findIndex(h => h === 'Name'); // 精确匹配Name字段（群聊ID）
    const nickNameIndex = headers.findIndex(h => h === 'NickName'); // 精确匹配昵称字段
    const remarkIndex = headers.findIndex(h => h === 'Remark'); // 精确匹配备注字段
    const ownerIndex = headers.findIndex(h => h === 'Owner');
    const userCountIndex = headers.findIndex(h => h === 'UserCount');

    console.log('📍 字段索引:', { nameIndex, nickNameIndex, remarkIndex, ownerIndex, userCountIndex });

    const chatrooms = [];

    // 解析数据行
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 简单的CSV解析（假设字段中没有逗号）
        const fields = line.split(',');

        if (fields.length < headers.length) {
            console.warn(`⚠️ 第${i + 1}行字段数量不足:`, line);
            continue;
        }

        const wxid = fields[nameIndex]?.trim() || '';
        const nickname = fields[nickNameIndex]?.trim() || '';
        const remark = fields[remarkIndex]?.trim() || '';
        const owner = fields[ownerIndex]?.trim() || '';
        const userCount = parseInt(fields[userCountIndex]?.trim() || '0');

        if (wxid) {
            // 优先使用昵称作为显示名称，其次使用备注，最后使用ID
            let displayName = nickname || remark || wxid;

            // 如果显示名称为空或只是ID，跳过
            if (!displayName || displayName.trim() === '') {
                continue;
            }

            // 直接添加显示名称到结果数组
            chatrooms.push(displayName);
        }
    }

    console.log(`📊 CSV解析完成，共解析出 ${chatrooms.length} 个群聊`);
    // 移除敏感数据示例，只显示统计信息
    console.log(`📊 CSV解析状态: 数据提取成功`);
    return chatrooms;
}

/**
 * 从外部chatlog服务获取群聊列表
 * @returns {Array} 群聊名称数组
 */
async function getChatroomsFromExternal() {
    try {
        const config = settingsManager.loadConfig();
        const chatlogUrl = config.chatlogUrl;

        if (!chatlogUrl) {
            throw new Error('Chatlog服务地址未配置');
        }

        // 正确处理URL，确保没有双斜杠
        let fullUrl = chatlogUrl.startsWith('http') ? chatlogUrl : `http://${chatlogUrl}`;
        // 移除末尾的斜杠，避免双斜杠问题
        if (fullUrl.endsWith('/')) {
            fullUrl = fullUrl.slice(0, -1);
        }

        console.log('🔗 正在从外部chatlog服务获取群聊列表:', fullUrl);

        // 尝试多个可能的API端点和参数组合
        const apiAttempts = [
            // 标准API v1端点
            {
                endpoint: '/api/v1/chatroom',
                params: { format: 'json' },
                desc: 'API v1 + JSON格式'
            },
            {
                endpoint: '/api/v1/chatroom',
                params: { format: 'csv' },
                desc: 'API v1 + CSV格式'
            },
            {
                endpoint: '/api/v1/chatroom',
                params: { limit: 100 },
                desc: 'API v1 + 限制数量'
            },
            {
                endpoint: '/api/v1/chatroom',
                params: {},
                desc: 'API v1 无参数'
            },
            // 备选端点
            {
                endpoint: '/api/chatroom',
                params: { format: 'json' },
                desc: '简化API + JSON格式'
            },
            {
                endpoint: '/chatroom',
                params: {},
                desc: '简单端点'
            },
        ];

        let response;
        let successfulAttempt = null;
        let lastError;

        // 依次尝试每个API配置
        for (const attempt of apiAttempts) {
            try {
                console.log(`🔍 尝试: ${attempt.desc}`);
                console.log(`   📍 端点: ${fullUrl}${attempt.endpoint}`);
                console.log(`   📋 参数: ${JSON.stringify(attempt.params)}`);

                response = await axios.get(`${fullUrl}${attempt.endpoint}`, {
                    params: attempt.params,
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'ChatChat-Platform/1.0',
                        'Accept': 'application/json, text/csv, text/plain'
                    },
                    // 绕过代理设置，因为ChatLog是本地服务
                    proxy: false
                });

                // 检查响应是否是HTML页面
                if (typeof response.data === 'string' &&
                    (response.data.trim().startsWith('<!DOCTYPE') || response.data.trim().startsWith('<html'))) {
                    console.warn(`⚠️ ${attempt.desc} 返回HTML页面，尝试下一个`);
                    continue;
                }

                console.log(`✅ ${attempt.desc} 返回有效数据`);
                console.log(`   📊 状态: ${response.status}`);
                console.log(`   📋 类型: ${typeof response.data}`);
                console.log(`   📏 长度: ${Array.isArray(response.data) ? response.data.length : response.data?.length || 0}`);

                successfulAttempt = attempt;
                break;

            } catch (error) {
                console.warn(`⚠️ ${attempt.desc} 失败: ${error.response?.status || error.message}`);
                lastError = error;
                continue;
            }
        }

        // 如果所有尝试都失败了
        if (!response || !successfulAttempt) {
            console.error('❌ 所有API端点都失败了');
            console.error('🔧 可能的问题:');
            console.error('   - ChatLog服务的群聊列表API不存在或路径不同');
            console.error('   - 服务版本不支持这些接口');
            console.error('   - 需要特定的认证或配置');
            console.error('   - API路径已变更，请检查ChatLog文档');
            throw new Error(`ChatLog群聊列表API不可用。最后错误: ${lastError?.message || '所有端点都失败'}`);
        }

        console.log('📝 外部chatlog服务响应成功:', {
            endpoint: successfulAttempt.endpoint,
            params: successfulAttempt.params,
            status: response.status,
            dataType: typeof response.data
        });

        // 解析响应数据
        let groups = [];

        console.log('🔍 分析响应数据类型和内容...');
        console.log(`📊 数据类型: ${typeof response.data}`);

        if (typeof response.data === 'string') {
            const rawData = response.data.trim();
            console.log(`📏 字符串长度: ${rawData.length}`);
            // 移除敏感数据预览，只记录是否包含标识符
            console.log(`📄 内容格式检查: 包含逗号=${rawData.includes(',')}, 包含换行=${rawData.includes('\n')}`);

            // 检查是否返回了HTML页面
            if (rawData.startsWith('<!DOCTYPE') || rawData.startsWith('<html')) {
                console.error('❌ 服务返回HTML页面而不是数据');
                throw new Error('API返回HTML页面，请检查端点配置');
            }

            // 优先检查CSV格式（ChatLog经常返回CSV）
            if (rawData.includes(',') && rawData.includes('\n') && rawData.includes('Name')) {
                try {
                    console.log('📊 检测到CSV格式数据，开始解析...');
                    groups = parseCSVChatrooms(rawData);
                    console.log(`✅ CSV解析成功: ${groups.length} 个群聊`);
                    // 移除样本数据显示，只显示数量
                    if (groups.length > 0) {
                        console.log('📊 CSV解析统计: 成功解析数据');
                    }
                } catch (csvError) {
                    console.error('❌ CSV解析失败:', csvError.message);
                    groups = [];
                }
            } else {
                // 尝试JSON解析
                try {
                    console.log('🔧 尝试解析字符串为JSON...');
                    const parsed = JSON.parse(rawData);
                    groups = parsed.data || parsed.chatrooms || parsed || [];
                    console.log('✅ JSON解析成功');
                } catch (parseError) {
                    console.error('❌ JSON解析失败:', parseError.message);
                    console.log('📄 尝试按行解析纯文本...');

                    // 如果不是JSON也不是标准CSV，尝试按行解析
                    const lines = rawData.split('\n').filter(line => line.trim());
                    if (lines.length > 0) {
                        groups = lines.map((line, index) => ({
                            id: `line_${index}`,
                            name: line.trim(),
                            type: 'text_line'
                        }));
                        console.log(`✅ 按行解析成功: ${groups.length} 行`);
                    } else {
                        groups = [];
                    }
                }
            }
        } else if (Array.isArray(response.data)) {
            // 直接是数组
            groups = response.data;
            console.log(`✅ 直接获得数组数据: ${groups.length} 项`);
        } else if (typeof response.data === 'object' && response.data !== null) {
            // 对象格式，尝试提取数组
            console.log('📋 对象结构字段数:', Object.keys(response.data).length);
            groups = response.data.data || response.data.chatrooms || response.data.rooms ||
                response.data.groups || response.data.chatroom || [];
            console.log(`✅ 从对象中提取数组数据: ${groups.length} 项`);

            // 如果对象格式还是空的，可能数据在其他字段中
            if (groups.length === 0) {
                console.log('⚠️ 标准字段为空，检查其他可能的字段...');
                const keys = Object.keys(response.data);
                for (const key of keys) {
                    if (Array.isArray(response.data[key])) {
                        groups = response.data[key];
                        console.log(`✅ 从字段 ${key} 找到数组: ${groups.length} 项`);
                        break;
                    }
                }
            }
        } else {
            console.warn('⚠️ 未知的响应数据格式');
        }

        // 确保groups是数组
        if (!Array.isArray(groups)) {
            console.warn('⚠️ 最终数据不是数组格式:', {
                type: typeof groups,
                hasKeys: typeof groups === 'object' && groups !== null
            });
            groups = [];
        }

        // 移除敏感数据样本显示，只记录统计信息
        console.log('✅ 最终群聊数据统计:', {
            count: groups.length,
            isEmpty: groups.length === 0
        });

        // 处理ChatLog返回的数据格式
        let chatrooms = [];

        if (Array.isArray(groups)) {
            console.log('🔍 处理群聊数组数据...');

            chatrooms = groups.map(group => {
                if (typeof group === 'string') {
                    // 如果是字符串，直接返回
                    return group;
                } else if (typeof group === 'object' && group !== null) {
                    // 如果是对象，提取群聊名称
                    // 优先使用 nickName，其次 remark，最后 name（ID）
                    let displayName = group.nickName || group.nickname ||
                        group.remark || group.Remark ||
                        group.name || group.id;

                    return displayName;
                } else {
                    return null;
                }
            }).filter(name => name && name.trim() && name !== 'undefined');

            console.log(`✅ 成功提取 ${chatrooms.length} 个群聊名称`);
        } else {
            console.warn('⚠️ 解析结果不是预期的数组格式:', typeof groups);
            chatrooms = [];
        }

        // 去重并返回
        const uniqueChatrooms = [...new Set(chatrooms)];

        console.log(`✅ 最终群聊名称列表: ${uniqueChatrooms.length}个（已去重）`);
        // 移除敏感数据预览，只显示统计信息
        if (uniqueChatrooms.length > 0) {
            console.log('📊 群聊数据状态: 成功获取群聊列表');
        }

        return uniqueChatrooms;

    } catch (error) {
        console.error('❌ 从外部chatlog服务获取群聊列表失败:', error.message);

        // 提供更详细的错误信息和解决建议
        if (error.code === 'ECONNREFUSED') {
            throw new Error('Chatlog服务连接失败，请检查服务是否运行在指定地址');
        } else if (error.response?.status === 404) {
            throw new Error('Chatlog服务API接口不存在，请检查服务版本和API路径');
        } else if (error.response?.status === 500) {
            throw new Error('Chatlog服务内部错误，请检查服务日志');
        } else {
            throw new Error(`Chatlog服务响应异常: ${error.message}`);
        }
    }
}

/**
 * 导入chatlog数据，自动分配ID并存储。
 * @param {Object} chatlog - 单个群聊的聊天记录对象
 * @returns {Object} 导入后的chatlog对象
 */
function importChatlog(chatlog) {
    ensureChatlogFile();
    const logs = getChatlogs();
    // 自动分配ID
    const newId = logs.length > 0 ? logs[logs.length - 1].id + 1 : 1;
    const newLog = { ...chatlog, id: newId };
    logs.push(newLog);
    fs.writeFileSync(CHATLOG_PATH, JSON.stringify(logs, null, 2), 'utf-8');
    return newLog;
}

/**
 * 获取所有chatlog数据。
 * @returns {Array} chatlog数组
 */
function getChatlogs() {
    ensureChatlogFile();
    try {
        const raw = fs.readFileSync(CHATLOG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        return [];
    }
}

/**
 * 获取所有群聊名称（优先从外部服务获取，失败时回退到本地数据）。
 * @returns {Array} 群聊名称数组
 */
async function getChatrooms() {
    console.log('🔍 开始获取群聊列表...');

    // 首先检查配置中是否有预设的群聊名称
    const config = settingsManager.loadConfig();
    const presetChatrooms = config.presetChatrooms || [];

    if (presetChatrooms.length > 0) {
        console.log('✅ 使用配置中的预设群聊名称:', presetChatrooms.length, '个');
        return presetChatrooms;
    }

    try {
        // 只从外部ChatLog服务获取真实群聊数据
        console.log('🌐 从外部ChatLog服务获取群聊列表...');
        const externalRooms = await getChatroomsFromExternal();

        if (externalRooms && externalRooms.length > 0) {
            console.log(`✅ 成功获取 ${externalRooms.length} 个群聊`);
            // 移除敏感数据预览，只显示统计信息
            console.log('📊 群聊数据状态: 数据获取成功');
            return externalRooms;
        } else {
            console.log('⚠️ 外部ChatLog服务返回空数据');
            return [];
        }
    } catch (error) {
        console.warn('⚠️ 外部ChatLog服务获取失败:', error.message);
        return [];
    }
}

/**
 * 按群聊名查找chatlog。
 * @param {string} roomName - 群聊名称
 * @returns {Object|null} 匹配的chatlog对象或null
 */
function findChatlogByRoom(roomName) {
    const logs = getChatlogs();
    return logs.find(log => log.chatroom === roomName) || null;
}

module.exports = {
    importChatlog,
    getChatlogs,
    getChatrooms,
    getChatroomsFromExternal,
    findChatlogByRoom
}; 