/**
 * 坚果云WebDAV同步功能
 */
class NutstoreSync {
    constructor() {
        this.isConfigured = false;
        // 原始坚果云WebDAV URL
        this.originalWebdavUrl = 'https://dav.jianguoyun.com/dav/';
        // Cloudflare Worker代理URL - 需要修改为您自己的Worker URL
        this.proxyUrl = 'https://money.alal225b.workers.dev/';
        this.useProxy = true; // 默认使用代理
        this.username = '';
        this.appPassword = '';
        this.syncFilename = 'money-goal-tracker-data.json';
        this.path = '';
        
        // 尝试从localStorage加载坚果云配置
        this.loadConfig();
    }
    
    /**
     * 加载坚果云配置
     */
    loadConfig() {
        const config = JSON.parse(localStorage.getItem('nutstoreConfig'));
        if (config && config.username && config.appPassword) {
            this.username = config.username;
            this.appPassword = config.appPassword;
            this.path = config.path || '';
            this.syncFilename = config.syncFilename || 'money-goal-tracker-data.json';
            this.useProxy = config.useProxy !== undefined ? config.useProxy : true;
            this.isConfigured = true;
        }
    }
    
    /**
     * 保存坚果云配置
     */
    saveConfig(username, appPassword, path = '', syncFilename = 'money-goal-tracker-data.json', useProxy = true) {
        this.username = username;
        this.appPassword = appPassword;
        this.path = path || '';
        this.syncFilename = syncFilename;
        this.useProxy = useProxy;
        this.isConfigured = true;
        
        // 保存配置到localStorage
        localStorage.setItem('nutstoreConfig', JSON.stringify({
            username,
            appPassword,
            path,
            syncFilename,
            useProxy
        }));
    }
    
    /**
     * 清除坚果云配置
     */
    clearConfig() {
        this.username = '';
        this.appPassword = '';
        this.path = '';
        this.isConfigured = false;
        localStorage.removeItem('nutstoreConfig');
    }
    
    /**
     * 获取WebDAV基础URL（直连或使用代理）
     */
    getBaseUrl() {
        return this.useProxy ? this.proxyUrl : this.originalWebdavUrl;
    }
    
    /**
     * 获取完整的WebDAV URL
     */
    getFullUrl() {
        // 对于代理模式，需要特殊处理URL结构
        if (this.useProxy) {
            // 确保代理URL以斜杠结尾
            let proxyBase = this.proxyUrl;
            if (!proxyBase.endsWith('/')) {
                proxyBase += '/';
            }
            
            // 简单拼接路径和文件名，让Worker处理完整路径
            return proxyBase + (this.path ? this.path + '/' : '') + this.syncFilename;
        } else {
            // 直连模式下的URL构建
            let fullPath = this.originalWebdavUrl + (this.path ? this.path + '/' : '');
            // 确保路径中不含多余的斜杠
            fullPath = fullPath.replace(/\/+/g, '/');
            // 确保最后有一个斜杠
            if (!fullPath.endsWith('/')) {
                fullPath += '/';
            }
            return fullPath + this.syncFilename;
        }
    }
    
    /**
     * 获取Basic认证头
     */
    getAuthHeader() {
        const credentials = btoa(`${this.username}:${this.appPassword}`);
        return `Basic ${credentials}`;
    }
    
