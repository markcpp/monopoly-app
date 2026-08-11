(function (global) {
    'use strict';

    // ── 常量 ──
    const playerNames = ['玩家一', '玩家二', '玩家三', '玩家四', '玩家五', '玩家六'];
    //骰子计时器,原本设计TOTALTICKS*TICKINTERVAL = 10*40,DICETOTALTIME=1500
    const TOTALTICKS = 10;
    const TICKINTERVAL = 10;        // TOTALTICKS*TICKINTERVAL 投骰子出结果时间
    const DICETOTALTIME =  200;    //投骰子总动画时间

    // 状态只存在自己模块内，不暴露给全局（需要的话通过request事件获取）
    const state = {
        playerCount: 3,
        initMoney: 15000,
        initReward: 2000,
        players: [],
        pendingChanges: {}, // 待变化的金额,点确定之后,清零
        diceCount: 3,
        rolling: false,
        //map.js相关
        currentPlayerIdx: 0,     // 当前掷骰子的玩家索引
        diceResult: 0,           // 上次骰子结果
        lastEvent: null          // 最后一次触发的事件（用于弹窗）
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

    const eventOverlay = $('#event-overlay');
    const modalTitle = $('#modal-title');
    const modalBody = $('#modal-body');
    const modalActions = $('#modal-actions');

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
                oldPos: 0,
                newPos: -1,
                hasMoved: false,   //没动过不发起点奖励
                isBankrupt: false, //如破产就出局
                own: {}            //地皮初始化,如{'中国': 0, '日本': 0,}，0:只有地皮
            });
            state.pendingChanges[i] = 0;
        }

        state.rolling = false;
        state.currentPlayerIdx = 0;
        state.diceResult = 0;
        state.lastEvent = null;

        state.gameOver = false;

        EventBus.emit('CMD_NOTIFY_SWITCH_SCREEN', 'game');
        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
    });

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

    // 公共函数：根据金额计算光标位置（正数￥前缀1位，负数-￥前缀2位）
    function getCursorPosForAmount(num) {
        console.log("getCursorPosForAmount");
        const prefixLen = num >= 0 ? 1 : 2; // 正数￥占1位，负数-￥占2位
        const digitLen = Math.abs(num).toString().length; // 数字部分长度
        return prefixLen + digitLen; // 光标永远在数字末尾
    }

    exitBtn.addEventListener('click', () => {
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
        // modalOverlay.style.display = 'none';
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
        const totalTicks = TOTALTICKS;
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

                state.diceResult = sum;
                overlayResult.textContent = results.join(' + ') + ' = ' + sum;
                overlayResult.classList.add('show');

                // 发事件让audio播放结果音效
                EventBus.emit('CMD_NOTIFY_PLAY_RESULT_SOUND');

                setTimeout(() => {
                    diceOverlay.classList.remove('show');
                    state.rolling = false;
                    rollBtn.disabled = false;

                    const currentPlayer = state.players[state.currentPlayerIdx];
                    if (currentPlayer && state.diceResult > 0) {
                        console.log(`[Game] 骰子动画结束，${currentPlayer.name} 移动 ${state.diceResult} 步`);
                        movetoNewPosition(currentPlayer, state.diceResult);
                        state.diceResult = 0;
                    }
                }, DICETOTALTIME);
            }
        }, TICKINTERVAL);
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
            <div class="player-card ${i === state.currentPlayerIdx ? 'active-player' : ''}">
                <div class="player-info">
                    <span class="player-name" data-action="edit-name" data-idx="${i}">
                        ${escHtml(p.name)}
                    </span>
                    <div class="player-money ${p.money < 0 ? 'negative' : ''}">
                        ￥${p.money.toLocaleString()}
                    </div>
                </div>
                <div class="change-money-container">
                    <input 
                        type="text"
                        inputmode="tel"
                        class="amount ${pc > 0 ? 'positive' : pc < 0 ? 'negative' : ''}" 
                        data-action="edit-amount"
                        data-idx="${i}"
                        value="${formatAmount(pc)}"
                        placeholder="￥0"
                    >
                    <div class="change-money-container-inner">
                        <button class="btn-round btn-minus" data-action="sub" data-idx="${i}">−</button>
                        <button class="btn-confirm ${pc === 0 ? 'gray' : ''}" data-action="confirm-change" data-idx="${i}">
                            确定
                        </button>
                    </div>
                </div>
                <div class="player-position">
                    ${p.oldPos !== 0 ? `${MAP_CONFIG.worldMap[p.oldPos]}` : '赤道'}
                    
                    ${p.newPos !== -1 ? `->${MAP_CONFIG.worldMap[p.newPos]}` : ''}
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
            checkGameOver();
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

    // 输入时：实时过滤非法字符 + 格式化显示
    playersContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);

            // 洗成纯数字字符串
            const pure = getPureNumber(input.value);
            const num = parseInt(pure) || 0;

            // 更新按钮状态
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', num === 0);
                confirmBtn.disabled = num === 0;
            }

            // 更新金额颜色
            input.classList.toggle('positive', num > 0);
            input.classList.toggle('negative', num < 0);

            // 格式化显示+定位光标
            input.value = formatAmount(num);
            const cursorPos = getCursorPosForAmount(num); 
        }
    });

    // 聚焦时：如果为空，重置为￥0
    playersContainer.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('amount')) {
            const input = e.target;
            const idx = parseInt(input.dataset.idx);
            const num = parseAmount(input.value) || 0;

             // ✅ 直接用格式化后的带￥内容（和你失焦时的显示完全一致）
            const formatted = formatAmount(num);
            input.value = formatted;
            
            // ✅ 光标定位到数字末尾（用你现有的函数，完全兼容正负）
            const cursorPos = getCursorPosForAmount(num);
            input.setSelectionRange(cursorPos, cursorPos);

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

    // 玩家卡片点击事件
    playersContainer.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const idx = parseInt(e.target.dataset.idx);
        //点击确定按钮
        if (action === 'confirm-change') {
            const input = playersContainer.querySelector(`.amount[data-idx="${idx}"]`);
            const pending = parseAmount(input?.value) || 0;
            
            if (pending !== 0) {
                EventBus.emit('CMD_NOTIFY_CONFIRM_CHANGE', { idx, pending });
                input?.blur();
            }
        }
        // 点击玩家名字,可以修改名字
        if (action === 'edit-name') {
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
        // 点击减号
        if (action === 'sub') {
            const input = playersContainer.querySelector(`.amount[data-idx="${idx}"]`);
            if (!input) return;
            // 标记跳过input事件，避免代码改值触发重复逻辑
            input.dataset.skipInput = 'true';
            const currentNum = parseAmount(input.value) || 0;
            const newNum = -currentNum; // 切换正负，和你原来的键盘逻辑完全一致
            // 更新确定按钮状态
            const confirmBtn = playersContainer.querySelector(`.btn-confirm[data-idx="${idx}"]`);
            if (confirmBtn) {
                confirmBtn.classList.toggle('gray', newNum === 0);
                confirmBtn.disabled = newNum === 0;
            }
            // 更新输入框颜色
            input.classList.toggle('positive', newNum > 0);
            input.classList.toggle('negative', newNum < 0);

            input.value = formatAmount(newNum);
            // const cursorPos = getCursorPosForAmount(newNum); 

            // 移除跳过标记，避免影响后续手动输入
            Promise.resolve().then(() => delete input.dataset.skipInput);
        }
    });

    // 按Enter键快速确认
    playersContainer.addEventListener('keydown', (e) => {
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

    // ✅ 确认修改：将待修改金额应用到真实资金
    EventBus.on('CMD_NOTIFY_CONFIRM_CHANGE', ({ idx, pending }) => {
        if (!state.players[idx] || pending === 0) return;

        const oldMoney = state.players[idx].money;
        state.players[idx].money = Math.round(oldMoney + pending);
        state.pendingChanges[idx] = 0;
        if(state.players[idx].money < 0){
            switchToNextPlayer();
        }else
            EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
    });



    //-------------------骰子动画结束,玩家移动及后续逻辑-------------------
    function movetoNewPosition(player, steps) {
        if (!player || isNaN(steps)) return;
        if (player.oldPos === undefined) {player.oldPos = 0;}
        if (player.newPos === undefined) {player.newPos = 0;}

        const oldPos = player.oldPos;
        // ✅ 正确计算循环位置（16格，0-15）
        const newPos = (oldPos + steps) % MAP_CONFIG.mapLength;
        state.players[player.id].newPos = newPos;

        // ✅ 正确获取地名
        const location = MAP_CONFIG.worldMap[newPos];
        console.log(`[Game] ${player.name} 移动 ${steps} 步，到达 ${location}(第${newPos}格)`);

        player.hasMoved = true; 

        // 如经过起点,奖励金额
        const passedStart = oldPos + steps >= MAP_CONFIG.mapLength && player.hasMoved;
        if (passedStart) {
            player.money += state.initReward;
            console.log(`[Game] ${player.name} 经过起点，获得奖励￥${state.initReward}`);
        }

        handleLanding(player);
        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
    }

    //格子事件处理
    function handleLanding(player) {
        // 按格子类型判断「是否需要弹窗」
        let location = MAP_CONFIG.worldMap[player.newPos]
        if(!MAP_CONFIG.hasPrice(location)) {
            if(location === '机会') {
                triggerChanceEvent(player.id);
            }else if(location === '命运') {
                triggerFateEvent(player.id);
            }
        }else{
            // 无主地皮
            if(getLocationInfo(location) === null) {
                console.log(`[Game] ${player.name} 到达无主地皮 ${location}`);
                state.lastEvent = { 
                    type: 'buy', 
                    playerId: player.id, 
                    location:MAP_CONFIG.worldMap[player.newPos]
                };
            }
            // 自己的地皮且不到5级
            else if(getLocationInfo(location).playerId === player.id && getLocationInfo(location).level < 5) {
                console.log(`[Game] ${player.name} 到达自己的地皮 ${location}，可升级`);
                state.lastEvent = { 
                    type: 'upgrade', 
                    playerId: player.id,
                    location:MAP_CONFIG.worldMap[player.newPos]
                };
            }
            // 其他玩家的地皮,要交过路费
            else if(getLocationInfo(location).playerId !== player.id) {
                console.log(`[Game] ${player.name} 到达其他玩家的地皮 ${location}，需交过路费`);
                state.lastEvent = { 
                    type: 'toll', 
                    playerId: player.id,                           //出钱的玩家id
                    ownerId: getLocationInfo(location).playerId,  //收钱的玩家id
                    location:MAP_CONFIG.worldMap[player.newPos],
                    toll: MAP_CONFIG.getToll(location, getLocationInfo(location).level), //过路费
                };
            }
        }
        renderModal(state.lastEvent);
    }

    // 查询 地皮归属的玩家id 和 地皮等级
    function getLocationInfo(location) {
        for (let i = 0; i < state.players.length; i++) {
            if (state.players[i].own.hasOwnProperty(location)) {
                return {
                    playerId: i,
                    level: state.players[i].own[location]
                };
            }
        }
        return null; // 无主地
    }

    // 机会事件触发
    function triggerChanceEvent(playerIdx) {
        const player = state.players[playerIdx];
        const events = [
            { msg: '捡到钱！获得 ￥500', effect: p => p.money += 500 },
            { msg: '请客吃饭，支出 ￥300', effect: p => p.money -= 300 },
            { msg: '中彩票！获得 ￥2000', effect: p => p.money += 2000 },
            { msg: '修车费，支出 ￥800', effect: p => p.money -= 800 },
            { msg: '打工赚外快，获得 ￥1000', effect: p => p.money += 1000 },
            { msg: '什么都没发生', effect: p => {} }
        ];
        const ev = events[Math.floor(Math.random() * events.length)];
        ev.effect(player);

        state.lastEvent = {
            type: 'chance',
            playerId: player.id,
            message: `🎲 机会卡：${ev.msg}`
        };
        console.log(`[Game] ${player.name} 触发机会：${ev.msg}`);
        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
    }
    // 命运事件触发
    function triggerFateEvent(playerIdx) {
        const player = state.players[playerIdx];
        const events = [
            { msg: '获得神秘宝藏！获得 ￥1500', effect: p => p.money += 1500 },
            { msg: '被罚款！支出 ￥1200', effect: p => p.money -= 1200 },
            { msg: '继承遗产！获得 ￥3000', effect: p => p.money += 3000 },
            { msg: '投资失败！支出 ￥2000', effect: p => p.money -= 2000 },
            { msg: '意外之财！获得 ￥800', effect: p => p.money += 800 },
            { msg: '医疗支出！支出 ￥1500', effect: p => p.money -= 1500 },
            { msg: '彩票中奖！获得 ￥5000', effect: p => p.money += 5000 },
            { msg: '车辆维修！支出 ￥1000', effect: p => p.money -= 1000 },
            { msg: '获得奖金！获得 ￥2500', effect: p => p.money += 2500 },
            { msg: '什么都没发生', effect: p => {} }
        ];
        const ev = events[Math.floor(Math.random() * events.length)];
        ev.effect(player);

        state.lastEvent = {
            type: 'fate',  // ✅ 关键：类型改为'fate'，和机会卡区分开
            playerId: player.id,
            message: `🔮 命运卡：${ev.msg}`
        };
        console.log(`[Game] ${player.name} 触发命运：${ev.msg}`);
        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
    }

    // ==================== 弹窗渲染 ====================
    function renderModal(event) {
        // 调试：打印当前状态
        console.log('[renderModal] 当前事件:', event);

        //没有事件时隐藏弹窗,同时切换到下一个玩家
        if (!event) {
            eventOverlay.classList.remove('show');
            eventOverlay.style.display = 'none'; 
            switchToNextPlayer();
            return;
        }
        //有事件时显示弹窗
        eventOverlay.style.display = 'flex';
        eventOverlay.classList.add('show');

        const player = state.players[event.playerId];
        
        switch (event.type) {
            case 'buy': {
                console.log(`[renderModal] 显示购买弹窗，玩家: ${player.name}, 地皮: ${event.location}, 购买价格: ${MAP_CONFIG.locationConfigs[event.location].buy}`);
                modalTitle.textContent = '🏝️ 新领地';
                modalBody.innerHTML = `
                    <div>欢迎来到 <span class="highlight">${event.location}</span></div>
                    <div style="margin-top:8px;">购买价格：<span class="highlight">￥${MAP_CONFIG.locationConfigs[event.location].buy.toLocaleString()}</span></div>
                    <div style="margin-top:8px;color:#aaa;font-size:14px;">你的余额：￥${player.money.toLocaleString()}</div>
                `;
                modalActions.innerHTML = `
                    <button class="btn-skip" data-action="confirm-skip">路过</button>
                    <button class="btn-buy" data-action="confirm-buy">购买</button>
                `;
                break;
            }
            case 'upgrade': {
                console.log(`[renderModal] 显示升级弹窗，玩家: ${player.name}, 地皮: ${event.location}, 当前等级: ${getLocationInfo(event.location).level}, 升级费用: ${MAP_CONFIG.locationConfigs[event.location].upgrade.toLocaleString()}`);
                modalTitle.textContent = '⬆️ 升级地皮';
                modalBody.innerHTML = `
                    <div>
                        <span class="highlight">${player.name}</span> 的领地
                        <span class="highlight">${event.location}</span>
                    </div>
                    <div style="margin-top:8px;">当前等级：<span class="highlight">${getLocationInfo(event.location).level}级</span></div>
                    <div style="margin-top:8px;">升级费用：<span class="highlight">￥${MAP_CONFIG.locationConfigs[event.location].upgrade.toLocaleString()}</span></div>
                    <div style="margin-top:8px;color:#aaa;font-size:14px;">你的余额：￥${player.money.toLocaleString()}</div>
                `;
                modalActions.innerHTML = `
                    <button class="btn-skip" data-action="confirm-skip">跳过</button>
                    <button class="btn-upgrade" data-action="confirm-upgrade">升级</button>
                `;
                break;
            }
            case 'toll': {
                const owner = state.players[event.ownerId];
                console.log(`[renderModal] 显示缴纳过路费弹窗，玩家: ${player.name},拥有金额: ￥${player.money}, 地皮: ${event.location}, 过路费: ${event.toll}, 收费玩家: ${owner.name},拥有金额: ￥${owner.money}`);
                modalTitle.textContent = '💰 缴纳过路费';
                    modalBody.innerHTML = `
                        <div><span class="highlight">${event.location}</span> 属于 <span class="highlight">${owner.name}</span></div>
                        <div style="margin-top:8px;">地皮等级：<span class="highlight">${getLocationInfo(event.location).level}级</span></div>
                        <div style="margin-top:8px;" class="danger">需支付：￥${event.toll}</div>
                        <div style="margin-top:8px;color:#aaa;font-size:14px;">你的余额：￥${player.money.toLocaleString()}</div>
                    `;
                modalActions.innerHTML = `
                    <button class="btn-pay" data-action="confirm-pay">支付</button>
                `;
                break;
            }
            case 'chance': {
                console.log(`[renderModal] 显示机会卡弹窗，玩家: ${player.name}, 消息: ${event.message}`);
                modalTitle.textContent = '🎲 机会卡';
                modalBody.innerHTML = `<div>${event.message}</div>`;
                modalActions.innerHTML = `
                    <button class="btn-skip" data-action="confirm-skip">知道了</button>
                `;
                break;
            }
            case 'fate': {
                console.log(`[renderModal] 显示命运卡弹窗，玩家: ${player.name}, 消息: ${event.message}`);
                modalTitle.textContent = '🔮 命运卡';
                modalBody.innerHTML = `<div>${event.message}</div>`;
                modalActions.innerHTML = `<button class="btn-skip" data-action="confirm-skip">知道了</button>`;
                break;
            }
            default: {
                console.warn(`[renderModal] 未识别的事件类型: ${event.type}，事件内容:`, event);
                modalTitle.textContent = '未知事件';
                modalBody.innerHTML = `<div>遇到了未定义的事件类型：${event.type}</div>`;
                modalActions.innerHTML = `<button class="btn-skip" data-action="confirm-skip">知道了</button>`;
            }
        }

    }

    // ==================== 事件弹窗的按钮点击 ====================
    modalActions.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action || !state.lastEvent) return;

        const event = state.lastEvent;  // 缓存当前事件
        const location = event.location;
        const player = state.players[event.playerId];

        // 业务操作
        switch (action) {
            case 'confirm-buy': {
                const price = MAP_CONFIG.locationConfigs[location].buy;
                if (player.money >= price) {
                    player.money -= price;
                    player.own[location] = location;
                    player.own[location] = 0;
                    console.log(`[Game] ${player.name} 购买了 ${location}，花费 ￥${price}`);

                }
                break;
            }
            case 'confirm-upgrade': {
                const upgradePrice = MAP_CONFIG.locationConfigs[location].upgrade;
                console.log(`[Game] player.money=${player.money},upgradePrice=${upgradePrice},player.own[location]=${player.own[location]}`);
                if (player.money >= upgradePrice && player.own[location] < 5) {
                    player.money -= upgradePrice;
                    player.own[location] += 1;
                    console.log(`[Game] ${player.name} 升级了 ${location}，当前 ${player.own[location]}级`);
                }
                break;
            }
            case 'confirm-pay': {
                console.log(`[Game] ${player.name} 支付了过路费 ￥${event.toll} 给 ${state.players[event.ownerId].name}`);
                const owner = state.players[event.ownerId];
                player.money -= event.toll;
                owner.money += event.toll;
                break;
            }
            default: {
                console.warn(`[Game] modalActions中,未识别的按钮点击事件: ${action}`);
            }
        }
        state.lastEvent = null;
        eventOverlay.classList.remove('show');
        eventOverlay.style.display = 'none'; 
        switchToNextPlayer();

    });

    function switchToNextPlayer() {
        if (state.gameOver) return; // 游戏结束不切换

         // 找下一个未出局的玩家
        let nextPlayerIdx = (state.currentPlayerIdx + 1) % state.playerCount;
        let loopCount = 0;
        
        while (state.players[nextPlayerIdx].isBankrupt) {
            nextPlayerIdx = (nextPlayerIdx + 1) % state.playerCount;
            loopCount++;
            // 找了一圈都没找到，说明只剩1个存活玩家，checkGameOver已经处理过了，直接返回
            if (loopCount >= state.playerCount) return;
        }

        state.currentPlayerIdx = nextPlayerIdx;
        state.lastEvent = null;
        const player = state.players[state.currentPlayerIdx];
        if(player.newPos != -1) player.oldPos = player.newPos;
        player.newPos = -1;//用-1清空新地点的显示
        EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
        console.log(`[Game] 回合结束，轮到玩家 ${state.currentPlayerIdx + 1}: ${state.players[state.currentPlayerIdx].name}`);
    }

    // 玩家出局处理
    function checkGameOver() {
        if (state.gameOver) return; // 已经结束的游戏不再重复检查

        // 1. 遍历所有玩家，标记出局
        state.players.forEach((player, idx) => {
            // 只标记未出局且资金<0的玩家，避免重复处理
            if (!player.isBankrupt && player.money < 0) {
                player.isBankrupt = true;
                console.log(`[Game] ${player.name} 资金不足，已出局！`);
            }
        });

        // 2. 统计存活玩家（未出局）
        const alivePlayers = state.players.filter(p => !p.isBankrupt);
        const aliveCount = alivePlayers.length;

        // 3. 只剩1个存活玩家，触发胜利
        if (aliveCount === 1) {
            state.gameOver = true; // 标记游戏已结束，避免重复触发
            // handleVictory(alivePlayers[0]);
        }
        // 4. 兜底：没人存活（极端情况），直接回菜单
        else if (aliveCount === 0) {
            state.gameOver = true;
            console.log(`[Game] 所有玩家都出局，游戏结束！`);
            // EventBus.emit('CMD_NOTIFY_SWITCH_SCREEN', 'menu');
        }
    }
})(window);



