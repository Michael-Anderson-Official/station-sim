/* 駅シム — 1面1線のしょぼい駅から新宿級の巨大ターミナルへ
   操作: 1本指ドラッグで回転 / 2本指で拡大・移動 */
(function () {
'use strict';

/* ================= 定数 ================= */
const CFG = {
	TRACK_W: 4.4,          // 線路1本が占める幅(m)
	CAR_LEN: 20,           // 1両の長さ(m)
	CARS_MIN: 2,
	CARS_MAX: 15,          // 在来線の実際の上限(基本10両+付属5両)
	CAR_CAP: 150,          // 1両の定員(ホーム側の目安。実際の定員は形式ごと)
	CAR_FLOW: 1.6,         // 1両あたりのドア扱い人数/秒(同上)
	TURN: 1200,            // 当駅で折り返して次のスジに就くまでの最短時間(秒)
	SPAWN_LEAD: 40,        // 到着の何秒前に列車を投入するか
	APPROACH_T: 14,        // 進入・退出にかかる秒数
	APPROACH_LEN: 260,     // 進入・退出で走る距離(m)
	OCC_IN: 30,            // 前の列車が抜けてから次が入線できるまで(秒)
	// 発車間隔。本線(駅の外の線路)と番線(ホームの線路)で別々に効く。
	// 1本線に2番線を交互に使えば、番線120秒の制約を守ったまま本線60秒が出せる
	LINE_HEAD: 60,         // 同一本線の最小発車間隔(信号の間隔)
	TRACK_HEAD: 120,       // 同一番線の最小発車間隔(停車+進入退出)
	HEAD_SLOW_FAST: 480,   // 同一本線で遅い種別の直後に速い種別(追いついてしまう)
	MAX_LINES: 6,          // 本線の最大数
	ENTER_WINDOW: 2700,    // この先これだけの間に乗れるスジが無ければ客は入場しない(秒)
	FAST_SHARE: 0.35,      // 優等が走っているとき「速い列車を待つ」客の割合
	PREF_GIVEUP: 720,      // これだけ待つと妥協して普通にも乗る(秒)
	RUN_PER_CAR: 900,      // 1両を1本走らせるごとの運行費(円)
	LOAD_ROOM: 0.35,       // 到着時に空いている定員の割合
	ALIGHT_ROOM: 0.4,      // 降車1人につき空く席の割合
	PLAT_Y: 1.1,           // ホーム面の高さ
	CONC_Y: 8.4,           // コンコース(橋上駅舎)の高さ
	// ビルの高さ帯。窓テクスチャ1タイル=約14mなので、帯ごとに繰り返し数を変えて階高を揃える
	BLD_CLASS: [
		{ max: 18, rx: 1.4, ry: 0.8 },
		{ max: 46, rx: 1.6, ry: 2.2 },
		{ max: 1e9, rx: 1.8, ry: 5.0 },
	],
	WALK: 1.35,            // 歩行速度 m/s
	GATE_M_HEADWAY: 2.8,   // 手動改札(駅員)1通路が1人を通す秒数
	GATE_A_HEADWAY: 1.4,   // 自動改札1通路が1人を通す秒数
	CROSS_HEADWAY: 0.25,   // 構内踏切が1人を通す秒数
	CROSS_CLEAR: 8,        // 列車が抜けてから踏切が開くまでの秒数
	CROSS_WARN: 25,        // 列車接近で閉まりはじめる秒数
	UNDER_Y: 7.2,          // 地下コンコースの深さ
	STAFF_WAGE: 42000,     // 駅員1人あたりの1日の人件費
	NO_GATE_FARE: 0.55,    // 改札が1つも無いときに回収できる運賃の割合
	STAIR_HEADWAY: 0.85,   // 階段1つが1人を通す秒数
	ESC_HEADWAY: 0.42,     // エスカレーター
	STAIR_CLIMB: 9,        // 階段を上り下りする秒数
	MAX_PAX: 2200,         // 同時表示エージェント上限
	MAX_STAIRS: 6,
	MAX_SUB_DT: 0.5,       // 物理サブステップ上限(ゲーム秒)
	DWELL_MIN: 25,         // 最低停車時間
	DWELL_MAX: 180,
	FARE: 80,              // 乗降1人あたりの駅の取り分(円)
};

const RANKS = [
	{ name: '無人駅',          need: 0 },
	{ name: '小さな駅',        need: 2000 },
	{ name: '町の駅',          need: 8000 },
	{ name: '中規模駅',        need: 25000 },
	{ name: '主要駅',          need: 70000 },
	{ name: '急行停車駅',      need: 150000 },
	{ name: 'ターミナル駅',    need: 400000 },
	{ name: '巨大ターミナル',  need: 1000000 },
	{ name: '新宿級',          need: 3000000 },
];

/* ================= 列車種別 =================
   表定速度の差が待避の意味になる。速い種別ほど運賃取り分が大きい */
const TYPES = [
	{ id: 0, name: '普通', abbr: '普', col: 0x9aa3ad, fareMul: 1.00, kmh: 45, rank: 0 },
	{ id: 1, name: '急行', abbr: '急', col: 0xe2903a, fareMul: 1.15, kmh: 65, rank: 2 },
	{ id: 2, name: '特急', abbr: '特', col: 0xd8434f, fareMul: 1.60, kmh: 85, rank: 4 },
];

/* ================= 車両形式カタログ =================
   cap/door は1両あたり。price/lease も1両あたり。
   cars = 組める両数。fit = 就ける種別(不適合でも走れるが遅く、運賃倍率が普通扱いになる) */
const MODELS = [
	{ id: 'kiha40',   name: 'キハ40形',        cars: [1, 2],        cap: 110, door: 1.0, kmh: 85,  fit: [0],       price: 380000,  lease: 14000, band: 0x2f6f4a, rank: 0 },
	{ id: 'mei6000',  name: '名鉄6000系',      cars: [2, 4, 6],     cap: 130, door: 1.4, kmh: 110, fit: [0, 1],    price: 620000,  lease: 21000, band: 0xd8006c, rank: 0 },
	{ id: 'keio7000', name: '京王7000系',      cars: [6, 8, 10],    cap: 145, door: 1.7, kmh: 110, fit: [0, 1],    price: 1000000, lease: 26000, band: 0x2f8f6a, rank: 2 },
	{ id: 'keio8000', name: '京王8000系',      cars: [8, 10],       cap: 150, door: 1.8, kmh: 110, fit: [0, 1],    price: 1250000, lease: 30000, band: 0xd8006c, rank: 3 },
	{ id: 'mei2200',  name: '名鉄2200系',      cars: [6, 8],        cap: 120, door: 1.1, kmh: 120, fit: [1, 2],    price: 1900000, lease: 33000, band: 0xc03040, rank: 3 },
	{ id: 'e231',     name: 'E231系',          cars: [10, 15],      cap: 155, door: 1.9, kmh: 120, fit: [0, 1],    price: 1450000, lease: 36000, band: 0x1f7ac0, rank: 4 },
	{ id: 'e233',     name: 'E233系3000番台',  cars: [10, 15],      cap: 160, door: 2.0, kmh: 120, fit: [0, 1, 2], price: 1750000, lease: 40000, band: 0xe06010, rank: 5 },
	{ id: 'keio5000', name: '京王5000系',      cars: [10],          cap: 125, door: 1.2, kmh: 120, fit: [1, 2],    price: 2400000, lease: 48000, band: 0x1f5fb0, rank: 5 },
	{ id: 'ltd2',     name: '特急形(2階建)',   cars: [8, 10, 12],   cap: 100, door: 0.7, kmh: 160, fit: [2],       price: 3200000, lease: 60000, band: 0x6a4ac0, rank: 6 },
];
const MODEL = {};
for (const m of MODELS) MODEL[m.id] = m;

function modelOf(id) { return MODEL[id] || MODELS[0]; }
function slotCap(mid, cars) { return cars * modelOf(mid).cap; }
function slotFlow(mid, cars) { return cars * modelOf(mid).door; }
function typeFits(mid, ty) { return modelOf(mid).fit.indexOf(ty) >= 0; }
function contractPrice(mid, cars) { return modelOf(mid).price * cars; }
function contractLease(mid, cars) { return modelOf(mid).lease * cars; }

/* ================= 駅周辺の開発 =================
   乗客は「駅の周りに何があるか」で決まる。用途ごとに時間帯の形が違い、
   乗車(駅から出る)と降車(駅に着く)を別々に持つので朝夕の向きが再現される。
   配列は0時〜23時。読み込み時に「1日の乗降の半分」になるよう正規化する */
const PROF = {
	// 住宅地: 朝に出て、夕方から夜に帰ってくる
	home: {
		out: [.002, .001, 0, 0, 0, .002, .005, .010, .012, .012, .015, .018, .020, .020, .022, .030, .045, .080, .105, .095, .070, .045, .025, .010],
		in: [0, 0, 0, 0, .005, .020, .055, .115, .085, .045, .025, .018, .015, .015, .015, .015, .012, .010, .008, .006, .004, .003, .002, .001],
	},
	// オフィス: 朝に着いて、夕方に帰る
	office: {
		out: [0, 0, 0, 0, 0, .005, .030, .120, .190, .080, .030, .015, .012, .010, .010, .008, .008, .006, .005, .004, .003, .002, .001, 0],
		in: [0, 0, 0, 0, 0, 0, .002, .004, .006, .008, .010, .012, .015, .015, .018, .025, .045, .085, .130, .090, .050, .025, .010, .004],
	},
	// 学校: 朝が鋭く、帰りはオフィスより早い
	school: {
		out: [0, 0, 0, 0, 0, .002, .025, .150, .180, .040, .010, .006, .005, .005, .005, .004, .004, .003, .002, .001, 0, 0, 0, 0],
		in: [0, 0, 0, 0, 0, 0, .002, .003, .004, .005, .006, .008, .012, .020, .045, .095, .120, .085, .045, .020, .008, .003, .001, 0],
	},
	// 商業: 昼から夕方に広く分布する
	shop: {
		out: [0, 0, 0, 0, 0, .002, .005, .010, .020, .035, .055, .065, .070, .065, .060, .060, .055, .045, .035, .022, .012, .006, .002, 0],
		in: [0, 0, 0, 0, 0, .001, .003, .006, .012, .020, .035, .050, .060, .065, .065, .070, .075, .070, .060, .045, .028, .015, .006, .002],
	},
};
// 乗車・降車それぞれの合計が 0.5 になるよう正規化する(合計で1日の乗降になる)
for (const k in PROF) {
	for (const dir of ['in', 'out']) {
		const a = PROF[k][dir];
		let s = 0;
		for (const v of a) s += v;
		for (let i = 0; i < a.length; i++) a[i] = a[i] / s * 0.5;
	}
}

/* 開発できるもの。pax = 1日の乗降(人)、rep = 建てるのに必要な評判 */
const DEVS = [
	{ id: 'home1', ic: '🏘', name: '住宅地', prof: 'home', pax: 900, cost: 2500000, growth: 1.12, rep: 0,
		desc: '朝に出て夜に帰る。1日を通して使われる基礎需要' },
	{ id: 'school', ic: '🏫', name: '高校', prof: 'school', pax: 1800, cost: 9000000, growth: 1.20, rep: 52,
		desc: '朝が鋭く、帰りは夕方前。休日は動かない' },
	{ id: 'office1', ic: '🏢', name: 'オフィス', prof: 'office', pax: 2600, cost: 15000000, growth: 1.15, rep: 58,
		desc: '朝の降車と夕方の乗車に集中する' },
	{ id: 'shop1', ic: '🏬', name: '商業施設', prof: 'shop', pax: 4200, cost: 32000000, growth: 1.16, rep: 64,
		desc: '昼から夕方に広く分布。ラッシュを避けた需要' },
	{ id: 'univ', ic: '🎓', name: '大学', prof: 'school', pax: 7500, cost: 60000000, growth: 1.18, rep: 70,
		desc: '高校より規模が大きく、時間帯も少し広い' },
	{ id: 'office2', ic: '🏙', name: '高層オフィス', prof: 'office', pax: 16000, cost: 130000000, growth: 1.14, rep: 76,
		desc: '朝夕のピークが一段跳ね上がる' },
	{ id: 'home2', ic: '🌆', name: 'ニュータウン', prof: 'home', pax: 26000, cost: 210000000, growth: 1.13, rep: 80,
		desc: '沿線人口そのものを増やす大規模開発' },
	{ id: 'center', ic: '🌃', name: '副都心開発', prof: 'office', pax: 200000, cost: 1000000000, growth: 1.10, rep: 86,
		desc: '駅を都市の中心にする。新宿級に到達する唯一の道' },
];
const DEV = {};
for (const d of DEVS) DEV[d.id] = d;

function devCount(id) { return (S.devs && S.devs[id]) | 0; }
function devCost(d) { return Math.round(d.cost * Math.pow(d.growth, devCount(d.id))); }
// 1日の潜在乗降(人)。開発が無ければゼロ
function potentialPax() {
	let n = 0;
	for (const d of DEVS) n += d.pax * devCount(d.id);
	return n;
}

// 時間帯別の需要倍率 (0時〜23時)
const HOURLY = [
	0.06, 0.02, 0.00, 0.00, 0.10, 0.55, 1.45, 2.95, 3.10, 1.75,
	1.00, 0.85, 0.95, 0.90, 0.85, 1.00, 1.35, 2.15, 2.45, 1.85,
	1.25, 0.95, 0.62, 0.25,
];

const SAVE_KEY = 'station-sim-v1';

/* ================= 状態 ================= */
function defaultState() {
	return {
		day: 1,
		t: 3600,              // 4:00起点の経過秒。開始は5:00
		money: 2000000,
		rep: 70,              // 評判 0-100
		town: 1,              // 街の発展度(需要倍率)
		cars: 2,              // ホーム有効長(両)
		link: 0,              // ホームへの動線 0=地平(構内踏切) 1=橋上駅舎 2=地下道
		nPlat: 1,             // ホーム面数
		nTrack: 1,            // 線路本数(番線)
		lines: 1,             // 本線の数(駅の外へ出ていく線路)
		trackLine: [0],       // 番線 → どの本線に属するか
		platW: 6,             // ホーム幅
		stairs: 0,            // 各ホームの階段数(地平駅では0)
		esc: false,           // エスカレーター化
		gateM: 0,             // 手動改札(駅員配置)の通路数
		gateA: 0,             // 自動改札の通路数
		concW: 0,             // コンコースの片側拡張幅
		shops: 0,             // 駅ナカ店舗
		// 駅周辺の開発。これが乗客の源。開業時は小さな住宅地が1つあるだけ
		devs: { home1: 1 },
		// 契約している編成。1要素 = 形式×両数ごとの保有本数
		fleet: [],            // [{m:'kiha40', cars:2, n:1}]
		// パターンダイヤ。1行を展開して1日ぶんのスジになる
		dia: [],              // [{id, m, cars, ty, track, from, to, every, off, dwell}] 分単位
		diaId: 1,
		todayPax: 0, todayRev: 0, todayCost: 0, todayLease: 0,
		yesterdayPax: 0,
		rank: 0,
		log: [],
	};
}

let S = defaultState();

// 実行時のみの状態(セーブしない)
const R = {
	pax: [],              // 乗客エージェント
	trains: [],
	outPool: 0,           // 列車で到着する予定の降車客(人)
	inAccum: 0,           // 入場客のスポーン端数
	inQ: [], inQHead: 0,  // 駅に入りきらない入場客(到着時刻のFIFO)
	waitN: [1], waitW: [0], maxWaitW: 1,   // 線路ごとの待機客(全走査を避けるためのカウンタ)
	crossFree: [0], crossOpenAt: 0, crossClosed: false,   // 構内踏切
	sched: [],            // 検証済みスジ(spawn昇順)。これが実行の唯一の真実
	depIdx: [],           // 発車昇順・2日ぶんの索引(番線選択と入場判定に使う)
	schedCur: 0,          // 次に投入するスジ
	trackBusy: [],        // 番線ごとに空く時刻
	need: 0, short: 0,    // 所要編成数 / 不足数
	issues: [],           // ダイヤの問題(UIで赤表示)
	missAcc: [],          // [番線×2+志向] ごとの積み残し発生本数(満足度計算用)
	stairFree: [],        // [plat][k] 階段が空く時刻
	gateFree: [],         // 改札レーンが空く時刻
	platCount: [],        // ホーム上の人数(混雑計算用)
	concCount: 0,
	satSum: 0, satN: 0,
	now: 0,               // 巻き戻らない絶対ゲーム時刻(待ち行列・滞在時間用)
	speed: 60,
	paxScale: 1,          // 1エージェントが表す人数
	lastAlert: {},
};

/* ================= 幾何 ================= */
const G = {};
function recalcGeometry() {
	G.unitW = S.platW + 2 * CFG.TRACK_W + 1.4;
	// ホーム長は編成長に追従する
	G.platLen = S.cars * CFG.CAR_LEN;
	G.platZ0 = -G.platLen / 2;
	G.platZ1 = G.platLen / 2;
	// 駅舎の大きさは駅の規模に合わせる。小駅に巨大な橋上駅舎が載らないように
	G.concD = Math.max(20, Math.min(92, 12 + gateCount() * 0.9 + G.platLen * 0.10));
	if (hasLink()) {
		// 橋上/地下: ホームの北端にまたがり、乗客は階段で上り下りする
		G.entryY = isBridge() ? CFG.CONC_Y : -CFG.UNDER_Y;
		G.over = Math.min(G.concD * 0.55, Math.max(10, G.platLen * 0.32));
		G.concZ0 = G.platZ1 - G.over;
	} else {
		// 地平駅: ホームの先の地上に駅舎があり、そのまま歩いて入れる
		G.entryY = 0;
		G.over = 0;
		G.concD = Math.max(16, Math.min(46, 12 + gateCount() * 1.4));
		G.concZ0 = G.platZ1 + 6;
	}
	G.concZ1 = G.concZ0 + G.concD;
	G.gateZ = hasLink() ? G.concZ1 - Math.min(18, G.concD * 0.34) : G.concZ0 + Math.min(9, G.concD * 0.42);
	G.exitZ = G.concZ1 + 8;
	if (hasLink()) {
		G.concX0 = platX(0) - G.unitW / 2 - 7 - S.concW;
		G.concX1 = platX(S.nPlat - 1) + G.unitW / 2 + 7 + S.concW;
	} else {
		// 駅舎は線路をまたげないので、いちばん東の線路より外に建てる
		let railE = -Infinity;
		for (let t = 0; t < S.nTrack; t++) railE = Math.max(railE, trackX(t) + CFG.TRACK_W / 2);
		G.concX0 = railE + 2.5;
		G.concX1 = G.concX0 + Math.max(15, 9 + gateCount() * 2.2 + S.concW * 2);
	}
	G.concCx = (G.concX0 + G.concX1) / 2;
	G.concArea = (G.concX1 - G.concX0) * G.concD;
	G.platArea = S.platW * G.platLen;
	G.trainCap = S.cars * CFG.CAR_CAP;
	G.doorFlow = S.cars * CFG.CAR_FLOW;
	G.nDoors = Math.max(2, S.cars * 2);
	// 階段はコンコースに覆われた範囲に収める
	G.stairA = G.concZ0 + 4;
	G.stairB = G.platZ1 - 4;
	// 地平駅で線路を渡る構内踏切のZ
	G.crossZ = G.platZ1 + 3;
}

// 延伸は+2両刻み。最後だけ+1両で15両(基本10両+付属5両)にする
function nextCars() {
	return S.cars + (S.cars + 2 > CFG.CARS_MAX ? 1 : 2);
}

// ホームへの動線。地平は構内踏切、橋上/地下は階段
function hasLink() { return S.link !== 0; }
function isBridge() { return S.link === 1; }
function isUnder() { return S.link === 2; }
const LINK_NAME = ['地平', '橋上', '地下'];

// 階段は立体交差の動線があるときだけ。地平駅は踏切を渡ってそのまま入れる
function hasStairs() { return hasLink(); }
// ホームが短いと階段は何本も置けない。延伸すると増やせるようになる
function maxStairs() {
	if (!hasLink()) return 0;
	return Math.max(1, Math.min(CFG.MAX_STAIRS, Math.round(S.cars * CFG.CAR_LEN / 50)));
}
function platX(i) { return (i - (S.nPlat - 1) / 2) * (S.platW + 2 * CFG.TRACK_W + 1.4); }
function trackPlat(t) { return t >> 1; }
function trackSide(t) { return (t & 1) ? 1 : -1; }
function trackX(t) { return platX(trackPlat(t)) + trackSide(t) * (S.platW / 2 + CFG.TRACK_W / 2); }
function stairZ(k) {
	if (S.stairs === 1) return (G.stairA + G.stairB) / 2;
	return G.stairA + k * (G.stairB - G.stairA) / (S.stairs - 1);
}
// 改札機は横一列に並べ、コンコース幅を超えたら手前へ折り返す
function gateCols() { return Math.max(4, Math.floor((G.concX1 - G.concX0 - 8) / 1.9)); }
// 改札は手動を左端にまとめ、その右に自動を並べる
function gateCount() { return S.gateM + S.gateA; }
function gateIsManual(j) { return j < S.gateM; }
function gateHeadway(j) { return gateIsManual(j) ? CFG.GATE_M_HEADWAY : CFG.GATE_A_HEADWAY; }
function gatePos(j) {
	const cols = gateCols();
	const row = Math.floor(j / cols);
	const col = j % cols;
	const n = Math.min(gateCount() - row * cols, cols);
	return { x: G.concCx + (col - (n - 1) / 2) * 1.9, z: G.gateZ - row * 7 };
}
// ドア位置のZ (1両あたり2ドア)
function doorZ(i) {
	if (G.nDoors < 2) return 0;
	return G.platZ0 + 3 + i * (G.platLen - 6) / (G.nDoors - 1);
}

/* ================= 手続きテクスチャ =================
   外部画像を使えないので、必要な質感は Canvas2D で焼いて CanvasTexture にする */
function makeCanvas(size, draw) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	draw(c.getContext('2d'), size);
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 4;
	t.encoding = THREE.sRGBEncoding;
	return t;
}

// 粒状ノイズを重ねる汎用の下地
function grain(ctx, size, amount, alpha) {
	const img = ctx.getImageData(0, 0, size, size);
	const d = img.data;
	for (let i = 0; i < d.length; i += 4) {
		const n = (Math.random() - 0.5) * amount;
		d[i] += n; d[i + 1] += n; d[i + 2] += n;
		if (alpha !== undefined) d[i + 3] = alpha;
	}
	ctx.putImageData(img, 0, 0);
}

const TEX = {};
function buildTextures() {
	// コンクリート(ホーム床)
	TEX.concrete = makeCanvas(256, (g, s) => {
		g.fillStyle = '#9ba3ac'; g.fillRect(0, 0, s, s);
		grain(g, s, 34);
		// 目地
		g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2;
		for (let i = 0; i <= 4; i++) {
			const p = i * s / 4;
			g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
			g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
		}
		// 汚し
		for (let i = 0; i < 24; i++) {
			g.fillStyle = 'rgba(60,66,74,' + (0.03 + Math.random() * 0.06) + ')';
			const r = 10 + Math.random() * 40;
			g.beginPath(); g.arc(Math.random() * s, Math.random() * s, r, 0, 7); g.fill();
		}
	});

	// バラスト(砕石)
	TEX.ballast = makeCanvas(256, (g, s) => {
		g.fillStyle = '#4a4741'; g.fillRect(0, 0, s, s);
		for (let i = 0; i < 2600; i++) {
			const v = 40 + Math.random() * 90;
			g.fillStyle = 'rgb(' + v + ',' + (v - 4) + ',' + (v - 12) + ')';
			const r = 1.2 + Math.random() * 2.6;
			g.beginPath(); g.arc(Math.random() * s, Math.random() * s, r, 0, 7); g.fill();
		}
	});

	// アスファルト(道路・駅前広場)
	TEX.asphalt = makeCanvas(256, (g, s) => {
		g.fillStyle = '#8b9096'; g.fillRect(0, 0, s, s);
		grain(g, s, 30);
		for (let i = 0; i < 700; i++) {
			g.fillStyle = 'rgba(60,64,70,' + (0.05 + Math.random() * 0.10) + ')';
			g.fillRect(Math.random() * s, Math.random() * s, 1.8, 1.8);
		}
	});

	// 点字ブロック(ホーム縁の黄色い警告帯)
	TEX.tactile = makeCanvas(128, (g, s) => {
		g.fillStyle = '#e8b91d'; g.fillRect(0, 0, s, s);
		grain(g, s, 16);
		g.fillStyle = 'rgba(120,88,0,.55)';
		const n = 6, step = s / n;
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				g.beginPath();
				g.arc(step * (x + 0.5), step * (y + 0.5), step * 0.24, 0, 7);
				g.fill();
			}
		}
	});

	// 車体の側面(窓とドアの帯)
	TEX.carSide = makeCanvas(512, (g, s) => {
		g.fillStyle = '#e9edf1'; g.fillRect(0, 0, s, s);
		grain(g, s, 10);
		// 窓帯
		const wy = s * 0.30, wh = s * 0.26;
		g.fillStyle = '#10161d';
		for (let i = 0; i < 4; i++) {
			const x = s * (0.06 + i * 0.24);
			g.fillRect(x, wy, s * 0.145, wh);
		}
		// ドア
		g.fillStyle = '#c9d2da';
		g.fillRect(s * 0.215, s * 0.20, s * 0.055, s * 0.62);
		g.fillRect(s * 0.735, s * 0.20, s * 0.055, s * 0.62);
		g.fillStyle = '#10161d';
		g.fillRect(s * 0.222, wy, s * 0.041, wh * 0.85);
		g.fillRect(s * 0.742, wy, s * 0.041, wh * 0.85);
		// 車体帯
		g.fillStyle = '#d8006c';
		g.fillRect(0, s * 0.60, s, s * 0.055);
		// 裾の汚し
		g.fillStyle = 'rgba(90,95,100,.22)';
		g.fillRect(0, s * 0.80, s, s * 0.20);
	});
	TEX.carSide.wrapS = THREE.RepeatWrapping;
	TEX.carSide.wrapT = THREE.ClampToEdgeWrapping;

	// ビルの壁。1タイル = 実寸 CFG.FLOOR_M * 4 なので、繰り返し数で階数が決まる
	TEX.building = makeCanvas(256, (g, s) => {
		g.fillStyle = '#8d9299'; g.fillRect(0, 0, s, s);
		grain(g, s, 18);
		const n = 4;
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				g.fillStyle = Math.random() < 0.4 ? '#3d444d' : '#4d555f';
				g.fillRect((x + 0.18) * s / n, (y + 0.22) * s / n, s / n * 0.64, s / n * 0.46);
			}
		}
		// 階と階の境
		g.fillStyle = 'rgba(255,255,255,.10)';
		for (let y = 0; y < n; y++) g.fillRect(0, (y + 0.74) * s / n, s, 2);
	});
	TEX.buildingLit = makeCanvas(256, (g, s) => {
		g.fillStyle = '#000000'; g.fillRect(0, 0, s, s);
		const n = 4;
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				if (Math.random() > 0.5) continue;
				const w = 190 + Math.random() * 60;
				g.fillStyle = 'rgb(' + w + ',' + (w - 18) + ',' + (w - 62) + ')';
				g.fillRect((x + 0.18) * s / n, (y + 0.22) * s / n, s / n * 0.64, s / n * 0.46);
			}
		}
	});

	// 木造駅舎の下見板張り
	TEX.wood = makeCanvas(256, (g, s) => {
		g.fillStyle = '#cdbfa4'; g.fillRect(0, 0, s, s);
		grain(g, s, 16);
		const n = 10;
		for (let i = 0; i < n; i++) {
			const y = i * s / n;
			g.fillStyle = 'rgba(120,100,72,' + (0.10 + Math.random() * 0.10) + ')';
			g.fillRect(0, y, s, s / n * 0.16);
			g.fillStyle = 'rgba(255,250,240,.06)';
			g.fillRect(0, y + s / n * 0.16, s, s / n * 0.2);
		}
	});

	// 瓦屋根
	TEX.tile = makeCanvas(256, (g, s) => {
		g.fillStyle = '#4a5058'; g.fillRect(0, 0, s, s);
		grain(g, s, 14);
		const n = 16;
		for (let i = 0; i < n; i++) {
			const x = i * s / n;
			g.fillStyle = 'rgba(20,24,30,.30)';
			g.fillRect(x, 0, s / n * 0.14, s);
			g.fillStyle = 'rgba(190,200,214,.10)';
			g.fillRect(x + s / n * 0.20, 0, s / n * 0.3, s);
		}
	});

	// 地面(駅の外の土地)
	TEX.land = makeCanvas(256, (g, s) => {
		g.fillStyle = '#8d9184'; g.fillRect(0, 0, s, s);
		grain(g, s, 20);
		// ごく淡い濃淡だけ。派手にすると俯瞰で地面が騒がしくなる
		for (let i = 0; i < 30; i++) {
			const v = 128 + (Math.random() - 0.5) * 26;
			g.fillStyle = 'rgba(' + (v | 0) + ',' + ((v + 4) | 0) + ',' + ((v - 12) | 0) + ',0.16)';
			g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 20 + Math.random() * 60, 0, 7); g.fill();
		}
	});
}

