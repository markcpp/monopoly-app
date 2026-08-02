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
    rolling: false,
    pendingChanges: {}, // 待变化的金额,点确定之后,清零
    diceCount: 3,
    position: 0
  };

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

    state.initMoney = parseInt(initMoneyInput.value) || 15000;
    if (state.initMoney < 1000) state.initMoney = 1000;
    state.initReward = parseInt(initRewardInput.value) || 2000;
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

})(window);