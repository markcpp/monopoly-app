(function (global) {
    'use strict';

    // ── 常量 ──
    const dotMap = {
        0: [],
        1: ['mc'],
        2: ['tr', 'bl'],
        3: ['tr', 'mc', 'bl'],
        4: ['tl', 'tr', 'bl', 'br'],
        5: ['tl', 'tr', 'mc', 'bl', 'br'],
        6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br']
    };

    let state = { rolling: false, diceCount: 3 }; // 自己的局部状态，其他状态通过request获取

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

    // ── Toast ──
    let toastTimer;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
    }

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

    let cachedState = null;

    // 只负责渲染，不碰任何EventBus
    function syncRender(state) {
        if (!state?.players) {
            playersContainer.innerHTML = '<div class="empty-tip">暂无玩家数据</div>';
            return;
        }
        
        playersContainer.innerHTML = state.players.map((p, i) => {
            const pc = state.pendingChanges?.[i];        // 待确认金额
            const delta = pc != null ? pc - p.money : 0; // 变更差额
            const displayAmount = pc ?? p.money;         // 显示金额：待确认优先，否则当前金额
            
            // return `
            //     <div class="player-card p${i}">
            //         <div class="player-main">
            //             <span class="player-name" data-action="edit-name" data-idx="${i}">
            //                 ${escHtml(p.name)}
            //             </span>
            //             <div class="player-money ${p.money < 0 ? 'negative' : ''}">
            //                 ￥${p.money.toLocaleString()}
            //             </div>
            //         </div>
            //         <div class="player-actions">
            //             <button class="btn-round btn-minus" data-action="sub" data-idx="${i}">−</button>
            //             <div class="amount-badge" data-action="cycle" data-idx="${i}">
            //                 ￥${displayAmount.toLocaleString()}
            //             </div>
            //             <button class="btn-round btn-plus" data-action="add" data-idx="${i}">+</button>
            //         </div>
            //         <button class="btn-confirm ${pc == null || pc === p.money ? 'gray' : ''}"
            //             data-action="confirm-change" data-idx="${i}">
            //             确定
            //         </button>
            //     </div>
            // `;
            return `
                <div class="player-card p${i}">
                    <!-- 左侧：玩家信息 -->
                    <div class="player-info">
                        <span class="player-name" data-action="edit-name" data-idx="${i}">
                            ${escHtml(p.name)}
                        </span>
                        <div class="player-money ${p.money < 0 ? 'negative' : ''}">
                            ￥${p.money.toLocaleString()}
                        </div>
                    </div>

                    <div class="change-money-container">
                        <div class="change-money-container-inner">
                            <button class="btn-round btn-plus" data-action="add" data-idx="${i}">+</button>
                            <div class="amount" data-idx="${i}">
                                ￥${displayAmount.toLocaleString()}
                            </div>
                        </div>

                        <div class="change-money-container-inner">
                            <button class="btn-round btn-minus" data-action="sub" data-idx="${i}">−</button>
                            <button class="btn-confirm" data-action="confirm-change" data-idx="${i}">
                                确  定
                            </button>
                        </div>
                    </div>

                    <!-- 位置显示 -->
                    <div class="player-position">
                        ${p.position ? `第 ${p.position} 格` : '未移动'}
                    </div>
                </div>
            `;

        }).join('');
    }

    // 3. 更新缓存并渲染：负责数据获取，只碰EventBus.call
    async function updateCacheAndRender() {
        try {
            const latestState = await EventBus.call('CMD_REQ_GET_STATE');
            if (!latestState) {
                console.warn('⚠️ 获取游戏状态失败，使用缓存');
                if (cachedState) syncRender(cachedState);
                return;
            }
            
            // 深拷贝缓存，避免引用污染
            cachedState = JSON.parse(JSON.stringify(latestState));
            syncRender(cachedState);
            
        } catch (err) {
            console.error('❌ 更新游戏状态失败:', err);
            // 降级：用旧缓存渲染，避免界面空白
            if (cachedState) syncRender(cachedState);
        }
    }

    // 4. 对外渲染接口：有缓存直接用，没缓存才请求
    function renderPlayers() {
        if (cachedState)    syncRender(cachedState);  // 同步渲染，无延迟
        else                updateCacheAndRender();   // 首次加载，需要请求
    }

    // 5. 监听数据更新通知：数据变了才重新请求
    EventBus.on('CMD_NOTIFY_STATE_UPDATED', renderPlayers);

    // 6. 可选：监听金额档位变化，只更新缓存不重新请求
    // EventBus.on('CMD_NOTIFY_AMOUNT_CHANGED', (newAmount) => {
    //     if (cachedState) {
    //         cachedState.selectedAmount = newAmount;
    //         syncRender(cachedState);
    //     }
    // });

})(window);



