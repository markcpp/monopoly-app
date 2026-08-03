(function (global) {
  'use strict';
  // 局部变量
  const menuState = {

  };
  let playerCount = 3;
  let initMoney = 15000;
  let initReward = 2000;

  // ── DOM 工具 ──
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // ── DOM 引用 ──
  const menuScreen      = $('#menu-screen');
  const gameScreen      = $('#game-screen');
  const countRow        = $('#count-row');
  const initMoneyInput  = $('#init-money');
  const initRewardInput = $('#init-reward');
  const startBtn        = $('#start-btn');

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
    playerCount = parseInt(btn.dataset.count);
    console.log('[Menu] 玩家人数选择:', playerCount);
  });


  // ── 根据选择的数据,开始游戏 ──
  startBtn.addEventListener('click', () => {
    const config = {
        playerCount: parseInt(playerCount),
        initMoney: parseInt(initMoneyInput.value),
        initReward: parseInt(initRewardInput.value),
    };
    
    // 通知game模块初始化游戏
    EventBus.emit('CMD_INIT_GAME', config);
  });

})(window);