    /**
     * 测试连接
     */
    async testConnection() {
        if (!this.isConfigured) {
            throw new Error('坚果云WebDAV未配置');
        }
        
        try {
            console.log('测试连接到:', this.getFullUrl());
            const response = await fetch(this.getFullUrl(), {
                method: 'PROPFIND',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Depth': '0'
                }
            });
            
            // 记录响应信息以便调试
            console.log('连接测试响应状态:', response.status);
            
            if (response.status === 207) { // 207表示成功的多状态响应
                return true;
            } else if (response.status === 404) {
                // 文件不存在但连接可能是正确的
                return true;
            } else if (response.status === 200) {
                // 有些代理可能将207转换为200
                return true;
            } else {
                throw new Error(`连接测试失败，状态码: ${response.status}`);
            }
        } catch (error) {
            console.error('连接测试错误:', error);
            
            // 如果直连失败并且还没有尝试代理，尝试切换到代理模式
            if (!this.useProxy && error.message.includes('Failed to fetch')) {
                this.useProxy = true;
                try {
                    const success = await this.testConnection();
                    if (success) {
                        // 如果代理连接成功，保存使用代理的配置
                        this.saveConfig(this.username, this.appPassword, this.path, this.syncFilename, true);
                        return true;
                    }
                } catch (proxyError) {
                    // 代理也失败，抛出原始错误
                    this.useProxy = false; // 恢复原来的设置
                    throw error;
                }
            }
            
            throw new Error(`连接测试失败: ${error.message}`);
        }
    }
    
    /**
     * 上传数据
     */
    async uploadData(data) {
        if (!this.isConfigured) {
            throw new Error('坚果云WebDAV未配置');
        }
        
        const jsonData = JSON.stringify(data);
        
        try {
            console.log('上传数据到:', this.getFullUrl());
            const response = await fetch(this.getFullUrl(), {
                method: 'PUT',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                body: jsonData
            });
            
            console.log('上传响应状态:', response.status);
            
            if (response.ok) {
                return true;
            } else {
                // 尝试读取响应文本以获取更多错误信息
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = '无法获取错误详情';
                }
                
                throw new Error(`上传失败，状态码: ${response.status}, 详情: ${errorText}`);
            }
        } catch (error) {
            console.error('上传错误:', error);
            
            // 如果直连失败并且还没有尝试代理，尝试切换到代理模式
            if (!this.useProxy && error.message.includes('Failed to fetch')) {
                this.useProxy = true;
                try {
                    const success = await this.uploadData(data);
                    if (success) {
                        // 如果代理上传成功，保存使用代理的配置
                        this.saveConfig(this.username, this.appPassword, this.path, this.syncFilename, true);
                        return true;
                    }
                } catch (proxyError) {
                    // 代理也失败，抛出原始错误
                    this.useProxy = false; // 恢复原来的设置
                    throw error;
                }
            }
            
            throw new Error(`上传失败: ${error.message}`);
        }
    }
    
    /**
     * 下载数据
     */
    async downloadData() {
        if (!this.isConfigured) {
            throw new Error('坚果云WebDAV未配置');
        }
        
        try {
            console.log('下载数据从:', this.getFullUrl());
            const response = await fetch(this.getFullUrl(), {
                method: 'GET',
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });
            
            console.log('下载响应状态:', response.status);
            
            if (response.ok) {
                try {
                    const jsonData = await response.json();
                    return jsonData;
                } catch (parseError) {
                    console.error('JSON解析错误:', parseError);
                    throw new Error(`下载的数据不是有效的JSON: ${parseError.message}`);
                }
            } else if (response.status === 404) {
                // 文件不存在
                return null;
            } else {
                // 尝试读取响应文本以获取更多错误信息
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = '无法获取错误详情';
                }
                
                throw new Error(`下载失败，状态码: ${response.status}, 详情: ${errorText}`);
            }
        } catch (error) {
            console.error('下载错误:', error);
            
            // 如果直连失败并且还没有尝试代理，尝试切换到代理模式
            if (!this.useProxy && error.message.includes('Failed to fetch')) {
                this.useProxy = true;
                try {
                    const data = await this.downloadData();
                    if (data !== undefined) { // 即使返回null也是有效响应
                        // 如果代理下载成功，保存使用代理的配置
                        this.saveConfig(this.username, this.appPassword, this.path, this.syncFilename, true);
                        return data;
                    }
                } catch (proxyError) {
                    // 代理也失败，抛出原始错误
                    this.useProxy = false; // 恢复原来的设置
                    throw error;
                }
            }
            
            throw new Error(`下载失败: ${error.message}`);
        }
    }
    
    /**
     * 设置是否使用代理
     */
    setUseProxy(useProxy) {
        this.useProxy = useProxy;
        if (this.isConfigured) {
            this.saveConfig(this.username, this.appPassword, this.path, this.syncFilename, useProxy);
        }
    }
    
    /**
     * 设置代理URL
     */
    setProxyUrl(proxyUrl) {
        if (proxyUrl && proxyUrl.trim()) {
            this.proxyUrl = proxyUrl.trim();
            // 确保URL以斜杠结尾
            if (!this.proxyUrl.endsWith('/')) {
                this.proxyUrl += '/';
            }
        }
    }
} 