(function (global) {
    'use strict';

    let audioContext = null;

    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (global.AudioContext || global.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') audioContext.resume();
        return audioContext;
    }

    // ── 骰子滚动音效 ──
    EventBus.on('CMD_NOTIFY_PLAY_DICE_SOUND', () => {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        for (let i = 0; i < 6; i++) {
        const t = now + i * 0.08;
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.3;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        const flt = ctx.createBiquadFilter();
        flt.type = 'highpass';
        flt.frequency.value = 2000;
        src.connect(flt);
        flt.connect(g);
        g.connect(ctx.destination);
        src.start(t);
        src.stop(t + 0.04);
        }
    });

    // ── 结果提示音 ──
    EventBus.on('CMD_NOTIFY_PLAY_RESULT_SOUND', () => {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    });
})(window);