// ビルの外壁色。灰一色にならないよう少しだけ振る
const BLD_COLORS = [
	0xc9ccd0, 0xbfb9ae, 0xd2cfc6, 0xa9b0b6, 0xc7bfb2,
	0xb4bcc2, 0xd6d2c8, 0xa2a8ad, 0xcabfae, 0xb8b2a8,
];
// 街区(敷地)の地色。地面が一様に見えないよう区画ごとに振る
const LOT_COLORS = [
	0xa8ac9a, 0x9ba392, 0xb4b3a4, 0x8f9b83, 0xadaa9b,
	0x9fa696, 0xb8b6a6, 0x94a08b, 0xa5a294, 0xb0b2a0,
];

/* ================= 空と時間帯 =================
   空の色・太陽の位置と色・環境光を時刻から決める。夜は駅の照明が点く */
const SKY_KEYS = [
	{ h: 0,  top: 0x070c18, bot: 0x131d2e, sun: 0x2a3550, si: 0.05, amb: 0.30, hemi: 0x22304a },
	{ h: 4.5,top: 0x11203c, bot: 0x3a3550, sun: 0x4b4a72, si: 0.10, amb: 0.34, hemi: 0x34405e },
	{ h: 6,  top: 0x2d4f80, bot: 0xd9865a, sun: 0xff9d5c, si: 0.75, amb: 0.45, hemi: 0x6d7b96 },
	{ h: 9,  top: 0x3f7fc8, bot: 0xa8cbe8, sun: 0xfff3e0, si: 1.25, amb: 0.62, hemi: 0x9fbcd8 },
	{ h: 13, top: 0x2f74c6, bot: 0xbcd8ee, sun: 0xffffff, si: 1.40, amb: 0.66, hemi: 0xa8c6e2 },
	{ h: 17, top: 0x3b74b4, bot: 0xd6bb92, sun: 0xffd39a, si: 1.05, amb: 0.56, hemi: 0x93a6bd },
	{ h: 18.5,top:0x27406e, bot: 0xe0794a, sun: 0xff8340, si: 0.55, amb: 0.42, hemi: 0x5d6580 },
	{ h: 20, top: 0x0c1428, bot: 0x1b2740, sun: 0x33405e, si: 0.10, amb: 0.32, hemi: 0x263248 },
	{ h: 24, top: 0x070c18, bot: 0x131d2e, sun: 0x2a3550, si: 0.05, amb: 0.30, hemi: 0x22304a },
];

let sky, sun, hemi, ambient;
const _cA = new THREE.Color(), _cB = new THREE.Color();

function lerpKey(h) {
	let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
	for (let i = 0; i < SKY_KEYS.length - 1; i++) {
		if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
	}
	const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
	return { a, b, t };
}

function initSky() {
	const geo = new THREE.SphereGeometry(4000, 24, 16);
	const mat = new THREE.ShaderMaterial({
		side: THREE.BackSide, depthWrite: false, fog: false,
		uniforms: {
			top: { value: new THREE.Color(0x3f7fc8) },
			bot: { value: new THREE.Color(0xa8cbe8) },
			sunDir: { value: new THREE.Vector3(0, 1, 0) },
			sunCol: { value: new THREE.Color(0xffffff) },
			sunAmt: { value: 1 },
		},
		vertexShader: `
			varying vec3 vDir;
			void main(){
				vDir = normalize(position);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
			}`,
		fragmentShader: `
			// tonemapping/encodings の関数群は three が前置きするので include しない
			uniform vec3 top; uniform vec3 bot; uniform vec3 sunCol;
			uniform vec3 sunDir; uniform float sunAmt;
			varying vec3 vDir;
			void main(){
				float h = clamp(vDir.y*1.4+0.22, 0.0, 1.0);
				vec3 c = mix(bot, top, pow(h, 0.85));
				// 太陽まわりのにじみ
				float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
				c += sunCol * pow(d, 90.0) * 1.4 * sunAmt;
				c += sunCol * pow(d, 6.0) * 0.16 * sunAmt;
				gl_FragColor = vec4(c, 1.0);
				// シーンと同じトーンマッピング・出力変換を通さないと空だけ浮く
				#include <tonemapping_fragment>
				#include <encodings_fragment>
			}`,
	});
	sky = new THREE.Mesh(geo, mat);
	sky.frustumCulled = false;
	scene.add(sky);
}

function updateSky() {
	const h = hourOfDay();
	const { a, b, t } = lerpKey(h);

	_cA.setHex(a.top).convertSRGBToLinear(); _cB.setHex(b.top).convertSRGBToLinear();
	sky.material.uniforms.top.value.copy(_cA).lerp(_cB, t);
	_cA.setHex(a.bot).convertSRGBToLinear(); _cB.setHex(b.bot).convertSRGBToLinear();
	const bot = sky.material.uniforms.bot.value.copy(_cA).lerp(_cB, t);
	_cA.setHex(a.sun).convertSRGBToLinear(); _cB.setHex(b.sun).convertSRGBToLinear();
	const sc = sky.material.uniforms.sunCol.value.copy(_cA).lerp(_cB, t);

	const si = a.si + (b.si - a.si) * t;
	const amb = a.amb + (b.amb - a.amb) * t;
	_cA.setHex(a.hemi).convertSRGBToLinear(); _cB.setHex(b.hemi).convertSRGBToLinear();

	// 太陽は6時に東(+X)から昇り18時に西(-X)へ沈む
	const ang = (h - 6) / 12 * Math.PI;
	const el = Math.sin(ang), az = Math.cos(ang);
	const dist = 900;
	sun.position.set(az * dist, Math.max(0.06, el) * dist * 0.9, dist * 0.35);
	sun.color.copy(sc);
	sun.intensity = si;
	sky.material.uniforms.sunDir.value.copy(sun.position).normalize();
	sky.material.uniforms.sunAmt.value = el > 0 ? 1 : 0.15;

	hemi.color.copy(_cA).lerp(_cB, t);
	hemi.intensity = amb;
	ambient.intensity = amb * 0.35;

	// フォグと地面は空の下側の色になじませる
	scene.fog.color.copy(bot).multiplyScalar(0.72);

	// 太陽が動いたぶんだけ影を焼き直す
	if (G.shadowAt === undefined || Math.abs(h - G.shadowAt) > 0.12 || h < G.shadowAt) {
		G.shadowAt = h;
		renderer.shadowMap.needsUpdate = true;
	}

	// 夜間は駅の照明を点ける
	const night = Math.max(0, Math.min(1, (0.30 - si) / 0.30));
	if (night !== G.night) {
		G.night = night;
		MAT.lamp.emissiveIntensity = 0.15 + night * 2.6;
		MAT.carWin.emissiveIntensity = night * 1.5;
		for (const m of MAT.winLit) { m.opacity = night; m.visible = night > 0.02; }
	}
}

/* ================= Three.js ================= */
let renderer, scene, camera, controls, paxMesh, dummy, stationGroup, trainGroup, cityGroup;
const COL_OUT = new THREE.Color(0x5fa8ff);   // 降車客(出場)
const COL_IN = new THREE.Color(0xffb055);    // 入場客

function initThree() {
	const app = document.getElementById('app');
	// ?dev=1 のときだけ描画バッファを保持する(スクリーンショット用。通常は性能優先で切る)
	const DEV = location.search.indexOf('dev=1') >= 0;
	renderer = new THREE.WebGLRenderer({
		antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEV,
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	// 影は駅と街をもう一度描くので毎フレームは回さない(太陽はゆっくりしか動かない)
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
	app.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	scene.fog = new THREE.Fog(0x8098b0, 700, 3400);

	camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 1, 9000);

	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.09;
	controls.maxPolarAngle = Math.PI * 0.475;
	controls.minDistance = 25;
	controls.maxDistance = 2500;

	ambient = new THREE.AmbientLight(0xffffff, 0.14);
	scene.add(ambient);
	hemi = new THREE.HemisphereLight(0x9fbcd8, 0x4a4438, 0.62);
	scene.add(hemi);

	sun = new THREE.DirectionalLight(0xffffff, 1.25);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.bias = -0.0004;
	// 大きすぎると柱やベンチの接地影が消えるので控えめに
	sun.shadow.normalBias = 0.05;
	scene.add(sun);
	scene.add(sun.target);

	buildTextures();
	buildMaterials();
	initSky();

	// 地面
	MAT.ground = new THREE.MeshStandardMaterial({ map: rep(TEX.land, 1, 1), color: 0xffffff, roughness: 1 });
	MAT.ground.map.repeat.set(1 / 82, 1 / 82);   // ShapeGeometry の UV はワールド座標

	stationGroup = new THREE.Group();
	scene.add(stationGroup);
	trainGroup = new THREE.Group();
	scene.add(trainGroup);
	cityGroup = new THREE.Group();
	scene.add(cityGroup);

	initPaxMesh();

	window.addEventListener('resize', onResize);
}

// 太陽の影の範囲を駅全体に合わせる
function fitShadow() {
	const r = Math.max(G.platLen, G.concX1 - G.concX0) * 0.75 + 120;
	const c = sun.shadow.camera;
	c.left = -r; c.right = r; c.top = r; c.bottom = -r;
	c.near = 100; c.far = 2400;
	c.updateProjectionMatrix();
	sun.target.position.set(0, 0, (G.platZ0 + G.exitZ) / 2);
	sun.target.updateMatrixWorld();
}

function onResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ===== 乗客の見た目 =====
   1ドローコールに収めるため、胴と頭を1つの BufferGeometry に手で結合する */
function mergeGeos(geos) {
	const list = geos.map(g => g.index ? g.toNonIndexed() : g);
	let vc = 0;
	for (const g of list) vc += g.attributes.position.count;
	const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
	let o = 0;
	for (const g of list) {
		pos.set(g.attributes.position.array, o * 3);
		nor.set(g.attributes.normal.array, o * 3);
		if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
		o += g.attributes.position.count;
	}
	const out = new THREE.BufferGeometry();
	out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
	out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	out.computeBoundingSphere();
	return out;
}

// 服の色のばらつき。青系=出場客 / 橙系=入場客 の識別は保ったまま濃淡を散らす
const PAL_OUT = [], PAL_IN = [];
function buildPalettes() {
	for (let i = 0; i < 8; i++) {
		const t = 0.62 + i / 7 * 0.62;
		PAL_OUT.push(COL_OUT.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, 0)
			.convertSRGBToLinear().multiplyScalar(t));
		PAL_IN.push(COL_IN.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, 0)
			.convertSRGBToLinear().multiplyScalar(t));
	}
}

let humanGeo = null;      // 乗客と駅員で共有する人型

function initPaxMesh() {
	buildPalettes();
	dummy = new THREE.Object3D();

	const body = new THREE.CylinderGeometry(0.19, 0.27, 1.18, 6, 1);
	body.translate(0, 0.59, 0);
	const head = new THREE.SphereGeometry(0.145, 6, 5);
	head.translate(0, 1.33, 0);
	const geo = humanGeo = mergeGeos([body, head]);
	body.dispose(); head.dispose();

	paxMesh = new THREE.InstancedMesh(geo,
		new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), CFG.MAX_PAX);
	paxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	paxMesh.frustumCulled = false;
	paxMesh.castShadow = false;      // 2200体の影は重すぎるので落とす
	paxMesh.receiveShadow = true;
	for (let i = 0; i < CFG.MAX_PAX; i++) paxMesh.setColorAt(i, COL_OUT);
	paxMesh.count = 0;
	scene.add(paxMesh);
}

/* ================= マテリアル ================= */
const MAT = {};

// このthreeにはColorManagementが無く、指定した16進色がそのままリニア値として扱われる。
// ACES+sRGB出力を通ると全体が白茶けるので、色は必ずリニアへ変換してから渡す。
function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

