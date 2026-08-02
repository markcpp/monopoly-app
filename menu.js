(function (global) {
  'use strict';

  // ── 常量 ──
  const playerNames = ['玩家一', '玩家二', '玩家三', '玩家四', '玩家五', '玩家六'];

  // 状态只存在自己模块内，不暴露给全局（需要的话通过request事件获取）
  const state = {
    playerCount: 3,
    players: [],
    rolling: false,
    pendingChanges: {}, // 待变化的金额,点确定之后,清零
    diceCount: 3,
    position: 0
  };

  const  initMoney = 15000;
  const  initReward = 2000;

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

  // ── DOM 工具 ──
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // ── DOM 引用 ──
  const menuScreen = $('#menu-screen');
  const gameScreen = $('#game-screen');
  const countRow = $('#count-row');
  const initMoneyInput = $('#init-money');
  const initRewardInput = $('#init-reward');
  const startBtn = $('#start-btn');

  // 监听“切换界面”命令（比如game发退出命令，menu处理）
  EventBus.on('CMD_NOTIFY_SWITCH_SCREEN', screenName => {
    if (screenName === 'menu') {
      gameScreen.classList.remove('active');
      menuScreen.classList.add('active');
    } else {
      menuScreen.classList.remove('active');
      gameScreen.classList.add('active');
    }
  });

  // ── 选择玩家人数 ──
  countRow.addEventListener('click', e => {
    const btn = e.target.closest('.count-btn');
    if (!btn) return;
    $$('.count-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.playerCount = parseInt(btn.dataset.count);
  });


  // ── 根据选择的数据,开始游戏 ──
  startBtn.addEventListener('click', () => {
    state.players = [];
    state.pendingChanges = {};

    state.initMoney = parseInt(initMoneyInput.value) || initMoney;
    if (state.initMoney < 1000) state.initMoney = 1000;
    state.initReward = parseInt(initRewardInput.value) || initReward;
    if (state.initReward < 1000) state.initReward = 1000;

    for (let i = 0; i < state.playerCount; i++) {
      state.players.push({  
        id: i, 
        name: playerNames[i], 
        money: state.initMoney
      });
      state.pendingChanges[i] = 0; // 初始化待变化金额为0
    }
    // 切换到game界面
    EventBus.emit('CMD_NOTIFY_SWITCH_SCREEN', 'game');
    // 渲染玩家卡片
    EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
  });

  // ✅ 确认修改：将待修改金额应用到真实资金
  EventBus.on('CMD_NOTIFY_CONFIRM_CHANGE', ({ idx, pending }) => {
      // 1. 校验
      if (!state.players[idx] || pending === 0) return;

      // 2. ✅ 核心修复：使用 Math.round 防止精度Bug，确保是整数
      const oldMoney = state.players[idx].money;
      state.players[idx].money = Math.round(oldMoney + pending);
      
      // 3. 重置待修改项
      state.pendingChanges[idx] = 0;
      
      console.log(`[Menu] 记账成功：玩家${idx} 原金额 ${oldMoney} + 变动 ${pending} = 新金额 ${state.players[idx].money}`);
      
      // 4. 通知刷新（这一步你之前是对的，只要确保 game.js 收到后能重绘就行）
      EventBus.emit('CMD_NOTIFY_STATE_UPDATED');
  });

})(window);