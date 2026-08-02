
(function (global) {
    'use strict';
    const events = {};      // 普通事件监听池
    const onceEvents = {};  // 单次监听池
    const pendingRequests = {}; // 请求-响应池（用于处理需要返回值的调用）

    global.EventBus = {

        //--- emit 和 on        配合使用 ---
        //--- call 和 respondTo 配合使用 ---

        /**
         * 监听普通事件（永久有效）
         * 理解:提供了事件名,emit这个事件名的时候,就会触发on的功能
         * @param {string} eventName 事件名
         * @param {Function} callback 回调函数，接收data和respond回调
         */
        on(eventName, callback) {
            events[eventName] = events[eventName] || [];
            events[eventName].push(callback);
        },

        /**
         * 取消监听
         * @param {string} eventName 事件名
         * @param {Function} callback 要取消的回调（可选，不传则取消所有）
         */
        off(eventName, callback) {
            if (callback) {
                events[eventName] = (events[eventName] || []).filter(cb => cb !== callback);
                onceEvents[eventName] = (onceEvents[eventName] || []).filter(cb => cb !== callback);
            } else {
                delete events[eventName];
                delete onceEvents[eventName];
            }
        },

        /**
         * 监听单次事件（执行一次后自动销毁）
         * @param {string} eventName 事件名
         * @param {Function} callback 回调函数
         */
        once(eventName, callback) {
            onceEvents[eventName] = onceEvents[eventName] || [];
            onceEvents[eventName].push(callback);
        },

        /**
         * 发送普通事件（通知类，不需要返回值）
         * 理解:emit其他on的事件名,就会触发on的功能
         * @param {string} eventName 事件名
         * @param {*} data 传递的数据(相当于参数)
         */
        emit(eventName, data) {
            // 处理普通监听
            (events[eventName] || []).forEach(cb => {
                try { cb(data); } catch (e) { console.error(`事件${eventName}执行报错：`, e); }
            });
            // 处理单次监听
            (onceEvents[eventName] || []).forEach(cb => {
                try { cb(data); } catch (e) { console.error(`事件${eventName}执行报错：`, e); }
            });
            // 单次监听执行后销毁
            delete onceEvents[eventName];

            // 调试日志（开发环境开启，生产环境可以关掉）
            if (global.__DEV__) {
                console.log(`📢 事件发送：${eventName}`, data);
            }
        },

        /**
         * 发送请求事件（需要返回值，模拟同步调用）
         * @param {string} requestName 请求名（格式：REQUEST_XXX）
         * @param {*} data 请求参数
         * @returns {Promise} 等待响应的Promise
         */
        request(requestName, data) {
            return new Promise(resolve => {
                const requestId = Date.now() + '_' + Math.random().toString(36).slice(2);
                pendingRequests[requestId] = resolve;
                this.emit(requestName, { requestId, data });
                // 超时处理（5秒没响应自动 reject，避免内存泄漏）
                setTimeout(() => {
                    if (pendingRequests[requestId]) {
                        console.warn(`⚠️ 请求${requestName}超时，requestId：${requestId}`);
                        delete pendingRequests[requestId];
                        resolve(null);
                    }
                }, 5000);
            });
        },

        /**
         * 响应请求事件（由处理请求的模块调用）
         * @param {string} requestName 请求名
         * @param {Function} handler 处理函数，接收data，返回结果
         */
        respondTo(requestName, handler) {
            this.on(requestName, async ({ requestId, data }) => {
                try {
                    const result = await handler(data);
                    if (pendingRequests[requestId]) {
                        pendingRequests[requestId](result);
                        delete pendingRequests[requestId];
                    }
                } catch (e) {
                    console.error(`请求${requestName}处理报错：`, e);
                    if (pendingRequests[requestId]) {
                        pendingRequests[requestId](null);
                        delete pendingRequests[requestId];
                    }
                }
            });
        },

        /**
         * 快捷命令调用（模拟直接调用全局函数，用起来更习惯）
         * @param {string} command 命令名（格式：CMD_XXX）
         * @param {*} data 参数
         * @returns {Promise} 如果命令支持响应，则返回Promise
         */
        call(command, data) {
            // 先判断是通知类命令还是请求类命令
            if (command.startsWith('CMD_NOTIFY_')) {
                this.emit(command, data);
                return Promise.resolve();
            } else if (command.startsWith('CMD_REQ_')) {
                return this.request(command, data);
            } else {
                console.warn(`⚠️ 命令${command}格式错误，应以CMD_NOTIFY_或CMD_REQ_开头`);
                return Promise.resolve();
            }
        }
    };

    // 开发环境标记，方便调试
    global.__DEV__ = true;
})(window);