function buildMaterials() {
	const std = (o) => {
		if (typeof o.color === 'number') o.color = C(o.color);
		if (typeof o.emissive === 'number') o.emissive = C(o.emissive);
		return new THREE.MeshStandardMaterial(o);
	};

	MAT.ballast = std({ map: rep(TEX.ballast, 2, 30), color: 0x8f8a80, roughness: 1 });
	MAT.sleeper = std({ color: 0x4b4038, roughness: 0.95 });
	MAT.rail = std({ color: 0xb9c0c8, roughness: 0.35, metalness: 0.85 });
	MAT.plat = std({ map: rep(TEX.concrete, 3, 40), color: 0xc8ccd2, roughness: 0.92 });
	MAT.platSide = std({ color: 0x8a8f96, roughness: 0.95 });
	MAT.tactile = std({ map: rep(TEX.tactile, 2, 60), color: 0xffffff, roughness: 0.85 });
	MAT.whiteLine = std({ color: 0xf2f4f6, roughness: 0.8 });
	MAT.conc = std({ map: rep(TEX.concrete, 6, 6), color: 0xd6dae0, roughness: 0.9 });
	MAT.concUnder = std({ color: 0xb0b5bb, roughness: 1 });
	// 上家は半透明にする。実際の駅の採光屋根に近く、俯瞰でホームの人も見える
	MAT.roof = std({
		color: 0xdfe6ec, roughness: 0.3, metalness: 0.05,
		transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide,
	});
	// 駅舎の屋根。俯瞰で改札の行列が見えないと困るので少し透かす
	// 木造駅舎(地平の小駅)。ガラス張りにしないための材
	MAT.wallWood = std({ map: rep(TEX.wood, 3, 1.2), color: 0xffffff, roughness: 0.9 });
	MAT.roofTile = std({ map: rep(TEX.tile, 4, 3), color: 0xffffff, roughness: 0.75 });
	MAT.beam = std({ color: 0x6b5540, roughness: 0.85 });
	MAT.roofSolid = std({
		color: 0xb6bdc5, roughness: 0.6, metalness: 0.15,
		transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
	});
	MAT.truss = std({ color: 0x5e6672, roughness: 0.6, metalness: 0.5 });
	MAT.stair = std({ color: 0xc2c8cf, roughness: 0.85 });
	MAT.esc = std({ color: 0x2f8f6a, roughness: 0.55, metalness: 0.35 });
	MAT.handrail = std({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.55 });
	MAT.gate = std({ color: 0x2f3b4a, roughness: 0.5, metalness: 0.3 });
	MAT.gateFlap = std({ color: 0x8fd8ff, roughness: 0.25, transparent: true, opacity: 0.55 });
	MAT.desk = std({ color: 0x7a5a3a, roughness: 0.75 });          // 手動改札のラッチ台(木製)
	MAT.staff = std({ color: 0x1d2b45, roughness: 0.8 });          // 駅員の制服
	MAT.shop = std({ color: 0xc25a35, roughness: 0.8 });
	MAT.pillar = std({ color: 0x9aa0a8, roughness: 0.85 });
	MAT.glass = std({ color: 0x9fc6dd, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.35 });
	MAT.sign = std({ color: 0x14509b, roughness: 0.6 });
	MAT.signFace = std({ color: 0xf4f7fa, roughness: 0.7 });
	MAT.bench = std({ color: 0x2b6ba8, roughness: 0.7 });
	MAT.vend = std({ color: 0xd23c3c, roughness: 0.55 });
	MAT.catenary = std({ color: 0x6b7280, roughness: 0.5, metalness: 0.6 });

	// 夜に光るもの
	MAT.lamp = std({ color: 0xfdf6e0, emissive: 0xfff0c4, emissiveIntensity: 0.15, roughness: 0.4 });
	MAT.carWin = std({ color: 0x121820, emissive: 0xffe9b8, emissiveIntensity: 0, roughness: 0.2, metalness: 0.2 });

	// 車体
	MAT.carSide = std({ map: TEX.carSide, color: 0xffffff, roughness: 0.42, metalness: 0.22 });
	MAT.carEnd = std({ color: 0xe4e9ee, roughness: 0.42, metalness: 0.22 });
	MAT.carRoof = std({ color: 0x9aa2aa, roughness: 0.8 });
	MAT.bogie = std({ color: 0x22262b, roughness: 0.8 });
	MAT.panto = std({ color: 0x4a5058, roughness: 0.5, metalness: 0.6 });

	// 街。1タイル=14m相当なので、高さ帯ごとに繰り返し数を変えて階の高さを揃える
	MAT.bldg = CFG.BLD_CLASS.map(c => std({
		map: rep(TEX.building, c.rx, c.ry), color: 0xffffff, roughness: 0.85,
	}));
	MAT.winLit = CFG.BLD_CLASS.map(c => {
		const m = new THREE.MeshBasicMaterial({
			map: rep(TEX.buildingLit, c.rx, c.ry), transparent: true, opacity: 0,
			blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
		});
		m.visible = false;
		return m;
	});
	MAT.road = std({ map: rep(TEX.asphalt, 4, 4), color: 0x8f959b, roughness: 1 });
	MAT.tree = std({ color: 0x35703a, roughness: 1 });
	MAT.trunk = std({ color: 0x4a3a2c, roughness: 1 });
	MAT.parcel = std({ map: rep(TEX.land, 1, 1), color: 0xffffff, roughness: 1 });
}

// テクスチャを繰り返し設定付きで複製する
function rep(tex, rx, ry) {
	const t = tex.clone();
	t.needsUpdate = true;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set(rx, ry);
	return t;
}

function box(w, h, d, mat, x, y, z, parent, noShadow) {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
	m.position.set(x, y + h / 2, z);
	if (!noShadow) { m.castShadow = true; m.receiveShadow = true; }
	parent.add(m);
	return m;
}

// 同じ形を大量に置くものは InstancedMesh にまとめる
function addInstanced(geo, mat, xforms, parent, cast, colors) {
	if (!xforms.length) return null;
	const m = new THREE.InstancedMesh(geo, mat, xforms.length);
	const d = new THREE.Object3D();
	const c = colors ? new THREE.Color() : null;
	for (let i = 0; i < xforms.length; i++) {
		const t = xforms[i];
		d.position.set(t[0], t[1], t[2]);
		d.rotation.set(t[3] || 0, t[4] || 0, t[5] || 0);
		d.scale.set(t[6] === undefined ? 1 : t[6], t[7] === undefined ? 1 : t[7], t[8] === undefined ? 1 : t[8]);
		d.updateMatrix();
		m.setMatrixAt(i, d.matrix);
		if (c) m.setColorAt(i, c.setHex(colors[i]).convertSRGBToLinear());
	}
	m.castShadow = !!cast;
	m.receiveShadow = true;
	parent.add(m);
	return m;
}

function disposeGroup(g) {
	while (g.children.length) {
		const c = g.children.pop();
		c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
	}
}

function buildStation() {
	recalcGeometry();
	disposeGroup(stationGroup);
	G.gateArms = [];

	const L = G.platLen;
	const RUN = 10;                        // 階段の水平投影長
	// 橋上なら正(上り)、地下なら負(下り)
	const rise = G.entryY - CFG.PLAT_Y;
	const trackLen = L + 520;
	const cw = G.concX1 - G.concX0;

	/* ---- 線路: バラスト・枕木・レール・架線柱 ---- */
	const sleeperGeo = new THREE.BoxGeometry(2.6, 0.22, 0.9);
	const sleepers = [];
	for (let t = 0; t < S.nTrack; t++) {
		const x = trackX(t);
		box(CFG.TRACK_W + 1.0, 0.5, trackLen, MAT.ballast, x, -0.5, 0, stationGroup, true);
		for (let z = -trackLen / 2; z < trackLen / 2; z += 2.4) sleepers.push([x, 0.11, z]);
		box(0.12, 0.18, trackLen, MAT.rail, x - 0.7175, 0.22, 0, stationGroup, true);
		box(0.12, 0.18, trackLen, MAT.rail, x + 0.7175, 0.22, 0, stationGroup, true);
	}
	addInstanced(sleeperGeo, MAT.sleeper, sleepers, stationGroup, false);

	/* ---- ホーム ---- */
	const pillarGeo = new THREE.BoxGeometry(0.42, CFG.CONC_Y - CFG.PLAT_Y - 0.3, 0.42);
	const pillars = [];
	const lampGeo = new THREE.BoxGeometry(0.3, 0.12, 2.4);
	const lamps = [];
	const benchGeo = new THREE.BoxGeometry(1.6, 0.45, 0.5);
	const benches = [];
	const stepGeo = new THREE.BoxGeometry(2.8, 0.22, RUN / 14 + 0.08);
	const stepPlates = [];
	const beamGeo = new THREE.BoxGeometry(S.platW + 1.2, 0.22, 0.3);
	const beams = [];

	for (let i = 0; i < S.nPlat; i++) {
		const x = platX(i);
		// 床と側壁
		box(S.platW, CFG.PLAT_Y, L, MAT.plat, x, 0, 0, stationGroup);
		box(S.platW + 0.12, CFG.PLAT_Y * 0.75, L + 0.1, MAT.platSide, x, 0, 0, stationGroup, true);
		// 点字ブロックと白線(両端)
		for (const s of [-1, 1]) {
			box(0.6, 0.04, L, MAT.tactile, x + s * (S.platW / 2 - 0.75), CFG.PLAT_Y, 0, stationGroup, true);
			box(0.12, 0.045, L, MAT.whiteLine, x + s * (S.platW / 2 - 0.18), CFG.PLAT_Y, 0, stationGroup, true);
		}
		// 上家(屋根)。コンコースに覆われていない範囲だけ架ける
		const roofZ1 = G.concZ0 - 1;
		if (roofZ1 > G.platZ0 + 4) {
			const rl = roofZ1 - G.platZ0;
			const rc = (G.platZ0 + roofZ1) / 2;
			const rf = box(S.platW + 1.6, 0.2, rl, MAT.roof, x, CFG.CONC_Y - 1.2, rc, stationGroup, true);
			rf.renderOrder = 4;
			// 屋根を支える梁(こちらは実体があるので影を落とす)
			for (let z = G.platZ0 + 5; z < roofZ1 - 1; z += 5.5) {
				beams.push([x, CFG.CONC_Y - 1.5, z]);
			}
			box(0.25, 0.3, rl, MAT.truss, x - S.platW / 2 - 0.6, CFG.CONC_Y - 1.5, rc, stationGroup, true);
			box(0.25, 0.3, rl, MAT.truss, x + S.platW / 2 + 0.6, CFG.CONC_Y - 1.5, rc, stationGroup, true);
			for (let z = G.platZ0 + 5; z < roofZ1 - 2; z += 11) {
				pillars.push([x, CFG.PLAT_Y + (CFG.CONC_Y - CFG.PLAT_Y - 0.3) / 2, z]);
				lamps.push([x, CFG.CONC_Y - 1.75, z + 5.5]);
			}
			for (let z = G.platZ0 + 9; z < roofZ1 - 6; z += 26) {
				benches.push([x, CFG.PLAT_Y + 0.225, z]);
			}
		}
		// コンコース下にも柱と照明
		for (let z = G.concZ0 + 3; z < G.platZ1 - 2; z += 11) {
			pillars.push([x, CFG.PLAT_Y + (CFG.CONC_Y - CFG.PLAT_Y - 0.3) / 2, z]);
			lamps.push([x, CFG.CONC_Y - 0.9, z + 5.5]);
		}

		// 駅名標(ホーム中ほどの柱に掛ける)
		const signZ = Math.max(G.platZ0 + 8, Math.min(G.platZ1 - 8, (G.platZ0 + G.concZ0) / 2));
		box(3.4, 0.7, 0.1, MAT.signFace, x, CFG.CONC_Y - 2.6, signZ, stationGroup, true);
		box(3.6, 0.16, 0.14, MAT.sign, x, CFG.CONC_Y - 2.0, signZ, stationGroup, true);

		/* ---- 階段 / エスカレーター ----
		   地平駅には無い。橋上なら上り、地下なら下りになる */
		if (hasStairs()) for (let k = 0; k < S.stairs; k++) {
			const sz = stairZ(k);
			const len = Math.hypot(rise, RUN);
			const ang = -Math.atan2(rise, RUN);
			if (S.esc) {
				// トラス + ステップ帯 + 手すり
				const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, len), MAT.esc);
				body.position.set(x, CFG.PLAT_Y + rise / 2, sz - RUN / 2);
				body.rotation.x = ang;
				body.castShadow = body.receiveShadow = true;
				stationGroup.add(body);
				for (const s of [-1, 1]) {
					const hr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, len), MAT.handrail);
					hr.position.set(x + s * 1.45, CFG.PLAT_Y + rise / 2 + 0.6, sz - RUN / 2);
					hr.rotation.x = ang;
					hr.castShadow = true;
					stationGroup.add(hr);
				}
			} else {
				// 段板。1段ずつメッシュにすると10面6基で960個になるのでまとめて置く
				const steps = 14;
				for (let s = 0; s < steps; s++) {
					const f = (s + 0.5) / steps;
					stepPlates.push([x, CFG.PLAT_Y + rise * f - 0.11, sz - RUN * f]);
				}
				for (const s of [-1, 1]) {
					const hr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, len), MAT.handrail);
					hr.position.set(x + s * 1.5, CFG.PLAT_Y + rise / 2 + 0.55, sz - RUN / 2);
					hr.rotation.x = ang;
					hr.castShadow = true;
					stationGroup.add(hr);
				}
			}
		}
	}
	addInstanced(pillarGeo, MAT.pillar, pillars, stationGroup, true);
	addInstanced(lampGeo, MAT.lamp, lamps, stationGroup, false);
	addInstanced(benchGeo, MAT.bench, benches, stationGroup, true);
	addInstanced(stepGeo, MAT.stair, stepPlates, stationGroup, true);
	addInstanced(beamGeo, MAT.truss, beams, stationGroup, true);

	/* ---- 架線柱 ---- */
	if (S.nTrack > 0) {
		const poleGeo = new THREE.BoxGeometry(0.36, 9.5, 0.36);
		const poles = [];
		const xl = trackX(0) - CFG.TRACK_W, xr = trackX(S.nTrack - 1) + CFG.TRACK_W;
		for (let z = -trackLen / 2 + 30; z < trackLen / 2 - 30; z += 45) {
			if (z > G.concZ0 - 6 && z < G.concZ1) continue;   // 駅舎の下は省く
			poles.push([xl, 4.75, z]);
			poles.push([xr, 4.75, z]);
		}
		addInstanced(poleGeo, MAT.catenary, poles, stationGroup, true);
	}

	/* ---- 駅舎 ---- */
	const EY = G.entryY;
	const wallH = 3.6;
	const czc = (G.concZ0 + G.concZ1) / 2;

	if (isBridge()) {
		// 橋上駅舎: 線路をまたぐ床を張る
		box(cw, 0.6, G.concD, MAT.concUnder, G.concCx, EY - 0.6, czc, stationGroup);
	} else if (isUnder()) {
		// 地下コンコース: 掘り下げた床。地面は buildCity 側でくり抜く
		box(cw, 0.6, G.concD, MAT.concUnder, G.concCx, EY - 0.6, czc, stationGroup);
	}
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(cw, G.concD), MAT.conc);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(G.concCx, EY + 0.02, czc);
	floor.receiveShadow = true;
	stationGroup.add(floor);

	if (hasLink()) {
		// 橋上/地下のコンコースは腰壁+ガラス。俯瞰で中が見えるよう天井は張らない
		for (const s of [-1, 1]) {
			const wx = G.concCx + s * cw / 2;
			box(0.35, 1.0, G.concD, MAT.concUnder, wx, EY, czc, stationGroup);
			box(0.3, wallH - 1.0, G.concD, MAT.glass, wx, EY + 1.0, czc, stationGroup, true);
		}
		for (const z of [G.concZ0, G.concZ1]) {
			box(cw, 1.0, 0.35, MAT.concUnder, G.concCx, EY, z, stationGroup);
			box(cw, wallH - 1.0, 0.3, MAT.glass, G.concCx, EY + 1.0, z, stationGroup, true);
		}
		// 屋根の縁(庇)だけ回して建物の輪郭を出す
		box(cw + 1.4, 0.3, 0.9, MAT.roof, G.concCx, EY + wallH, G.concZ0 - 0.4, stationGroup, true);
		box(cw + 1.4, 0.3, 0.9, MAT.roof, G.concCx, EY + wallH, G.concZ1 + 0.4, stationGroup, true);
	} else {
		/* ---- 地平の小駅は木造駅舎。下見板張りの壁に切妻の瓦屋根 ---- */
		const wh = 3.2;
		// ホーム側(concZ0)は出入口なので開けておく
		for (const s of [-1, 1]) {
			box(0.3, wh, G.concD, MAT.wallWood, G.concCx + s * cw / 2, EY, czc, stationGroup);
		}
		box(cw, wh, 0.3, MAT.wallWood, G.concCx, EY, G.concZ1, stationGroup);
		// 出入口側は左右に袖壁だけ残す
		const openW = Math.min(cw * 0.5, 7);
		for (const s of [-1, 1]) {
			const ww = (cw - openW) / 2;
			box(ww, wh, 0.3, MAT.wallWood, G.concCx + s * (openW + ww) / 2, EY, G.concZ0, stationGroup);
		}
		// 妻壁(切妻の三角部分)
		const pitch = 0.36;                      // 屋根の勾配(rad)
		const hw2 = (cw + 2.6) / 2;
		const peak = Math.tan(pitch) * (cw / 2);
		const ridge = EY + wh + Math.tan(pitch) * hw2;
		const tri = new THREE.Shape();
		tri.moveTo(-cw / 2, 0); tri.lineTo(cw / 2, 0); tri.lineTo(0, peak); tri.closePath();
		for (const z of [G.concZ0, G.concZ1]) {
			const g = new THREE.Mesh(new THREE.ShapeGeometry(tri), MAT.wallWood);
			g.position.set(G.concCx, EY + wh, z);
			g.castShadow = g.receiveShadow = true;
			stationGroup.add(g);
		}
		// 切妻屋根。棟は線路と平行(Z方向)に通す
		const slabLen = hw2 / Math.cos(pitch);
		for (const s of [-1, 1]) {
			const rf = new THREE.Mesh(
				new THREE.BoxGeometry(slabLen, 0.26, G.concD + 2.6), MAT.roofTile);
			rf.position.set(
				G.concCx + s * (hw2 / 2),
				EY + wh + Math.tan(pitch) * hw2 / 2,
				czc);
			rf.rotation.z = -s * pitch;
			rf.castShadow = rf.receiveShadow = true;
			stationGroup.add(rf);
		}
		// 棟と軒桁
		box(0.5, 0.3, G.concD + 2.8, MAT.beam, G.concCx, ridge - 0.1, czc, stationGroup, true);
		for (const s of [-1, 1]) {
			box(0.28, 0.34, G.concD + 2.6, MAT.beam, G.concCx + s * hw2, EY + wh - 0.1, czc, stationGroup, true);
		}
		// 駅舎からホーム端まで渡る構内踏切
		const xa = platX(0) - S.platW / 2;
		box(G.concX0 + 3 - xa, 0.16, 4.0, MAT.stair,
			(xa + G.concX0 + 3) / 2, 0.06, G.crossZ, stationGroup, true);
		// 踏切からホームへ上がるスロープ
		const rampLen = G.crossZ - (G.platZ1 - 3);
		for (let i = 0; i < 6; i++) {
			const f = (i + 0.5) / 6;
			box(S.platW * 0.75, 0.22, rampLen / 6 + 0.1, MAT.stair,
				platX(0), CFG.PLAT_Y * f - 0.11, G.crossZ - rampLen * f, stationGroup, true);
		}
		// 踏切の警報機と遮断機。遮断桿は開閉でZ軸まわりに回す
		G.gateArms = [];
		for (const s of [-1, 1]) {
			const bx = s < 0 ? xa - 1.6 : G.concX0 + 1.6;
			box(0.3, 2.8, 0.3, MAT.gate, bx, 0, G.crossZ + 3.0, stationGroup, true);
			const arm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.22, 0.22), MAT.vend);
			arm.position.set(bx - s * 3.25, 2.2, G.crossZ + 3.0);
			arm.castShadow = true;
			stationGroup.add(arm);
			G.gateArms.push({ mesh: arm, px: bx, s: s, z: G.crossZ + 3.0 });
		}
	}
	// 天井の照明(木造駅舎は屋根で隠れるので置かない)
	if (hasLink()) {
		const clampGeo = new THREE.BoxGeometry(3.0, 0.14, 0.3);
		const clamps = [];
		for (let x = G.concX0 + 6; x < G.concX1 - 3; x += 9) {
			for (let z = G.concZ0 + 6; z < G.concZ1 - 3; z += 12) clamps.push([x, EY + wallH - 0.4, z]);
		}
		addInstanced(clampGeo, MAT.lamp, clamps, stationGroup, false);
	} else {
		// 軒下の裸電球
		box(0.5, 0.3, 0.5, MAT.lamp, G.concCx, EY + 2.9, G.concZ0 - 0.8, stationGroup, false);
	}

	/* ---- 改札 ---- */
	const gBodyGeo = new THREE.BoxGeometry(0.5, 1.0, 3.0);
	const gTopGeo = new THREE.BoxGeometry(0.56, 0.1, 3.0);
	const gFlapGeo = new THREE.BoxGeometry(0.08, 0.72, 0.9);
	const mDeskGeo = new THREE.BoxGeometry(0.7, 1.05, 3.0);       // 手動改札のラッチ台
	const mPostGeo = new THREE.BoxGeometry(0.24, 2.3, 0.24);
	const gb = [], gt = [], gf = [], md = [], mp = [], staff = [];
	for (let j = 0; j < gateCount(); j++) {
		const g = gatePos(j);
		if (gateIsManual(j)) {
			// 通路の両脇にラッチ台。片側に駅員が立つ
			for (const s of [-1, 1]) {
				md.push([g.x + s * 0.95, EY, g.z]);
				mp.push([g.x + s * 0.95, EY, g.z - 1.6]);
			}
			staff.push([g.x + 1.55, EY, g.z - 0.4, 0, Math.PI, 0]);
		} else {
			for (const s of [-1, 1]) {
				gb.push([g.x + s * 0.85, EY + 0.5, g.z]);
				gt.push([g.x + s * 0.85, EY + 1.05, g.z]);
				gf.push([g.x + s * 0.55, EY + 0.36, g.z + 1.2]);
			}
		}
	}
	addInstanced(gBodyGeo, MAT.gate, gb, stationGroup, true);
	addInstanced(gTopGeo, MAT.lamp, gt, stationGroup, false);
	addInstanced(gFlapGeo, MAT.gateFlap, gf, stationGroup, false);
	addInstanced(mDeskGeo, MAT.desk, md, stationGroup, true);
	addInstanced(mPostGeo, MAT.handrail, mp, stationGroup, true);
	if (humanGeo) addInstanced(humanGeo, MAT.staff, staff, stationGroup, true);

	// 改札の上の案内サイン(吊り下げ)。改札が無いうちは出さない
	if (gateCount() > 0) {
		const sgW = Math.min(cw - 6, 3 + gateCount() * 1.0);
		box(sgW, 0.55, 0.12, MAT.sign, G.concCx, EY + 2.55, G.gateZ + 2.4, stationGroup, true);
		box(sgW * 0.9, 0.34, 0.14, MAT.signFace, G.concCx, EY + 2.65, G.gateZ + 2.33, stationGroup, true);
	}

	/* ---- 駅ナカ店舗 / 券売機 ---- */
	for (let s = 0; s < S.shops; s++) {
		const side = s % 2 ? 1 : -1;
		const idx = Math.floor(s / 2);
		const sx = G.concCx + side * (cw / 2 - 5.5 - idx * 9);
		// 駅舎の中に収める(小さい地平駅でもはみ出さないように)
		const sz = Math.min(G.concZ1 - 4, Math.max(G.concZ0 + 4,
			G.gateZ + (hasLink() ? -18 : 11) - (idx % 2) * 9));
		box(7, 2.9, 6, MAT.shop, sx, EY + 0.02, sz, stationGroup);
		box(7.2, 0.5, 0.3, MAT.lamp, sx, EY + 2.5, sz - 3.1, stationGroup, false);
	}
	const vendGeo = new THREE.BoxGeometry(1.1, 1.9, 0.7);
	const vends = [];
	for (let i = 0; i < Math.min(6, 1 + gateCount() / 8); i++) {
		vends.push([G.concX0 + 3, EY + 0.95,
			Math.min(G.concZ1 - 3, G.gateZ + 6 + i * 2.2)]);
	}
	addInstanced(vendGeo, MAT.vend, vends, stationGroup, true);

	/* ---- 出口 ----
	   地平駅は駅舎の外がそのまま駅前。橋上駅舎は線路の真上に降りられないので、
	   デッキを線路脇まで横に渡してから地上に降ろす */
	if (!hasLink()) {
		G.plazaX = G.concX1 + 10;
		G.plazaCx = G.concCx;
		G.plazaCz = G.exitZ + 22;
		fitShadow();
		buildCity();
		return;
	}

	if (isUnder()) {
		// 地下は線路の脇まで掘り進めて、そこから地上へ上がる
		G.plazaX = G.concX1 + 26;
		G.plazaCx = G.plazaX + 20;
		G.plazaCz = G.exitZ;
		const runLen = G.plazaX - G.concX1 + 6;
		box(runLen, 0.6, 14, MAT.concUnder, G.concX1 + runLen / 2 - 3, EY - 0.6, G.exitZ, stationGroup);
		const cor = new THREE.Mesh(new THREE.PlaneGeometry(runLen, 14), MAT.conc);
		cor.rotation.x = -Math.PI / 2;
		cor.position.set(G.concX1 + runLen / 2 - 3, EY + 0.02, G.exitZ);
		cor.receiveShadow = true;
		stationGroup.add(cor);
		// 地上へ上がる階段
		const us = 16;
		for (let i = 0; i < us; i++) {
			const f = (i + 0.5) / us;
			box(14 / us + 0.1, 0.3, 8, MAT.stair,
				G.plazaX - 4 + 14 * f, EY + (0 - EY) * f, G.exitZ, stationGroup, true);
		}
		G.holeX = [G.concX0 - 1, G.plazaX + 12];
		G.holeZ = [G.concZ0 - 1, G.concZ1 + 1];
		// 掘り込みの擁壁。線路の下は通すので、線路にかかる部分は空ける
		const wallY = -0.45 - EY;
		for (const hz of G.holeZ) {
			box(G.holeX[1] - G.holeX[0] + 1.2, wallY, 0.6, MAT.concUnder,
				(G.holeX[0] + G.holeX[1]) / 2, EY, hz, stationGroup);
		}
		for (const hx of G.holeX) {
			box(0.6, wallY, G.holeZ[1] - G.holeZ[0], MAT.concUnder,
				hx, EY, (G.holeZ[0] + G.holeZ[1]) / 2, stationGroup);
		}
		fitShadow();
		buildCity();
		return;
	}

	const dw = Math.min(cw, 60);
	const deckZ = G.exitZ + 7;
	box(dw, 0.6, 20, MAT.concUnder, G.concCx, CFG.CONC_Y - 0.6, deckZ, stationGroup);
	const deck = new THREE.Mesh(new THREE.PlaneGeometry(dw, 20), MAT.conc);
	deck.rotation.x = -Math.PI / 2;
	deck.position.set(G.concCx, CFG.CONC_Y + 0.01, deckZ);
	deck.receiveShadow = true;
	stationGroup.add(deck);

	// 線路をまたいで東側へ伸ばす連絡デッキ
	G.plazaX = trackX(S.nTrack - 1) + 46;
	const bridgeLen = G.plazaX - G.concCx;
	box(bridgeLen, 0.6, 12, MAT.concUnder, G.concCx + bridgeLen / 2, CFG.CONC_Y - 0.6, deckZ, stationGroup);
	const bridge = new THREE.Mesh(new THREE.PlaneGeometry(bridgeLen, 12), MAT.conc);
	bridge.rotation.x = -Math.PI / 2;
	bridge.position.set(G.concCx + bridgeLen / 2, CFG.CONC_Y + 0.01, deckZ);
	bridge.receiveShadow = true;
	stationGroup.add(bridge);
	for (const s of [-1, 1]) {
		box(bridgeLen, 1.1, 0.2, MAT.handrail, G.concCx + bridgeLen / 2, CFG.CONC_Y, deckZ + s * 6, stationGroup, true);
	}
	// 橋脚(線路の間を避けて立てる)
	for (let bx = G.concX1 + 6; bx < G.plazaX; bx += 16) {
		let onTrack = false;
		for (let t = 0; t < S.nTrack; t++) if (Math.abs(bx - trackX(t)) < CFG.TRACK_W) onTrack = true;
		if (onTrack) continue;
		box(1.2, CFG.CONC_Y - 0.6, 1.2, MAT.pillar, bx, 0, deckZ, stationGroup, true);
	}
	// コンコース自体の橋脚
	for (let bx = G.concX0 + 4; bx < G.concX1 - 2; bx += 14) {
		let onTrack = false;
		for (let t = 0; t < S.nTrack; t++) if (Math.abs(bx - trackX(t)) < CFG.TRACK_W) onTrack = true;
		if (onTrack) continue;
		box(1.2, CFG.CONC_Y - 0.6, 1.2, MAT.pillar, bx, 0, G.concZ1 - 2, stationGroup, true);
	}

	// 地上へ下りる階段(線路の外側)
	const dsteps = 18;
	for (let i = 0; i < dsteps; i++) {
		const f = (i + 0.5) / dsteps;
		box(16 / dsteps + 0.1, 0.3, 10, MAT.stair,
			G.plazaX + 16 * f, CFG.CONC_Y - CFG.CONC_Y * f, deckZ, stationGroup, true);
	}
	G.plazaCz = G.exitZ;

	fitShadow();
	buildCity();
}

