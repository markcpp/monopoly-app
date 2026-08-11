const MAP_CONFIG = {
    worldMap: [
        '赤道','中国','日本','机会','韩国','菲律宾','马来西亚','越南','泰国','印度','太平洋','斯里兰卡','伊朗','伊拉克','沙特阿拉伯','叙利亚',
        '土耳其','命运',
        // '黎巴嫩','以色列','俄罗斯','波兰','德国','印度洋','奥地利','瑞士','法国','比利时','机会','荷兰','英国',

    ],

    // ---- 地皮价格（买 / 升级）----
    // 规律：每往后一格，买地 +200，升级 +100
    locationConfigs: {
        '中国':       { buy:  200, upgrade:  100, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '日本':       { buy:  400, upgrade:  200, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '韩国':       { buy:  600, upgrade:  300, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '菲律宾':     { buy:  800, upgrade:  400, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '马来西亚':   { buy: 1000, upgrade:  500, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '越南':       { buy: 1200, upgrade:  600, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '泰国':       { buy: 1400, upgrade:  700, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '印度':       { buy: 1600, upgrade:  800, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '斯里兰卡':   { buy: 1800, upgrade:  900, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '伊朗':       { buy: 2000, upgrade: 1000, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '伊拉克':   { buy: 2200, upgrade: 1100, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '沙特阿拉伯': { buy: 2400, upgrade: 1200, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '叙利亚':     { buy: 2600, upgrade: 1300, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
        '土耳其':   { buy: 2800, upgrade: 1400, toll0:100, toll1:200, toll2:300, toll3:400, toll4:500, toll5:600 },
    },

    // ---- 工具属性 ----
    get mapLength() { return this.worldMap.length; },

    // ---- 判断某格是不是地皮（可购买）----
    hasPrice(name) {
        return !!this.locationConfigs[name];
    },
    // ---- 过路费公式 ----
    getToll(location, level) {
        const config = this.locationConfigs[location];
        return config[`toll${level}`];
    },

};

// 冻结 MAP_CONFIG 对象及其子对象，防止被修改
Object.freeze(MAP_CONFIG);
Object.freeze(MAP_CONFIG.locationConfigs);