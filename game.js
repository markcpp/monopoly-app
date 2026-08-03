(function (global) {
    'use strict';

    // ── 常量 ──
    const playerNames = ['玩家一', '玩家二', '玩家三', '玩家四', '玩家五', '玩家六'];

    // 状态只存在自己模块内，不暴露给全局（需要的话通过request事件获取）
    const state = {
        playerCount: 3,
        initMoney: 15000,
        initReward: 2000,
        players: [],
        pendingChanges: {}, // 待变化的金额,点确定之后,清零
        diceCount: 3,
        rolling: false,
    };


    const dotMap = {
        0: [],
        1: ['mc'],
        2: ['tr', 'bl'],
        3: ['tr', 'mc', 'bl'],
        4: ['tl', 'tr', 'bl', 'br'],
        5: ['tl', 'tr', 'mc', 'bl', 'br'],
        6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br']
    };

    

    // ── DOM 工具 ──
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    // ── DOM 引用 ──
    const exitBtn = $('#exit-btn');
    const modalOverlay = $('#modal-overlay');
    const modalMsg = $('#modal-msg');
    const modalCancel = $('#modal-cancel');
    const modalConfirm = $('#modal-confirm');
    const diceCountRow = $('#dice-count-row');
    const rollBtn = $('#roll-btn');
    const diceOverlay = $('#dice-overlay');
    const bigDie1 = $('#big-die1');
    const bigDie2 = $('#big-die2');
    const bigDie3 = $('#big-die3');
    const bigDie4 = $('#big-die4');
    const overlayResult = $('#overlay-result');

    const playersContainer = $('#players-container');

    EventBus.respondTo('CMD_REQ_GET_STATE', () => {
        // 建议深拷贝，避免外部修改影响内部state（关键！）
        return JSON.parse(JSON.stringify({
            playerCount: state.playerCount,
            players: state.players,
            pendingChanges: state.pendingChanges,
            initMoney: state.initMoney,
            initReward: state.initReward,
            diceCount: state.diceCount
        }));
    });

   
    // 数字转显示格式：正数→￥X，负数→-￥X，0→￥0
    function formatAmount(num) {
        const n = Number(num) || 0;
        if (n === 0) return '￥0';
        if (n > 0) return `￥${n}`;
        return `-￥${Math.abs(n)}`; // 负数格式：-￥200（符合你的要求）
    }

    // 显示格式转数字：去掉￥/-，转成纯数字
    function parseAmount(str) {
        const cleaned = str.replace(/[￥\-]/g, '');
        const num = parseInt(cleaned) || 0;
        return str.startsWith('-') ? -num : num;
    }

    // 把输入内容转成合法的纯数字字符串（带符号）
    function getPureNumber(raw) {
        // 1. 只保留数字和第一个负号
        let cleaned = raw.replace(/[^0-9-]/g, '');
        const negCount = (cleaned.match(/-/g) || []).length;
        if (negCount > 1) cleaned = '-' + cleaned.replace(/-/g, ''); // 多个负号只留第一个
        
        // 2. 处理前导零和单独的负号
        if (cleaned === '-') return '-0'; // 只输入负号时显示-0
        if (cleaned === '-0') return '-0'; // 保留-0状态
        cleaned = cleaned.replace(/^0+/, ''); // 去掉前导零（002→2）
        cleaned = cleaned.replace(/^-0+/, '-'); // 去掉负数的前导零（-002→-2）
        
        return cleaned || '0'; // 空内容返回0
    }

    EventBus.on('CMD_INIT_GAME', config => {
        state.playerCount = config.playerCount;
        state.initMoney = config.initMoney;
        state.initReward = config.initReward;

        // 初始化玩家
        state.players = [];
        state.pendingChanges = {};
        for (let i = 0; i < state.playerCount; i++) {
            state.players.push({
                id: i,
                name: playerNames[i],
                money: state.initMoney,
                position: 0
            });
            state.pendingChanges[i] = 0;
        }
        state.rolling = false;

        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
        EventBus.emit('CMD_NOTIFY_SWITCH_SCREEN', 'game');
    });

    exitBtn.addEventListener('click', async () => {
        // 发事件让menu显示弹窗，或者自己处理弹窗，这里演示发事件让menu处理
        EventBus.emit('CMD_NOTIFY_SHOW_MODAL', {
            msg: '退出当前游戏吗？\n进度不会保存',
            onConfirm: () => EventBus.emit('CMD_NOTIFY_SWITCH_SCREEN', 'menu')
        });
    });

    // ── Modal ──
    let modalResolve = null;
    
    // 监听“显示弹窗”命令
    EventBus.on('CMD_NOTIFY_SHOW_MODAL', async ({ msg, onConfirm }) => {
        const ok = await showModal(msg);
        if (ok && onConfirm) onConfirm();
    });
    
    function showModal(msg) {
        return new Promise(resolve => {
            modalMsg.textContent = msg;
            modalOverlay.classList.add('show');
            modalResolve = resolve;
        });
    }
    modalConfirm.addEventListener('click', () => {
        modalOverlay.classList.remove('show');
        if (modalResolve) modalResolve(true);
    });
    modalCancel.addEventListener('click', () => {
        modalOverlay.classList.remove('show');
        if (modalResolve) modalResolve(false);
    });

    // ── HTML 转义 ──
    function escHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── 骰子数量选择 ──
    diceCountRow.addEventListener('click', e => {
        const btn = e.target.closest('.dice-count-btn');
        if (!btn) return;
        e.stopPropagation();
        state.diceCount = parseInt(btn.dataset.count);
        diceCountRow.querySelectorAll('.dice-count-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });

    // ── 掷骰子 ──
    rollBtn.addEventListener('click', e => {
        if (state.rolling) return;
        if (e.target.closest('.dice-count-btn')) return;

        state.rolling = true;
        rollBtn.disabled = true;

        // 发事件让audio播放骰子音效，不直接调用audio的函数
        EventBus.emit('CMD_NOTIFY_PLAY_DICE_SOUND');

        diceOverlay.classList.add('show');
        [bigDie1, bigDie2, bigDie3, bigDie4].forEach(d => d.style.animation = '');

        bigDie1.style.display = state.diceCount >= 1 ? '' : 'none';
        bigDie2.style.display = state.diceCount >= 2 ? '' : 'none';
        bigDie3.style.display = state.diceCount >= 3 ? '' : 'none';
        bigDie4.style.display = state.diceCount >= 4 ? '' : 'none';
        if (state.diceCount < 2) bigDie2.innerHTML = '';
        if (state.diceCount < 3) bigDie3.innerHTML = '';
        if (state.diceCount < 4) bigDie4.innerHTML = '';

        const diceRow = document.querySelector('.dice-row');
        diceRow.classList.remove('layout-1', 'layout-2', 'layout-3', 'layout-4'); // 清旧状态
        diceRow.classList.add('layout-' + state.diceCount); // 加新状态

        overlayResult.classList.remove('show');
        overlayResult.textContent = '';

        let ticks = 0;
        const totalTicks = 10;
        const interval = setInterval(() => {
            for (let d = 0; d < state.diceCount; d++) {
                const v = Math.floor(Math.random() * 7);
                renderBigDie([bigDie1, bigDie2, bigDie3, bigDie4][d], v);
            }
            ticks++;
            if (ticks >= totalTicks) {
                clearInterval(interval);

                const diceEls = [bigDie1, bigDie2, bigDie3, bigDie4];
                let sum = 0;
                const results = [];
                for (let d = 0; d < state.diceCount; d++) {
                    const v = Math.floor(Math.random() * 7);
                    results.push(v);
                    sum += v;
                    renderBigDie(diceEls[d], v);
                    diceEls[d].style.animation = 'none';
                }
                [bigDie1, bigDie2, bigDie3, bigDie4].forEach(d => d.style.animation = 'none');

                overlayResult.textContent = results.join(' + ') + ' = ' + sum;
                overlayResult.classList.add('show');

                // 发事件让audio播放结果音效
                EventBus.emit('CMD_NOTIFY_PLAY_RESULT_SOUND');

                setTimeout(() => {
                    diceOverlay.classList.remove('show');
                    state.rolling = false;
                    rollBtn.disabled = false;
                }, 1500);
            }
        }, 40);
    });

    // ── 渲染骰子 ──
    function renderBigDie(el, value) {
        el.innerHTML = '';
        const dots = dotMap[value] || [];
        ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].forEach(pos => {
            const cell = document.createElement('div');
            if (dots.includes(pos)) cell.className = 'big-dot ' + pos;
            el.appendChild(cell);
        });
    }

    // 渲染卡片
    function renderPlayers(state) {
        const players = state?.players ?? [];
        if (players.length === 0) {
            playersContainer.innerHTML = '<div class="empty-tip">暂无玩家数据</div>';
            return;
        }
        
        return players.map((p, i) => {
            const pc = state.pendingChanges[i];
            return `
            <div class="player-card p${i}">
                <div class="player-info">
                    <span class="player-name" data-action="edit-name" data-idx="${i}">
                        ${escHtml(p.name)}
                    </span>
                    <div class="player-money">
                        ￥${p.money.toLocaleString()}
                    </div>
                </div>
                <div class="change-money-container">
                    <div class="change-money-container-inner">
                        <input 
                            type="text"
                            inputmode="tel"
                            class="amount ${pc > 0 ? 'positive' : pc < 0 ? 'negative' : ''}" 
                            data-action="edit-amount"
                            data-idx="${i}"
                            value="${formatAmount(pc)}"
                            placeholder="￥0"
                        >
                        <button class="btn-confirm ${pc === 0 ? 'gray' : ''}" data-action="confirm-change" data-idx="${i}">
                            确  定
                        </button>
                    </div>
                </div>
                <div class="player-position">
                    ${p.position ? `第 ${p.position} 格` : '未移动'}
                </div>
            </div>
        `;
    }).join('');
    }

    // 带防抖和UI反馈的渲染调度器
    let renderTimer = null;
    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
            playersContainer.style.opacity = '0.7';
            try {
                playersContainer.innerHTML = renderPlayers(state);
            } finally {
                playersContainer.style.opacity = '1';
            }
        }, 50);
    }

    // 4. 监听事件
    EventBus.on('CMD_NOTIFY_STATE_UPDATED', scheduleRender);


    // ── 玩家卡片区域事件委托 ──
    // 1. 聚焦时：显示纯数字，方便编辑（去掉￥）
    playersContainer.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);
            const num = parseAmount(input.value) || 0;
            
            // ✅ 关键修改：聚焦时显示纯数字（不带￥），方便编辑
            // 即使是0也显示"0"，而不是"￥0"
            input.value = num.toString();
            input.select(); // 全选，方便直接覆盖输入

            // 同步更新按钮状态
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                if (num === 0) {
                    confirmBtn.classList.add('gray');
                    confirmBtn.disabled = true;
                } else {
                    confirmBtn.classList.remove('gray');
                    confirmBtn.disabled = false;
                }
            }
        }
    });

    // 2. 输入时：实时过滤非法字符 + 格式化显示 + 更新pendingChanges
    playersContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);

            // 1. 洗成纯数字字符串
            const pure = getPureNumber(input.value);
            const num = parseInt(pure) || 0;

            // 2. 更新pendingChanges+按钮状态
            EventBus.emit('CMD_NOTIFY_UPDATE_PENDING', { idx, money: num });
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', num === 0);
                confirmBtn.disabled = num === 0;
            }

            // 3. 更新金额颜色
            input.classList.toggle('positive', num > 0);
            input.classList.toggle('negative', num < 0);

            // 4. 格式化显示+定位光标（核心：光标永远在数字最后面）
            input.value = formatAmount(num);
            const digitLen = Math.abs(num).toString().length; // 数字部分长度
            const cursorPos = 1 + digitLen; // ￥占1位，所以光标在数字最后
            input.setSelectionRange(cursorPos, cursorPos);
        }
    });

    // 3. 失焦时：如果为空，重置为￥0
    playersContainer.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);
            const num = parseAmount(input.value) || 0;
            input.value = num.toString(); // 去掉￥，显示纯数字
            input.select(); // 全选，方便直接覆盖

            // 同步按钮状态
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', num === 0);
                confirmBtn.disabled = num === 0;
            }
        }
    });

    // 失焦时：格式化显示，兜底状态
    playersContainer.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);
            const num = parseAmount(input.value) || 0;
            input.value = formatAmount(num); // 加￥格式化

            // 同步按钮状态
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', num === 0);
                confirmBtn.disabled = num === 0;
            }
        }
    });

    // 4. 点击确定按钮：应用金额到总金额
    playersContainer.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const idx = parseInt(e.target.dataset.idx);
        if (action === 'confirm-change') {
            const input = playersContainer.querySelector(`.amount[data-idx="${idx}"]`);
            const pending = parseAmount(input?.value) || 0;
            
            if (pending !== 0) {
                EventBus.emit('CMD_NOTIFY_CONFIRM_CHANGE', { idx, pending });
                input?.blur();
            }
        }
        // 修改玩家名字
        if (e.target.dataset.action === 'edit-name') {
            const span = e.target;
            const idx = parseInt(span.dataset.idx);
            const oldName = span.textContent.trim();

            // 把 span 替换成 input 输入框
            const spanStyle = window.getComputedStyle(span);
            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'text';
            input.value = oldName;
            input.className = 'player-name-input'; // 加个类名方便写样式
            input.dataset.idx = idx;
            input.dataset.oldName = oldName; // 存旧名字，用于取消修改

            // 替换 span 为 input，自动聚焦全选
            span.parentNode.replaceChild(input, span);
            input.focus();
            input.select();

            // ✅ 2. 保存名字的逻辑
            const saveName = () => {
                const newName = input.value.trim().slice(0, 6);
                const finalName = newName || oldName; // 空名字恢复旧名
                const targetIdx = parseInt(input.dataset.idx);

                // 名字没变化就不发通知
                if (finalName !== oldName) {
                    // 通知 menu 更新名字（用你熟悉的 CMD_NOTIFY_ 前缀）
                    EventBus.emit('CMD_NOTIFY_UPDATE_PLAYER_NAME', {
                        idx: targetIdx,
                        name: escHtml(finalName) // 转义防注入
                    });
                }

                // 把 input 换回 span
                const newSpan = document.createElement('span');
                newSpan.className = 'player-name';
                newSpan.dataset.action = 'edit-name';
                newSpan.dataset.idx = targetIdx;
                newSpan.textContent = finalName;
                input.parentNode.replaceChild(newSpan, input);
            };

            // ✅ 3. 绑定输入完成事件
            input.addEventListener('blur', saveName); // 失去焦点保存
            input.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter') { // 按回车保存
                    ke.preventDefault();
                    input.blur();
                }
                if (ke.key === 'Escape') { // 按 ESC 取消，恢复原名字
                    input.value = input.dataset.oldName;
                    input.blur();
                }
            });
        }
    });

    // 5. 按Enter键快速确认
    playersContainer.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('amount') && e.key === '-') {
            e.preventDefault();
            const input = e.target;
            const idx = parseInt(input.dataset.idx);
            const currentNum = parseAmount(input.value);
            const newNum = currentNum === 0 ? -0 : -currentNum;

            // 更新状态
            EventBus.emit('CMD_NOTIFY_UPDATE_PENDING', { idx, money: newNum });
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', newNum === 0);
                confirmBtn.disabled = newNum === 0;
            }
            input.classList.toggle('positive', newNum > 0);
            input.classList.toggle('negative', newNum < 0);

            // ✅ 关键修改：根据正负号动态计算光标位置
            const formatted = formatAmount(newNum);
            input.value = formatted;
            
            // 正数：￥200 → 前缀长度1，光标在1+3=4
            // 负数：-￥200 → 前缀长度2，光标在2+3=5
            const prefixLen = newNum >= 0 ? 1 : 2; // ￥占1位，-￥占2位
            const digitLen = Math.abs(newNum).toString().length;
            const cursorPos = prefixLen + digitLen; // 光标在数字末尾
            
            input.setSelectionRange(cursorPos, cursorPos);
        }

        // 原有Enter确认逻辑保留
        if (e.target.classList.contains('amount') && e.key === 'Enter') {
            e.target.blur();
            const idx = parseInt(e.target.dataset.idx);
            const pending = parseAmount(e.target.value) || 0;
            if (pending !== 0) {
                EventBus.emit('CMD_NOTIFY_CONFIRM_CHANGE', { idx, pending });
            }
        }
    });

    // game.js → 替换 input 事件里的光标计算部分
    playersContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);
            const pure = getPureNumber(input.value);
            const num = parseInt(pure) || 0;

            // 更新状态
            EventBus.emit('CMD_NOTIFY_UPDATE_PENDING', { idx, money: num });
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', num === 0);
                confirmBtn.disabled = num === 0;
            }
            input.classList.toggle('positive', num > 0);
            input.classList.toggle('negative', num < 0);

            // ✅ 关键修改：根据正负号动态计算光标位置
            const formatted = formatAmount(num);
            input.value = formatted;
            
            // 正数：￥200 → 前缀长度1，光标在1+3=4
            // 负数：-￥200 → 前缀长度2，光标在2+3=5
            const prefixLen = num >= 0 ? 1 : 2; // ￥占1位，-￥占2位
            const digitLen = Math.abs(num).toString().length;
            const cursorPos = prefixLen + digitLen; // 光标在数字末尾
            
            input.setSelectionRange(cursorPos, cursorPos);
        }
    });

    // ✅ 确认修改：将待修改金额应用到真实资金
    EventBus.on('CMD_NOTIFY_CONFIRM_CHANGE', ({ idx, pending }) => {
        if (!state.players[idx] || pending === 0) return;

        const oldMoney = state.players[idx].money;
        state.players[idx].money = Math.round(oldMoney + pending);
        state.pendingChanges[idx] = 0;

        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
    });

})(window);