/* ================= 駅の外(街) =================
   増築のたびに作り直されるので、並びが変わらないよう乱数はシード固定 */
let _seed = 1;
function srand() {
	_seed = (_seed * 1664525 + 1013904223) % 4294967296;
	return _seed / 4294967296;
}

// 地面。地下コンコースがあるときは、その部分をくり抜いて中を見えるようにする
let groundMesh = null;
function buildGround() {
	if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); }
	const H = 4500;
	const sh = new THREE.Shape();
	sh.moveTo(-H, -H); sh.lineTo(H, -H); sh.lineTo(H, H); sh.lineTo(-H, H); sh.closePath();
	if (isUnder() && G.holeX) {
		const h = new THREE.Path();
		// Shape はXY平面。回転後に -Z が +Y に来るので z は符号を反転して渡す
		h.moveTo(G.holeX[0], -G.holeZ[0]);
		h.lineTo(G.holeX[1], -G.holeZ[0]);
		h.lineTo(G.holeX[1], -G.holeZ[1]);
		h.lineTo(G.holeX[0], -G.holeZ[1]);
		h.closePath();
		sh.holes.push(h);
	}
	groundMesh = new THREE.Mesh(new THREE.ShapeGeometry(sh), MAT.ground);
	groundMesh.rotation.x = -Math.PI / 2;
	groundMesh.position.y = -0.45;
	groundMesh.receiveShadow = true;
	scene.add(groundMesh);
}

function buildCity() {
	disposeGroup(cityGroup);
	buildGround();
	_seed = 20260802;

	const railHalf = Math.abs(trackX(S.nTrack - 1)) + CFG.TRACK_W * 2 + 14;
	const trackLen = G.platLen + 520;
	const grow = Math.min(1, S.rank / 8 + Math.log10(Math.max(1, S.town)) / 3.2);
	const hMax = 12 + grow * 92;
	const reach = 420 + grow * 620;
	// 建物の数が一定になるよう、範囲に応じて間隔を広げる
	const step = Math.max(30, reach * 2 / 22);

	const bGeo = new THREE.BoxGeometry(1, 1, 1);
	bGeo.translate(0, 0.5, 0);
	const byClass = CFG.BLD_CLASS.map(() => []);
	const byClassCol = CFG.BLD_CLASS.map(() => []);
	const lots = [], lotCol = [];
	const trees = [];
	const plazaX = G.plazaX === undefined ? 0 : G.plazaX;
	// 駅のまわりは開けておく(カメラが建物に埋まらないように)
	const clear = Math.max(150, railHalf + 60);
	// 発展度が低いうちは建物もまばら
	const density = 0.30 + grow * 0.58;

	for (let x = -reach; x <= reach; x += step) {
		for (let z = -reach; z <= reach; z += step) {
			// 線路の帯・駅舎・駅前広場は空ける
			if (Math.abs(x) < railHalf && z > -trackLen / 2 && z < trackLen / 2) continue;
			// 駅舎と駅前広場のぶんを空ける
			if (x > G.concX0 - 12 && x < (hasLink() ? plazaX + 78 : G.concX1 + 12)
				&& z > G.concZ0 - 12 && z < G.exitZ + 52) continue;
			const d = Math.hypot(x, z);
			if (d > reach || d < clear) continue;
			// 区画の地色を敷いて、地面が単調にならないようにする
			lots.push([x, -0.42, z, 0, 0, 0, step * 0.86, 1, step * 0.86]);
			lotCol.push(LOT_COLORS[(srand() * LOT_COLORS.length) | 0]);
			const r = srand();
			if (r > density) {
				if (r > 0.88) trees.push([x + srand() * 12 - 6, 0, z + srand() * 12 - 6]);
				continue;
			}
			// 駅に近いほど高い
			const near = Math.max(0, 1 - d / reach);
			const h = 5 + srand() * hMax * (0.28 + near * 1.05);
			const w = 12 + srand() * 14, dp = 12 + srand() * 14;
			let ci = 0;
			while (ci < CFG.BLD_CLASS.length - 1 && h > CFG.BLD_CLASS[ci].max) ci++;
			byClass[ci].push([x + srand() * 10 - 5, 0, z + srand() * 10 - 5, 0, srand() * 0.5 - 0.25, 0, w, h, dp]);
			byClassCol[ci].push(BLD_COLORS[(srand() * BLD_COLORS.length) | 0]);
		}
	}

	const lotGeo = new THREE.BoxGeometry(1, 0.05, 1);
	addInstanced(lotGeo, MAT.parcel, lots, cityGroup, false, lotCol);

	byClass.forEach((list, ci) => {
		addInstanced(bGeo, MAT.bldg[ci], list, cityGroup, true, byClassCol[ci]);
		// 夜だけ光る窓(同じ形に加算合成で重ねる)
		const lit = addInstanced(bGeo, MAT.winLit[ci], list.map(b => b.slice()), cityGroup, false);
		if (lit) { lit.renderOrder = 3; lit.receiveShadow = false; }
	});

	// 道路網。建物と同じ格子に敷いて「街区」に見せる
	const roadGeo = new THREE.BoxGeometry(1, 0.06, 1);
	const roads = [];
	for (let x = -reach; x <= reach; x += step * 2) {
		if (Math.abs(x) < railHalf) continue;
		roads.push([x, -0.4, 0, 0, 0, 0, 9, 1, reach * 2]);
	}
	for (let z = -reach; z <= reach; z += step * 2) {
		roads.push([0, -0.4, z, 0, 0, 0, reach * 2, 1, 9]);
	}
	addInstanced(roadGeo, MAT.road, roads, cityGroup, false);

	// 街路樹
	const tGeo = new THREE.SphereGeometry(2.6, 6, 5);
	tGeo.translate(0, 5.2, 0);
	addInstanced(tGeo, MAT.tree, trees, cityGroup, true);
	const trGeo = new THREE.CylinderGeometry(0.3, 0.4, 3.4, 5);
	trGeo.translate(0, 1.7, 0);
	addInstanced(trGeo, MAT.trunk, trees, cityGroup, false);

	// 駅前広場。駅の規模に合わせる
	const pw = 34 + grow * 60, pd = 30 + grow * 54;
	const sq = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), MAT.road);
	sq.rotation.x = -Math.PI / 2;
	const px = hasLink() ? plazaX + 18 + pw / 2 : (G.plazaCx === undefined ? 0 : G.plazaCx);
	const pz = G.plazaCz === undefined ? G.exitZ : G.plazaCz;
	sq.position.set(px, -0.38, pz);
	sq.receiveShadow = true;
	cityGroup.add(sq);
}

// 駅全体が画角に収まる位置へカメラを置く(起動時のみ)
function fitCamera() {
	const span = Math.max(G.platLen + G.concD, G.concX1 - G.concX0);
	const d = span * 0.72 + 42;
	const cz = (G.platZ0 + G.exitZ) / 2;
	controls.target.set(0, 4, cz);
	// 駅舎がホームを隠さないよう南東から見る。空と地平線も入る浅い角度
	camera.position.set(d * 0.86, d * 0.44, cz - d * 0.52);
	controls.update();
}

/* ================= 列車 =================
   ジオメトリは両数に依存しないのでモジュールに1組だけ持つ */
const TG = {};
function trainGeos() {
	if (TG.body) return TG;
	const cl = CFG.CAR_LEN - 1.2;          // 連結部を空ける
	TG.body = new THREE.BoxGeometry(3.0, 2.6, cl);
	TG.roof = new THREE.BoxGeometry(2.86, 0.34, cl);
	TG.skirt = new THREE.BoxGeometry(2.8, 0.55, cl - 1.5);
	TG.bogie = new THREE.BoxGeometry(2.5, 0.7, 3.0);
	TG.win = new THREE.BoxGeometry(3.04, 0.95, cl - 2.2);
	TG.panto = new THREE.BoxGeometry(1.9, 0.12, 0.5);
	TG.end = new THREE.BoxGeometry(2.9, 2.4, 0.4);
	TG.cl = cl;
	return TG;
}

// 編成中心を原点にしたローカル座標で組む。位置は mesh.position.z で与える
function buildTrainMesh(cars, bandCol) {
	const g = new THREE.Group();
	const T = trainGeos();
	const cl = T.cl;
	const half = cars * CFG.CAR_LEN / 2;
	const bodies = [], roofs = [], skirts = [], bogies = [], pantos = [];

	for (let i = 0; i < cars; i++) {
		const z = -half + i * CFG.CAR_LEN + CFG.CAR_LEN / 2;
		bodies.push([0, 2.35, z]);
		roofs.push([0, 3.79, z]);
		skirts.push([0, 0.85, z]);
		bogies.push([0, 0.6, z - cl / 2 + 2.6]);
		bogies.push([0, 0.6, z + cl / 2 - 2.6]);
		if (i % 2 === 1) pantos.push([0, 4.05, z + 3]);
	}
	// 車体はテクスチャで窓とドアと帯を表現する
	const body = addInstanced(T.body, MAT.carSide, bodies, g, true);
	if (body) body.receiveShadow = false;
	addInstanced(T.roof, MAT.carRoof, roofs, g, true);
	addInstanced(T.skirt, MAT.bogie, skirts, g, false);
	addInstanced(T.bogie, MAT.bogie, bogies, g, false);
	// 夜に光る窓(車体より少しだけ外側に重ねる)
	const win = addInstanced(T.win, MAT.carWin, bodies.map(b => [b[0], b[1] + 0.5, b[2]]), g, false);
	if (win) win.receiveShadow = false;
	addInstanced(T.panto, MAT.panto, pantos, g, false);

	// 先頭部の前面
	const e1 = new THREE.Mesh(T.end, MAT.carEnd); e1.position.set(0, 3.6, -half + 0.3); e1.castShadow = true; g.add(e1);
	const e2 = new THREE.Mesh(T.end, MAT.carEnd); e2.position.set(0, 3.6, half - 0.3); e2.castShadow = true; g.add(e2);
	return g;
}

// 列車が場外に待避する距離
function trainOffZ() { return G.platLen / 2 + CFG.APPROACH_LEN + 40; }

// 停止位置(編成中心)。ホーム北端=改札寄りに前を揃える
function stopZOf(cars) { return G.platZ1 - cars * CFG.CAR_LEN / 2; }

// 停止位置からのオフセットを返す純関数。900倍速でサブステップが飛んでも行き過ぎない
function trainOffset(tr, now) {
	if (now < tr.tArr) {
		const u = Math.min(1, (tr.tArr - now) / CFG.APPROACH_T);
		return -CFG.APPROACH_LEN * u * u;
	}
	if (now < tr.tDep) return 0;
	const u = (now - tr.tDep) / CFG.APPROACH_T;
	return CFG.APPROACH_LEN * u * u;
}

function launchTrain(e) {
	const tr = {
		dia: e.dia, track: e.track, cars: e.cars, mid: e.m, ty: e.ty,
		tArr: R.now + (e.arr - S.t), tDep: R.now + (e.dep - S.t),
		cap: e.cap, flow: e.flow, fare: e.fare,
		room: 0, boardAcc: 0, alightLeft: 0,
		arrived: false, gone: false, mesh: null, late: 0,
	};
	// 前の列車が抜けていなければ場内で待たされる(遅延)
	const busy = R.trackBusy[e.track] || 0;
	if (busy > tr.tArr - CFG.OCC_IN) {
		const push = busy + CFG.OCC_IN - tr.tArr;
		tr.tArr += push; tr.tDep += push; tr.late = push;
	}
	R.trackBusy[e.track] = tr.tDep + CFG.OCC_IN;
	R.trains.push(tr);
}

function attachTrainMesh(tr) {
	const m = modelOf(tr.mid);
	tr.mesh = buildTrainMesh(tr.cars, m.band);
	tr.mesh.position.set(trackX(tr.track), 0, stopZOf(tr.cars));
	trainGroup.add(tr.mesh);
}

/* ================= ダイヤ =================
   S.dia(パターン)を展開して R.sched(検証済みスジ)を作る。
   実行・乗客の指名・UIの表示は、すべてこの1本のリストだけを見る */

function fleetHave(mid, cars) {
	const f = S.fleet.find(x => x.m === mid && x.cars === cars);
	return f ? f.n : 0;
}

/* 同一本線での続行間隔。
   遅い種別の直後に速い種別を出すと追いついてしまうので大きく空ける。
   それ以外は信号の間隔(LINE_HEAD)まで詰められる */
function headwayFor(prevTy, nextTy) {
	return TYPES[nextTy].kmh > TYPES[prevTy].kmh ? CFG.HEAD_SLOW_FAST : CFG.LINE_HEAD;
}

// その番線が属する本線
function lineOf(track) {
	const a = S.trackLine || [];
	return Math.min(S.lines - 1, Math.max(0, a[track] === undefined ? track % S.lines : a[track]));
}
// 番線が足りているか。1本線に2番線あれば本線の60秒間隔を出しきれる
function lineTracks(line) {
	let n = 0;
	for (let t = 0; t < S.nTrack; t++) if (lineOf(t) === line) n++;
	return n;
}

function compileSched() {
	const out = [];
	const issues = [];

	// 1. パターンを展開
	for (const d of S.dia) {
		if (d.every <= 0 || d.to <= d.from) continue;
		// 不正な off がセーブに残っていても先頭を落とさない
		d.off = ((d.off || 0) % d.every + d.every) % d.every;
		const model = modelOf(d.m);
		const bad = [];
		if (d.cars > S.cars) bad.push('ホーム有効長' + S.cars + '両では' + d.cars + '両は着けられない');
		if (d.track >= S.nTrack) bad.push((d.track + 1) + '番線が無い');
		if (fleetHave(d.m, d.cars) === 0) bad.push('未契約');
		if (bad.length) { issues.push({ dia: d.id, msg: bad.join(' / ') }); continue; }
		for (let mn = d.from + (d.off || 0); mn < d.to; mn += d.every) {
			const arr = mn * 60;
			const dep = arr + Math.max(15, d.dwell) ;
			out.push({
				dia: d.id, m: d.m, cars: d.cars, ty: d.ty, track: d.track,
				arr: arr, dep: dep, spawn: arr - CFG.SPAWN_LEAD,
				cap: slotCap(d.m, d.cars), flow: slotFlow(d.m, d.cars),
				fare: typeFits(d.m, d.ty) ? TYPES[d.ty].fareMul : 1.0,
				fits: typeFits(d.m, d.ty),
				ok: true,
			});
		}
	}

	// 2a. 同一番線の占有は「到着順」で見る。停車時間が違うと発車順では判定を誤る
	const byArr = out.slice().sort((a, b) => a.arr - b.arr);
	const lastOnTrack = [];
	for (const s of byArr) {
		const prevT = lastOnTrack[s.track];
		if (prevT !== undefined && s.arr < prevT.dep + CFG.OCC_IN) {
			s.ok = false;
			issues.push({ dia: s.dia, at: s.arr, msg: (s.track + 1) + '番線が塞がっている' });
			continue;                       // 失格スジは番線を塞いだ扱いにしない
		}
		lastOnTrack[s.track] = s;
	}

	// 2b. 発車間隔は「本線ごと」と「番線ごと」の2本立て。
	//     本線は駅の外の線路なので追い越しが起きず、種別差で間隔が伸びる。
	//     番線はホームの線路で、停車と進入退出のぶん最低120秒空く。
	//     1本線に2番線あれば、番線120秒を守ったまま本線60秒の発車が出せる。
	out.sort((a, b) => a.dep - b.dep);
	const lastOnLine = [];      // 本線ごとの直前の有効スジ
	const lastDepTrack = [];    // 番線ごとの直前の発車時刻
	for (const s of out) {
		if (!s.ok) continue;
		s.line = lineOf(s.track);

		const pd = lastDepTrack[s.track];
		if (pd !== undefined && s.dep - pd < CFG.TRACK_HEAD) {
			s.ok = false;
			issues.push({ dia: s.dia, at: s.dep, msg: (s.track + 1) + '番線は' + Math.round(CFG.TRACK_HEAD / 60) + '分に1本まで' });
			continue;
		}

		const p = lastOnLine[s.line];
		if (p) {
			const need = Math.max(CFG.LINE_HEAD, headwayFor(p.ty, s.ty));
			if (s.dep - p.dep < need) {
				s.ok = false;
				const why = p.ty === s.ty
					? '本線' + (s.line + 1) + 'は' + Math.round(need / 60) + '分に1本まで'
					: TYPES[p.ty].name + 'の' + Math.round(need / 60) + '分後まで' + TYPES[s.ty].name + 'は発車できない';
				issues.push({ dia: s.dia, at: s.dep, msg: why });
				continue;
			}
		}
		lastOnLine[s.line] = s;
		lastDepTrack[s.track] = s.dep;
	}

	// 3. 契約している編成の本数で運用できるスジだけを残す。
	//    折返し CFG.TURN を空けて次のスジに就ける
	const pool = {};
	for (const f of S.fleet) pool[f.m + '/' + f.cars] = new Array(f.n).fill(-1e9);
	const liveByArr = out.filter(s => s.ok).sort((a, b) => a.arr - b.arr);
	let usedPeak = 0, busyNow = [];
	for (const s of liveByArr) {
		const key = s.m + '/' + s.cars;
		const free = pool[key];
		if (!free) { s.ok = false; continue; }
		// いちばん早く空く編成に割り当てる
		let bi = 0;
		for (let i = 1; i < free.length; i++) if (free[i] < free[bi]) bi = i;
		if (free[bi] > s.arr - CFG.SPAWN_LEAD) {
			s.ok = false;
			issues.push({ dia: s.dia, at: s.arr, msg: modelOf(s.m).name + s.cars + '両の編成が足りない' });
			continue;
		}
		free[bi] = s.dep + CFG.TURN;
	}

	const live = out.filter(s => s.ok);

	// 4. 所要編成数(同時に線路上に居る本数の最大)をスイープラインで求める
	const ev = [];
	for (const s of live) { ev.push([s.arr - CFG.SPAWN_LEAD, 1]); ev.push([s.dep + CFG.TURN, -1]); }
	ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	let cur = 0, peak = 0;
	for (const e of ev) { cur += e[1]; if (cur > peak) peak = cur; }
	R.need = peak;
	R.have = S.fleet.reduce((a, f) => a + f.n, 0);
	R.short = Math.max(0, peak - R.have);

	R.sched = live.slice().sort((a, b) => a.spawn - b.spawn);
	R.schedCur = 0;
	while (R.schedCur < R.sched.length && R.sched[R.schedCur].spawn <= S.t) R.schedCur++;

	// 4. 発車昇順・2日ぶんの索引(日跨ぎで客が待てるように)
	R.depIdx = live.map(s => s).concat(live.map(s => ({ ...s, arr: s.arr + 86400, dep: s.dep + 86400, spawn: s.spawn + 86400 })));
	R.depIdx.sort((a, b) => a.dep - b.dep);

	R.issues = issues;
	R.hasFast = live.some(s => s.ty >= 1);   // 優等が1本でもあるか
	R.allSlots = out;          // 無効なものも含む(UIで赤表示するため)
	R.diaVer = (R.diaVer || 0) + 1;          // 待機客に番線を選び直させるための版数

	// 在線中の列車を引き継ぐ。0クリアすると走っている列車の上に入線してしまう
	R.trackBusy = new Array(Math.max(1, S.nTrack)).fill(0);
	for (const tr of R.trains) {
		if (tr.gone || tr.track >= R.trackBusy.length) continue;
		R.trackBusy[tr.track] = Math.max(R.trackBusy[tr.track], tr.tDep + CFG.OCC_IN);
	}
	if (DIA.open) drawDia();
}

// この先しばらくの間に、その番線から「その志向の客が乗れる」スジがあるか
function nextDepOn(track, fromT, pref) {
	for (let i = 0; i < R.depIdx.length; i++) {
		const s = R.depIdx[i];
		if (s.dep < fromT || s.track !== track) continue;
		if (pref !== undefined && !canRide(s.ty, pref)) continue;
		return s;
	}
	return null;
}

function updateTrains(dt) {
	// スジの投入。単調カーソルなので1ステップに複数入っても取りこぼさない
	while (R.schedCur < R.sched.length && R.sched[R.schedCur].spawn <= S.t) {
		launchTrain(R.sched[R.schedCur++]);
	}

	const now = R.now;
	for (let i = R.trains.length - 1; i >= 0; i--) {
		const tr = R.trains[i];

		if (!tr.mesh && now >= tr.tArr - CFG.APPROACH_T) attachTrainMesh(tr);

		// まだ着いていない列車は、前の列車が延びていたら押し出される(場内待ち)
		if (!tr.arrived) {
			for (const o of R.trains) {
				if (o === tr || o.gone || o.track !== tr.track) continue;
				if (o.tArr < tr.tArr && o.tDep + CFG.OCC_IN > tr.tArr) {
					const push = o.tDep + CFG.OCC_IN - tr.tArr;
					tr.tArr += push; tr.tDep += push; tr.late = (tr.late || 0) + push;
				}
			}
		}

		// 到着: 降車客を確定し、空き容量を決める
		if (!tr.arrived && now >= tr.tArr) {
			tr.arrived = true;
			const n = Math.min(R.outPool, tr.cap);
			R.outPool -= n;
			tr.alightLeft = n;
			tr.room = Math.min(tr.cap, tr.cap * CFG.LOAD_ROOM + n * CFG.ALIGHT_ROOM);
		}

		// 停車中: 降車と乗車
		if (tr.arrived && !tr.gone && now < tr.tDep) {
			if (tr.alightLeft > 0) {
				const n = Math.min(tr.alightLeft, tr.flow * dt);
				tr.alightLeft -= n;
				spawnAlighted(tr, n);
			}
			if (tr.room > 0) {
				// 1体=paxScale人でも平均レートがドア扱い量に一致するよう端数を繰り越す
				tr.boardAcc = Math.min(tr.boardAcc + tr.flow * dt,
					tr.flow * dt + Math.max(R.paxScale, R.maxWaitW));
				const got = boardWaiting(tr, Math.min(tr.boardAcc, tr.room));
				tr.boardAcc -= got;
				tr.room -= got;
			}
		}

		// 発車: 乗車は定刻で打ち切る(=積み残し)。降車未了だけが遅延
		if (!tr.gone && now >= tr.tDep) {
			if (tr.alightLeft > 0.5) {
				tr.tDep = now + tr.alightLeft / Math.max(0.1, tr.flow);
				// 延びたぶん在線も伸ばさないと、後続が同じ番線に重なる
				R.trackBusy[tr.track] = Math.max(R.trackBusy[tr.track] || 0, tr.tDep + CFG.OCC_IN);
				if (!tr.lateWarn) {
					tr.lateWarn = true;
					S.rep = Math.max(0, S.rep - 0.05);
					alertOnce('delay', '⚠ 降車が終わらず遅延 — 停車時間が短すぎます', false, 30);
				}
			} else {
				tr.gone = true;
				// 運行費は発車ごとに掛かる。本数を増やせば増えるほど重くなる
				const run = tr.cars * CFG.RUN_PER_CAR * (1 + tr.ty * 0.18);
				S.money -= run; S.todayRun = (S.todayRun || 0) + run;
				// 積み残しは「本数」で数える。人数を足すと finishPax の 240秒/本 が破綻する。
				// その列車に乗れたはずの志向の客にだけ1本ぶん記録する
				const left = waitingFor(tr.track, tr.ty);
				if (left > 0) {
					const k0 = wIdx(tr.track, 0);
					R.missAcc[k0] = (R.missAcc[k0] || 0) + 1;
					if (tr.ty >= 1) {
						const k1 = wIdx(tr.track, 1);
						R.missAcc[k1] = (R.missAcc[k1] || 0) + 1;
					}
					if (left > tr.cap * 0.15) {
						alertOnce('left', '⚠ 積み残し — 停車時間か本数が足りません', false, 30);
					}
				}
			}
		}

		if (tr.mesh) tr.mesh.position.z = stopZOf(tr.cars) + trainOffset(tr, now);
		if (tr.gone && trainOffset(tr, now) > CFG.APPROACH_LEN) {
			// ジオメトリは全編成で共有しているので破棄しない
			if (tr.mesh) trainGroup.remove(tr.mesh);
			R.trains.splice(i, 1);
		}
	}

	// 構内踏切は列車が抜けきるまで閉じる。スジから直接見積もる
	let block = 0;
	if (S.link === 0) {
		for (const tr of R.trains) {
			if (tr.gone) {
				const done = tr.tDep + CFG.APPROACH_T + CFG.CROSS_CLEAR;
				if (done > now) block = Math.max(block, done - now);
			} else if (now >= tr.tArr - CFG.CROSS_WARN) {
				block = Math.max(block, tr.tDep + CFG.APPROACH_T + CFG.CROSS_CLEAR - now);
			}
		}
	}
	R.crossOpenAt = now + block;
	R.crossClosed = block > 0;
}

/* ================= 乗客 ================= */
function newPax() {
	return { x: 0, y: 0, z: 0, path: null, pi: 0, dir: 0, plat: 0, track: 0,
		state: 'walk', until: 0, born: 0, readyAt: undefined, w: 1, sx: 0, sz: 0,
		ph: 0, head: 0, col: COL_OUT };
}

function pathOut(p) {
	// 降車 → (階段) → 改札 → 出口
	const px = platX(p.plat);
	const path = [];
	if (hasStairs()) {
		const k = pickStair(p.plat);
		const sz = stairZ(k);
		path.push({ x: px, y: CFG.PLAT_Y, z: sz + 2, res: 'stair', k: k });
		path.push({ x: px, y: G.entryY, z: sz - 10, climb: true });
	} else {
		// 地平駅はホーム端のスロープを下り、構内踏切を渡って駅舎へ
		path.push({ x: px, y: CFG.PLAT_Y, z: G.platZ1 - 3 });
		path.push({ x: px, y: 0, z: G.crossZ, res: 'cross', qz: -1 });
		path.push({ x: G.concX0 + 2, y: 0, z: G.crossZ });
	}
	// 改札が1つも無い無人駅では素通りする
	const j = pickGate();
	if (j >= 0) {
		const g = gatePos(j);
		path.push({ x: g.x, y: G.entryY, z: g.z - 4, res: 'gate', j: j });
		path.push({ x: g.x, y: G.entryY, z: g.z + 4 });
	}
	// 出口。地下は階段を上がって地上へ出る
	if (isUnder()) {
		path.push({ x: G.concX1 + 20, y: G.entryY, z: G.exitZ });
		path.push({ x: G.concX1 + 40 + Math.random() * 10, y: 0, z: G.exitZ + (Math.random() - 0.5) * 12, exit: true });
	} else {
		// 駅舎の幅の内側に収める(線路の上に湧かないように)
		const ex = G.concX0 + 2 + Math.random() * Math.max(1, (G.concX1 - G.concX0) - 4);
		path.push({ x: ex, y: G.entryY, z: G.exitZ + 12, exit: true });
	}
	return path;
}

function pathIn(p) {
	const px = platX(p.plat);
	const side = trackSide(p.track);
	const di = Math.floor(Math.random() * G.nDoors);
	const path = [];
	// 地下は階段を下りてコンコースへ
	if (isUnder()) path.push({ x: G.concX1 + 20, y: G.entryY, z: G.exitZ });
	const j = pickGate();
	if (j >= 0) {
		const g = gatePos(j);
		path.push({ x: g.x, y: G.entryY, z: g.z + 6, res: 'gate', j: j });
		path.push({ x: g.x, y: G.entryY, z: g.z - 6 });
	}
	if (hasStairs()) {
		const k = pickStair(p.plat);
		const sz = stairZ(k);
		path.push({ x: px, y: G.entryY, z: sz - 10, res: 'stair', k: k });
		path.push({ x: px, y: CFG.PLAT_Y, z: sz + 2, climb: true });
	} else {
		path.push({ x: G.concX0 + 2, y: 0, z: G.crossZ, res: 'cross', qx: 1 });
		path.push({ x: px, y: 0, z: G.crossZ });
		path.push({ x: px, y: CFG.PLAT_Y, z: G.platZ1 - 3 });
	}
	path.push({ x: px + side * (S.platW / 2 - 1.3), y: CFG.PLAT_Y, z: doorZ(di), board: true });
	return path;
}

function pickStair(plat) {
	let best = 0, bt = Infinity;
	for (let k = 0; k < S.stairs; k++) {
		const f = R.stairFree[plat][k];
		if (f < bt) { bt = f; best = k; }
	}
	return best;
}
function pickGate() {
	let best = -1, bt = Infinity;
	for (let j = 0; j < gateCount(); j++) {
		// 待ち時間だけでなく処理の速さも見て、自動改札に寄るようにする
		const eta = Math.max(R.gateFree[j], R.now) + gateHeadway(j);
		if (eta < bt) { bt = eta; best = j; }
	}
	return best;
}

function addPax(dir, plat, track, x, y, z, born) {
	if (R.pax.length >= CFG.MAX_PAX) return null;
	const p = newPax();
	p.dir = dir; p.plat = plat; p.track = track;
	p.x = x; p.y = y; p.z = z;
	p.w = R.paxScale;                 // 生成時のスケールを保持する
	p.born = born === undefined ? R.now : born;
	p.ph = Math.random() * 6.283;
	p.head = dir === 0 ? 0 : Math.PI;
	// 優等が走っているときだけ「速い列車を待つ」客が現れる
	p.pref = (dir === 1 && R.hasFast && Math.random() < CFG.FAST_SHARE) ? 1 : 0;
	const pal = dir === 0 ? PAL_OUT : PAL_IN;
	p.col = pal[(Math.random() * pal.length) | 0];
	p.path = dir === 0 ? pathOut(p) : pathIn(p);
	p.pi = 0;
	R.pax.push(p);
	return p;
}

function spawnAlighted(tr, n) {
	R.alightAcc = (R.alightAcc || 0) + n / R.paxScale;
	const plat = trackPlat(tr.track);
	const side = trackSide(tr.track);
	while (R.alightAcc >= 1) {
		R.alightAcc -= 1;
		const di = Math.floor(Math.random() * G.nDoors);
		addPax(0, plat, tr.track,
			platX(plat) + side * (S.platW / 2 - 1.0),
			CFG.PLAT_Y, doorZ(di));
	}
	// tr.fare には既に種別倍率(不適合なら1.0)が入っている。二重に掛けない
	countPax(n, tr.fare);
}

/* 待機客のカウンタ。番線 × 志向(0=どれでもいい / 1=速い列車を待つ) の2次元を
   フラット配列で持つ。毎回 R.pax を全走査すると高速再生で潰れるため */
function wIdx(track, pref) { return track * 2 + pref; }
// その種別の列車に、その志向の客が乗るか。優等は両方乗せ、普通は待つ客を乗せない
function canRide(ty, pref) { return pref === 0 || ty >= 1; }

function countWaiting(track) { return (R.waitN[wIdx(track, 0)] || 0) + (R.waitN[wIdx(track, 1)] || 0); }
// その列車に乗れたはずの客(積み残しの計算に使う)
function waitingFor(track, ty) {
	let n = R.waitW[wIdx(track, 0)] || 0;
	if (ty >= 1) n += R.waitW[wIdx(track, 1)] || 0;
	return n;
}

function recountWaiting() {
	const n = Math.max(1, S.nTrack) * 2;
	R.waitN = new Array(n).fill(0);
	R.waitW = new Array(n).fill(0);
	R.maxWaitW = 1;
	for (let i = 0; i < R.pax.length; i++) {
		const p = R.pax[i];
		if (p.state !== 'waitTrain') continue;
		if (p.track >= S.nTrack) p.track = S.nTrack - 1;
		const k = wIdx(p.track, p.pref || 0);
		R.waitN[k]++; R.waitW[k] += p.w;
		if (p.w > R.maxWaitW) R.maxWaitW = p.w;
	}
}

function boardWaiting(tr, maxPeople) {
	let took = 0;
	// 先に来た客から乗せる(末尾から走査すると後から来た客が先に乗ってしまう)
	for (let i = 0; i < R.pax.length; i++) {
		const p = R.pax[i];
		if (p.state !== 'waitTrain' || p.track !== tr.track) continue;
		// 速い列車を待っている客は普通に乗らない
		if (!canRide(tr.ty, p.pref || 0)) continue;
		const k = wIdx(p.track, p.pref || 0);
		// この客がホームに着いてから何本見送ったか
		p.missed = Math.max(0, (R.missAcc[k] || 0) - (p.missAt || 0));
		// 1エージェント = p.w 人。人数で先に判定しないとドア扱い量を超える
		if (took + p.w > maxPeople) break;
		finishPax(p);
		R.pax.splice(i, 1);
		i--;
		R.waitN[k]--; R.waitW[k] -= p.w;
		took += p.w;
	}
	countPax(took, tr.fare);
	return took;
}

function countPax(people, mul) {
	S.todayPax += people;
	// 改札が無いと運賃を取りこぼす。種別と駅の格で取り分が変わる
	const fare = CFG.FARE * (gateCount() > 0 ? 1 : CFG.NO_GATE_FARE)
		* (mul === undefined ? 1 : mul) * (1 + S.rank * 0.06);
	// 運賃の駅取り分 + 駅ナカ店舗の売上(通行客の一部が買う)
	const rev = people * fare + people * S.shops * 6.2;
	S.todayRev += rev;
	S.money += rev;
}

function finishPax(p) {
	// 駅内滞在時間から満足度を算出。
	// ただし乗車客が「次の列車を待つ」時間は駅のせいではないので除き、
	// 1本乗り遅れた分(積み残し)だけを罰する。運行間隔の不便さは軽い係数で反映。
	// ダイヤは自分で組むので、列車待ちもプレイヤーの責任。
	// ただし歩行や行列より軽く見る(0.45)。積み残された回数は重く罰する
	let dur;
	if (p.dir === 1 && p.readyAt !== undefined) {
		dur = (p.readyAt - p.born) + 0.45 * (R.now - p.readyAt) + (p.missed || 0) * 240;
	} else {
		dur = R.now - p.born;
	}
	const ideal = 180;
	const sat = Math.max(0, Math.min(100, 100 - Math.max(0, dur - ideal) / 8));
	R.satSum += sat * p.w;
	R.satN += p.w;
}

function crowdFactor(p) {
	// 混雑していると歩けなくなる
	let dens;
	if (Math.abs(p.y - CFG.PLAT_Y) < 0.25) {
		dens = R.platCount[p.plat] / Math.max(1, G.platArea);
	} else {
		dens = R.concCount / Math.max(1, G.concArea);
	}
	// 1.2人/m² を超えると急激に遅くなる
	return Math.max(0.22, Math.min(1, 1.15 - dens / 1.5));
}

function updatePax(dt) {
	// 混雑カウント
	for (let i = 0; i < R.platCount.length; i++) R.platCount[i] = 0;
	R.concCount = 0;
	for (let i = 0; i < R.pax.length; i++) {
		const p = R.pax[i];
		// ホーム面の高さにいるならホーム、それ以外(地上/コンコース)は改札まわり
		if (Math.abs(p.y - CFG.PLAT_Y) < 0.25) {
			if (p.plat < R.platCount.length) R.platCount[p.plat] += p.w;
		} else R.concCount += p.w;
	}

	for (let i = R.pax.length - 1; i >= 0; i--) {
		const p = R.pax[i];
		if (p.state === 'waitTrain') {
			// ダイヤが変わったら番線を選び直す。乗るはずのスジが消えていることがある
			if (p.diaVer !== R.diaVer) {
				p.diaVer = R.diaVer;
				const nt = pickBoardTrack(p.pref || 0);
				if (nt >= 0 && nt !== p.track && trackPlat(nt) === p.plat) {
					const o = wIdx(p.track, p.pref || 0);
					R.waitN[o]--; R.waitW[o] -= p.w;
					p.track = nt;
					const k = wIdx(p.track, p.pref || 0);
					R.waitN[k]++; R.waitW[k] += p.w;
					p.missAt = R.missAcc[k] || 0;
				}
			}
			// 速い列車を待ちすぎた客は妥協して普通にも乗るようになる
			if (p.pref === 1 && R.now - p.readyAt > CFG.PREF_GIVEUP) {
				const a = wIdx(p.track, 1), b = wIdx(p.track, 0);
				R.waitN[a]--; R.waitW[a] -= p.w;
				p.pref = 0;
				R.waitN[b]++; R.waitW[b] += p.w;
				p.missAt = R.missAcc[b] || 0;   // 基準点を移した先に合わせる
			}
			continue;
		}

		if (p.state === 'queue') {
			if (R.now >= p.until) {
				p.state = 'walk';
				p.pi++;
			} else {
				// 行列の位置でじりじり進む
				stepTo(p, p.sx, p.y, p.sz, dt);
				continue;
			}
		}

		const node = p.path[p.pi];
		if (!node) { R.pax.splice(i, 1); continue; }

		// リソース(階段/改札/構内踏切)の取得
		if (node.res && !p.gotRes) {
			let pool, idx, hw;
			if (node.res === 'stair') {
				pool = R.stairFree[p.plat]; idx = node.k;
				hw = S.esc ? CFG.ESC_HEADWAY : CFG.STAIR_HEADWAY;
			} else if (node.res === 'cross') {
				pool = R.crossFree; idx = 0;
				hw = CFG.CROSS_HEADWAY;
			} else {
				pool = R.gateFree; idx = node.j;
				hw = gateHeadway(node.j);
			}
			// 1エージェントが paxScale 人を表すので、占有時間もその分かかる
			hw *= R.paxScale;
			// 構内踏切は列車が抜けるまで開かない
			const open = node.res === 'cross' ? R.crossOpenAt : 0;
			const start = Math.max(pool[idx], R.now, open);
			pool[idx] = start + hw;
			p.gotRes = true;
			p.until = start;
			const ahead = Math.max(0, Math.ceil((start - R.now) / hw));
			// 行列は来た方向へ伸ばす
			const back = Math.min(ahead * 0.75, 40);
			const qx = node.qx || 0;
			const qz = node.qz !== undefined ? node.qz : (qx ? 0 : (p.dir === 0 ? -1 : 1));
			p.sx = node.x + qx * back;
			p.sz = node.z + qz * back;
			if (start > R.now) { p.state = 'queue'; continue; }
		}

		const arrived = stepTo(p, node.x, node.y, node.z, dt, node.climb);
		if (arrived) {
			p.gotRes = false;
			if (node.exit) { finishPax(p); R.pax.splice(i, 1); continue; }
			if (node.board) {
				// ホームに着いた時点で番線を選び直す。歩いている間に列車が出ていることがある
				const best = pickBoardTrack(p.pref || 0);
				if (best >= 0 && best !== p.track && trackPlat(best) === p.plat) p.track = best;
				p.state = 'waitTrain'; p.readyAt = R.now;
				const k = wIdx(p.track, p.pref || 0);
				p.missAt = R.missAcc[k] || 0;         // 積み残しの基準点
				p.diaVer = R.diaVer;                  // 待ち始めたときのダイヤ版数
				R.waitN[k]++; R.waitW[k] += p.w;
				if (p.w > R.maxWaitW) R.maxWaitW = p.w;
				continue;
			}
			p.pi++;
			if (p.pi >= p.path.length) { finishPax(p); R.pax.splice(i, 1); }
		}
	}
}

function stepTo(p, tx, ty, tz, dt, climb) {
	const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z;
	const d = Math.hypot(dx, dz);
	// 階段は昇降に時間がかかる
	const spd = climb
		? Math.hypot(9, CFG.CONC_Y - CFG.PLAT_Y) / CFG.STAIR_CLIMB * (S.esc ? 1.6 : 1)
		: CFG.WALK * crowdFactor(p);
	const move = spd * dt;
	if (d <= move || d < 0.05) {
		p.x = tx; p.y = ty; p.z = tz;
		return true;
	}
	p.x += dx / d * move;
	p.z += dz / d * move;
	p.head = Math.atan2(dx, dz);
	if (Math.abs(dy) > 0.001) {
		// 水平移動に比例して高さを詰める
		p.y += dy * (move / d);
	}
	return false;
}

/* ================= 需要 ================= */
function hourOfDay() { return ((4 * 3600 + S.t) / 3600) % 24; }

function hourFactor() {
	const h = hourOfDay();
	const a = HOURLY[Math.floor(h) % 24];
	const b = HOURLY[(Math.floor(h) + 1) % 24];
	return a + (b - a) * (h - Math.floor(h));
}

// 時刻 h における配列の補間値
function profAt(a, h) {
	const i = Math.floor(h) % 24, j = (i + 1) % 24;
	return a[i] + (a[j] - a[i]) * (h - Math.floor(h));
}

/* いまの需要(人/秒)。駅の周りに何があるかで決まる。
   評判は「その駅を使いたいか」の係数として掛かる */
function demandNow() {
	const h = hourOfDay();
	let din = 0, dout = 0;
	for (const d of DEVS) {
		const n = devCount(d.id);
		if (!n) continue;
		const P = PROF[d.prof];
		din += d.pax * n * profAt(P.in, h);
		dout += d.pax * n * profAt(P.out, h);
	}
	const rep = 0.55 + (S.rep / 100) * 0.75;
	return { in: din * rep / 3600, out: dout * rep / 3600 };
}

function demandPerSec() {
	const d = demandNow();
	return d.in + d.out;
}

function updateDemand(dt) {
	// この先しばらくに乗れるスジが1本も無ければ、そもそも客は駅に来ない。
	// 白紙スタートで「列車が無ければ客も来ない」を成立させる
	let served = false;
	for (let t = 0; t < S.nTrack && !served; t++) {
		const s = nextDepOn(t, S.t);
		if (s && s.dep - S.t <= CFG.ENTER_WINDOW) served = true;
	}

	const dm = demandNow();
	// エージェント数が上限に近づいたら1人=N人にスケール
	const want = Math.ceil((dm.in + dm.out) * 220 / CFG.MAX_PAX);
	R.paxScale = Math.max(1, want);

	// 降車客は列車が運んでくる。運んでくる列車が無いなら溜めない
	if (served) R.outPool += dm.out * dt;
	R.outPool = Math.min(R.outPool, CFG.CAR_CAP * CFG.CARS_MAX * 3);

	// 入場客は駅前から入ってくる。駅が飽和していたら外で待たされる(入場規制)
	if (served) {
		R.inAccum += dm.in * dt / R.paxScale;
		while (R.inAccum >= 1) { R.inAccum -= 1; R.inQ.push(R.now); }
	}

	// 満員なら1回も生成できないので、行き先の選定は生成できるときだけ行う
	while (R.inQHead < R.inQ.length && R.pax.length < CFG.MAX_PAX) {
		const track = pickBoardTrack();
		if (track < 0) break;
		const p = isUnder()
			? addPax(1, trackPlat(track), track,
				G.concX1 + 40 + Math.random() * 10, 0, G.exitZ + (Math.random() - 0.5) * 12, R.inQ[R.inQHead])
			: addPax(1, trackPlat(track), track,
				G.concX0 + 2 + Math.random() * Math.max(1, (G.concX1 - G.concX0) - 4),
				G.entryY, G.exitZ + 12, R.inQ[R.inQHead]);
		if (!p) break;
		R.inQHead++;
	}
	if (R.inQHead > 1024) { R.inQ = R.inQ.slice(R.inQHead); R.inQHead = 0; }

	// あまりに待たされた客は諦めて帰る(評判に直撃)
	const queued = R.inQ.length - R.inQHead;
	if (queued > 0) {
		alertOnce('gaveup', '⚠ 入場規制 — 駅の処理能力が限界です', false, 30);
		let give = 0;
		while (R.inQHead < R.inQ.length && R.now - R.inQ[R.inQHead] > 1200) { R.inQHead++; give++; }
		if (give > 0) {
			R.satSum += 0;
			R.satN += give * R.paxScale;
			S.rep = Math.max(0, S.rep - give * R.paxScale * 0.0004);
		}
	}
}

function pickBoardTrack(pref) {
	// 自分が乗れるスジのうち、次に発車するものが最も早い番線を選ぶ
	let best = -1, bt = Infinity;
	for (let t = 0; t < S.nTrack; t++) {
		const s = nextDepOn(t, S.t + 60, pref);
		if (!s) continue;
		const eta = s.dep + countWaiting(t) * 0.01;
		if (eta < bt) { bt = eta; best = t; }
	}
	// 速い列車を待つ客でも、行き先が無ければ普通で妥協する
	if (best < 0 && pref === 1) return pickBoardTrack(0);
	return best;
}

/* ================= 経済・日次 ================= */
function dailyCost() {
	return S.nPlat * (10000 + 3500 * S.cars) + 25000 * S.nTrack + 12000 * S.stairs * S.nPlat
		+ 9000 * S.gateA + CFG.STAFF_WAGE * S.gateM + 900 * S.concW + 55000 * S.shops
		+ (S.esc ? 120000 : 0) + fleetLease();
}

// 契約している編成のリース料(1日)
function fleetLease() {
	let n = 0;
	for (const f of S.fleet) n += contractLease(f.m, f.cars) * f.n;
	return n;
}

function endOfDay() {
	const cost = dailyCost();
	S.money -= cost;
	S.todayCost = cost;

	// 誰も駅を使っていない日は評判を動かさない(列車を走らせずに評判が上がるのを防ぐ)
	const sat = R.satN > 0 ? R.satSum / R.satN : null;
	if (sat !== null) S.rep = Math.max(0, Math.min(100, S.rep + (sat - S.rep) * 0.35));
	S.town = potentialPax() / 10000;   // 表示用(万人/日)

	S.yesterdayPax = S.todayPax;
	const oldRank = S.rank;
	while (S.rank < RANKS.length - 1 && S.yesterdayPax >= RANKS[S.rank + 1].need) S.rank++;

	S.log.unshift({
		day: S.day, pax: Math.round(S.todayPax), rev: Math.round(S.todayRev),
		cost: cost, lease: fleetLease(), run: Math.round(S.todayRun || 0),
		fixed: cost - fleetLease(),
		sat: sat === null ? '—' : Math.round(sat), town: S.town,
		rank: RANKS[S.rank].name, trains: R.sched.length,
	});
	if (S.log.length > 40) S.log.length = 40;

	if (S.rank > oldRank) {
		alertOnce('rank', '🎉 ' + RANKS[S.rank].name + ' に昇格！', true, 0);
	}

	S.day++;
	S.todayPax = 0; S.todayRev = 0; S.todayRun = 0;
	R.satSum = 0; R.satN = 0;
	R.missAcc = new Array(Math.max(1, S.nTrack) * 2).fill(0);
	// S.t が巻き戻るのでスジのカーソルを先頭に戻す
	compileSched();
	save();
	renderLog();
}

/* ================= セーブ ================= */
let noSave = false;   // リセット中は書き戻さない
function save() {
	if (noSave) return;
	try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 無視 */ }
}
function load() {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return false;
		const o = JSON.parse(raw);
		if (!o || typeof o.nPlat !== 'number') return false;
		S = Object.assign(defaultState(), o);
		// 編成長が可変になる前のセーブはホーム固定10両だった。
		// 補完しないと defaultState() の2両に落ちて輸送力が数分の1になる
		if (typeof o.cars !== 'number') S.cars = 10;
		S.cars = Math.max(CFG.CARS_MIN, Math.min(CFG.CARS_MAX, Math.round(S.cars)));
		// 契約・ダイヤが無かった頃のセーブは白紙で始める
		// 本線が無かった頃のセーブは、番線をまとめて1本線に載せる
		S.lines = Math.max(1, Math.min(CFG.MAX_LINES, Math.round(S.lines || 1)));
		if (!Array.isArray(S.trackLine)) S.trackLine = [];
		if (!Array.isArray(S.fleet)) S.fleet = [];
		if (!Array.isArray(S.dia)) S.dia = [];
		S.diaId = Math.max(1, S.diaId | 0);
		for (const d of S.dia) if (d.id >= S.diaId) S.diaId = d.id + 1;
		S.nPlat = Math.max(1, Math.min(10, Math.round(S.nPlat)));
		S.nTrack = Math.max(1, Math.min(S.nPlat * 2, Math.round(S.nTrack)));
		S.stairs = Math.max(0, Math.round(S.stairs));
		// 改札が「最初から2台」だった頃のセーブは、その台数を自動改札とみなす
		if (typeof o.gateA !== 'number' && typeof o.gates === 'number') {
			S.gateA = Math.max(0, Math.round(o.gates));
			S.gateM = 0;
		}
		S.gateA = Math.max(0, Math.round(S.gateA));
		S.gateM = Math.max(0, Math.round(S.gateM));
		// 橋上駅舎が最初から在った頃のセーブは、建設済みとして引き継ぐ
		// 橋上駅舎が真偽値だった頃 / 最初から在った頃のセーブを引き継ぐ
		if (typeof o.link !== 'number') S.link = (o.conc === false) ? 0 : 1;
		if (S.link === 0 && S.nPlat > 1) S.link = 1;
		return true;
	} catch (e) { return false; }
}

/* ================= 増築 ================= */
const UPGRADES = [
	{
		id: 'cars', ic: '📏', name: 'ホームを延伸',
		desc: () => 'ホーム有効長 ' + S.cars + '両 → ' + nextCars() + '両。'
			+ (nextCars() === 15 ? '基本10両+付属5両が着けられるようになる。' : '')
			+ 'より長い編成を契約できるようになる。',
		cost: () => 2200000 * Math.pow(1.42, (S.cars - CFG.CARS_MIN) / 2) * S.nPlat,
		can: () => S.cars < CFG.CARS_MAX,
		ng: () => CFG.CARS_MAX + '両が上限',
		apply: () => { S.cars = nextCars(); },
	},
	{
		id: 'under', ic: '🕳', name: '地下道を建設',
		desc: '線路の下をくぐる地下コンコースを掘り、改札を地下へ移す。'
			+ '構内踏切が不要になり、ホームを2面以上に増やせる。安いが階段が深く、後の拡張は割高。',
		cost: () => 5200000 + 900000 * S.nTrack,
		can: () => !hasLink(),
		ng: () => LINK_NAME[S.link] + '駅舎を建設済み',
		apply: () => { S.link = 2; if (S.stairs < 1) S.stairs = 1; },
	},
	{
		id: 'bridge', ic: '🌉', name: '橋上駅舎を建設',
		desc: '線路をまたぐ駅舎を建て、改札を2階へ移す。'
			+ '構内踏切が不要になり、ホームを2面以上に増やせる。高いが明るく、拡張しやすい。',
		cost: () => 9800000 + 1800000 * S.nTrack,
		can: () => !hasLink(),
		ng: () => LINK_NAME[S.link] + '駅舎を建設済み',
		apply: () => { S.link = 1; if (S.stairs < 1) S.stairs = 1; },
	},
	{
		id: 'stairs', ic: '🪜', name: '階段を増設',
		desc: 'ホームとコンコースを結ぶ階段。少ないとホームに人が溜まる。',
		cost: () => 700000 * Math.pow(1.9, S.stairs - 1) * S.nPlat * (isUnder() ? 1.5 : 1),
		can: () => hasLink() && S.stairs < maxStairs(),
		ng: () => !hasLink() ? '橋上駅舎か地下道が必要'
			: (S.stairs < CFG.MAX_STAIRS ? 'ホームが短い(要延伸)' : '上限'),
		apply: () => { S.stairs++; },
	},
	{
		id: 'esc', ic: '🛗', name: 'エスカレーター化',
		desc: 'すべての階段をエスカレーターに。処理能力が約2倍。',
		cost: () => 4500000,
		can: () => !S.esc,
		ng: () => '導入済み',
		apply: () => { S.esc = true; },
	},
	{
		id: 'gateM', ic: '👮', name: '手動改札を1つ設置',
		desc: () => '駅員が切符を切る通路。安く置けるが 約'
			+ CFG.GATE_M_HEADWAY + '秒に1人と遅く、駅員の人件費が1日 '
			+ yen(CFG.STAFF_WAGE) + ' かかる。現在 ' + S.gateM + '通路。',
		// 指数だと台数が増えたとき数学的に到達不能になるので緩やかにする
		cost: () => 260000 * (1 + S.gateM * 0.05),
		can: () => S.gateM < 40,
		ng: () => '上限',
		apply: () => { S.gateM++; },
	},
	{
		id: 'gateA', ic: '🎫', name: '自動改札を1台設置',
		desc: () => '約' + CFG.GATE_A_HEADWAY + '秒に1人と速く、維持費も安い。'
			+ '初期費用は高い。現在 ' + S.gateA + '台。',
		// 新宿級には140台前後必要になる。指数だと絶対に届かないので線形に近づける
		cost: () => 1900000 * (1 + S.gateA * 0.006),
		can: () => S.gateA < 220,
		ng: () => '上限',
		apply: () => { S.gateA++; },
	},
	{
		id: 'line', ic: '🧭', name: '本線を増設',
		desc: () => '駅の外へ出ていく線路を1本増やす。本線は' + Math.round(CFG.LINE_HEAD / 60)
			+ '分に1本まで発車でき、1本線に2番線を交互に使うとその上限を出しきれる。現在 '
			+ S.lines + '本線 / 番線' + S.nTrack + '（理論上限 '
			+ Math.min(S.lines * 3600 / CFG.LINE_HEAD, S.nTrack * 3600 / CFG.TRACK_HEAD) + '本/時）',
		cost: () => 18000000 * Math.pow(1.55, S.lines - 1),
		can: () => S.lines < CFG.MAX_LINES && S.nTrack > S.lines,
		ng: () => S.lines >= CFG.MAX_LINES ? '上限' : '先に番線を増設',
		apply: () => { S.lines++; },
	},
	{
		id: 'track', ic: '🛤', name: '線路を増設',
		desc: '発着できる列車が増え、輸送力が上がる。ホーム1面につき2線まで。',
		cost: () => 3200000 * Math.pow(1.30, S.nTrack - 1),
		can: () => S.nTrack < S.nPlat * 2,
		ng: () => '先にホームを増設',
		apply: () => { S.nTrack++; },
	},
	{
		id: 'plat', ic: '🏗', name: 'ホームを増設',
		desc: '島式ホームを1面追加。線路をさらに2本敷けるようになる。',
		cost: () => 14000000 * Math.pow(1.55, S.nPlat - 1),
		can: () => hasLink() && S.nPlat < 10,
		ng: () => !hasLink() ? '橋上駅舎か地下道が必要' : '上限',
		apply: () => { S.nPlat++; },
	},
	{
		id: 'platw', ic: '↔️', name: 'ホームを拡幅',
		desc: 'ホームを2m広げる。待機客の密度が下がり、歩行が速くなる。',
		cost: () => 2600000 * Math.pow(1.4, (S.platW - 6) / 2),
		can: () => S.platW < 22,
		ng: () => '上限',
		apply: () => { S.platW += 2; },
	},
	{
		id: 'conc', ic: '🏢', name: '駅舎を拡張',
		desc: '駅舎を左右に8mずつ拡張。滞留スペースと改札を置ける幅が増える。',
		cost: () => 3400000 * Math.pow(1.3, S.concW / 8),
		can: () => S.concW < 96,
		ng: () => '上限',
		apply: () => { S.concW += 8; },
	},
	{
		id: 'shop', ic: '🏪', name: '駅ナカ店舗を出店',
		desc: '通行客から副収入。ただし維持費もかかる。',
		cost: () => 1500000 * Math.pow(1.28, S.shops),
		can: () => S.shops < 24,
		ng: () => '上限',
		apply: () => { S.shops++; },
	},
];

function descOf(u) { return typeof u.desc === 'function' ? u.desc() : u.desc; }

/* 編成を1本も持っていない間は、いちばん安い契約ぶんの資金を残しておく。
   これを守らないと「列車が無い→客が来ない→収入ゼロ」で詰む */
function reserveForFirstTrain() {
	if (S.fleet.length) return 0;
	let min = Infinity;
	for (const m of MODELS) {
		if (S.rank < m.rank) continue;
		for (const c of m.cars) {
			if (c > S.cars) continue;
			min = Math.min(min, contractPrice(m.id, c));
		}
	}
	return min === Infinity ? 0 : min;
}
function canSpend(cost) { return S.money - cost >= reserveForFirstTrain(); }

function renderUpgrades() {
	const el = document.getElementById('upgrades');
	el.innerHTML = '';
	for (const u of UPGRADES) {
		const ok = u.can();
		const cost = Math.round(u.cost());
		const afford = canSpend(cost);
		const b = document.createElement('button');
		b.className = 'up';
		b.disabled = !ok || !afford;
		b.innerHTML =
			'<span class="ic">' + u.ic + '</span>' +
			'<span class="tx"><b>' + u.name + '</b><span>' + descOf(u) + '</span></span>' +
			'<span class="pr">' + (ok ? yen(cost) : u.ng()) + '</span>';
		b._u = u;
		b.onclick = () => {
			const c = Math.round(u.cost());
			if (!u.can() || !canSpend(c)) return;
			navigator.vibrate && navigator.vibrate(12);
			S.money -= c;
			u.apply();
			resetRuntimeForLayout();
			buildStation();
			save();
			renderUpgrades();
		};
		el.appendChild(b);
	}
}

/* ---- 周辺開発の一覧 ---- */
function renderDevs() {
	const el = document.getElementById('devList');
	if (!el) return;
	const sum = document.getElementById('devSum');
	if (sum) {
		const p = potentialPax();
		sum.innerHTML = '沿線の潜在需要 <b style="color:#7ee0a0;font-size:13px">' + num(p) + '人/日</b>'
			+ '（評判' + Math.round(S.rep) + 'で実効 ' + num(Math.round(p * (0.55 + S.rep / 100 * 0.75))) + '人/日）';
	}
	el.innerHTML = '';
	for (const d of DEVS) {
		const n = devCount(d.id);
		const cost = devCost(d);
		const locked = S.rep < d.rep;
		const b = document.createElement('button');
		b.className = 'up';
		b.disabled = locked || !canSpend(cost);
		b.innerHTML =
			'<span class="ic">' + d.ic + '</span>' +
			'<span class="tx"><b>' + d.name + (n ? ' ×' + n : '') + '</b>' +
			'<span>' + d.desc + '　+' + num(d.pax) + '人/日</span></span>' +
			'<span class="pr">' + (locked ? '評判' + d.rep + 'から' : yen(cost)) + '</span>';
		b.onclick = () => {
			const c = devCost(d);
			if (S.rep < d.rep || !canSpend(c)) return;
			S.money -= c;
			if (!S.devs) S.devs = {};
			S.devs[d.id] = devCount(d.id) + 1;
			S.town = potentialPax() / 10000;
			navigator.vibrate && navigator.vibrate(12);
			renderDevs(); buildStation(); save();
		};
		el.appendChild(b);
	}
}

function resetRuntimeForLayout() {
	// 地平駅に階段は無い。立体交差なら最低1つ
	S.stairs = hasLink() ? Math.max(1, Math.min(S.stairs, maxStairs())) : 0;
	recalcGeometry();
	R.stairFree = [];
	for (let i = 0; i < S.nPlat; i++) {
		R.stairFree.push(new Array(CFG.MAX_STAIRS).fill(0));
	}
	R.gateFree = new Array(gateCount()).fill(0);
	R.platCount = new Array(S.nPlat).fill(0);
	R.waitN = new Array(Math.max(1, S.nTrack)).fill(0);
	R.waitW = new Array(Math.max(1, S.nTrack)).fill(0);
	R.maxWaitW = 1;
	// レイアウトが変わると既存の経路が無効になるので作り直す
	for (const p of R.pax) {
		if (p.plat >= S.nPlat) p.plat = S.nPlat - 1;
		if (p.track >= S.nTrack) p.track = S.nTrack - 1;
		if (p.state !== 'waitTrain') {
			p.path = p.dir === 0 ? pathOut(p) : pathIn(p);
			p.pi = 0;
			p.gotRes = false;
			p.state = 'walk';
		}
	}
	// レイアウトが変わると有効なスジが変わるので、走行中の列車は消してダイヤを組み直す
	for (const tr of R.trains) if (tr.mesh) trainGroup.remove(tr.mesh);
	R.trains.length = 0;
	R.missAcc = new Array(Math.max(1, S.nTrack) * 2).fill(0);
	recountWaiting();
	compileSched();
}

/* ================= ダイヤ編集UI =================
   番線別のタイムライン。帯は展開されたスジ、編集の実体はパターン(S.dia) */
const DIA = {
	open: false, tab: 'dia', sel: null,
	t0: 5 * 60 - 4 * 60,     // 表示開始(4:00起点の分)
	span: 60,                // 表示幅(分)
	cv: null, ctx: null, w: 0, h: 0, dpr: 1,
	drag: null, dirty: false,
};
const LANE_H = 26, AXIS_H = 22, LABEL_W = 30;

function diaLaneCount() { return Math.max(1, S.nTrack); }
function diaHeight() { return AXIS_H + diaLaneCount() * LANE_H + 6; }

function diaResize() {
	const cv = DIA.cv;
	if (!cv) return;
	DIA.dpr = Math.min(window.devicePixelRatio || 1, 2);
	// レイアウトが取れない状況(非表示など)でも 0 幅にしない
	DIA.w = Math.max(240, cv.clientWidth || window.innerWidth - 24 || 360);
	DIA.h = diaHeight();
	cv.style.height = DIA.h + 'px';
	cv.width = Math.round(DIA.w * DIA.dpr);
	cv.height = Math.round(DIA.h * DIA.dpr);
	DIA.ctx.setTransform(DIA.dpr, 0, 0, DIA.dpr, 0, 0);
}

function minToX(mn) { return LABEL_W + (mn - DIA.t0) / DIA.span * (DIA.w - LABEL_W); }
function xToMin(x) { return DIA.t0 + (x - LABEL_W) / (DIA.w - LABEL_W) * DIA.span; }

// 4:00起点の分 → 時計表示
function clockOf(mn) {
	const h = Math.floor(((mn + 4 * 60) / 60)) % 24, m = Math.round(mn) % 60;
	return String(h).padStart(2, '0') + ':' + String((m + 60) % 60).padStart(2, '0');
}

function drawDia() {
	if (!DIA.ctx || !DIA.w) return;
	const g = DIA.ctx, w = DIA.w, h = DIA.h;
	g.clearRect(0, 0, w, h);

	// 需要カーブを背景に敷く
	g.fillStyle = 'rgba(120,170,230,.10)';
	g.beginPath(); g.moveTo(LABEL_W, AXIS_H);
	for (let x = LABEL_W; x <= w; x += 4) {
		const mn = xToMin(x), hh = ((mn + 4 * 60) / 60) % 24;
		const a = HOURLY[Math.floor(hh) % 24], b = HOURLY[(Math.floor(hh) + 1) % 24];
		const v = a + (b - a) * (hh - Math.floor(hh));
		g.lineTo(x, AXIS_H + (h - AXIS_H) * (1 - Math.min(1, v / 3.2)));
	}
	g.lineTo(w, AXIS_H); g.closePath(); g.fill();

	// 時刻の目盛り
	const step = DIA.span > 600 ? 120 : DIA.span > 180 ? 60 : DIA.span > 90 ? 30 : 10;
	g.font = '9px system-ui, sans-serif'; g.textBaseline = 'middle';
	for (let mn = Math.ceil(DIA.t0 / step) * step; mn <= DIA.t0 + DIA.span; mn += step) {
		const x = minToX(mn);
		g.strokeStyle = (mn + 240) % 60 === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)';
		g.beginPath(); g.moveTo(x, AXIS_H - 4); g.lineTo(x, h); g.stroke();
		g.fillStyle = 'rgba(220,232,246,.65)'; g.textAlign = 'center';
		g.fillText(clockOf(mn), x, 9);
	}

	// 番線のレーン
	for (let t = 0; t < diaLaneCount(); t++) {
		const y = AXIS_H + t * LANE_H;
		g.fillStyle = t % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.015)';
		g.fillRect(LABEL_W, y, w - LABEL_W, LANE_H);
		g.fillStyle = 'rgba(220,232,246,.8)'; g.textAlign = 'left'; g.font = 'bold 10px system-ui, sans-serif';
		g.fillText((t + 1) + '番', 3, y + LANE_H / 2);
	}

	// スジの帯
	const slots = R.allSlots || [];
	for (const s of slots) {
		const a = s.arr / 60, d = s.dep / 60;
		if (d < DIA.t0 - 5 || a > DIA.t0 + DIA.span + 5) continue;
		if (s.track >= diaLaneCount()) continue;
		const x0 = minToX(a), x1 = Math.max(minToX(d), x0 + 9);
		const y = AXIS_H + s.track * LANE_H + 4;
		const T = TYPES[s.ty];
		const on = DIA.sel === s.dia;
		g.fillStyle = s.ok ? '#' + T.col.toString(16).padStart(6, '0') : '#7a2f2a';
		g.beginPath();
		if (g.roundRect) g.roundRect(x0, y, x1 - x0, LANE_H - 8, 3); else g.rect(x0, y, x1 - x0, LANE_H - 8);
		g.fill();
		if (on) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
		if (x1 - x0 > 16) {
			g.fillStyle = 'rgba(16,22,29,.9)'; g.textAlign = 'center'; g.font = 'bold 9px system-ui, sans-serif';
			g.fillText(T.abbr, (x0 + x1) / 2, y + (LANE_H - 8) / 2);
		}
	}

	// 現在時刻
	const nowMn = S.t / 60;
	if (nowMn >= DIA.t0 && nowMn <= DIA.t0 + DIA.span) {
		const x = minToX(nowMn);
		g.strokeStyle = '#7ee0a0'; g.lineWidth = 1.5;
		g.beginPath(); g.moveTo(x, AXIS_H - 4); g.lineTo(x, h); g.stroke();
	}
	const el = document.getElementById('diaClock');
	if (el) el.textContent = clockOf(DIA.t0) + ' 〜 ' + clockOf(DIA.t0 + DIA.span);
}

// 指の位置にあるスジ
function diaHit(x, y) {
	const slots = R.allSlots || [];
	for (const s of slots) {
		if (s.track >= diaLaneCount()) continue;
		const x0 = minToX(s.arr / 60), x1 = Math.max(minToX(s.dep / 60), x0 + 9);
		const yy = AXIS_H + s.track * LANE_H;
		if (x >= x0 - 5 && x <= x1 + 5 && y >= yy && y <= yy + LANE_H) return s;
	}
	return null;
}

function diaCompileSoon() {
	DIA.dirty = true;
	if (DIA.timer) return;
	DIA.timer = setTimeout(() => { DIA.timer = null; DIA.dirty = false; compileSched(); renderDiaList(); }, 120);
}

function initDiaCanvas() {
	const cv = DIA.cv = document.getElementById('diaCv');
	DIA.ctx = cv.getContext('2d');
	let last = null;

	cv.addEventListener('pointerdown', e => {
		cv.setPointerCapture(e.pointerId);
		const r = cv.getBoundingClientRect();
		const x = e.clientX - r.left, y = e.clientY - r.top;
		const hit = diaHit(x, y);
		last = { x: x, y: y, mn: xToMin(x) };
		if (hit) {
			DIA.sel = hit.dia;
			const d = S.dia.find(p => p.id === hit.dia);
			DIA.drag = d ? { pat: d, off0: d.off || 0, mn0: xToMin(x) } : null;
			renderDiaList();
		} else {
			DIA.drag = null;
		}
		drawDia();
	});

	cv.addEventListener('pointermove', e => {
		if (!last) return;
		const r = cv.getBoundingClientRect();
		const x = e.clientX - r.left;
		if (DIA.drag) {
			// パターン全体をずらす
			const d = DIA.drag.pat;
			const delta = Math.round(xToMin(x) - DIA.drag.mn0);
			const ev = Math.max(1, d.every);
			d.off = ((DIA.drag.off0 + delta) % ev + ev) % ev;
			diaCompileSoon();
			drawDia();
		} else {
			// 時刻を動かす
			DIA.t0 -= (x - last.x) / (DIA.w - LABEL_W) * DIA.span;
			DIA.t0 = Math.max(0, Math.min(1440 - DIA.span, DIA.t0));
			last.x = x;
			drawDia();
		}
	});

	const end = () => { last = null; if (DIA.drag) { DIA.drag = null; compileSched(); renderDiaList(); } };
	cv.addEventListener('pointerup', end);
	cv.addEventListener('pointercancel', end);
}

/* ---- パターン一覧とインスペクタ ---- */
function patLabel(d) {
	const m = modelOf(d.m);
	return m.name + ' ' + d.cars + '両';
}
function patSub(d) {
	return (d.track + 1) + '番線 / ' + clockOf(d.from) + '〜' + clockOf(d.to)
		+ ' / ' + d.every + '分毎 / 停車' + d.dwell + '秒';
}

function renderDiaList() {
	const el = document.getElementById('diaList');
	if (!el) return;
	el.innerHTML = '';
	const badIds = {};
	for (const it of R.issues) badIds[it.dia] = true;

	for (const d of S.dia) {
		const row = document.createElement('div');
		row.className = 'diaRow' + (DIA.sel === d.id ? ' sel' : '') + (badIds[d.id] ? ' bad' : '');
		const T = TYPES[d.ty];
		row.innerHTML =
			'<span class="ty" style="background:#' + T.col.toString(16).padStart(6, '0') + '">' + T.abbr + '</span>' +
			'<span class="tx"><b>' + patLabel(d) + '</b><span>' + patSub(d) + '</span></span>';
		const del = document.createElement('button');
		del.className = 'del'; del.textContent = '✕';
		del.onclick = ev => {
			ev.stopPropagation();
			S.dia = S.dia.filter(x => x.id !== d.id);
			if (DIA.sel === d.id) DIA.sel = null;
			compileSched(); renderDiaList(); drawDia(); save();
		};
		row.appendChild(del);
		row.onclick = () => { DIA.sel = DIA.sel === d.id ? null : d.id; renderDiaList(); drawDia(); };
		el.appendChild(row);

		if (DIA.sel === d.id) el.appendChild(buildInspector(d));
	}
	if (!S.dia.length) {
		el.innerHTML = '<p class="hint">パターンがありません。まず「契約」タブで編成を契約してから、下の＋で追加してください。</p>';
	}
	if (S.nTrack > 1 || S.lines > 1) el.appendChild(buildLineMap());
	renderDiaStat();
}

/* 番線がどの本線に属するか。1本線に2番線を割り当てると1分間隔が出せる */
function buildLineMap() {
	const box = document.createElement('div');
	box.style.cssText = 'background:rgba(0,0,0,.22);border-radius:9px;padding:8px 9px;margin-top:8px;';
	const cap = Math.min(S.lines * 3600 / CFG.LINE_HEAD, S.nTrack * 3600 / CFG.TRACK_HEAD);
	box.innerHTML = '<p class="hint" style="margin:0 0 6px">番線と本線の割り当て　'
		+ '<b style="color:#7ee0a0">理論上限 ' + cap + '本/時</b></p>';
	for (let t = 0; t < S.nTrack; t++) {
		box.appendChild(stepper((t + 1) + '番線', () => lineOf(t),
			v => {
				const n = S.lines;
				if (!S.trackLine) S.trackLine = [];
				S.trackLine[t] = ((v % n) + n) % n;
			}, v => '本線' + (v + 1)));
	}
	const note = document.createElement('p');
	note.className = 'hint';
	note.style.margin = '6px 2px 0';
	const per = [];
	for (let l = 0; l < S.lines; l++) per.push('本線' + (l + 1) + ':' + lineTracks(l) + '番線');
	note.textContent = per.join(' / ') + '　同じ本線に2番線あると、交互発車で本線の上限まで出せます。';
	box.appendChild(note);
	return box;
}

// step は増減の刻み。丸め幅より小さいと押しても値が戻ってしまうので必ず合わせる
function stepper(label, get, set, fmt, step) {
	const st = step || 1;
	const row = document.createElement('div');
	row.className = 'stepRow';
	row.innerHTML = '<span>' + label + '</span>';
	const mk = (t, dv) => {
		const b = document.createElement('button');
		b.textContent = t;
		b.onclick = () => { set(get() + dv); compileSched(); renderDiaList(); drawDia(); save(); };
		return b;
	};
	row.appendChild(mk('−', -st));
	const v = document.createElement('span');
	v.className = 'val'; v.textContent = fmt(get());
	row.appendChild(v);
	row.appendChild(mk('＋', st));
	return row;
}

function buildInspector(d) {
	const box = document.createElement('div');
	box.style.cssText = 'background:rgba(0,0,0,.22);border-radius:9px;padding:8px 9px;margin:-2px 0 8px;';

	// 種別
	const tyRow = document.createElement('div');
	tyRow.className = 'stepRow';
	tyRow.innerHTML = '<span>種別</span>';
	for (const T of TYPES) {
		const b = document.createElement('button');
		b.className = 'wide';
		b.textContent = T.name;
		b.style.background = d.ty === T.id ? '#' + T.col.toString(16).padStart(6, '0') : 'rgba(255,255,255,.1)';
		b.style.color = d.ty === T.id ? '#10161d' : '#e8eef7';
		if (S.rank < T.rank) { b.disabled = true; b.style.opacity = '.4'; b.textContent = T.name + '(未解禁)'; }
		b.onclick = () => { d.ty = T.id; compileSched(); renderDiaList(); drawDia(); save(); };
		tyRow.appendChild(b);
	}
	box.appendChild(tyRow);

	// 契約済みの「形式×両数」から選ぶ
	const combos = S.fleet.map(f => ({ m: f.m, cars: f.cars }));
	if (combos.length) {
		const at = Math.max(0, combos.findIndex(c => c.m === d.m && c.cars === d.cars));
		box.appendChild(stepper('編成', () => at,
			v => {
				const n = combos.length;
				const c = combos[((v % n) + n) % n];
				d.m = c.m; d.cars = c.cars;
			},
			v => modelOf(combos[((v % combos.length) + combos.length) % combos.length].m).name
				+ ' ' + combos[((v % combos.length) + combos.length) % combos.length].cars + '両'));
	}

	box.appendChild(stepper('番線', () => d.track,
		v => { d.track = Math.max(0, Math.min(S.nTrack - 1, v)); }, v => (v + 1) + '番線'));
	box.appendChild(stepper('間隔', () => d.every,
		v => {
			d.every = Math.max(2, Math.min(240, v));
			// ずらしが間隔以上だと先頭が展開されず、黙って本数が減る
			d.off = ((d.off || 0) % d.every + d.every) % d.every;
		}, v => v + '分毎'));
	box.appendChild(stepper('ずらし', () => d.off || 0,
		v => { const e = Math.max(1, d.every); d.off = ((v % e) + e) % e; }, v => v + '分'));
	box.appendChild(stepper('停車', () => d.dwell,
		v => { d.dwell = Math.max(15, Math.min(300, Math.round(v / 5) * 5)); }, v => v + '秒', 5));
	box.appendChild(stepper('開始', () => d.from,
		v => { d.from = Math.max(0, Math.min(d.to - 30, Math.round(v / 30) * 30)); }, clockOf, 30));
	box.appendChild(stepper('終了', () => d.to,
		v => { d.to = Math.max(d.from + 30, Math.min(1440, Math.round(v / 30) * 30)); }, clockOf, 30));

	// 停車時間で捌ける人数
	const cap = slotCap(d.m, d.cars), flow = slotFlow(d.m, d.cars);
	const room = Math.round(cap * CFG.LOAD_ROOM);
	const canBoard = Math.round(flow * d.dwell);
	const info = document.createElement('p');
	info.className = 'hint';
	info.style.margin = '6px 2px 0';
	info.textContent = '定員' + cap + '人 / ドア扱い' + flow.toFixed(1) + '人・秒。'
		+ '停車' + d.dwell + '秒なら最大' + canBoard + '人を捌けるが、'
		+ '空き容量は約' + room + '人（降車が多いほど増える）。';
	box.appendChild(info);
	return box;
}

function renderDiaStat() {
	const el = document.getElementById('diaStat');
	if (!el) return;
	el.innerHTML = '本日 <b>' + R.sched.length + '本</b><br>'
		+ '所要' + R.need + ' / 契約' + R.have
		+ (R.short > 0 ? ' <i>' + R.short + '本不足</i>' : '');
	const is = document.getElementById('diaIssues');
	if (is) {
		const seen = {}, lines = [];
		for (const it of R.issues) {
			if (seen[it.msg]) { seen[it.msg]++; continue; }
			seen[it.msg] = 1; lines.push(it.msg);
			if (lines.length >= 4) break;
		}
		is.innerHTML = lines.map(m => '<div>⚠ ' + m + (seen[m] > 1 ? '（' + seen[m] + '件）' : '') + '</div>').join('');
	}
}

/* ---- 契約タブ ---- */
function renderFleet() {
	const have = document.getElementById('fleetHave');
	const shop = document.getElementById('fleetShop');
	if (!have || !shop) return;

	have.innerHTML = S.fleet.length
		? S.fleet.map(f => {
			const m = modelOf(f.m);
			return '<div class="mdl"><div class="h"><b>' + m.name + ' ' + f.cars + '両</b>'
				+ '<span>×' + f.n + '本</span><i>リース ' + yen(contractLease(f.m, f.cars) * f.n) + '/日</i></div></div>';
		}).join('')
		: '<p class="hint">まだ1本も契約していません。下から契約すると、ダイヤに置けるようになります。</p>';

	shop.innerHTML = '';
	for (const m of MODELS) {
		const locked = S.rank < m.rank;
		const div = document.createElement('div');
		div.className = 'mdl' + (locked ? ' locked' : '');
		div.innerHTML = '<div class="h"><b>' + m.name + '</b><span>定員' + m.cap + '人/両・'
			+ m.kmh + 'km/h・' + m.fit.map(t => TYPES[t].name).join('/') + '</span>'
			+ '<i>' + (locked ? RANKS[m.rank].name + 'から' : yen(m.price) + '/両') + '</i></div>';
		const cars = document.createElement('div');
		cars.className = 'cars';
		for (const c of m.cars) {
			const b = document.createElement('button');
			const price = contractPrice(m.id, c);
			b.textContent = c + '両 ' + yen(price);
			b.disabled = locked || c > S.cars || S.money < price;
			if (c > S.cars) b.textContent = c + '両 (ホーム' + S.cars + '両)';
			b.onclick = () => {
				if (S.money < price) return;
				S.money -= price;
				const f = S.fleet.find(x => x.m === m.id && x.cars === c);
				if (f) f.n++; else S.fleet.push({ m: m.id, cars: c, n: 1 });
				compileSched(); renderFleet(); renderDiaList(); save();
			};
			cars.appendChild(b);
		}
		div.appendChild(cars);
		shop.appendChild(div);
	}
}

/* ---- 開閉 ---- */
function openDia() {
	DIA.open = true;
	document.getElementById('diaSheet').hidden = false;
	DIA.savedSpeed = R.speed;
	R.speed = 0;                       // 編集中は時間を止める
	document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', +x.dataset.speed === 0));
	if (!DIA.cv) initDiaCanvas();
	diaResize();
	renderDiaList(); renderFleet(); drawDia();
}
function closeDia() {
	DIA.open = false;
	document.getElementById('diaSheet').hidden = true;
	if (DIA.savedSpeed !== undefined) {
		R.speed = DIA.savedSpeed;
		document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', +x.dataset.speed === R.speed));
	}
	compileSched(); save();
}

function initDiaUI() {
	document.getElementById('diaBtn').onclick = openDia;
	document.getElementById('diaClose').onclick = closeDia;

	document.querySelectorAll('#diaSheet .seg button').forEach(b => {
		b.onclick = () => {
			DIA.tab = b.dataset.tab;
			document.querySelectorAll('#diaSheet .seg button').forEach(x => x.classList.toggle('on', x === b));
			document.getElementById('diaPane').hidden = DIA.tab !== 'dia';
			document.getElementById('fleetPane').hidden = DIA.tab !== 'fleet';
			if (DIA.tab === 'dia') { diaResize(); drawDia(); } else renderFleet();
		};
	});

	document.querySelectorAll('#diaZoom button').forEach(b => {
		b.onclick = () => {
			const c = DIA.t0 + DIA.span / 2;
			DIA.span = +b.dataset.span;
			DIA.t0 = Math.max(0, Math.min(1440 - DIA.span, c - DIA.span / 2));
			document.querySelectorAll('#diaZoom button').forEach(x => x.classList.toggle('on', x === b));
			drawDia();
		};
	});

	document.getElementById('diaAdd').onclick = () => {
		if (!S.fleet.length) {
			alertOnce('nofleet', '先に「契約」タブで編成を契約してください', false, 5);
			return;
		}
		const f = S.fleet[0];
		const d = {
			id: S.diaId++, m: f.m, cars: f.cars, ty: 0,
			track: 0, from: 60, to: 20 * 60, every: 30, off: 0, dwell: 45,
		};
		S.dia.push(d);
		DIA.sel = d.id;
		compileSched(); renderDiaList(); drawDia(); save();
	};

	window.addEventListener('resize', () => { if (DIA.open) { diaResize(); drawDia(); } });
}

/* ================= UI ================= */
function yen(v) {
	if (v >= 1e8) return '¥' + (v / 1e8).toFixed(2) + '億';
	if (v >= 1e4) return '¥' + Math.round(v / 1e4).toLocaleString() + '万';
	return '¥' + Math.round(v).toLocaleString();
}
function num(v) { return Math.round(v).toLocaleString(); }

const UI = {};
function initUI() {
	['rankBox', 'clockBox', 'moneyBox', 'paxBox', 'waitBox', 'satBox', 'townBox',
		'rankFill', 'rankNext', 'alert', 'logList'].forEach(id => UI[id] = document.getElementById(id));

	document.querySelectorAll('#speed button').forEach(b => {
		b.onclick = () => {
			R.speed = +b.dataset.speed;
			document.querySelectorAll('#speed button').forEach(x => x.classList.remove('active'));
			b.classList.add('active');
		};
	});

	const sheet = document.getElementById('sheet');
	document.getElementById('buildBtn').onclick = () => { renderUpgrades(); renderDevs(); sheet.hidden = false; };
	document.getElementById('sheetClose').onclick = () => { sheet.hidden = true; };
	document.querySelectorAll('#upSeg button').forEach(b => {
		b.onclick = () => {
			document.querySelectorAll('#upSeg button').forEach(x => x.classList.toggle('on', x === b));
			const dev = b.dataset.up === 'dev';
			document.getElementById('facPane').hidden = dev;
			document.getElementById('devPane').hidden = !dev;
			if (dev) renderDevs(); else renderUpgrades();
		};
	});

	initDiaUI();

	const logSheet = document.getElementById('logSheet');
	document.getElementById('logBtn').onclick = () => { renderLog(); logSheet.hidden = false; };
	document.getElementById('logClose').onclick = () => { logSheet.hidden = true; };

	document.getElementById('resetBtn').onclick = () => {
		if (!confirm('セーブを削除して最初からやり直しますか？')) return;
		noSave = true;
		localStorage.removeItem(SAVE_KEY);
		location.reload();
	};
}

function alertOnce(key, msg, good, cooldown) {
	if (R.lastAlert[key] && R.now - R.lastAlert[key] < (cooldown === 0 ? 1e9 : cooldown * 60)) return;
	R.lastAlert[key] = R.now;
	const d = document.createElement('div');
	if (good) d.className = 'good';
	d.textContent = msg;
	UI.alert.appendChild(d);
	setTimeout(() => d.remove(), 3600);
}

let uiTick = 0;
function updateUI(rdt) {
	uiTick += rdt;
	if (uiTick < 0.2) return;
	uiTick = 0;

	const h = hourOfDay();
	const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
	const gtxt = gateCount() === 0 ? ' 改札なし'
		: ' 改札' + (S.gateM ? '手' + S.gateM : '') + (S.gateA ? '自' + S.gateA : '');
	UI.clockBox.textContent = S.day + '日目 ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
		+ ' · ' + LINK_NAME[S.link] + ' ' + S.cars + '両 ' + S.nPlat + '面' + S.nTrack + '線' + gtxt;
	UI.moneyBox.textContent = yen(S.money);
	UI.rankBox.textContent = RANKS[S.rank].name;
	UI.paxBox.textContent = num(S.todayPax);

	let waiting = 0;
	for (let i = 0; i < R.waitW.length; i++) waiting += R.waitW[i] || 0;
	const outside = (R.inQ.length - R.inQHead) * R.paxScale;
	UI.waitBox.textContent = num(waiting) + (outside > 0 ? '+' + num(outside) : '');
	UI.satBox.textContent = Math.round(S.rep);
	UI.townBox.textContent = S.town.toFixed(1);

	// シートを開いたまま資金が貯まったら買えるようにする
	const sheet = document.getElementById('sheet');
	if (!sheet.hidden) {
		for (const b of sheet.querySelectorAll('.up')) {
			const u = b._u;
			if (!u) continue;
			const ok = u.can(), c = Math.round(u.cost());
			b.disabled = !ok || S.money < c;
			b.querySelector('.pr').textContent = ok ? yen(c) : u.ng();
			b.querySelector('.tx span').textContent = descOf(u);
		}
	}

	const next = RANKS[S.rank + 1];
	if (next) {
		const cur = RANKS[S.rank].need;
		// 朝いちで0%に戻らないよう、前日実績と当日実績の大きい方で表示する
		const pax = Math.max(S.todayPax, S.yesterdayPax);
		const pr = Math.max(0, Math.min(1, (pax - cur) / (next.need - cur)));
		UI.rankFill.style.width = (pr * 100).toFixed(1) + '%';
		UI.rankNext.textContent = '次: ' + next.name + ' まで 1日 ' + num(next.need) + '人';
	} else {
		UI.rankFill.style.width = '100%';
		UI.rankNext.textContent = '最高ランク達成！';
	}

	// 詰まりの警告
	if (waiting > 900) alertOnce('crowd', '⚠ ホームが大混雑 — 線路/ホームが足りません', false, 30);
	const gq = R.gateFree.length ? Math.max.apply(null, R.gateFree) - R.now : 0;
	if (gq > 90) alertOnce('gate', '⚠ 改札に長い行列 — 改札を増設', false, 30);
	if (gateCount() === 0) {
		alertOnce('nogate', '⚠ 改札が無く運賃を取りこぼしています', false, 90);
	}
	let sq = 0;
	for (let i = 0; i < R.stairFree.length; i++) {
		for (let k = 0; k < S.stairs; k++) sq = Math.max(sq, R.stairFree[i][k] - R.now);
	}
	if (sq > 90) alertOnce('stair', '⚠ 階段が渋滞 — 階段/エスカレーターを検討', false, 30);
	if (S.money < 0) alertOnce('debt', '⚠ 赤字です', false, 60);
}

function renderLog() {
	const el = UI.logList;
	if (!S.log.length) {
		el.innerHTML = '<p class="hint">1日の営業が終わると（毎朝4時）ここに日報が届きます。</p>';
		return;
	}
	el.innerHTML = S.log.map(r => {
		const run = r.run || 0, lease = r.lease || 0, fixed = r.fixed !== undefined ? r.fixed : r.cost - lease;
		const profit = r.rev - r.cost - run;
		return '<div class="rep"><b>' + r.day + '日目</b><i>' + r.rank + '</i><br>' +
			'乗降 <b>' + num(r.pax) + '</b>人<i>満足度 ' + r.sat + '</i><br>' +
			'運賃収入 ' + yen(r.rev) + (r.trains ? '<i>' + r.trains + '本</i>' : '') + '<br>' +
			'　リース ' + yen(-lease) + '<br>' +
			'　運行費 ' + yen(-run) + '<br>' +
			'　施設維持 ' + yen(-fixed) + '<br>' +
			'<b style="color:' + (profit >= 0 ? '#7ee0a0' : '#ff8a7a') + '">損益 ' +
			(profit >= 0 ? '+' : '−') + yen(Math.abs(profit)) + '</b>' +
			'<i>街 ' + r.town.toFixed(2) + '</i></div>';
	}).join('');
}

/* ================= 描画 ================= */
function renderPax() {
	const n = Math.min(R.pax.length, CFG.MAX_PAX);
	const t = R.now;
	for (let i = 0; i < n; i++) {
		const p = R.pax[i];
		// 歩いている間だけ上下に揺らす
		const bob = p.state === 'walk' ? Math.sin(t * 5.5 + p.ph) * 0.035 : 0;
		dummy.position.set(p.x, p.y + bob, p.z);
		dummy.rotation.y = p.head;
		dummy.updateMatrix();
		paxMesh.setMatrixAt(i, dummy.matrix);
		// 配列が詰められてインデックスがずれるので色は毎フレーム書く
		paxMesh.setColorAt(i, p.col);
	}
	paxMesh.count = n;
	paxMesh.instanceMatrix.needsUpdate = true;
	if (paxMesh.instanceColor) paxMesh.instanceColor.needsUpdate = true;
}

// 遮断桿の上げ下ろし。閉=水平、開=垂直
function updateGateArms(rdt) {
	if (!G.gateArms || !G.gateArms.length) return;
	const target = R.crossClosed ? 0 : 1;
	G.armT = G.armT === undefined ? target : G.armT + (target - G.armT) * Math.min(1, rdt * 2.2);
	const a = G.armT * Math.PI / 2;      // 0=水平(閉) → π/2=垂直(開)
	for (const g of G.gateArms) {
		g.mesh.rotation.z = -g.s * a;
		// 支点を軸に回るよう位置も合わせる
		const half = 3.25;
		g.mesh.position.set(g.px - g.s * half * Math.cos(a), 2.2 + half * Math.sin(a), g.z);
	}
}

/* ================= メインループ ================= */
function simulate(gameSeconds) {
	let remain = gameSeconds;
	let guard = 0;
	while (remain > 0.0001 && guard++ < 64) {
		const dt = Math.min(CFG.MAX_SUB_DT, remain);
		remain -= dt;
		S.t += dt;
		R.now += dt;
		updateDemand(dt);
		updateTrains(dt);
		updatePax(dt);
		if (S.t >= 86400) { S.t -= 86400; endOfDay(); }
	}
}

let last = 0;
function loop(now) {
	requestAnimationFrame(loop);
	const rdt = Math.min(0.05, (now - last) / 1000 || 0);
	last = now;

	if (R.speed > 0) simulate(rdt * R.speed);

	renderPax();
	updateGateArms(rdt);
	updateSky();
	updateUI(rdt);
	controls.update();
	renderer.render(scene, camera);
}

/* ================= 起動 ================= */
function boot() {
	load();
	initThree();
	initUI();
	resetRuntimeForLayout();
	buildStation();
	fitCamera();
	G.night = -1;
	updateSky();
	renderLog();
	requestAnimationFrame(loop);
	window.addEventListener('beforeunload', save);
	setInterval(save, 30000);

	// デバッグ用: コンソールから sim.step(3600) で1時間進められる
	window.sim = {
		get S() { return S; }, R, CFG, G,
		get three() { return { renderer, scene, camera, controls, sun, stationGroup, trainGroup, cityGroup }; },
		// 開発用: 指定サイズで1枚描いてサーバーに保存する(serve.mjs --dev が必要)
		shot: (w, h, hour) => {
			if (hour !== undefined) { S.t = ((hour - 4 + 24) % 24) * 3600; updateSky(); }
			const ow = renderer.domElement.width, oh = renderer.domElement.height;
			renderer.setSize(w || 1280, h || 800, false);
			camera.aspect = (w || 1280) / (h || 800);
			camera.updateProjectionMatrix();
			renderPax();
			renderer.render(scene, camera);
			const url = renderer.domElement.toDataURL('image/png');
			renderer.setSize(ow, oh, false);
			camera.aspect = ow / oh; camera.updateProjectionMatrix();
			return fetch('/__shot', { method: 'POST', body: url }).then(r => r.text());
		},
		reset: () => { noSave = true; localStorage.removeItem(SAVE_KEY); location.reload(); },
		// S を直接いじった後に呼ぶ(レイアウト反映)
		rebuild: () => { resetRuntimeForLayout(); buildStation(); renderUpgrades(); },
		// 契約: 形式ID, 両数, 本数
		hire: (mid, cars, n) => {
			const m = modelOf(mid);
			if (m.cars.indexOf(cars) < 0) return '両数が組めない: ' + m.cars.join('/');
			const cost = contractPrice(mid, cars) * (n || 1);
			if (S.money < cost) return '資金不足 ' + yen(cost);
			S.money -= cost;
			const f = S.fleet.find(x => x.m === mid && x.cars === cars);
			if (f) f.n += (n || 1); else S.fleet.push({ m: mid, cars: cars, n: n || 1 });
			compileSched(); renderUpgrades();
			return 'ok ' + yen(cost);
		},
		// ダイヤ: パターン1行を追加 {m,cars,ty,track,from,to,every,off,dwell} 分単位
		addDia: (o) => {
			const d = Object.assign({
				id: S.diaId++, m: 'kiha40', cars: 2, ty: 0, track: 0,
				from: 5 * 60, to: 24 * 60, every: 30, off: 0, dwell: 45,
			}, o || {});
			// from/to は 4:00 起点の分に直す
			d.from = (d.from - 4 * 60 + 1440) % 1440;
			d.to = d.from + (o.to - o.from);
			S.dia.push(d);
			compileSched();
			return { id: d.id, slots: R.sched.length, need: R.need, short: R.short, issues: R.issues.slice(0, 4) };
		},
		dia: () => ({ fleet: S.fleet, dia: S.dia, slots: R.sched.length, need: R.need, have: R.have, short: R.short, issues: R.issues.slice(0, 6) }),
		ui: DIA,
		minToX: minToX, xToMin: xToMin,
		step: sec => {
			for (let r = sec; r > 0; r -= 30) simulate(Math.min(30, r));
			renderPax(); uiTick = 1; updateUI(0);
		},
		buy: id => {
			const u = UPGRADES.find(x => x.id === id);
			if (!u || !u.can()) return false;
			const c = Math.round(u.cost());
			if (S.money < c) return false;
			S.money -= c;
			u.apply(); resetRuntimeForLayout(); buildStation(); renderUpgrades();
			return true;
		},
	};
}

boot();
})();
