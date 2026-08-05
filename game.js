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
	MAX_PAX: 2200,         // 高速再生時のエージェント上限
	// 速度でディテールを切り替える。等倍のときは1体=1人にして実際に行列を作る
	DETAIL_SPEED: 4,       // これ以下の速度なら詳細モード
	MAX_PAX_DETAIL: 6000,  // 詳細モードの上限(iPhone 17 Pro 前提)
	QUEUE_PITCH: 0.55,     // 行列の1人あたりの間隔(m)
	MAX_STAIRS: 6,
	STUCK_EVICT: 45,       // 歩行中に動けない状態がこれだけ続いた客は追い出す(ゲーム秒)
	STUCK_SPD: 0.01,       // 「動けていない」とみなす速さ(m/s)
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

/* ================= 盤面(グリッド) =================
   1マス2m。1両=10マス、15両=150マス、線路1本=2マス幅(4m)。
   索引はZ最速。線路もホームもZに長いので、保存時のRLEのラン数が桁で減る。
   レイヤーは 0=地上 / 1=上階または地下(S.linkで決まる)の2枚。
   セル種別は追記のみ。欠番の再利用は禁止(既存セーブが静かに壊れるため) */
const GRID = { CELL: 2, W: 176, D: 224, L: 2, OX: 88, OZ: 112 };

const C_EMPTY = 0, C_RAIL_L = 1, C_RAIL_R = 2, C_PLAT = 3, C_FLOOR = 4,
	C_WALL = 5, C_STAIR = 6, C_ESCAL = 7, C_GATE = 8, C_UNUSED9 = 9,
	C_SHOP = 10, C_VEND = 11, C_BENCH = 12, C_PILLAR = 13, C_ENTRANCE = 14,
	C_ROAD = 15, C_BLDG = 16,
	C_OOB = 255;

// 属性ビット。踏切は「線路の上に重なる」ので種別ではなくビットで持つ。
// 種別にすると線路の連なりが分断され、番線として検出されなくなる
const F_ROOF = 1, F_CROSS = 2;

// 歩ける種別か
const WALKABLE = {};
for (const t of [C_PLAT, C_FLOOR, C_STAIR, C_ESCAL, C_GATE, C_ENTRANCE, C_SHOP, C_VEND, C_BENCH]) WALKABLE[t] = 1;

// 踏切が敷かれた線路セルも歩ける(列車接近時は R.crossOpenAt で閉じる)
function walkableAt(l, x, z) {
	const t = tAt(l, x, z);
	if (WALKABLE[t]) return true;
	if ((t === C_RAIL_L || t === C_RAIL_R) && (B.f[gidx(l, x, z)] & F_CROSS)) return true;
	return false;
}

const B = {
	t: null,   // 種別
	f: null,   // 属性ビット(bit0=上家)
	o: null,   // 設備の永続ID(0=なし)。fid は 65535 を超えうるので Int32
	objs: null,
	sk: null,  // gridSkeleton() が書いた骨格の寸法
	nextId: 1,
};

// 設備IDの発番。Stage4 では S.nextFid に移す
function facNextId() { return B.nextId++; }

function gidx(l, x, z) { return (l * GRID.W + x) * GRID.D + z; }
function inBoard(x, z) { return x >= 0 && x < GRID.W && z >= 0 && z < GRID.D; }
function tAt(l, x, z) { return inBoard(x, z) ? B.t[gidx(l, x, z)] : C_OOB; }
function setT(l, x, z, v) { if (inBoard(x, z)) B.t[gidx(l, x, z)] = v; }

// 盤 ↔ ワールド座標
function wx(gx) { return (gx - GRID.OX + 0.5) * GRID.CELL; }
function wz(gz) { return (gz - GRID.OZ + 0.5) * GRID.CELL; }
function cx(X) { return Math.floor(X / GRID.CELL) + GRID.OX; }
function cz(Z) { return Math.floor(Z / GRID.CELL) + GRID.OZ; }

function boardAlloc() {
	const n = GRID.W * GRID.D * GRID.L;
	B.t = new Uint8Array(n);
	B.f = new Uint8Array(n);
	B.o = new Int32Array(n);
	B.objs = new Map();
	B.nextId = 1;
}

function fillRect(l, x0, x1, z0, z1, type) {
	for (let x = Math.max(0, x0); x <= Math.min(GRID.W - 1, x1); x++) {
		for (let z = Math.max(0, z0); z <= Math.min(GRID.D - 1, z1); z++) {
			B.t[gidx(l, x, z)] = type;
		}
	}
}

// 動線そのものになる設備。あとから置くものに潰させない
function isFlowFac(t) { return t === C_GATE || t === C_STAIR || t === C_ESCAL; }

/* 設備を置く。占有セルに種別とIDを書く。
   改札・階段は乗客の動線そのものなので、あとから置く店や自販機に上書きさせない。
   ここを素通しにすると、盤面から改札が消えて乗客が無賃で通り抜ける */
function placeFac(kind, l, x, z, w, d, cell, fid, meta) {
	const id = fid;
	// meta は設備番号(階段 kk / 改札 jj)。B.o はあとから置いた設備に奪われるので、
	// セル→設備の逆引きは必ずこのレコードから作る
	let wrote = 0;
	for (let i = 0; i < w; i++) {
		for (let j = 0; j < d; j++) {
			if (!inBoard(x + i, z + j)) continue;
			const k = gidx(l, x + i, z + j);
			if (!isFlowFac(cell) && isFlowFac(B.t[k])) continue;   // 動線は守る
			B.t[k] = cell;
			B.o[k] = id;
			wrote++;
		}
	}
	if (!wrote) return -1;
	B.objs.set(id, Object.assign({ i: id, k: kind, l: l, x: x, z: z, w: w, d: d }, meta));
	return id;
}

/* ---- いまのパラメトリックな駅から盤面を起こす ----
   ワールド座標から変換すると量子化で線路とホームの間に隙間が出るので、
   盤面の上で直接レイアウトする。これで隣接が構造的に保証される */
const CAR_CELLS = CFG.CAR_LEN / GRID.CELL;   // 1両 = 10マス

/* 盤面の指紋。Stage4 で盤面の作りかたを組み替えるとき、
   「挙動が1セルも変わっていない」ことを機械的に確かめるための物差し。
   種別・属性ビットと、設備の種別×位置×大きさを混ぜる */
function boardHash() {
	let h = 2166136261 >>> 0;
	const mix = v => { h ^= v & 255; h = Math.imul(h, 16777619) >>> 0; };
	for (let i = 0; i < B.t.length; i++) { mix(B.t[i]); mix(B.f[i]); }
	const objs = Array.from(B.objs.values())
		.map(o => o.k + ':' + o.l + ',' + o.x + ',' + o.z + ',' + o.w + ',' + o.d
			+ (o.jj !== undefined ? ',j' + o.jj : '') + (o.kk !== undefined ? ',k' + o.plat + '.' + o.kk : ''))
		.sort();
	for (const t of objs) for (let i = 0; i < t.length; i++) mix(t.charCodeAt(i));
	return (h >>> 0).toString(16).padStart(8, '0') + '/' + objs.length;
}

/* ---- 骨格 ----
   ホーム・線路・駅舎の外形・出入口・構内踏切。増築ボタンで数を買うもの。
   設備(改札・階段・店・自販機)は置かない。それは facPlaceAll() の仕事 */
/* いまの設備数がちょうど収まる駅舎の大きさ。
   Stage4 でプレイヤーが床を買うようになるまでの繋ぎで、盤面を焼く直前に呼ぶ。
   ここを消せば駅舎は S.bldN/bldD/bldW のままになり、改札を買っても動かなくなる */
function bldFit() {
	if (hasLink()) {
		const n = Math.max(4, Math.round(G.over / GRID.CELL));
		S.bldN = Math.max(S.bldN, n);
		S.bldD = Math.max(S.bldD, Math.max(8, Math.round(G.concD / GRID.CELL)) - n);
		S.bldW = Math.max(S.bldW, 0);
	} else {
		S.bldW = Math.max(S.bldW, Math.max(6, Math.ceil(gateCount() * 1.2) + 4) - 6);
		S.bldD = Math.max(S.bldD, Math.max(7, Math.ceil(gateCount() * 0.6) + 6) + (S.shops ? 5 : 0) - 7);
	}
}

/* ---- 線路とホームを盤面に敷く ----
   どちらもユーザーが置いたもの(S.rail / S.plat)がそのまま正 */
function layTrackAndPlat() {
	// 線路は左レールの列。盤の端から端まで通す(外へ繋がっている扱い)
	for (const c of S.rail) {
		if (!inBoard(c.x, 0) || !inBoard(c.x + 1, 0)) continue;
		fillRect(0, c.x, c.x, 0, GRID.D - 1, C_RAIL_L);
		fillRect(0, c.x + 1, c.x + 1, 0, GRID.D - 1, C_RAIL_R);
	}
	// ホームは1マスずつ。線路の上には書かない
	for (const c of S.plat) {
		if (!inBoard(c.x, c.z)) continue;
		const k = gidx(0, c.x, c.z);
		if (B.t[k] !== C_EMPTY) continue;
		B.t[k] = C_PLAT;
		B.f[k] |= F_ROOF;
	}
}

/* ---- 駅舎(橋上/地下)と出入口 ----
   幾何が決まったあとに敷く。地平駅は駅舎を建てない */
function layStructure() {
	if (!DV.plats.length) { B.sk = { LU: 0, pw: 1, unit: 0, startX: GRID.OX, plen: 1,
		pz0: GRID.OZ, pz1: GRID.OZ, px0: [], fx0: GRID.OX, fx1: GRID.OX, fz0: GRID.OZ, fz1: GRID.OZ }; return; }
	const LU = hasLink() ? 1 : 0;
	bldFit();
	let fx0, fx1, fz0, fz1;
	const px0 = DV.plats.length ? DV.plats[0].x0 : GRID.OX - 1;
	const px1 = DV.plats.length ? DV.plats[DV.plats.length - 1].x1 : GRID.OX + 1;
	let pz0 = GRID.OZ - 1, pz1 = GRID.OZ + 1;
	if (DV.plats.length) {
		pz0 = Math.min.apply(null, DV.plats.map(p => p.z0));
		pz1 = Math.max.apply(null, DV.plats.map(p => p.z1));
	}
	if (hasLink()) {
		fx0 = px0 - 1; fx1 = px1 + 1 + S.bldW;
		fz0 = pz1 - S.bldN;
		fz1 = pz1 + S.bldD;
		fx0 = Math.max(1, fx0); fx1 = Math.min(GRID.W - 2, fx1);
		fz0 = Math.max(1, fz0); fz1 = Math.min(GRID.D - 3, fz1);
		fillRect(LU, fx0, fx1, fz0, fz1, C_FLOOR);
		fillRect(LU, fx0 + 1, fx1 - 1, fz1, fz1 + 1, C_ENTRANCE);
	} else {
		// 田舎の地平駅。ホーム端から地面へ下りるとそこが駅前
		fx0 = px0; fx1 = px1;
		fz0 = pz0; fz1 = pz1;
		const ez = Math.min(GRID.D - 5, pz1 + 1);
		fillRect(0, fx0, fx1, ez, ez + 1, C_FLOOR);
		fillRect(0, fx0, fx1, ez + 2, ez + 3, C_ENTRANCE);
	}
	B.sk = { LU: LU, pw: Math.max(1, px1 - px0 + 1), unit: 0, startX: px0, plen: pz1 - pz0 + 1,
		pz0: pz0, pz1: pz1, px0: DV.plats.map(p => p.x0), fx0: fx0, fx1: fx1, fz0: fz0, fz1: fz1 };
}

/* 測定値を S へ写す。有効長・面数・線数はもう「置かれた結果」 */
function deriveLayout() {
	S.nPlat = Math.max(1, DV.plats.length);
	S.nTrack = Math.max(1, DV.tracks.length);
	S.cars = Math.max(CFG.CARS_MIN, Math.min(CFG.CARS_MAX, G.cars));
	if (DV.plats.length) S.platW = platWOf(0);
}

/* 旧セーブ(nPlat/nTrack/cars/platW)から線路とホームを起こす。
   移行した瞬間の見た目が変わらないよう、これまでの配置式をそのまま使う */
function migrateLayout() {
	const pw = Math.max(3, Math.round(S.platW / GRID.CELL));
	const unit = pw + 4;
	const startX = GRID.OX - Math.floor(S.nPlat * unit / 2);
	const plen = S.cars * CAR_CELLS;
	const pz0 = GRID.OZ - Math.floor(plen / 2), pz1 = pz0 + plen - 1;
	for (let i = 0; i < S.nPlat; i++) {
		const x0 = startX + i * unit + 2;
		for (let x = x0; x < x0 + pw; x++) {
			for (let z = pz0; z <= pz1; z++) S.plat.push({ x: x, z: z });
		}
		for (const side of [0, 1]) {
			if (i * 2 + side >= S.nTrack) continue;
			S.rail.push({ x: side ? x0 + pw : x0 - 2 });
		}
	}
	S.rail.sort((a, b) => a.x - b.x);
}

/* 開業時の姿。線路が1本あるだけで、ホームも何も無い */
function startingLayout() {
	S.rail = [{ x: GRID.OX - 1 }];
	S.plat = [];
	S.fac = []; S.nextFid = 1;
}

function gridFromParams() {
	boardAlloc();
	layTrackAndPlat();
	rebuildDerived();          // 線路の検出とホームの成分
	recalcGeometry();          // 幾何は盤面から
	deriveLayout();            // 面数・線数・有効長は測定値
	layStructure();            // 駅舎と出入口
	if (!S.fac.length) facSync();
	facPlaceAll();
	buildWalkGraph();          // 出入口の位置がここで確定する
	layTown();                 // 道路と建物(歩行の対象ではないので最後)
	facRebindRuntime();
}

/* ================= 設備 =================
   プレイヤーが駅舎とホームの上に置くもの。S.fac が唯一の正で、盤面には毎回そこから焼く。
   位置は「アンカー原点からの符号付きオフセット(マス)」で持つ。
   原点は 駅舎の西端 fx0 と ホーム南端 pz1 で、拡幅・延伸・面増設のどれでも動かない側なので、
   増築しても置いたものの相対位置が保たれる */
const K_GATEA = 0, K_GATEM = 1, K_STAIR = 2, K_ESCAL = 3, K_CONV = 4, K_VEND = 5;

// obj は B.objs のレコードの k(文字列)。3D生成がこれで分岐しているので変えない
const FACS = [
	/* K_GATEA */ { id: 'gateA', obj: 'gateA', name: '自動改札', w: 1, d: 1, cell: C_GATE, on: 'both', lane: 1, build: 120 },
	/* K_GATEM */ { id: 'gateM', obj: 'gateM', name: '手動改札', w: 1, d: 1, cell: C_GATE, on: 'both', lane: 1, build: 60 },
	/* K_STAIR */ { id: 'stair', obj: 'stair', name: '階段', w: 2, d: 5, cell: C_STAIR, on: 'plat', lane: 1, build: 900 },
	/* K_ESCAL */ { id: 'escal', obj: 'escal', name: 'エスカレーター', w: 2, d: 5, cell: C_ESCAL, on: 'plat', lane: 1, build: 1500 },
	/* K_CONV  */ { id: 'conv', obj: 'conv', name: '駅ナカ店舗', w: 3, d: 4, cell: C_SHOP, on: 'both', build: 1800 },
	/* K_VEND  */ { id: 'vend', obj: 'vend', name: '自販機', w: 1, d: 1, cell: C_VEND, on: 'both', build: 60 },
];

/* アンカー原点。a=0 は駅舎(コンコース層)、a=1 はホーム n(地上層) */
function facAnchor(a, n) {
	const SK = B.sk;
	if (a === 1) return { l: 0, ox: SK.px0[Math.min(n, SK.px0.length - 1)], oz: SK.pz1 };
	return { l: SK.LU, ox: SK.fx0, oz: SK.pz1 };
}
function facCell(r) {
	const A = facAnchor(r.a, r.n);
	return { l: A.l, x: A.ox + r.x, z: A.oz + r.z };
}

/* その位置の下地が正しいか。盤面を焼いている途中でも使うので、
   既に置かれた設備のセル(改札や店)は「別の設備がある」として弾かれる */
function facBaseOK(k, l, x, z) {
	const F = FACS[k];
	if (!inBoard(x, z) || !inBoard(x + F.w - 1, z + F.d - 1)) return false;
	for (let i = 0; i < F.w; i++) for (let j = 0; j < F.d; j++) {
		const t = B.t[gidx(l, x + i, z + j)];
		if (F.on === 'plat') {
			if (B.t[gidx(0, x + i, z + j)] !== C_PLAT) return false;
			if (B.t[gidx(B.sk.LU, x + i, z + j)] !== C_FLOOR) return false;
		} else if (F.on === 'both') {
			if (t !== C_FLOOR && t !== C_PLAT) return false;
		} else if (t !== C_FLOOR) return false;
	}
	return true;
}

/* 骨格が変わって置けなくなった設備を、近くの空いている場所へ移す。
   橋上化やホーム増設で駅舎が動くと、相対位置のままでは外へ出てしまう */
function facRelocate(r) {
	const SK = B.sk, F = FACS[r.k];
	if (F.on === 'plat') {
		if (!hasLink()) return false;
		for (let p = 0; p < S.nPlat; p++) {
			const n = (r.n + p) % S.nPlat, px = SK.px0[n];
			for (let z = Math.max(SK.pz0, SK.fz0); z + F.d - 1 <= Math.min(SK.pz1, SK.fz1); z++) {
				for (let x = px; x + F.w - 1 < px + SK.pw; x++) {
					if (!facBaseOK(r.k, 0, x, z)) continue;
					r.a = 1; r.n = n; r.x = x - px; r.z = z - SK.pz1;
					return true;
				}
			}
		}
		return false;
	}
	for (let z = SK.fz1; z >= SK.fz0; z--) {
		for (let x = SK.fx0; x + F.w - 1 <= SK.fx1; x++) {
			if (!facBaseOK(r.k, SK.LU, x, z)) continue;
			r.a = 0; r.n = 0; r.x = x - SK.fx0; r.z = z - SK.pz1;
			return true;
		}
	}
	return false;
}

// 1個だけ盤面に置く。骨格に収まらなければ false(レコードは捨てず休止にする)
function facPlaceOne(r) {
	const F = FACS[r.k];
	if (!F) return false;
	let c = facCell(r);
	// 下地が壊れていたら近くへ移す。それも駄目なら休止
	if (!facBaseOK(r.k, c.l, c.x, c.z)) {
		if (!facRelocate(r)) return false;
		c = facCell(r);
	}
	if (!inBoard(c.x, c.z) || !inBoard(c.x + F.w - 1, c.z + F.d - 1)) return false;
	const meta = r.k === K_STAIR || r.k === K_ESCAL ? { plat: r.n, kk: r.s || 0 }
		: (r.k === K_GATEA || r.k === K_GATEM) ? { jj: r.s || 0 } : undefined;
	return placeFac(F.obj, c.l, c.x, c.z, F.w, F.d, F.cell, r.i, meta) >= 0;
}

/* いまのパラメトリックな設定から「置くべき設備の一覧」を作る。
   Stage4 でプレイヤーが自分で置くようになるまでの自動レイアウト。
   返すのはアンカー相対のオフセットで、絶対座標には触れない */
function facAutoLayout() {
	const SK = B.sk, want = [];
	if (hasStairs()) {
		// 階段(2×5マス = 4×10m)。駅舎に覆われた範囲に等間隔で置く
		const sa = Math.max(SK.pz0 + 1, SK.fz0 + 1), sb = Math.min(SK.pz1 - 5, SK.fz1 - 5);
		for (let i = 0; i < S.nPlat; i++) {
			const px = SK.px0[i] + Math.max(0, Math.floor(SK.pw / 2) - 1);
			for (let k = 0; k < S.stairs; k++) {
				const sz = (S.stairs === 1 || sb <= sa) ? Math.round((sa + sb) / 2)
					: Math.round(sa + k * (sb - sa) / (S.stairs - 1));
				if (sz < 0 || sz + 4 >= GRID.D) continue;
				want.push({ k: S.esc ? K_ESCAL : K_STAIR, a: 1, n: i, s: k, x: px - SK.px0[i], z: sz - SK.pz1 });
			}
		}
	}
	// 改札(1×1)。駅舎の中に横一列、はみ出したら手前へ折り返す
	const total = gateCount();
	const cols = Math.max(1, SK.fx1 - SK.fx0 - 1);
	const gz = hasLink() ? SK.fz1 - 3 : SK.fz0 + 3;
	for (let j = 0; j < total; j++) {
		const row = Math.floor(j / cols), col = j % cols;
		const gzz = gz - row * 2;
		if (gzz > SK.fz0) want.push({ k: gateIsManual(j) ? K_GATEM : K_GATEA, a: 0, n: 0, s: j,
			x: 1 + col, z: gzz - SK.pz1 });
	}
	/* 駅ナカコンビニ(3×4 = 6×8m = 48m²。NewDaysの平均と一致)と自販機。
	   改札の帯を必ず避ける。ここを避けないと店が改札のセルを上書きし、
	   改札が盤面から消えて乗客が通り抜けてしまう */
	const gRows = Math.max(1, Math.ceil(total / cols));
	const gzTop = total ? gz - (gRows - 1) * 2 : gz;
	let sz = gzTop - 5;
	if (total && sz < SK.fz0 + 1) sz = gz + 2;
	if (!total) sz = SK.fz0 + 1;
	for (let s = 0; s < S.shops; s++) {
		const side = s % 2, idx = Math.floor(s / 2);
		const sx = side ? SK.fx1 - 3 - idx * 4 : SK.fx0 + 1 + idx * 4;
		if (sx > SK.fx0 && sx + 2 < SK.fx1 && sz > SK.fz0 && sz + 3 <= SK.fz1) {
			want.push({ k: K_CONV, a: 0, n: 0, x: sx - SK.fx0, z: sz - SK.pz1 });
		}
	}
	// 自販機は店とぶつからない列に寄せる
	const vx = S.shops ? SK.fx1 - 1 : SK.fx0 + 1;
	for (let i = 0; i < Math.min(6, 1 + total / 8); i++) {
		const vz = Math.min(SK.fz1 - 1, gz + 2 + i);
		if (vz > SK.fz0 && vz < SK.fz1 && vx > SK.fx0 && vx < SK.fx1) {
			want.push({ k: K_VEND, a: 0, n: 0, x: vx - SK.fx0, z: vz - SK.pz1 });
		}
	}
	return want;
}

/* 自動レイアウトの結果を S.fac に流し込む。
   既にあるレコードは永続IDを引き継ぐ(待ち行列の時刻を持ち越すため)。
   Stage4 でプレイヤーが置くようになったら、この呼び出しを外すだけでよい */
function facSync() {
	const want = facAutoLayout();
	const old = S.fac, used = new Array(old.length).fill(false), out = [];
	const take = (pred) => {
		for (let i = 0; i < old.length; i++) if (!used[i] && pred(old[i])) { used[i] = true; return old[i]; }
		return null;
	};
	for (const w of want) {
		// 同じ種別・同じ場所のものを最優先で、次に同じ種別のものを引き継ぐ
		const r = take(o => o.k === w.k && o.a === w.a && o.n === w.n && o.x === w.x && o.z === w.z)
			|| take(o => o.k === w.k && o.a === w.a && o.n === w.n)
			|| take(o => o.k === w.k);
		if (r) { r.a = w.a; r.n = w.n; r.x = w.x; r.z = w.z; r.s = w.s; out.push(r); }
		else out.push({ i: S.nextFid++, k: w.k, a: w.a, n: w.n, s: w.s, x: w.x, z: w.z });
	}
	S.fac = out;
}

// S.fac を盤面に焼く。配列の順に置く(あとのものが先のセルを上書きしうる)
function facPlaceAll() {
	for (const r of S.fac) r.off = facPlaceOne(r) ? 0 : 1;
	deriveMirror();
}

/* ---- 値段 ----
   同じ種類を増やすほど高くなる。増築ボタンで買っていたころの値段をそのまま引き継ぐ */
function facCount(k) { let n = 0; for (const r of S.fac) if (r.k === k) n++; return n; }
function facCountOn(k, n) { let c = 0; for (const r of S.fac) if (r.k === k && r.a === 1 && r.n === n) c++; return c; }

function facPrice(k, plat) {
	switch (k) {
		case K_GATEA: return Math.round(1900000 * (1 + facCount(K_GATEA) * 0.006));
		case K_GATEM: return Math.round(260000 * (1 + facCount(K_GATEM) * 0.05));
		case K_STAIR: return Math.round(700000 * Math.pow(1.9, facCountOn(K_STAIR, plat || 0) + facCountOn(K_ESCAL, plat || 0)) * (isUnder() ? 1.5 : 1));
		case K_ESCAL: return Math.round(facPrice(K_STAIR, plat) * 2.2);
		case K_CONV: return Math.round(1500000 * Math.pow(1.28, facCount(K_CONV)));
		case K_VEND: return 300000;
	}
	return 0;
}
const FAC_REFUND = 0.6;   // 撤去したときに戻る割合

/* ---- 置けるか ----
   下地が正しいこと、盤の中にあること、既にある設備と重ならないこと。
   盤面は「最後に焼いた結果」なので、既存の設備はその種別のセルとして見える。
   つまり下地が床/ホームであることを見れば重なりも同時に弾ける */
const NG_TEXT = {
	oob: '盤の外', base: 'ここには置けない', over: '別の設備がある',
	noflo: 'コンコースの床の上だけ', noplat: 'ホームの上だけ',
	nobase: 'ホームか床の上だけ',
	nolink: '橋上駅舎か地下道が必要', noroof: '真上に駅舎が無い',
	money: '資金が足りない', cut: '通路を塞いでしまう', max: '上限',
};

function facCanPlace(k, a, n, x, z, self) {
	const F = FACS[k];
	if (!F) return 'base';
	if (!B.sk) return 'base';
	const A = facAnchor(a, n);
	const cx0 = A.ox + x, cz0 = A.oz + z, l = A.l;
	// 動かすときは、自分がいま占めているセルを空きとみなす
	let sk = null;
	if (self) {
		const SF = FACS[self.k], sc = facCell(self);
		sk = { l: sc.l, x0: sc.x, x1: sc.x + SF.w - 1, z0: sc.z, z1: sc.z + SF.d - 1 };
	}
	const isSelf = (ll, xx, zz) => sk && ll === sk.l && xx >= sk.x0 && xx <= sk.x1 && zz >= sk.z0 && zz <= sk.z1;
	if (!inBoard(cx0, cz0) || !inBoard(cx0 + F.w - 1, cz0 + F.d - 1)) return 'oob';
	if (F.on === 'plat' && !hasLink()) return 'nolink';
	if (F.on === 'plat' && l !== 0) return 'noplat';
	if (F.on === 'floor' && l !== B.sk.LU) return 'noflo';
	for (let i = 0; i < F.w; i++) for (let j = 0; j < F.d; j++) {
		const gx = cx0 + i, gz = cz0 + j;
		const raw = B.t[gidx(l, gx, gz)];
		const t = isSelf(l, gx, gz) ? (raw === C_PLAT ? C_PLAT : C_FLOOR) : raw;
		if (F.on === 'plat') {
			if (t !== C_PLAT) return t === C_EMPTY ? 'noplat' : 'over';
			// 階段は真上(または真下)が床でないと層を繋げない
			const up = isSelf(B.sk.LU, gx, gz) ? C_FLOOR : B.t[gidx(B.sk.LU, gx, gz)];
			if (up !== C_FLOOR) return 'noroof';
		} else if (F.on === 'both') {
			// 改札・店・自販機はホームの上にも床の上にも置ける
			if (t !== C_FLOOR && t !== C_PLAT) {
				return (t === C_EMPTY || t === C_RAIL_L || t === C_RAIL_R) ? 'nobase' : 'over';
			}
		} else {
			if (t !== C_FLOOR) return (t === C_EMPTY || t === C_PLAT || t === C_RAIL_L || t === C_RAIL_R) ? 'noflo' : 'over';
		}
	}
	return null;
}

/* 実際に置く。置いたあとで動線が切れていないか焼き直して確かめ、
   切れていたら元に戻す(店や壁で駅舎を分断させない) */
function facAdd(k, a, n, x, z, free) {
	const why = facCanPlace(k, a, n, x, z);
	if (why) return why;
	const price = free ? 0 : facPrice(k, a === 1 ? n : 0);
	if (S.money < price) return 'money';
	// 置く前の通行性を控えておく。まだ階段が1本も無い駅では最初から到達不能なので、
	// 「0かどうか」ではなく「悪くなったかどうか」で見ないと1本目が永久に置けない
	const st0 = walkStats();
	const un0 = st0 ? st0.platUnreach.reduce((p, q) => p + q, 0) : 0;
	const rec = { i: S.nextFid++, k: k, a: a, n: n, x: x, z: z };
	S.fac.push(rec);
	facApply();
	const st = walkStats();
	const un1 = st ? st.platUnreach.reduce((p, q) => p + q, 0) : 0;
	if (st && (un1 > un0 || (st.shopFallback && !st0.shopFallback))) {
		S.fac.pop(); S.nextFid--;
		facApply();
		return 'cut';
	}
	S.money -= price;
	facStartBuild(rec.i, FACS[k].build || 0);
	return null;
}

// 工事の開始。終わるまでその設備は使えない
function facStartBuild(fid, sec) {
	const slot = laneOf(fid);
	if (slot < 0 || !sec) return;
	R.facBuilt[slot] = R.now + sec;
	R.facFree[slot] = Math.max(R.facFree[slot], R.facBuilt[slot]);
}
// 工事の残り秒。0なら使える
function facBuildLeft(fid) {
	const slot = laneOf(fid);
	if (slot < 0) return 0;
	return Math.max(0, R.facBuilt[slot] - R.now);
}

/* 動かす。永続IDを保つので待ち行列も利用実績も引き継ぐ。
   代金は取らないが、動かしているあいだは工期の半分だけ使えない */
function facMove(rec, a, n, x, z) {
	const old = { a: rec.a, n: rec.n, x: rec.x, z: rec.z };
	// 自分を盤面から外さずに判定する。外すとレーンが解放されて
	// 待ち行列と利用実績が消えてしまう
	const why = facCanPlace(rec.k, a, n, x, z, rec);
	if (why) return why;
	rec.a = a; rec.n = n; rec.x = x; rec.z = z;
	const st0 = walkStats();
	const un0 = st0 ? st0.platUnreach.reduce((p, q) => p + q, 0) : 0;
	facApply();
	const st = walkStats();
	const un1 = st ? st.platUnreach.reduce((p, q) => p + q, 0) : 0;
	if (st && un1 > un0) { Object.assign(rec, old); facApply(); return 'cut'; }
	facStartBuild(rec.i, Math.round((FACS[rec.k].build || 0) / 2));
	return null;
}



// 撤去。返金は6割。取り消し(undo)のときだけ全額戻す
function facRemove(rec, rate) {
	const i = S.fac.indexOf(rec);
	if (i < 0) return 0;
	S.fac.splice(i, 1);
	const back = Math.round(facPrice(rec.k, rec.a === 1 ? rec.n : 0) * (rate === undefined ? FAC_REFUND : rate));
	S.money += back;
	facApply();
	return back;
}

// その位置にある設備を探す
function facAt(l, gx, gz) {
	for (const r of S.fac) {
		if (r.off) continue;
		const F = FACS[r.k], c = facCell(r);
		if (c.l !== l) continue;
		if (gx >= c.x && gx < c.x + F.w && gz >= c.z && gz < c.z + F.d) return r;
	}
	return null;
}

/* 盤面と3Dと経路を作り直す。resetRuntimeForLayout と違って走行中の列車を消さない
   (設備を1個置くたびに列車が消えると、ダイヤが成立しない) */
function facApply() {
	gridFromParams();
	buildStation();
	for (const p of R.pax) {
		if (p.plat >= S.nPlat) p.plat = S.nPlat - 1;
		if (p.state === 'waitTrain') continue;
		p.path = p.dir === 0 ? pathOut(p) : pathIn(p);
		p.pi = 0; p.gotRes = false; p.atRoot = 0; p.fRoot = 0; p.state = 'walk';
	}
	recountWaiting();
	renderUpgrades();
}

/* 自動で空いている場所を探して置く。増築ボタンから使う。
   プレイヤーが2Dで置くのと同じ経路を通るので、どちらで増やしても同じ形になる */
function facAutoPlace(k) {
	const SK = B.sk;
	if (!SK) return 'base';
	const F = FACS[k];
	if (F.on === 'plat') {
		// いちばん階段の少ないホームの、駅舎に覆われた範囲へ
		let best = 0, bn = 1e9;
		for (let i = 0; i < S.nPlat; i++) {
			const c = facCountOn(K_STAIR, i) + facCountOn(K_ESCAL, i);
			if (c < bn) { bn = c; best = i; }
		}
		const px0 = SK.px0[best];
		for (let z = Math.max(SK.pz0, SK.fz0); z + F.d - 1 <= Math.min(SK.pz1, SK.fz1); z++) {
			for (let x = px0; x + F.w - 1 < px0 + SK.pw; x++) {
				const why = facCanPlace(k, 1, best, x - px0, z - SK.pz1);
				if (!why) return facAdd(k, 1, best, x - px0, z - SK.pz1);
			}
		}
		return 'noplat';
	}
	// 駅舎の中を、出口に近い側から順に探す
	for (let z = SK.fz1; z >= SK.fz0; z--) {
		for (let x = SK.fx0; x + F.w - 1 <= SK.fx1; x++) {
			const why = facCanPlace(k, 0, 0, x - SK.fx0, z - SK.pz1);
			if (!why) return facAdd(k, 0, 0, x - SK.fx0, z - SK.pz1);
		}
	}
	return 'noflo';
}

/* S.fac から旧来のカウントを写す。dailyCost・運賃・増築UI が
   S.gateA/gateM/stairs/shops/esc を読み続けられるようにするため */
function deriveMirror() {
	let ga = 0, gm = 0, cv = 0, st = 0, es = 0;
	const perPlat = new Array(Math.max(1, S.nPlat)).fill(0);
	for (const r of S.fac) {
		if (r.off) continue;
		if (r.k === K_GATEA) ga++;
		else if (r.k === K_GATEM) gm++;
		else if (r.k === K_CONV) cv++;
		else if (r.k === K_STAIR) { st++; if (r.a === 1) perPlat[Math.min(r.n, perPlat.length - 1)]++; }
		else if (r.k === K_ESCAL) { es++; if (r.a === 1) perPlat[Math.min(r.n, perPlat.length - 1)]++; }
	}
	S.gateA = ga; S.gateM = gm; S.shops = cv;
	S.stairs = Math.max.apply(null, perPlat);
	S.esc = es > st;                      // 半分以上がエスカレーターなら「エスカレーター化済み」扱い
}


/* ---- 盤面から派生値を作る。recalcGeometry() のグリッド版 ----
   番線は「RAIL_L/RAIL_R のペアがZ方向に連なる区間」として検出する。
   永続ID(tid)はセーブが持ち、実行時は表示順の密インデックス(ti)で引く */
const DV = { tracks: [], byTid: null, plats: [], ver: 0 };

/* ================= Stage3: 歩行グラフ =================
   盤面 B から起こす派生データ。B.t / B.f は一切書き換えない
   (greedyRects が拾ってしまい、3Dの外形が変わるため)。
   無効化点は gridFromParams() の出口ただ1箇所。

   設計の要:
   - 距離場は「出口 → ホーム」のような端から端までは絶対に張らない。
     盤面には改札の壁が無く(改札セルの左右に床が残る)、端から端まで張ると
     全員が改札を迂回できてしまい、待ち行列＝経済が静かに消える。
     場が案内するのは、いま向かっているアンカーの「集団」までに限る。
   - 層をまたぐ辺は縦ポータル(pass の bit1)だけで表す。実際に登り降りするのは
     従来どおり climb ノードで、場は距離を伝播させるためだけに使う。 */
const WK_MAXFIELD = 26;        // 場の上限枚数(26 × 154KiB = 3.91MiB)
const WK_MAXGROW = 6;          // 改札は何行ぶんまで場を持つか
const WK_PASS = 1, WK_PORT = 2;

const WK = {
	ver: 0,            // 盤面版数。buildWalkGraph() のたびに ++
	pass: null,        // Uint8Array(N)  bit0=歩ける bit1=縦ポータルあり
	q: null,           // Int32Array(N)  BFSのリングキュー(全場で使い回す)
	fields: [],        // [{name, roots, dist, visited}]
	fEXIT: -1,
	fGP: [],           // 改札の行 → 精算済側(-Z)の場id
	fGU: [],           // 改札の行 → 改札外側(+Z)の場id
	fSTAIR: [],        // ホーム面 → 階段列(コンコース側)の場id
	fCROSS_P: -1, fCROSS_U: -1,
	// 逆引き表。B.o は後から置いた設備に奪われるので必ず B.objs から作る
	gateFid: [], facCell: null, facMouth: null, facKind: null,
	stairEnds: null, stairOf: null, gateRowOf: null,
	platRect: [], boardX: null, entRect: null,
	crossZ: -1, crossX0: -1, crossX1: -1,
	probe: null,       // 連結判定の作業配列(使い回す)
	solidShop: true,   // 店舗/自販機を通行不可にするか。動線が切れたら自動で false
	shopFallback: false,
	tiOk: true,        // DV.tracks の ti と パラメトリックの番線番号が一致しているか
	anchor: true,      // ノードの目標座標を盤面のセルへ寄せるか
	on: true,          // 距離場に沿って歩かせるか(false なら従来どおり直線)
	audit: { on: false, n: 0, offGraph: 0, gap: [], cos: [], legEnd: [], legOver: 0, by: {} },
	stat: { rebuildMs: 0, evicted: 0, fallback: 0, stale: 0, dropped: 0 },
};

/* 種付き乱数。既定では Math.random そのままなので挙動は変わらない。
   sim.seed(n) を入れたときだけ線形合同法に差し替わり、A/B比較が成立する */
let _wkR = null;
function wkRnd() {
	if (_wkR === null) return Math.random();
	_wkR = (_wkR * 1664525 + 1013904223) % 4294967296;
	return _wkR / 4294967296;
}

// 3Dでは中身の詰まった箱として描かれるので、店舗と自販機は通行不可にする
function wkSolid(t) { return WK.solidShop && (t === C_SHOP || t === C_VEND); }

function buildWalkGraph() {
	const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
	const N = GRID.W * GRID.D * GRID.L;
	if (!WK.pass || WK.pass.length !== N) { WK.pass = new Uint8Array(N); WK.q = new Int32Array(N); }
	WK.solidShop = true;
	wkIndexBoard();          // platRect を先に作る(継ぎ目の補修が使う)
	wkIndexFacs();
	wkBakePass();
	if (!wkConnected()) {
		// 店舗が駅舎を割った。動線を優先して通行可に戻す
		WK.solidShop = false; wkBakePass(); WK.shopFallback = true;
	} else WK.shopFallback = false;
	wkBuildFields();
	WK.ver++;
	WK.stat.rebuildMs = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
}

/* ---- 盤面を走査して索引を作る ----
   gridFromParams() の座標式をここで再現してはいけない。式が2箇所に増えると、
   将来レイアウトを変えたときに静かに1〜2セルずれる */
function wkIndexBoard() {
	const LU = hasLink() ? 1 : 0, W = GRID.W, D = GRID.D;
	// ホーム矩形。C_PLAT の x 連続区間ごとに1面
	WK.platRect.length = 0;
	let x = 0;
	while (x < W) {
		let z0 = -1, z1 = -1;
		for (let z = 0; z < D; z++) if (B.t[gidx(0, x, z)] === C_PLAT) { if (z0 < 0) z0 = z; z1 = z; }
		if (z0 < 0) { x++; continue; }
		let x1 = x;
		while (x1 + 1 < W && B.t[gidx(0, x1 + 1, z0)] === C_PLAT) x1++;
		WK.platRect.push({ x0: x, x1: x1, z0: z0, z1: z1 });
		x = x1 + 1;
	}
	// 出口の帯
	let ex0 = 1e9, ex1 = -1, ez0 = 1e9, ez1 = -1;
	for (let xx = 0; xx < W; xx++) for (let z = 0; z < D; z++) {
		if (B.t[gidx(LU, xx, z)] === C_ENTRANCE) {
			if (xx < ex0) ex0 = xx; if (xx > ex1) ex1 = xx;
			if (z < ez0) ez0 = z; if (z > ez1) ez1 = z;
		}
	}
	WK.entRect = ex1 >= 0 ? { x0: ex0, x1: ex1, z0: ez0, z1: ez1 } : null;
	// 構内踏切(地平のみ)。F_CROSS の外接
	WK.crossZ = -1; WK.crossX0 = -1; WK.crossX1 = -1;
	if (!hasLink()) {
		let cx0 = 1e9, cx1 = -1, cz0 = 1e9;
		for (let xx = 0; xx < W; xx++) for (let z = 0; z < D; z++) {
			if (B.f[gidx(0, xx, z)] & F_CROSS) {
				if (xx < cx0) cx0 = xx; if (xx > cx1) cx1 = xx; if (z < cz0) cz0 = z;
			}
		}
		if (cx1 >= 0) { WK.crossX0 = cx0; WK.crossX1 = cx1; WK.crossZ = cz0; }
	}
	// 番線 → 乗車位置のホーム列。DV.tracks(盤面から検出したもの)から引く
	const nt = Math.max(1, S.nTrack);
	WK.boardX = new Int32Array(nt).fill(-1);
	// ti はx昇順、パラメトリックの番線もx昇順。ずれていたら場を使わせない
	WK.tiOk = DV.tracks.length === S.nTrack && DV.tracks.every((r, i) => r.ti === i);
	if (WK.tiOk) {
		for (const r of DV.tracks) {
			if (r.ti >= nt) continue;
			const zc = r.adjZ1 >= 0 ? r.adjZ1 : Math.round((r.z0 + r.z1) / 2);
			WK.boardX[r.ti] = tAt(0, r.x - 1, zc) === C_PLAT ? r.x - 1 : r.x + 2;
		}
	}
}

/* ---- 設備の逆引き ----
   B.o はあとから置いた設備に上書きされる(店1個で改札のセルが化ける)ので使わない。
   名前は kk/jj/plat にする。o.k は種別の文字列で、3D生成がそれで分岐している */
function wkIndexFacs() {
	const LU = hasLink() ? 1 : 0;
	WK.gateFid = [];                 // 盤面にある改札の fid(z降順→x昇順)
	WK.facCell = new Map();          // fid → 代表セル
	WK.facMouth = new Map();         // fid → [精算済側(-Z), 改札外側(+Z)]
	WK.stairEnds = new Map();        // fid → [ホーム口(+Z端), コンコース口(-Z端)]
	WK.stairOf = new Map();          // ホーム面 → その面の階段の fid 一覧
	WK.gateRowOf = new Map();        // fid → 改札の行番号
	WK.facKind = new Map();          // fid → 種別の文字列
	for (const o of B.objs.values()) {
		WK.facKind.set(o.i, o.k);
		if (o.k === 'gateA' || o.k === 'gateM') {
			WK.gateFid.push(o.i);
			WK.facCell.set(o.i, gidx(o.l, o.x, o.z));
			WK.facMouth.set(o.i, [gidx(o.l, o.x, o.z - 1), gidx(o.l, o.x, o.z + 1)]);
		} else if (o.k === 'stair' || o.k === 'escal') {
			WK.facCell.set(o.i, gidx(0, o.x, o.z));
			WK.stairEnds.set(o.i, [gidx(0, o.x, o.z + o.d - 1), gidx(LU, o.x, o.z)]);
			const a = WK.stairOf.get(o.plat) || []; a.push(o.i); WK.stairOf.set(o.plat, a);
		}
	}
	// 改札は「改札外側から数えた行」の順に並べる
	WK.gateFid.sort((a, b) => (WK.facCell.get(b) % GRID.D) - (WK.facCell.get(a) % GRID.D) || a - b);
}

// 設備1台の処理間隔(秒)
function facHeadway(fid) {
	const k = WK.facKind.get(fid);
	if (k === 'gateM') return CFG.GATE_M_HEADWAY;
	if (k === 'gateA') return CFG.GATE_A_HEADWAY;
	if (k === 'escal') return CFG.ESC_HEADWAY;
	if (k === 'stair') return CFG.STAIR_HEADWAY;
	return CFG.CROSS_HEADWAY;
}

/* ---- 通行マスクを焼く ----
   (a)セル種別 (b)地平駅の継ぎ目の補修 (c)縦ポータル
   補修で B.t に C_FLOOR を書くと greedyRects が拾って駅舎がホームまで伸びるので、
   必ずマスク側だけを塞ぐ */
function wkBakePass() {
	const p = WK.pass;
	p.fill(0);
	for (let i = 0; i < p.length; i++) {
		const t = B.t[i];
		if (wkSolid(t)) continue;
		if (WALKABLE[t] || ((t === C_RAIL_L || t === C_RAIL_R) && (B.f[i] & F_CROSS))) p[i] = WK_PASS;
	}
	// 地平駅はホーム南端と構内踏切のあいだが1行空いていて、盤面上は分断されている
	if (!hasLink() && WK.platRect.length && WK.crossZ >= 0) {
		for (const pr of WK.platRect) {
			const zs = pr.z1 + 1;
			if (zs >= WK.crossZ) continue;
			for (let x = pr.x0; x <= pr.x1; x++) {
				if (!(p[gidx(0, x, pr.z1)] & WK_PASS) || !(p[gidx(0, x, WK.crossZ)] & WK_PASS)) continue;
				for (let z = zs; z < WK.crossZ; z++) p[gidx(0, x, z)] = WK_PASS;
			}
		}
	}
	// 縦ポータル。階段の footprint 全体に立てる(口の1セルだけだと階段の幅が使われない)
	if (hasLink()) {
		for (const o of B.objs.values()) {
			if (o.k !== 'stair' && o.k !== 'escal') continue;
			for (let i = 0; i < o.w; i++) for (let j = 0; j < o.d; j++) {
				if (!inBoard(o.x + i, o.z + j)) continue;
				const a = gidx(0, o.x + i, o.z + j), b = gidx(1, o.x + i, o.z + j);
				if ((p[a] & WK_PASS) && (p[b] & WK_PASS)) { p[a] |= WK_PORT; p[b] |= WK_PORT; }
			}
		}
	}
}

// 軸に沿った歩行可セルの走り。zAxis=true なら x 固定でZへ、false なら z 固定でXへ
function wkRun(l, a0, a1, fixed, zAxis) {
	const out = [];
	for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) {
		const x = zAxis ? fixed : a, z = zAxis ? a : fixed;
		if (!inBoard(x, z)) continue;
		const k = gidx(l, x, z);
		if (WK.pass[k] & WK_PASS) out.push(k);
	}
	return Int32Array.from(out);
}

// 矩形の中の歩行可セル
function wkCellsOf(l, r) {
	if (!r) return new Int32Array(0);
	const out = [];
	for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
		if (!inBoard(x, z)) continue;
		const k = gidx(l, x, z);
		if (WK.pass[k] & WK_PASS) out.push(k);
	}
	return Int32Array.from(out);
}

function wkAddField(name, roots, stride) {
	if (!roots || !roots.length) { WK.stat.dropped++; return -1; }
	if (WK.fields.length >= WK_MAXFIELD) { WK.stat.dropped++; return -1; }
	const N = GRID.W * GRID.D * GRID.L;
	// stride は根が並ぶ索引の刻み。0 なら矩形の根(隙間の判定をしない)
	const f = { name: name, roots: roots, stride: stride || 0, dist: new Uint16Array(N), visited: 0 };
	wkFieldBuild(f);
	WK.fields.push(f);
	return WK.fields.length - 1;
}

// 多始点BFS。4近傍 + 縦ポータル
function wkFieldBuild(f) {
	const pass = WK.pass, dist = f.dist, q = WK.q;
	const W = GRID.W, D = GRID.D, LW = W * D;
	dist.fill(0xffff);
	let h = 0, t = 0;
	for (let i = 0; i < f.roots.length; i++) {
		const s = f.roots[i];
		if ((pass[s] & WK_PASS) && dist[s] === 0xffff) { dist[s] = 0; q[t++] = s; }
	}
	while (h < t) {
		const k = q[h++], d1 = dist[k] + 1;
		const l = k >= LW ? 1 : 0, r = k - l * LW, x = (r / D) | 0, z = r - x * D;
		let n;
		if (x > 0) { n = k - D; if ((pass[n] & WK_PASS) && dist[n] === 0xffff) { dist[n] = d1; q[t++] = n; } }
		if (x < W - 1) { n = k + D; if ((pass[n] & WK_PASS) && dist[n] === 0xffff) { dist[n] = d1; q[t++] = n; } }
		if (z > 0) { n = k - 1; if ((pass[n] & WK_PASS) && dist[n] === 0xffff) { dist[n] = d1; q[t++] = n; } }
		if (z < D - 1) { n = k + 1; if ((pass[n] & WK_PASS) && dist[n] === 0xffff) { dist[n] = d1; q[t++] = n; } }
		if (pass[k] & WK_PORT) {
			n = l ? k - LW : k + LW;
			if ((pass[n] & WK_PASS) && dist[n] === 0xffff) { dist[n] = d1; q[t++] = n; }
		}
	}
	f.visited = t;
}

// 出口から全ホームが見えるか。店舗が駅舎を割っていないかの判定に使う
function wkConnected() {
	if (!WK.entRect || !WK.platRect.length) return true;
	const LU = hasLink() ? 1 : 0;
	const N = GRID.W * GRID.D * GRID.L;
	if (!WK.probe || WK.probe.length !== N) WK.probe = new Uint16Array(N);
	const f = { name: '_probe', roots: wkCellsOf(LU, WK.entRect), dist: WK.probe, visited: 0 };
	if (!f.roots.length) return true;
	wkFieldBuild(f);
	for (const r of WK.platRect) {
		for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
			if (f.dist[gidx(0, x, z)] === 0xffff) return false;
		}
	}
	return true;
}

/* 階段の場の根。ホーム面ごとに、階段そのものが占めるセル(のコンコース側)だけを集める。
   外接矩形を根にすると、離して置いた2本のあいだのコンコース床まで根になり、
   「もう着いた」と判定されて場が階段へ案内しなくなる */
function wkStairRoots(plat, LU) {
	const out = [];
	for (const o of B.objs.values()) {
		if (o.plat !== plat) continue;
		if (o.k !== 'stair' && o.k !== 'escal') continue;
		for (let i = 0; i < o.w; i++) for (let j = 0; j < o.d; j++) {
			if (!inBoard(o.x + i, o.z + j)) continue;
			const k = gidx(LU, o.x + i, o.z + j);
			if (WK.pass[k] & WK_PASS) out.push(k);
		}
	}
	return Int32Array.from(out);
}

/* 改札の場の根。その行の改札の口セルだけを集める。
   行の左端から右端までを走りにすると、改札が無い床まで根になり、
   自由に散らした瞬間に乗客が改札の脇へ吸われて素通りする。
   paid=true なら精算済側(-Z)、false なら改札外側(+Z) */
function wkGateRoots(gz, paid) {
	const out = [];
	for (const fid of WK.gateFid) {
		if (WK.facCell.get(fid) % GRID.D !== gz) continue;
		const k = WK.facMouth.get(fid)[paid ? 0 : 1];
		if (k >= 0 && (WK.pass[k] & WK_PASS)) out.push(k);
	}
	out.sort((a, b) => a - b);
	return Int32Array.from(out);
}

function wkBuildFields() {
	WK.fields.length = 0; WK.stat.dropped = 0;
	const LU = hasLink() ? 1 : 0;
	WK.fEXIT = wkAddField('EXIT', wkCellsOf(LU, WK.entRect));

	// 改札。行ごとに 精算済側(-Z) と 改札外側(+Z) の隣接行を根にする
	WK.fGP.length = 0; WK.fGU.length = 0;
	const rows = new Map();
	for (const fid of WK.gateFid) {
		const c = WK.facCell.get(fid);
		const LW = GRID.W * GRID.D, l = c >= LW ? 1 : 0, rr = c - l * LW;
		const gx = (rr / GRID.D) | 0, gz = rr - gx * GRID.D;
		const r = rows.get(gz) || { x0: gx, x1: gx };
		if (gx < r.x0) r.x0 = gx; if (gx > r.x1) r.x1 = gx;
		rows.set(gz, r);
	}
	// 行番号は既存の row = floor(j/cols) と同じ順序になるよう z 降順(改札外側から)で振る
	const zs = Array.from(rows.keys()).sort((a, b) => b - a);
	zs.forEach((gz, r) => {
		const g = rows.get(gz);
		if (r >= WK_MAXGROW) { WK.fGP[r] = -1; WK.fGU[r] = -1; WK.stat.dropped += 2; return; }
		void g;
		WK.fGP[r] = wkAddField('GP' + r, wkGateRoots(gz, true), GRID.D);
		WK.fGU[r] = wkAddField('GU' + r, wkGateRoots(gz, false), GRID.D);
		for (const fid of WK.gateFid) {
			if (WK.facCell.get(fid) % GRID.D === gz) WK.gateRowOf.set(fid, r);
		}
	});

	// 階段。ホーム面ごとに、階段そのものが占めるセルだけを根にする
	WK.fSTAIR.length = 0;
	for (let i = 0; i < S.nPlat; i++) {
		const roots = wkStairRoots(i, LU);
		WK.fSTAIR[i] = roots.length ? wkAddField('ST' + i, roots) : -1;
	}

	// 地平の構内踏切
	if (!hasLink() && WK.crossZ >= 0 && WK.platRect.length) {
		const pr = WK.platRect[0];
		WK.fCROSS_P = wkAddField('XP', wkRun(0, pr.x0, pr.x1, WK.crossZ, false), GRID.D);
		WK.fCROSS_U = wkAddField('XU', wkRun(0, WK.crossX1, WK.crossX1, WK.crossZ, false), GRID.D);
	} else { WK.fCROSS_P = -1; WK.fCROSS_U = -1; }
}

/* ---- 実行時のサンプリング ---- */
// Math.floor を使うこと。|0 だと X<0 で1マスずれる。OX=88 なので盤の西半分は常に X<0
function wkCellOf(l, X, Z) {
	const x = cx(X), z = cz(Z);
	return inBoard(x, z) ? gidx(l, x, z) : -1;
}

const _wg = { x: 0, z: 0, ok: false, at: false };
function wkSample(fid, k) {
	_wg.ok = false; _wg.at = false;
	if (fid < 0 || k < 0 || fid >= WK.fields.length) return _wg;
	const d = WK.fields[fid].dist, D = GRID.D, LW = GRID.W * D;
	const here = d[k];
	if (here === 0xffff) return _wg;
	if (here === 0) { _wg.ok = true; _wg.at = true; _wg.x = 0; _wg.z = 0; return _wg; }
	const c = here + 2;                                  // 盤外・不通は「2歩ぶん遠い」
	const l = k >= LW ? 1 : 0, r = k - l * LW, x = (r / D) | 0, z = r - x * D;
	const xm = x > 0 ? Math.min(d[k - D], c) : c, xp = x < GRID.W - 1 ? Math.min(d[k + D], c) : c;
	const zm = z > 0 ? Math.min(d[k - 1], c) : c, zp = z < D - 1 ? Math.min(d[k + 1], c) : c;
	let gx = xm - xp, gz = zm - zp;
	if (gx === 0 && gz === 0) {
		// 平坦(偶数幅の通路など)。いちばん近い隣へ倒す
		let best = here, bi = 0;
		if (xm < best) { best = xm; bi = 1; }
		if (xp < best) { best = xp; bi = 2; }
		if (zm < best) { best = zm; bi = 3; }
		if (zp < best) { best = zp; bi = 4; }
		if (!bi) return _wg;
		gx = bi === 1 ? -1 : bi === 2 ? 1 : 0;
		gz = bi === 3 ? -1 : bi === 4 ? 1 : 0;
	}
	const m = Math.hypot(gx, gz);
	_wg.x = gx / m; _wg.z = gz / m; _wg.ok = true;
	return _wg;
}

/* ---- 静的検査。乗客を1人も動かさずに盤面の健全性を測る ---- */
// 根の走りの中に通行不可セルがあると、最終接近の直線が塞がる
function wkRunGaps() {
	let bad = 0;
	for (const f of WK.fields) {
		if (!f.stride || f.roots.length < 2) continue;
		const a = f.roots[0], b = f.roots[f.roots.length - 1];
		const want = Math.floor(Math.abs(b - a) / f.stride) + 1;
		if (want > f.roots.length) bad += want - f.roots.length;
	}
	return bad;
}

function wkPortalPairs() {
	const out = [], LW = GRID.W * GRID.D;
	for (const [fid, e] of (WK.stairEnds || new Map())) {
		const bot = e[0], top = e[1];
		const plat = 0, kk = fid;
		const botPass = bot >= 0 && !!(WK.pass[bot] & WK_PASS);
		const topPass = top >= 0 && !!(WK.pass[top] & WK_PASS);
		// 上端の真下(または真上)にポータルが立っているか
		const other = top >= 0 ? (top >= LW ? top - LW : top + LW) : -1;
		const linked = top >= 0 && !!(WK.pass[top] & WK_PORT) && other >= 0 && !!(WK.pass[other] & WK_PASS);
		out.push({ plat: plat, kk: kk, botPass: botPass, topPass: topPass, linked: linked });
	}
	return out;
}

// 置いてあるのに盤面へ焼けなかった設備の数
function wkStairMissing() {
	let want = 0;
	for (const r of S.fac) if (r.k === K_STAIR || r.k === K_ESCAL) want++;
	return Math.max(0, want - (WK.stairEnds ? WK.stairEnds.size : 0));
}

// パラメトリック座標と盤面座標のずれ。C3で座標がどれだけ動くかを事前に知る
function wkAnchorDrift() {
	const d = [];
	(WK.gateFid || []).forEach((fid, j) => {
		const a = wkAnchorGate(fid, true);
		if (!a) return;
		const g = gatePos(j);
		d.push(Math.hypot(a.x - g.x, a.z - g.z));
	});
	for (let plat = 0; plat < S.nPlat; plat++) {
		(WK.stairOf && WK.stairOf.get(plat) || []).forEach((fid, k) => {
			const a = wkAnchorStair(fid, false);
			if (!a) return;
			d.push(Math.hypot(a.x - platX(plat), a.z - (stairZ(k) + 2)));
		});
	}
	if (!d.length) return { p50: 0, p95: 0, max: 0, n: 0 };
	d.sort((a, b) => a - b);
	return {
		p50: +d[Math.floor(d.length * 0.5)].toFixed(2),
		p95: +d[Math.floor(d.length * 0.95)].toFixed(2),
		max: +d[d.length - 1].toFixed(2), n: d.length,
	};
}

function wkKeyToXZ(k) {
	const LW = GRID.W * GRID.D, l = k >= LW ? 1 : 0, r = k - l * LW;
	const x = (r / GRID.D) | 0, z = r - x * GRID.D;
	return { l: l, gx: x, gz: z, x: wx(x), z: wz(z) };
}

// 改札の口。paid=true なら精算済側(-Z)、false なら改札外側(+Z)
function wkAnchorGate(fid, paid) {
	const m = WK.facMouth && WK.facMouth.get(fid);
	if (!m) return null;
	const k = m[paid ? 0 : 1];
	if (k < 0 || !(WK.pass[k] & WK_PASS)) return null;
	const p = wkKeyToXZ(k);
	return { x: p.x, z: p.z };
}

// 階段の口。top=true ならコンコース側(-Z端)、false ならホーム側(+Z端)
function wkAnchorStair(fid, top) {
	const e = WK.stairEnds && WK.stairEnds.get(fid);
	if (!e) return null;
	const key = top ? e[1] : e[0];
	if (key < 0 || !(WK.pass[key] & WK_PASS)) return null;
	const p = wkKeyToXZ(key);
	return { x: p.x, z: p.z };
}

// 構内踏切の口。'plat'=ホーム側 'conc'=駅舎側
function wkAnchorCross(side) {
	if (WK.crossZ < 0 || !WK.platRect.length) return null;
	const pr = WK.platRect[0];
	const gx = side === 'plat' ? Math.round((pr.x0 + pr.x1) / 2) : WK.crossX1;
	if (!inBoard(gx, WK.crossZ)) return null;
	return { x: wx(gx), z: wz(WK.crossZ) };
}

// 乗車位置。線路の上には立たせない
function wkAnchorBoard(plat, track, dz) {
	const gx = WK.boardX && track < WK.boardX.length ? WK.boardX[track] : -1;
	if (gx < 0) return { x: platX(plat) + trackSide(track) * (S.platW / 2 - 1.3), z: dz };
	return { x: wx(gx), z: dz };
}

function walkStats() {
	if (!WK.pass) return null;
	let walk = 0, port = 0;
	for (let i = 0; i < WK.pass.length; i++) {
		if (WK.pass[i] & WK_PASS) walk++;
		if (WK.pass[i] & WK_PORT) port++;
	}
	const fs = WK.fields.map(f => {
		let ok = 0;
		for (let i = 0; i < WK.pass.length; i++) if ((WK.pass[i] & WK_PASS) && f.dist[i] !== 0xffff) ok++;
		return { name: f.name, roots: f.roots.length, reach: +(ok / Math.max(1, walk)).toFixed(3), visited: f.visited };
	});
	const platUnreach = WK.platRect.map(r => {
		let bad = 0;
		for (const f of WK.fields) for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
			if (f.dist[gidx(0, x, z)] === 0xffff) bad++;
		}
		return bad;
	});
	let boardOnRail = 0;
	for (let t = 0; t < WK.boardX.length; t++) {
		const gx = WK.boardX[t];
		if (gx < 0) continue;
		const pr = WK.platRect[t >> 1];
		if (!pr) { boardOnRail++; continue; }
		if (B.t[gidx(0, gx, Math.round((pr.z0 + pr.z1) / 2))] !== C_PLAT) boardOnRail++;
	}
	return {
		walk: walk, port: port, fields: fs, platUnreach: platUnreach,
		runGap: wkRunGaps(), portalPairs: wkPortalPairs(),
		gateMissing: (() => { let w = 0; for (const r of S.fac) if (r.k === K_GATEA || r.k === K_GATEM) w++;
			return Math.max(0, w - (WK.gateFid ? WK.gateFid.length : 0)); })(),
		stairMissing: wkStairMissing(), boardOnRail: boardOnRail, tiOk: WK.tiOk,
		anchorDrift: wkAnchorDrift(), shopFallback: WK.shopFallback,
		dropped: WK.stat.dropped, rebuildMs: +WK.stat.rebuildMs.toFixed(2),
		evicted: WK.stat.evicted, fallback: WK.stat.fallback, stale: WK.stat.stale,
	};
}

/* 9構成を順に組んで盤面の指紋だけを取る。
   盤面の作りかたを組み替えたとき、前後でこの並びが一致すれば「1セルも変わっていない」 */
function hashSweep() {
	const keep = JSON.stringify(S);
	const out = [];
	const step = label => { resetRuntimeForLayout(); out.push(label + ' = ' + boardHash()); };
	try {
		S.link = 0; S.nPlat = 1; S.nTrack = 1; S.cars = 2; S.stairs = 0; S.gateA = 0; S.gateM = 0; S.shops = 0; S.esc = false; S.concW = 0;
		step('開業 地平1面1線2両 改札0');
		S.gateA = 4; step('地平 +自動改札4');
		S.gateM = 2; S.shops = 1; step('地平 +手動2 +店1');
		S.link = 1; S.stairs = 2; S.cars = 10; step('橋上 1面1線10両 階段2');
		S.nPlat = 2; S.nTrack = 4; S.gateA = 16; step('橋上 2面4線 改札18');
		S.nPlat = 4; S.nTrack = 8; S.cars = 15; S.stairs = 4; S.gateA = 34; S.shops = 4; step('橋上 4面8線15両');
		S.esc = true; step('橋上 4面8線 エスカレータ');
		S.link = 2; step('地下 4面8線');
		S.nPlat = 10; S.nTrack = 20; S.stairs = 6; S.gateA = 144; S.shops = 12; S.concW = 8; step('地下 10面20線 新宿級');
	} finally {
		S = JSON.parse(keep);
		resetRuntimeForLayout();
		buildStation();
	}
	return out;
}

// 増築の順に流して、各段で盤面が健全かを見る
function walkSweep() {
	const keep = JSON.stringify(S);
	const out = [];
	const step = (label) => {
		resetRuntimeForLayout();
		const w = walkStats();
		out.push({
			step: label, walk: w.walk, port: w.port, fields: w.fields.length,
			platUnreach: w.platUnreach.reduce((a, b) => a + b, 0),
			runGap: w.runGap, gateMissing: w.gateMissing, stairMissing: w.stairMissing,
			boardOnRail: w.boardOnRail, tiOk: w.tiOk, shopFallback: w.shopFallback,
			dropped: w.dropped, ms: w.rebuildMs,
			portalBad: w.portalPairs.filter(p => !p.linked).length,
			drift: w.anchorDrift.max,
		});
	};
	try {
		S.link = 0; S.nPlat = 1; S.nTrack = 1; S.cars = 2; S.stairs = 0; S.gateA = 0; S.gateM = 0; S.shops = 0; S.esc = false;
		step('開業 地平1面1線2両 改札0');
		S.gateA = 4; step('地平 +自動改札4');
		S.gateM = 2; S.shops = 1; step('地平 +手動2 +店1');
		S.link = 1; S.stairs = 2; S.cars = 10; step('橋上 1面1線10両 階段2');
		S.nPlat = 2; S.nTrack = 4; S.gateA = 16; step('橋上 2面4線 改札18');
		S.nPlat = 4; S.nTrack = 8; S.cars = 15; S.stairs = 4; S.gateA = 34; S.shops = 4; step('橋上 4面8線15両');
		S.esc = true; step('橋上 4面8線 エスカレータ');
		S.link = 2; step('地下 4面8線');
		S.nPlat = 10; S.nTrack = 20; S.stairs = 6; S.gateA = 144; S.shops = 12; S.concW = 8; step('地下 10面20線 新宿級');
	} finally {
		S = JSON.parse(keep);
		resetRuntimeForLayout();
		buildStation();
	}
	return out;
}

function rebuildDerived() {
	const tracks = [];
	for (let x = 0; x < GRID.W - 1; x++) {
		let z = 0;
		while (z < GRID.D) {
			if (tAt(0, x, z) === C_RAIL_L && tAt(0, x + 1, z) === C_RAIL_R) {
				const z0 = z;
				while (z < GRID.D && tAt(0, x, z) === C_RAIL_L && tAt(0, x + 1, z) === C_RAIL_R) z++;
				// 両端が盤の端に届いていれば「外へ繋がっている」= 営業できる番線
				const through = (z0 === 0 && z === GRID.D);
				tracks.push({ x: x, z0: z0, z1: z - 1, ok: through });
			} else z++;
		}
	}
	tracks.sort((a, b) => a.x - b.x);

	// 永続ID。種セル S.tseed を頼りに、線路を敷き替えても番号が動かないようにする
	if (!Array.isArray(S.tseed)) S.tseed = [];
	const used = {};
	for (const r of tracks) {
		let tid = null;
		for (const sd of S.tseed) {
			if (sd.x === r.x && sd.z >= r.z0 && sd.z <= r.z1 && !used[sd.tid]) { tid = sd.tid; break; }
		}
		if (tid === null) {
			tid = S.nextTid || 1;
			S.nextTid = tid + 1;
			S.tseed.push({ tid: tid, x: r.x, z: Math.round((r.z0 + r.z1) / 2) });
		}
		used[tid] = 1;
		r.tid = tid;
	}
	const live = tracks.filter(r => r.ok);
	live.forEach((r, i) => { r.ti = i; r.num = i + 1; });

	// ホームに面しているか、有効長は何両か
	for (const r of live) {
		let best = 0, run = 0, bz1 = -1;
		for (let z = r.z0; z <= r.z1; z++) {
			const near = tAt(0, r.x - 1, z) === C_PLAT || tAt(0, r.x + 2, z) === C_PLAT;
			if (near) { run++; if (run > best) { best = run; bz1 = z; } } else run = 0;
		}
		r.adjLen = best;
		r.cars = Math.min(CFG.CARS_MAX, Math.floor(best / (CFG.CAR_LEN / GRID.CELL)));
		r.adjZ1 = bz1;
	}

	DV.tracks = live;
	DV.byTid = new Map(live.map(r => [r.tid, r]));
	DV.all = tracks;
	DV.plats = findPlats();      // ホームの連結成分(矩形とは限らない)
	linkTracksToPlats();         // 番線 → 面しているホームと向き
	DV.ver++;
	return DV;
}

/* ---- グリーディメッシング ----
   同じ種別の連結セルを長方形にまとめる。セル単位で箱を置くと継ぎ目が出るうえ、
   描画コールが数万になる。Z最速索引なのでZへ伸ばしてからXへ広げる */
function greedyRects(layer, pred) {
	const W = GRID.W, D = GRID.D;
	const seen = new Uint8Array(W * D);
	const out = [];
	for (let x = 0; x < W; x++) {
		for (let z = 0; z < D; z++) {
			if (seen[x * D + z] || !pred(layer, x, z)) continue;
			let z1 = z;
			while (z1 + 1 < D && !seen[x * D + z1 + 1] && pred(layer, x, z1 + 1)) z1++;
			let x1 = x;
			outer: while (x1 + 1 < W) {
				for (let zz = z; zz <= z1; zz++) {
					if (seen[(x1 + 1) * D + zz] || !pred(layer, x1 + 1, zz)) break outer;
				}
				x1++;
			}
			for (let xx = x; xx <= x1; xx++) for (let zz = z; zz <= z1; zz++) seen[xx * D + zz] = 1;
			out.push({ x0: x, x1: x1, z0: z, z1: z1 });
			z = z1;
		}
	}
	return out;
}

// 長方形(マス) → ワールドの中心と大きさ
function rectBox(r) {
	const w = (r.x1 - r.x0 + 1) * GRID.CELL, d = (r.z1 - r.z0 + 1) * GRID.CELL;
	return {
		cx: wx(r.x0) - GRID.CELL / 2 + w / 2,
		cz: wz(r.z0) - GRID.CELL / 2 + d / 2,
		w: w, d: d,
	};
}

// レイヤーの床の高さ
function layerY(l) { return l === 0 ? 0 : (isUnder() ? -CFG.UNDER_Y : CFG.CONC_Y); }

// 永続ID → 実行時の密インデックス
function tiOf(tid) {
	const r = DV.byTid && DV.byTid.get(tid);
	return r ? r.ti : -1;
}

/* 盤面が期待どおりに起きているかを数える(Stage1の検証用)。
   パラメトリックな値と突き合わせて、ズレていれば移行処理のバグ */
function gridStats() {
	const cnt = {};
	let occupied = 0;
	for (let i = 0; i < B.t.length; i++) {
		const v = B.t[i];
		if (v) { occupied++; cnt[v] = (cnt[v] || 0) + 1; }
	}
	const name = { 1: 'RAIL_L', 2: 'RAIL_R', 3: 'PLAT', 4: 'FLOOR', 6: 'STAIR', 7: 'ESCAL', 8: 'GATE', 10: 'SHOP', 11: 'VEND', 14: 'ENTRANCE' };
	const cells = {};
	for (const k in cnt) cells[name[k] || k] = cnt[k];
	let cross = 0, roof = 0;
	for (let i = 0; i < B.f.length; i++) { if (B.f[i] & F_CROSS) cross++; if (B.f[i] & F_ROOF) roof++; }
	cells['(踏切)'] = cross; cells['(上家)'] = roof;
	const perCar = CFG.CAR_LEN / GRID.CELL;
	return {
		cells: cells, occupied: occupied,
		tracks: DV.tracks.length, tracksAll: DV.all.length,
		expectTracks: S.nTrack,
		cars: DV.tracks.map(r => r.cars), expectCars: S.cars,
		adjLen: DV.tracks.map(r => r.adjLen), expectAdj: S.cars * perCar,
		tids: DV.tracks.map(r => r.tid),
		facs: B.objs.size,
		expectFacs: (hasStairs() ? S.stairs * S.nPlat : 0) + gateCount() + S.shops + Math.min(6, Math.floor(1 + gateCount() / 8)),
	};
}

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
function potentialPax() { return townPax(); }

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
		money: 20000000,
		rep: 70,              // 評判 0-100
		town: 1,              // 街の発展度(需要倍率)
		cars: 2,              // ホーム有効長(両)
		link: 0,              // ホームへの動線 0=地平(構内踏切) 1=橋上駅舎 2=地下道
		nPlat: 1,             // ホーム面数
		nTrack: 1,            // 線路本数(番線)
		lines: 1,             // 本線の数(駅の外へ出ていく線路)
		trackLine: [0],       // 番線 → どの本線に属するか
		trackDir: [],         // 番線 → 進行方向 0=北行き(+Zへ発車) / 1=南行き
		tseed: [],            // 番線の永続ID。線路を敷き替えても番号が動かないための種セル
		nextTid: 1,
		// 行先。番線の進行方向ごとに並べる。km が運賃の取り分に効く
		dests: [
			{ id: 1, dir: 0, name: '中央町', km: 8 },
			{ id: 2, dir: 0, name: '北野', km: 22 },
			{ id: 3, dir: 0, name: '山下', km: 48 },
			{ id: 4, dir: 1, name: '港南', km: 6 },
			{ id: 5, dir: 1, name: '南浜', km: 19 },
			{ id: 6, dir: 1, name: '岬崎', km: 45 },
		],
		runs: [],             // 1本ずつ置いたスジ [{id,m,cars,ty,track,at(分),dwell}]
		runId: 1,
		platW: 6,             // ホーム幅
		stairs: 0,            // 各ホームの階段数(地平駅では0)
		esc: false,           // エスカレーター化
		gateM: 0,             // 手動改札(駅員配置)の通路数
		gateA: 0,             // 自動改札の通路数
		concW: 0,             // コンコースの片側拡張幅
		// 駅舎の大きさ(マス)。北=ホーム側への張り出し / 南=出口側の奥行き / 東への拡幅
		bldN: 0, bldD: 0, bldW: 0,
		// 置いた設備。[{i:永続ID, k:種別, a:アンカー(0=駅舎/1=ホーム), n:ホーム面, x,z:相対マス}]
		fac: [], nextFid: 1,
		// 線路とホームはユーザーが置く。これが盤面の正
		rail: [{ x: GRID.OX - 1 }],   // 左レールの列 [{x}]。開業時は1本だけ通っている
		plat: [],             // ホームのマス [{x,z}]
		road: [],             // 道路のマス [{x,z}]
		bldg: [],             // 町の建物 [{k:DEVSのid, x, z}]
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
	resN: { stair: 0, gate: 0, cross: 0 },   // res の取得回数(Stage3の検証用)
	sched: [],            // 検証済みスジ(spawn昇順)。これが実行の唯一の真実
	depIdx: [],           // 発車昇順・2日ぶんの索引(番線選択と入場判定に使う)
	schedCur: 0,          // 次に投入するスジ
	trackBusy: [],        // 番線ごとに空く時刻
	need: 0, short: 0,    // 所要編成数 / 不足数
	issues: [],           // ダイヤの問題(UIで赤表示)
	missAcc: [],          // [番線×2+志向] ごとの積み残し発生本数(満足度計算用)
	facFree: new Float64Array(64),   // レーンごとに空く時刻(索引は FACR.lane が配る slot)
	facBuilt: new Float64Array(64),  // 工事が終わる時刻。これ以前は使えない
	facUse: new Float64Array(64),    // 今日その設備を通った人数(表示用)
	platCount: [],        // ホーム上の人数(混雑計算用)
	concCount: 0,
	satSum: 0, satN: 0,
	now: 0,               // 巻き戻らない絶対ゲーム時刻(待ち行列・滞在時間用)
	speed: 60,
	paxScale: 1,          // 1エージェントが表す人数
	lastAlert: {},
};

/* ================= 幾何 =================
   すべて盤面から導く。ホームも線路もユーザーが置くので、
   「何面何線」「何両」はパラメータではなく、置かれた結果の測定値になる */
const G = {};

/* ホームの連結成分を数える。ユーザーが自由に塗るので矩形とは限らない */
function findPlats() {
	const seen = new Uint8Array(GRID.W * GRID.D);
	const out = [];
	const q = new Int32Array(GRID.W * GRID.D);
	for (let x = 0; x < GRID.W; x++) for (let z = 0; z < GRID.D; z++) {
		if (seen[x * GRID.D + z] || tAt(0, x, z) !== C_PLAT) continue;
		let h = 0, t = 0;
		q[t++] = x * GRID.D + z; seen[x * GRID.D + z] = 1;
		let x0 = x, x1 = x, z0 = z, z1 = z, n = 0;
		while (h < t) {
			const k = q[h++], px = (k / GRID.D) | 0, pz = k - px * GRID.D;
			n++;
			if (px < x0) x0 = px; if (px > x1) x1 = px;
			if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
			const push = (a, b) => {
				if (!inBoard(a, b) || seen[a * GRID.D + b] || tAt(0, a, b) !== C_PLAT) return;
				seen[a * GRID.D + b] = 1; q[t++] = a * GRID.D + b;
			};
			push(px + 1, pz); push(px - 1, pz); push(px, pz + 1); push(px, pz - 1);
		}
		out.push({ x0: x0, x1: x1, z0: z0, z1: z1, n: n });
	}
	out.sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
	return out;
}

/* 番線 → 面している ホーム成分 と 向き を決める */
function linkTracksToPlats() {
	for (const r of DV.tracks) {
		r.plat = -1; r.side = -1;
		const zc = r.adjZ1 >= 0 ? r.adjZ1 : Math.round((r.z0 + r.z1) / 2);
		for (const side of [-1, 1]) {
			const x = side < 0 ? r.x - 1 : r.x + 2;
			if (tAt(0, x, zc) !== C_PLAT) continue;
			const i = DV.plats.findIndex(p => x >= p.x0 && x <= p.x1 && zc >= p.z0 && zc <= p.z1);
			if (i >= 0) { r.plat = i; r.side = side; break; }
		}
	}
}

// ホーム成分 i の中心x(ワールド)
function platX(i) {
	const p = DV.plats[Math.max(0, Math.min(DV.plats.length - 1, i))];
	return p ? (wx(p.x0) + wx(p.x1)) / 2 : 0;
}
// ホーム成分 i の幅(m)
function platWOf(i) {
	const p = DV.plats[Math.max(0, Math.min(DV.plats.length - 1, i))];
	return p ? (p.x1 - p.x0 + 1) * GRID.CELL : S.platW;
}
function trackPlat(t) { const r = DV.tracks[t]; return r && r.plat >= 0 ? r.plat : 0; }
function trackSide(t) { const r = DV.tracks[t]; return r && r.side ? r.side : -1; }
// 線路の中心x(ワールド)。2マス幅なので左レールの中心+1マス
function trackX(t) {
	const r = DV.tracks[t];
	return r ? wx(r.x) + GRID.CELL / 2 : 0;
}

function recalcGeometry() {
	// ホームの広がりを盤面から測る
	let z0 = Infinity, z1 = -Infinity, cells = 0;
	for (const p of DV.plats) { if (p.z0 < z0) z0 = p.z0; if (p.z1 > z1) z1 = p.z1; cells += p.n; }
	if (!DV.plats.length) { z0 = GRID.OZ - 5; z1 = GRID.OZ + 5; }
	G.platZ0 = wz(z0) - GRID.CELL / 2;
	G.platZ1 = wz(z1) + GRID.CELL / 2;
	G.platLen = Math.max(GRID.CELL, G.platZ1 - G.platZ0);
	G.platArea = Math.max(GRID.CELL * GRID.CELL, cells * GRID.CELL * GRID.CELL);
	G.unitW = (DV.plats.length ? platWOf(0) : S.platW) + 2 * CFG.TRACK_W + 1.4;

	// 着けられる編成長は「線路がホームに接している一番長い区間」で決まる
	let best = 0;
	for (const r of DV.tracks) best = Math.max(best, r.cars || 0);
	G.cars = Math.max(1, best);

	G.concD = Math.max(20, Math.min(92, 12 + gateCount() * 0.9 + G.platLen * 0.10));
	if (hasLink()) {
		G.entryY = isBridge() ? CFG.CONC_Y : -CFG.UNDER_Y;
		G.over = Math.min(G.concD * 0.55, Math.max(10, G.platLen * 0.32));
		G.concZ0 = G.platZ1 - G.over;
	} else {
		G.entryY = 0;
		G.over = 0;
		G.concD = Math.max(16, Math.min(46, 12 + gateCount() * 1.4));
		G.concZ0 = G.platZ1 + 6;
	}
	G.concZ1 = G.concZ0 + G.concD;
	G.gateZ = hasLink() ? G.concZ1 - Math.min(18, G.concD * 0.34) : G.concZ0 + Math.min(9, G.concD * 0.42);
	G.exitZ = G.concZ1 + 8;
	if (hasLink() && DV.plats.length) {
		G.concX0 = wx(DV.plats[0].x0) - GRID.CELL / 2 - 7 - S.concW;
		G.concX1 = wx(DV.plats[DV.plats.length - 1].x1) + GRID.CELL / 2 + 7 + S.concW;
	} else {
		let railE = -Infinity;
		for (let t = 0; t < DV.tracks.length; t++) railE = Math.max(railE, trackX(t) + CFG.TRACK_W / 2);
		if (!isFinite(railE)) railE = 0;
		G.concX0 = railE + 2.5;
		G.concX1 = G.concX0 + Math.max(15, 9 + gateCount() * 2.2 + S.concW * 2);
	}
	G.concCx = (G.concX0 + G.concX1) / 2;
	G.concArea = (G.concX1 - G.concX0) * G.concD;
	G.trainCap = G.cars * CFG.CAR_CAP;
	G.doorFlow = G.cars * CFG.CAR_FLOW;
	G.nDoors = Math.max(2, G.cars * 2);
	G.stairA = G.concZ0 + 4;
	G.stairB = G.platZ1 - 4;
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
	if (G.nDoors < 2) return (G.platZ0 + G.platZ1) / 2;
	const a = G.platZ0 + 3, b = G.platZ1 - 3;
	return b <= a ? (a + b) / 2 : a + i * (b - a) / (G.nDoors - 1);
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
	renderer.setSize(Math.max(1, window.innerWidth || 1), Math.max(1, window.innerHeight || 1));
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

	camera = new THREE.PerspectiveCamera(48, Math.max(1, window.innerWidth || 1) / Math.max(1, window.innerHeight || 1), 1, 9000);

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

/* 画面の大きさが一瞬0になることがある(タブが非表示のとき、iOSの画面回転中など)。
   そのまま0で設定すると canvas が 0×0 のまま固まり、aspect が NaN になって
   以後なにも映らなくなる。必ず1以上に丸める */
function onResize() {
	const w = Math.max(1, window.innerWidth || 0), h = Math.max(1, window.innerHeight || 0);
	if (w < 2 || h < 2) return;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);
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
		new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), CFG.MAX_PAX_DETAIL);
	paxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	paxMesh.frustumCulled = false;
	paxMesh.castShadow = false;      // 2200体の影は重すぎるので落とす
	paxMesh.receiveShadow = true;
	for (let i = 0; i < CFG.MAX_PAX_DETAIL; i++) paxMesh.setColorAt(i, COL_OUT);
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

/* ================= 盤面から3Dを組む =================
   セル単位で箱を置くと継ぎ目と描画コールが破綻するので、
   連結セルを長方形にまとめてから箱にする。設備だけインスタンス描画 */
function buildStation() {
	recalcGeometry();
	disposeGroup(stationGroup);
	G.gateArms = [];
	if (!B.t) gridFromParams();

	const LU = hasLink() ? 1 : 0;
	const uy = layerY(LU);
	const isRail = (l, x, z) => { const t = tAt(l, x, z); return t === C_RAIL_L || t === C_RAIL_R; };
	const isPlat = (l, x, z) => tAt(l, x, z) === C_PLAT;
	const isFloor = (l, x, z) => { const t = tAt(l, x, z); return t === C_FLOOR || t === C_ENTRANCE || t === C_GATE || t === C_SHOP || t === C_VEND; };
	const isRoof = (l, x, z) => (B.f[gidx(l, x, z)] & F_ROOF) !== 0;
	const isCross = (l, x, z) => (B.f[gidx(l, x, z)] & F_CROSS) !== 0;

	/* ---- 線路 ---- */
	const sleeperGeo = new THREE.BoxGeometry(3.4, 0.22, 0.9);
	const sleepers = [];
	for (const r of DV.all) {
		const b = rectBox({ x0: r.x, x1: r.x + 1, z0: r.z0, z1: r.z1 });
		box(b.w + 1.0, 0.5, b.d, MAT.ballast, b.cx, -0.5, b.cz, stationGroup, true);
		for (let z = r.z0; z <= r.z1; z += 1.2) sleepers.push([b.cx, 0.11, wz(z)]);
		box(0.12, 0.18, b.d, MAT.rail, b.cx - 0.7175, 0.22, b.cz, stationGroup, true);
		box(0.12, 0.18, b.d, MAT.rail, b.cx + 0.7175, 0.22, b.cz, stationGroup, true);
	}
	addInstanced(sleeperGeo, MAT.sleeper, sleepers, stationGroup, false);

	/* ---- ホーム ---- */
	const platRects = greedyRects(0, isPlat);
	for (const r of platRects) {
		const b = rectBox(r);
		box(b.w, CFG.PLAT_Y, b.d, MAT.plat, b.cx, 0, b.cz, stationGroup);
		box(b.w + 0.12, CFG.PLAT_Y * 0.75, b.d + 0.1, MAT.platSide, b.cx, 0, b.cz, stationGroup, true);
		// 線路に面した縁だけ点字ブロックと白線を敷く
		for (const side of [-1, 1]) {
			const nx = side < 0 ? r.x0 - 1 : r.x1 + 1;
			if (!isRail(0, nx, r.z0)) continue;
			const ex = side < 0 ? wx(r.x0) - GRID.CELL / 2 : wx(r.x1) + GRID.CELL / 2;
			box(0.6, 0.04, b.d, MAT.tactile, ex - side * 0.75, CFG.PLAT_Y, b.cz, stationGroup, true);
			box(0.12, 0.045, b.d, MAT.whiteLine, ex - side * 0.18, CFG.PLAT_Y, b.cz, stationGroup, true);
		}
	}

	/* ---- 上家(半透明。俯瞰でホームの人が見える) ---- */
	const roofRects = greedyRects(0, isRoof);
	const beamGeo = new THREE.BoxGeometry(1, 0.22, 0.3);
	const pillarGeo = new THREE.BoxGeometry(0.42, CFG.CONC_Y - CFG.PLAT_Y - 0.3, 0.42);
	const lampGeo = new THREE.BoxGeometry(0.3, 0.12, 2.4);
	const pillars = [], lamps = [];
	for (const r of roofRects) {
		const b = rectBox(r);
		// 駅舎に覆われている範囲には架けない
		const covered = hasLink() && tAt(1, r.x0, r.z0) === C_FLOOR;
		if (covered) continue;
		const rf = box(b.w + 1.2, 0.2, b.d, MAT.roof, b.cx, CFG.CONC_Y - 1.2, b.cz, stationGroup, true);
		rf.renderOrder = 4;
		for (let z = r.z0 + 2; z <= r.z1 - 1; z += 5) {
			pillars.push([b.cx, CFG.PLAT_Y + (CFG.CONC_Y - CFG.PLAT_Y - 0.3) / 2, wz(z)]);
			lamps.push([b.cx, CFG.CONC_Y - 1.75, wz(z) + 2]);
		}
		box(0.25, 0.3, b.d, MAT.truss, b.cx - b.w / 2 - 0.3, CFG.CONC_Y - 1.5, b.cz, stationGroup, true);
		box(0.25, 0.3, b.d, MAT.truss, b.cx + b.w / 2 + 0.3, CFG.CONC_Y - 1.5, b.cz, stationGroup, true);
	}
	addInstanced(pillarGeo, MAT.pillar, pillars, stationGroup, true);
	addInstanced(lampGeo, MAT.lamp, lamps, stationGroup, false);

	/* ---- 駅舎の床 ---- */
	const floorRects = greedyRects(LU, isFloor);
	let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9;
	for (const r of floorRects) {
		const b = rectBox(r);
		fx0 = Math.min(fx0, r.x0); fx1 = Math.max(fx1, r.x1);
		fz0 = Math.min(fz0, r.z0); fz1 = Math.max(fz1, r.z1);
		if (LU > 0) box(b.w, 0.6, b.d, MAT.concUnder, b.cx, uy - 0.6, b.cz, stationGroup);
		const fl = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), MAT.conc);
		fl.rotation.x = -Math.PI / 2;
		fl.position.set(b.cx, uy + 0.02, b.cz);
		fl.receiveShadow = true;
		stationGroup.add(fl);
	}

	if (floorRects.length) {
		const bw = (fx1 - fx0 + 1) * GRID.CELL, bd = (fz1 - fz0 + 1) * GRID.CELL;
		const bcx = wx(fx0) - GRID.CELL / 2 + bw / 2, bcz = wz(fz0) - GRID.CELL / 2 + bd / 2;
		const wallH = 3.4;
		if (hasLink()) {
			// 橋上/地下は腰壁+ガラス。天井は張らない
			for (const s of [-1, 1]) {
				box(0.35, 1.0, bd, MAT.concUnder, bcx + s * bw / 2, uy, bcz, stationGroup);
				box(0.3, wallH - 1.0, bd, MAT.glass, bcx + s * bw / 2, uy + 1.0, bcz, stationGroup, true);
				box(bw, 1.0, 0.35, MAT.concUnder, bcx, uy, bcz + s * bd / 2, stationGroup);
				box(bw, wallH - 1.0, 0.3, MAT.glass, bcx, uy + 1.0, bcz + s * bd / 2, stationGroup, true);
			}
			// 橋脚(線路を避けて立てる)
			if (isBridge()) {
				for (let x = fx0 + 1; x <= fx1; x += 6) {
					if (isRail(0, x, fz1)) continue;
					box(1.2, CFG.CONC_Y - 0.6, 1.2, MAT.pillar, wx(x), 0, wz(fz1 - 1), stationGroup, true);
				}
			}
		} else {
			// 地平駅は駅舎を建てない。改札はホームに直接付くので、
			// 出入口まわりは舗装だけを敷いて空を見せる
		}
		G.plazaCx = bcx; G.plazaCz = bcz + bd / 2 + 22;
		G.plazaX = wx(fx1) + 10;
	}

	/* ---- 構内踏切 ---- */
	const crossRects = greedyRects(0, isCross);
	for (const r of crossRects) {
		const b = rectBox(r);
		box(b.w, 0.16, b.d, MAT.stair, b.cx, 0.06, b.cz, stationGroup, true);
		// 遮断機。開閉でZ軸まわりに回す
		for (const s of [-1, 1]) {
			const bx = s < 0 ? b.cx - b.w / 2 - 1.2 : b.cx + b.w / 2 + 1.2;
			box(0.3, 2.8, 0.3, MAT.gate, bx, 0, b.cz + b.d / 2 + 1.2, stationGroup, true);
			const arm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.22, 0.22), MAT.vend);
			arm.position.set(bx - s * 3.25, 2.2, b.cz + b.d / 2 + 1.2);
			arm.castShadow = true;
			stationGroup.add(arm);
			G.gateArms.push({ mesh: arm, px: bx, s: s, z: b.cz + b.d / 2 + 1.2 });
		}
	}

	/* ---- 設備 ---- */
	const gb = [], gt = [], gf = [], md = [], mp = [], staff = [], vends = [], benches = [];
	const stepPlates = [];
	for (const o of B.objs.values()) {
		const oy = layerY(o.l);
		const b = rectBox({ x0: o.x, x1: o.x + o.w - 1, z0: o.z, z1: o.z + o.d - 1 });
		if (o.k === 'gateA') {
			for (const s of [-1, 1]) {
				gb.push([b.cx + s * 0.85, oy + 0.5, b.cz]);
				gt.push([b.cx + s * 0.85, oy + 1.05, b.cz]);
				gf.push([b.cx + s * 0.55, oy + 0.36, b.cz + 1.2]);
			}
		} else if (o.k === 'gateM') {
			for (const s of [-1, 1]) {
				md.push([b.cx + s * 0.95, oy, b.cz]);
				mp.push([b.cx + s * 0.95, oy, b.cz - 1.6]);
			}
			staff.push([b.cx + 1.55, oy, b.cz - 0.4, 0, Math.PI, 0]);
		} else if (o.k === 'vend') {
			vends.push([b.cx, oy + 0.95, b.cz]);
		} else if (o.k === 'conv' || o.k === 'kiosk') {
			box(b.w - 0.4, 2.9, b.d - 0.4, MAT.shop, b.cx, oy + 0.02, b.cz, stationGroup);
			box(b.w, 0.5, 0.3, MAT.lamp, b.cx, oy + 2.5, b.cz - b.d / 2 + 0.2, stationGroup, false);
		} else if (o.k === 'stair' || o.k === 'escal') {
			// 階段は地上⇄駅舎レイヤーを結ぶ。橋上なら上り、地下なら下り
			const rise = layerY(LU) - CFG.PLAT_Y;
			const run = b.d;
			const ang = -Math.atan2(rise, run);
			if (o.k === 'escal') {
				const len = Math.hypot(rise, run);
				const body = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.4, 0.75, len), MAT.esc);
				body.position.set(b.cx, CFG.PLAT_Y + rise / 2, b.cz);
				body.rotation.x = ang;
				body.castShadow = body.receiveShadow = true;
				stationGroup.add(body);
			} else {
				const steps = 12;
				for (let s = 0; s < steps; s++) {
					const f = (s + 0.5) / steps;
					stepPlates.push([b.cx, CFG.PLAT_Y + rise * f - 0.11, b.cz + b.d / 2 - run * f]);
				}
			}
			for (const s of [-1, 1]) {
				const len = Math.hypot(rise, run);
				const hr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, len), MAT.handrail);
				hr.position.set(b.cx + s * (b.w / 2 - 0.2), CFG.PLAT_Y + rise / 2 + 0.55, b.cz);
				hr.rotation.x = ang;
				hr.castShadow = true;
				stationGroup.add(hr);
			}
		}
	}
	addInstanced(new THREE.BoxGeometry(0.5, 1.0, 3.0), MAT.gate, gb, stationGroup, true);
	addInstanced(new THREE.BoxGeometry(0.56, 0.1, 3.0), MAT.lamp, gt, stationGroup, false);
	addInstanced(new THREE.BoxGeometry(0.08, 0.72, 0.9), MAT.gateFlap, gf, stationGroup, false);
	addInstanced(new THREE.BoxGeometry(0.7, 1.05, 3.0), MAT.desk, md, stationGroup, true);
	addInstanced(new THREE.BoxGeometry(0.24, 2.3, 0.24), MAT.handrail, mp, stationGroup, true);
	if (humanGeo) addInstanced(humanGeo, MAT.staff, staff, stationGroup, true);
	addInstanced(new THREE.BoxGeometry(1.1, 1.9, 0.7), MAT.vend, vends, stationGroup, true);
	addInstanced(new THREE.BoxGeometry(1.6, 0.45, 0.5), MAT.bench, benches, stationGroup, true);
	addInstanced(new THREE.BoxGeometry(GRID.CELL * 1.6, 0.22, 1.0), MAT.stair, stepPlates, stationGroup, true);

	/* ---- 架線柱 ---- */
	if (DV.all.length) {
		const poles = [];
		let rx0 = 1e9, rx1 = -1e9;
		for (const r of DV.all) { rx0 = Math.min(rx0, r.x); rx1 = Math.max(rx1, r.x + 1); }
		for (let z = 6; z < GRID.D - 6; z += 22) {
			if (floorRects.length && z > fz0 - 3 && z < fz1 + 3 && hasLink()) continue;
			poles.push([wx(rx0) - 3, 4.75, wz(z)]);
			poles.push([wx(rx1) + 3, 4.75, wz(z)]);
		}
		addInstanced(new THREE.BoxGeometry(0.36, 9.5, 0.36), MAT.catenary, poles, stationGroup, true);
	}

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

/* 町の3D。自動生成はやめ、置かれた道路と建物だけを描く */
function buildCity() {
	disposeGroup(cityGroup);
	buildGround();

	// 道路
	const roadGeo = new THREE.PlaneGeometry(GRID.CELL, GRID.CELL);
	roadGeo.rotateX(-Math.PI / 2);
	const roads = [];
	for (const c of S.road) roads.push([wx(c.x), 0.06, wz(c.z)]);
	addInstanced(roadGeo, MAT.road, roads, cityGroup, false);

	// 建物。種類ごとに高さと色を変える
	const bGeo = new THREE.BoxGeometry(1, 1, 1);
	bGeo.translate(0, 0.5, 0);
	const byClass = CFG.BLD_CLASS.map(() => []);
	const byClassCol = CFG.BLD_CLASS.map(() => []);
	const H = { home1: 8, school: 12, office1: 22, shop1: 16, univ: 20, office2: 68, home2: 26, sub: 120 };
	for (const b of S.bldg) {
		const [w, d] = bldgSize(b.k);
		const h = H[b.k] || 10;
		const ci = h > 46 ? 2 : h > 18 ? 1 : 0;
		const wm = w * GRID.CELL - 1.2, dm = d * GRID.CELL - 1.2;
		byClass[ci].push([wx(b.x) - GRID.CELL / 2 + w * GRID.CELL / 2, 0,
			wz(b.z) - GRID.CELL / 2 + d * GRID.CELL / 2, wm, h, dm]);
		byClassCol[ci].push(b.off ? C(0x6a6a6a) : null);
	}
	for (let ci = 0; ci < byClass.length; ci++) {
		const list = byClass[ci];
		if (!list.length) continue;
		addInstanced(bGeo, MAT.bldg[ci], list, cityGroup, true, byClassCol[ci]);
		const lit = addInstanced(bGeo, MAT.winLit[ci], list.map(b => b.slice()), cityGroup, false);
		if (lit) cityGroup.userData.lit = (cityGroup.userData.lit || []).concat([lit]);
	}
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

/* 停止位置(編成中心)。先頭を進行方向の端に揃えるので、上りと下りで逆になる */
function stopZOf(cars, dir) {
	const half = cars * CFG.CAR_LEN / 2;
	return dir ? G.platZ0 + half : G.platZ1 - half;
}
// 進行方向の符号。+Z へ発車するなら +1
function dirSign(dir) { return dir ? -1 : 1; }

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
		dia: e.dia, run: e.run, track: e.track, cars: e.cars, mid: e.m, ty: e.ty,
		dir: dirOf(e.track),
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
	tr.mesh.position.set(trackX(tr.track), 0, stopZOf(tr.cars, tr.dir));
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
// 番線の進行方向。0=北行き(+Zへ発車) / 1=南行き
function dirOf(track) { return (S.trackDir && S.trackDir[track]) ? 1 : 0; }
const DIR_NAME = ['北行き', '南行き'];

/* 発車間隔を共有する単位。実際の上り本線・下り本線に相当する。
   同じ本線でも方向が違えば別の線路なので、間隔は競合しない */
function groupOf(track) { return lineOf(track) * 2 + dirOf(track); }

// その本線・方向に何番線あるか。2つあれば交互発車で本線の上限を出しきれる
function lineTracks(line, dir) {
	let n = 0;
	for (let t = 0; t < S.nTrack; t++) {
		if (lineOf(t) !== line) continue;
		if (dir !== undefined && dirOf(t) !== dir) continue;
		n++;
	}
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
				fare: (typeFits(d.m, d.ty) ? TYPES[d.ty].fareMul : 1.0) * destFare(d.dest),
				fits: typeFits(d.m, d.ty), dest: d.dest,
				ok: true,
			});
		}
	}

	/* 1本だけ置いたスジ＝臨時列車。他社から1本借りる扱いなので契約は要らず、
	   代わりに走った日だけ運行料を払う。パターンと同じ形に均して以降の検証を共通で通す */
	for (const r of (S.runs || [])) {
		const mo = modelOf(r.m);
		const bad = [];
		if (r.cars > S.cars) bad.push('ホーム有効長' + S.cars + '両では' + r.cars + '両は着けられない');
		if (r.track >= S.nTrack) bad.push((r.track + 1) + '番線が無い');
		if (S.rank < mo.rank) bad.push(mo.name + 'は' + RANKS[mo.rank].name + 'から');
		if (bad.length) { issues.push({ run: r.id, msg: bad.join(' / ') }); continue; }
		const arr = ((r.at % 1440) + 1440) % 1440 * 60;
		out.push({
			run: r.id, m: r.m, cars: r.cars, ty: r.ty, track: r.track,
			arr: arr, dep: arr + Math.max(15, r.dwell), spawn: arr - CFG.SPAWN_LEAD,
			cap: slotCap(r.m, r.cars), flow: slotFlow(r.m, r.cars),
			fare: (typeFits(r.m, r.ty) ? TYPES[r.ty].fareMul : 1.0) * destFare(r.dest),
			fits: typeFits(r.m, r.ty), dest: r.dest, ok: true,
		});
	}

	// 2a. 同一番線の占有は「到着順」で見る。停車時間が違うと発車順では判定を誤る
	const byArr = out.slice().sort((a, b) => a.arr - b.arr);
	const lastOnTrack = [];
	for (const s of byArr) {
		const prevT = lastOnTrack[s.track];
		if (prevT !== undefined && s.arr < prevT.dep + CFG.OCC_IN) {
			s.ok = false;
			issues.push({ dia: s.dia, run: s.run, at: s.arr, msg: (s.track + 1) + '番線が塞がっている' });
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
		s.dir = dirOf(s.track);
		s.grp = groupOf(s.track);

		const pd = lastDepTrack[s.track];
		if (pd !== undefined && s.dep - pd < CFG.TRACK_HEAD) {
			s.ok = false;
			issues.push({ dia: s.dia, run: s.run, at: s.dep, msg: (s.track + 1) + '番線は' + Math.round(CFG.TRACK_HEAD / 60) + '分に1本まで' });
			continue;
		}

		const p = lastOnLine[s.grp];
		if (p) {
			const need = Math.max(CFG.LINE_HEAD, headwayFor(p.ty, s.ty));
			if (s.dep - p.dep < need) {
				s.ok = false;
				const why = p.ty === s.ty
					? '本線' + (s.line + 1) + ' ' + DIR_NAME[s.dir] + 'は' + Math.round(need / 60) + '分に1本まで'
					: TYPES[p.ty].name + 'の' + Math.round(need / 60) + '分後まで' + TYPES[s.ty].name + 'は発車できない';
				issues.push({ dia: s.dia, run: s.run, at: s.dep, msg: why });
				continue;
			}
		}
		lastOnLine[s.grp] = s;
		lastDepTrack[s.track] = s.dep;
	}

	// 3. 契約している編成の本数で運用できるスジだけを残す。
	//    折返し CFG.TURN を空けて次のスジに就ける
	const pool = {};
	for (const f of S.fleet) pool[f.m + '/' + f.cars] = new Array(f.n).fill(-1e9);
	const liveByArr = out.filter(s => s.ok && s.run === undefined).sort((a, b) => a.arr - b.arr);
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
			issues.push({ dia: s.dia, run: s.run, at: s.arr, msg: modelOf(s.m).name + s.cars + '両の編成が足りない' });
			continue;
		}
		free[bi] = s.dep + CFG.TURN;
	}

	const live = out.filter(s => s.ok);

	// 4. 所要編成数(同時に線路上に居る本数の最大)をスイープラインで求める
	const ev = [];
	for (const s of live) {
		if (s.run !== undefined) continue;              // 臨時は自前の編成を使わない
		ev.push([s.arr - CFG.SPAWN_LEAD, 1]); ev.push([s.dep + CFG.TURN, -1]);
	}
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
	if (DIA.open) renderTimetable();
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
				// 運行費は発車ごとに掛かる。本数を増やせば増えるほど重くなる。
				// 臨時列車は自前の編成ではないので、1本走るごとに借り賃も乗る
				const run = tr.cars * CFG.RUN_PER_CAR * (1 + tr.ty * 0.18)
					+ (tr.run !== undefined ? runFee(tr.mid, tr.cars) : 0);
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

		if (tr.mesh) tr.mesh.position.z = stopZOf(tr.cars, tr.dir) + trainOffset(tr, now) * dirSign(tr.dir);
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
		ph: 0, head: 0, col: COL_OUT,
		// Stage3: wkVer=経路を焼いた盤面版数 / jt=横のばらつき / stuckT=詰まり監視 / fx,fz=影
		wkVer: -1, jt: 0, stuckT: 0, atRoot: 0, fRoot: 0, fx: 0, fz: 0 };
}

function pathOut(p) {
	// 降車 → (階段) → 改札 → 出口
	const px = platX(p.plat);
	const path = [];
	if (hasStairs()) {
		const k = pickStair(p.plat);
		const sz = stairZ(WK.stairOf && WK.stairOf.get(p.plat) ? WK.stairOf.get(p.plat).indexOf(k) : 0);
		path.push({ x: px, y: CFG.PLAT_Y, z: sz + 2, res: 'stair', rf: k, hw: facHeadway(k) });
		path.push({ x: px, y: G.entryY, z: sz - 10, climb: true });
	} else {
		// 地平駅はホーム端のスロープを下り、構内踏切を渡って駅舎へ
		// 田舎駅は踏切が無い。ホーム端の階段を下りてそのまま駅前へ
		path.push({ x: px, y: CFG.PLAT_Y, z: G.platZ1 - 3 });
		path.push({ x: px, y: 0, z: G.crossZ });
	}
	// 改札が1つも無い無人駅では素通りする
	const j = pickGate();
	if (j >= 0) {
		const g = gatePos(WK.gateFid ? WK.gateFid.indexOf(j) : 0);
		path.push({ x: g.x, y: G.entryY, z: g.z - 4, res: 'gate', rf: j, hw: facHeadway(j) });
		path.push({ x: g.x, y: G.entryY, z: g.z + 4 });
	}
	// 出口。地下は階段を上がって地上へ出る
	if (isUnder()) {
		path.push({ x: G.concX1 + 20, y: G.entryY, z: G.exitZ });
		path.push({ x: G.concX1 + 40 + wkRnd() * 10, y: 0, z: G.exitZ + (wkRnd() - 0.5) * 12, exit: true });
	} else {
		// 駅舎の幅の内側に収める(線路の上に湧かないように)
		const ex = G.concX0 + 2 + wkRnd() * Math.max(1, (G.concX1 - G.concX0) - 4);
		path.push({ x: ex, y: G.entryY, z: G.exitZ + 12, exit: true });
	}
	return attachFields(p, path);
}

function pathIn(p) {
	const px = platX(p.plat);
	const side = trackSide(p.track);
	const di = Math.floor(wkRnd() * G.nDoors);
	const path = [];
	// 地下は階段を下りてコンコースへ
	if (isUnder()) path.push({ x: G.concX1 + 20, y: G.entryY, z: G.exitZ });
	const j = pickGate();
	if (j >= 0) {
		const g = gatePos(WK.gateFid ? WK.gateFid.indexOf(j) : 0);
		path.push({ x: g.x, y: G.entryY, z: g.z + 6, res: 'gate', rf: j, hw: facHeadway(j) });
		path.push({ x: g.x, y: G.entryY, z: g.z - 6 });
	}
	if (hasStairs()) {
		const k = pickStair(p.plat);
		const sz = stairZ(WK.stairOf && WK.stairOf.get(p.plat) ? WK.stairOf.get(p.plat).indexOf(k) : 0);
		path.push({ x: px, y: G.entryY, z: sz - 10, res: 'stair', rf: k, hw: facHeadway(k) });
		path.push({ x: px, y: CFG.PLAT_Y, z: sz + 2, climb: true });
	} else {
		path.push({ x: px, y: 0, z: G.crossZ });
		path.push({ x: px, y: CFG.PLAT_Y, z: G.platZ1 - 3 });
	}
	path.push({ x: px + side * (S.platW / 2 - 1.3), y: CFG.PLAT_Y, z: doorZ(di), board: true });
	return attachFields(p, path);
}

/* ---- 設備のレーン ----
   待ち行列の時刻は「設備の永続ID」に紐づく。番号で索引していたころは、
   改札を1台撤去すると後続の番号が全部ずれて別の改札の行列が移り、
   増築のたびに全レーンがゼロに戻って朝ラッシュの行列が消えていた */
const FACR = { lane: new Map(), freeSlots: [], nSlot: 0 };

function laneOf(fid) { const v = FACR.lane.get(fid); return v === undefined ? -1 : v; }

function facRebindRuntime() {
	const live = new Set([0]);                    // 0番は構内踏切の予約席
	for (const fid of (WK.gateFid || [])) live.add(fid);
	for (const fid of (WK.stairEnds || new Map()).keys()) live.add(fid);
	// 消えた設備のレーンを返す。他のレーンは1つも動かない
	for (const [fid, slot] of FACR.lane) {
		if (live.has(fid)) continue;
		FACR.lane.delete(fid); FACR.freeSlots.push(slot);
		R.facFree[slot] = 0; R.facBuilt[slot] = 0; R.facUse[slot] = 0;
	}
	// 新しい設備にレーンを配る
	for (const fid of live) {
		if (FACR.lane.has(fid)) continue;
		const slot = FACR.freeSlots.length ? FACR.freeSlots.pop() : FACR.nSlot++;
		if (slot >= R.facFree.length) {
			const n = R.facFree.length * 2;
			const a = new Float64Array(n); a.set(R.facFree); R.facFree = a;
			const b = new Float64Array(n); b.set(R.facBuilt); R.facBuilt = b;
			const c = new Float64Array(n); c.set(R.facUse); R.facUse = c;
		}
		R.facFree[slot] = R.now;                  // 新設は「いま空いている」
		R.facUse[slot] = 0;
		FACR.lane.set(fid, slot);
	}
}

// その面でいちばん早く捌ける階段。返すのは永続ID
function pickStair(plat) {
	const list = (WK.stairOf && WK.stairOf.get(plat)) || [];
	let best = -1, bt = Infinity;
	for (const fid of list) {
		const slot = laneOf(fid);
		if (slot < 0) continue;
		const eta = Math.max(R.facFree[slot], R.now, R.facBuilt[slot]) + facHeadway(fid);
		if (eta < bt) { bt = eta; best = fid; }
	}
	return best;
}
// いちばん早く通れる改札。待ち時間だけでなく処理の速さも見る(自動改札に寄る)
function pickGate() {
	let best = -1, bt = Infinity;
	for (const fid of (WK.gateFid || [])) {
		const slot = laneOf(fid);
		if (slot < 0) continue;
		const eta = Math.max(R.facFree[slot], R.now, R.facBuilt[slot]) + facHeadway(fid);
		if (eta < bt) { bt = eta; best = fid; }
	}
	return best;
}

function addPax(dir, plat, track, x, y, z, born) {
	if (R.pax.length >= paxLimit()) return null;
	const p = newPax();
	p.dir = dir; p.plat = plat; p.track = track;
	p.x = x; p.y = y; p.z = z;
	p.w = R.paxScale;                 // 生成時のスケールを保持する
	p.born = born === undefined ? R.now : born;
	p.ph = wkRnd() * 6.283;
	p.head = dir === 0 ? 0 : Math.PI;
	p.spd = 0.78 + wkRnd() * 0.44;   // 歩く速さの個人差
	// 優等が走っているときだけ「速い列車を待つ」客が現れる
	p.pref = (dir === 1 && R.hasFast && wkRnd() < CFG.FAST_SHARE) ? 1 : 0;
	const pal = dir === 0 ? PAL_OUT : PAL_IN;
	p.col = pal[(wkRnd() * pal.length) | 0];
	p.jt = (wkRnd() - 0.5) * 0.7;
	p.fx = p.x; p.fz = p.z;
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
		const di = Math.floor(wkRnd() * G.nDoors);
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
				p.atRoot = 0;
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
			// 種別で分岐せず、経路に焼かれた設備の永続IDからレーンを引く
			const idx = laneOf(node.rf);
			if (idx < 0) { p.path = null; p.pi = 0; R.pax.splice(i, 1); continue; }
			const pool = R.facFree;
			let hw = node.hw;
			// 1エージェントが paxScale 人を表すので、占有時間もその分かかる
			hw *= R.paxScale;
			// 構内踏切は列車が抜けるまで開かない
			const open = node.res === 'cross' ? R.crossOpenAt : 0;
			const start = Math.max(pool[idx], R.now, open, R.facBuilt[idx]);
			pool[idx] = start + hw;
			R.resN[node.res] = (R.resN[node.res] || 0) + 1;   // Stage3の検証用
			R.facUse[idx] += R.paxScale;                     // 表示用の利用人数
			p.gotRes = true;
			p.until = start;
			// 自分の前に何人いるか。詳細モードでは実際にその人数ぶん後ろに並ぶ
			const ahead = Math.max(0, Math.ceil((start - R.now) / hw));
			const qx = node.qx || 0;
			const qz = node.qz !== undefined ? node.qz : (qx ? 0 : (p.dir === 0 ? -1 : 1));
			if (detail()) {
				// 1列が長くなりすぎたら折り返して、通路を塞ぎきらないようにする
				const perLane = 14;
				const lane = Math.floor(ahead / perLane) % 4;
				const along = (ahead % perLane) * CFG.QUEUE_PITCH + 0.4;
				p.sx = node.x + (qx ? qx * along : (lane - 1.5) * 0.62);
				p.sz = node.z + (qx ? (lane - 1.5) * 0.62 : qz * along);
			} else {
				const back = Math.min(ahead * 0.75, 40);
				p.sx = node.x + qx * back;
				p.sz = node.z + qz * back;
			}
			if (start > R.now) { p.state = 'queue'; continue; }
		}

		if (WK.audit.on) auditStep(p, node, dt);   // 影を1歩進めて記録するだけ。本体は触らない
		const ox = p.x, oz = p.z;
		const arrived = WK.on ? stepField(p, node, dt)
			: stepTo(p, node.x, node.y, node.z, dt, node.climb);
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
			// 影が「場だけで」アンカーまで来られたか。これが距離場の可否を決める指標。
			// 勾配とアンカー方向の角度(cos)は、場が集団までしか案内しない設計上
			// 負になって当たり前なので、到達したかどうかで見る
			if (WK.audit.on && node.fid !== undefined && node.fid >= 0) {
				WK.audit.legEnd.push(Math.hypot(p.fx - node.x, p.fz - node.z));
				if (WK.audit.legEnd.length > 30000) WK.audit.legEnd.shift();
			}
			p.pi++;
			p.stuckT = 0;                       // ノードが進んだので詰まり時間を戻す
			p.atRoot = 0;                       // 根に着いた印は脚ごとに解除する
			p.fRoot = 0;
			p.fx = p.x; p.fz = p.z;             // 影は脚の境界で同期する
			if (p.pi >= p.path.length) { finishPax(p); R.pax.splice(i, 1); }
		} else {
			/* 詰まり監視。動けない歩行客は paxLimit() を食い潰し、新規入場を止めて
			   「入場規制」を偽装する。経路のバグが別の症状に化けるのを防ぐ最後の網。
			   混雑減速の下限でも 0.23m/s は出るので、0.01m/s は 23 倍の余裕がある。
			   行列待ちと列車待ちは上で continue するので対象外(正当な待ちを追い出さない) */
			const lim = CFG.STUCK_SPD * dt;
			const mv = (p.x - ox) * (p.x - ox) + (p.z - oz) * (p.z - oz);
			p.stuckT = mv < lim * lim ? p.stuckT + dt : 0;
			if (p.stuckT > CFG.STUCK_EVICT) {
				WK.stat.evicted++;
				finishPax(p); R.pax.splice(i, 1);   // 満足度は課す(45秒立ち往生は実際に悪い体験)
			}
		}
	}
}

function stepTo(p, tx, ty, tz, dt, climb) {
	const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z;
	const d = Math.hypot(dx, dz);
	// 階段は昇降に時間がかかる
	const spd = climb
		? Math.hypot(9, CFG.CONC_Y - CFG.PLAT_Y) / CFG.STAIR_CLIMB * (S.esc ? 1.6 : 1)
		: CFG.WALK * crowdFactor(p) * (p.spd || 1);
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

/* ================= Stage3: 距離場で歩く =================
   ノード列そのものは一切変えない。変えるのは「隣り合うノードのあいだの歩き方」だけ。
   res(階段/改札/踏切)の予約は今までどおりノードが駆動するので、待ち行列は不変 */

/* 経路に距離場の番号とレイヤーを焼き込む。ノードを足しも消しも並べ替えもしない。
   高さの変わる脚(階段の昇降・地平のスロープ・地下の昇り)は必ず場を使わない —
   ここを場に任せると CFG.STAIR_CLIMB の意味が変わる */
function attachFields(p, path) {
	let prevY = p.y;                     // 生成直後の高さ = 第1脚の始点
	const onCross = z => !hasLink() && WK.crossZ >= 0 && cz(z) === WK.crossZ;
	for (let i = 0; i < path.length; i++) {
		const n = path[i];
		n.fid = -1;
		n.lay = (hasLink() && Math.abs(n.y - G.entryY) < 1.5) ? 1 : 0;

		// アンカーを盤面のセルへ寄せる(C3)。既定では動かさない
		if (WK.anchor) wkReanchor(p, path, i);

		// 場の割り当て。案内するのは「アンカーの集団」までで、端から端までは張らない。
		// 端から端まで張ると改札を迂回できてしまい、待ち行列が消える
		let fid = -1;
		if (n.res === 'gate') {
			const row = WK.gateRowOf ? WK.gateRowOf.get(n.rf) : undefined;
			if (row !== undefined && row >= 0) fid = (p.dir === 0 ? WK.fGP : WK.fGU)[row];
			if (fid === undefined) fid = -1;
		} else if (n.res === 'stair') {
			fid = p.dir === 0 ? -1 : WK.fSTAIR[p.plat];   // 出場はホーム上=見通しがきく
			if (fid === undefined) fid = -1;
		} else if (n.res === 'cross') {
			fid = p.dir === 0 ? -1 : WK.fCROSS_U;         // 出場側はスロープ脚なのでどのみち落ちる
		} else if (n.exit) {
			fid = WK.fEXIT;
		} else if (!n.board && onCross(n.z)) {
			// 踏切帯の上に落ちる中継ノード。出場は駅舎side、入場はホームsideへ渡る
			fid = p.dir === 0 ? WK.fCROSS_U : WK.fCROSS_P;
		}

		if (fid >= 0 && prevY === n.y && !n.climb) n.fid = fid;
		prevY = n.y;
	}
	p.wkVer = WK.ver;
	return path;
}

/* アンカー(ノードの目標座標)を盤面のセルへ寄せる。
   パラメトリックな platX/gatePos/stairZ と盤面のレイアウトは別々に決まっていて、
   新宿級では 100m 以上ずれる。距離場は盤面の上で定義されているので、
   アンカーが盤面から外れていると場と目標が食い違い、乗客が迷う */
function wkReanchor(p, path, i) {
	const n = path[i], nx = path[i + 1];
	if (n.res === 'gate') {
		// 出場は精算済側(-Z)から入り、入場は改札外側(+Z)から入る
		const a = wkAnchorGate(n.rf, p.dir === 0);
		if (a) { n.x = a.x; n.z = a.z; }
		const b = wkAnchorGate(n.rf, p.dir !== 0);
		if (b && nx && !nx.res) { nx.x = b.x; nx.z = b.z + (p.dir === 0 ? 2 : -2); }
	} else if (n.res === 'stair') {
		// 出場はホーム口(+Z端)から入って上へ、入場はコンコース口(-Z端)から入って下へ
		const a = wkAnchorStair(n.rf, p.dir !== 0);
		if (a) { n.x = a.x; n.z = a.z; }
		const b = wkAnchorStair(n.rf, p.dir === 0);
		if (b && nx && nx.climb) { nx.x = b.x; nx.z = b.z; }
	} else if (n.res === 'cross') {
		const a = wkAnchorCross(p.dir === 0 ? 'plat' : 'conc');
		if (a) { n.x = a.x; n.z = a.z; }
		// 渡りきった先も盤面へ
		const b = wkAnchorCross(p.dir === 0 ? 'conc' : 'plat');
		if (b && nx && !nx.res && !nx.board) { nx.x = b.x; nx.z = b.z; }
	} else if (n.board) {
		const a = wkAnchorBoard(p.plat, p.track, n.z);
		n.x = a.x; n.z = a.z;
	} else if (n.exit && WK.entRect) {
		// 出口の最終点は意図的に盤外(構造の外へ歩き去る)。x だけ出口の帯に収める
		n.x = Math.min(Math.max(n.x, wx(WK.entRect.x0)), wx(WK.entRect.x1));
	} else if (nx && nx.exit && WK.entRect && !n.res) {
		// 出口の1つ手前の中継点は帯の中に置く(地下の昇り口など)
		n.x = wx(Math.round((WK.entRect.x0 + WK.entRect.x1) / 2));
		n.z = wz(Math.round((WK.entRect.z0 + WK.entRect.z1) / 2));
	}
}

/* 距離場に沿って1歩ぶん歩かせる。戻り値は stepTo と同じ「node に着いたか」。
   使えない状況では必ず現行の stepTo に落ちる */
function stepField(p, node, dt) {
	if (node.climb || node.fid === undefined || node.fid < 0)
		return stepTo(p, node.x, node.y, node.z, dt, node.climb);
	if (p.wkVer !== WK.ver) { WK.stat.stale++; return stepTo(p, node.x, node.y, node.z, dt, node.climb); }
	/* いちど根に着いたら、その脚のあいだは直線に固定する。
	   場は「設備の集団」までしか案内しないので、同じ面に階段が2本あると
	   目標の階段へ1歩踏み出した瞬間に勾配が最寄りのもう1本へ引き戻し、
	   境界で永久に振動する(詰まり監視は動いているので発火しない) */
	if (p.atRoot) return stepTo(p, node.x, node.y, node.z, dt, node.climb);
	const k = wkCellOf(node.lay, p.x, p.z);
	const g = wkSample(node.fid, k);
	if (!g.ok) { WK.stat.fallback++; return stepTo(p, node.x, node.y, node.z, dt, node.climb); }
	if (g.at) { p.atRoot = 1; return stepTo(p, node.x, node.y, node.z, dt, node.climb); }

	const dx = node.x - p.x, dz = node.z - p.z;
	const dRest = Math.hypot(dx, dz);
	const spd = CFG.WALK * crowdFactor(p) * (p.spd || 1);
	const move = spd * dt;
	if (dRest <= move || dRest < 0.05) {          // 到達判定は stepTo と同一
		p.x = node.x; p.y = node.y; p.z = node.z;
		return true;
	}
	// 横のばらつき。全員が同じ折れ線に重なるのを防ぐ。アンカーは動かさないので
	// 到達判定にも行列の位置にも影響しない
	const jx = -g.z * p.jt, jz = g.x * p.jt;
	const gnx = g.x + jx, gnz = g.z + jz, gm = Math.hypot(gnx, gnz) || 1;
	const ux = gnx / gm, uz = gnz / gm;
	p.x += ux * move; p.z += uz * move;
	p.head = Math.atan2(ux, uz);
	// 高さは「アンカーまでの残り水平距離」に比例して詰める。
	// 勾配の1歩(2m)で割ると階段まわりで y が一気に飛ぶ
	const dy = node.y - p.y;
	if (Math.abs(dy) > 0.001) p.y += dy * Math.min(1, move / dRest);
	return false;
}

/* 影エージェント。距離場だけで動く2つ目の位置を並走させ、本体との差を測る。
   予約もしないし到達判定もしないので、ゲームには一切影響しない */
function auditStep(p, node, dt) {
	const a = WK.audit;
	a.n++;
	if (node.climb || node.fid === undefined || node.fid < 0) { p.fx = p.x; p.fz = p.z; return; }
	if (p.fRoot) { const d0 = Math.hypot(node.x - p.fx, node.z - p.fz);
		if (d0 > 0.05) { const mv = CFG.WALK * crowdFactor(p) * (p.spd || 1) * dt;
			p.fx += (node.x - p.fx) / d0 * Math.min(mv, d0); p.fz += (node.z - p.fz) / d0 * Math.min(mv, d0); }
		if (a.gap.length < 30000) a.gap.push(Math.hypot(p.fx - p.x, p.fz - p.z));
		return; }
	const k = wkCellOf(node.lay, p.fx, p.fz);
	const g = wkSample(node.fid, k);
	if (k < 0 || !g.ok) { a.offGraph++; p.fx = p.x; p.fz = p.z; return; }
	if (g.at) p.fRoot = 1;
	const dx = node.x - p.fx, dz = node.z - p.fz;
	const dRest = Math.hypot(dx, dz);
	const move = CFG.WALK * crowdFactor(p) * (p.spd || 1) * dt;
	let ux, uz;
	if (g.at || dRest < 0.05) { ux = dRest ? dx / dRest : 0; uz = dRest ? dz / dRest : 0; }
	else { ux = g.x; uz = g.z; }
	p.fx += ux * move; p.fz += uz * move;
	if (a.gap.length < 30000) a.gap.push(Math.hypot(p.fx - p.x, p.fz - p.z));
	if (!g.at && dRest > 1) {
		const c = (g.x * dx + g.z * dz) / dRest;
		if (a.cos.length < 30000) a.cos.push(c);
		// 脚の種類ごとの内訳。どの脚で場とアンカーが食い違うかを切り分ける
		const key = (node.res || (node.exit ? 'exit' : node.board ? 'board' : 'mid')) + '/' + p.dir;
		const b = a.by[key] || (a.by[key] = { n: 0, sum: 0, neg: 0, min: 1 });
		b.n++; b.sum += c; if (c < 0) b.neg++; if (c < b.min) b.min = c;
	}
}

function wkPct(arr, q) {
	if (!arr.length) return 0;
	const a = arr.slice().sort((x, y) => x - y);
	return +a[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(3);
}

function auditReport() {
	const a = WK.audit;
	return {
		n: a.n, offGraph: a.offGraph,
		onGraph: a.n ? +(1 - a.offGraph / a.n).toFixed(4) : 1,
		gapMed: wkPct(a.gap, 0.5), gapP95: wkPct(a.gap, 0.95), gapMax: wkPct(a.gap, 1),
		cosMed: wkPct(a.cos, 0.5), cosP05: wkPct(a.cos, 0.05), cosMin: wkPct(a.cos, 0),
		cosNeg: a.cos.filter(c => c < 0).length,
		// 脚の終わりに影がアンカーからどれだけ離れているか。これが小さければ場は正しい
		legMed: wkPct(a.legEnd, 0.5), legP95: wkPct(a.legEnd, 0.95), legMax: wkPct(a.legEnd, 1),
		legN: a.legEnd.length, legBad: a.legEnd.filter(v => v > 6).length,
		by: Object.keys(a.by).sort().map(k => k + ' n=' + a.by[k].n
			+ ' 平均cos=' + (a.by[k].sum / a.by[k].n).toFixed(3)
			+ ' 逆向き=' + a.by[k].neg + ' 最小=' + a.by[k].min.toFixed(2)),
		samples: { gap: a.gap.length, cos: a.cos.length },
		stale: WK.stat.stale, fallback: WK.stat.fallback, evicted: WK.stat.evicted,
	};
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

// 等倍(またはごく低速)なら詳細モード
function detail() { return R.speed > 0 && R.speed <= CFG.DETAIL_SPEED; }
function paxLimit() { return detail() ? CFG.MAX_PAX_DETAIL : CFG.MAX_PAX; }

function updateDemand(dt) {
	// この先しばらくに乗れるスジが1本も無ければ、そもそも客は駅に来ない。
	// 白紙スタートで「列車が無ければ客も来ない」を成立させる
	let served = false;
	for (let t = 0; t < S.nTrack && !served; t++) {
		const s = nextDepOn(t, S.t);
		if (s && s.dep - S.t <= CFG.ENTER_WINDOW) served = true;
	}

	const dm = demandNow();
	// 等倍のときは1体=1人。高速再生では上限に収まるようスケールする
	const lim = detail() ? CFG.MAX_PAX_DETAIL : CFG.MAX_PAX;
	const want = Math.ceil((dm.in + dm.out) * 220 / lim);
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
	while (R.inQHead < R.inQ.length && R.pax.length < paxLimit()) {
		const track = pickBoardTrack();
		if (track < 0) break;
		const p = isUnder()
			? addPax(1, trackPlat(track), track,
				G.concX1 + 40 + wkRnd() * 10, 0, G.exitZ + (wkRnd() - 0.5) * 12, R.inQ[R.inQHead])
			: addPax(1, trackPlat(track), track,
				G.concX0 + 2 + wkRnd() * Math.max(1, (G.concX1 - G.concX0) - 4),
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

/* 臨時列車(単発スジ)1本あたりの運行料。
   1日8本ぶんでちょうど1編成のリース料になる。数本なら断然安く、
   終日走らせるなら自前で契約したほうが安い、という分かれ目 */
function runFee(mid, cars) { return Math.round(contractLease(mid, cars) / 8); }

// 今日走る予定の臨時列車の借り賃合計(UIの見積り用。実際は発車ごとに引かれる)
function runFeeTotal() {
	let n = 0;
	for (const s of (R.sched || [])) if (s.run !== undefined) n += runFee(s.m, s.cars);
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
	R.facUse.fill(0);
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
		// 方向が無かった頃のセーブ。全番線を北行きにすると発車間隔が急にきつくなるので、
		// 実際の島式ホームと同じく、番線の偶数奇数で上下に振り分ける
		if (!Array.isArray(S.trackDir)) S.trackDir = [];
		for (let t = 0; t < S.nTrack; t++) if (S.trackDir[t] === undefined) S.trackDir[t] = t % 2;
		// 駅舎の大きさを持っていなかった頃のセーブ。bldFit() が焼く直前に埋めるので0で足りる
		// 線路とホームを持っていなかった頃のセーブ。いまの見た目のまま起こし直す
		if (!Array.isArray(S.rail)) S.rail = [];
		if (!Array.isArray(S.plat)) S.plat = [];
		if (!Array.isArray(S.road)) S.road = [];
		if (!Array.isArray(S.bldg)) S.bldg = [];
		if (!S.bldg.length && S.devs && Object.keys(S.devs).length) migrateTown();
		if (S.plat.length === 0 && S.rail.length <= 1 && (o.nPlat > 0 && o.cars > 0 && o.nTrack > 0 && o.plat === undefined)) { S.rail = []; migrateLayout(); }
		if (!Array.isArray(S.fac)) S.fac = [];
		S.nextFid = Math.max(1, S.nextFid | 0);
		for (const f of S.fac) if (f.i >= S.nextFid) S.nextFid = f.i + 1;
		if (typeof S.bldN !== 'number') S.bldN = 0;
		if (typeof S.bldD !== 'number') S.bldD = 0;
		if (typeof S.bldW !== 'number') S.bldW = 0;
		if (!Array.isArray(S.dests) || !S.dests.length) S.dests = defaultState().dests;
		if (!Array.isArray(S.runs)) S.runs = [];
		S.runId = Math.max(1, S.runId | 0);
		for (const r of S.runs) if (r.id >= S.runId) S.runId = r.id + 1;
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
		can: () => false,
		ng: () => '🗺配置で置く',
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
		apply: () => { facAutoPlace(S.esc ? K_ESCAL : K_STAIR); },
	},
	{
		id: 'esc', ic: '🛗', name: 'エスカレーター化',
		desc: 'すべての階段をエスカレーターに。処理能力が約2倍。',
		cost: () => 4500000,
		can: () => !S.esc,
		ng: () => '導入済み',
		apply: () => { for (const r of S.fac) if (r.k === K_STAIR) r.k = K_ESCAL; facApply(); },
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
		apply: () => { facAutoPlace(K_GATEM); },
	},
	{
		id: 'gateA', ic: '🎫', name: '自動改札を1台設置',
		desc: () => '約' + CFG.GATE_A_HEADWAY + '秒に1人と速く、維持費も安い。'
			+ '初期費用は高い。現在 ' + S.gateA + '台。',
		// 新宿級には140台前後必要になる。指数だと絶対に届かないので線形に近づける
		cost: () => 1900000 * (1 + S.gateA * 0.006),
		can: () => S.gateA < 220,
		ng: () => '上限',
		apply: () => { facAutoPlace(K_GATEA); },
	},
	{
		id: 'line', ic: '🧭', name: '本線を増設',
		desc: () => '駅の外へ出ていく線路を1本増やす。本線は上り下りそれぞれ' + Math.round(CFG.LINE_HEAD / 60)
			+ '分に1本まで発車でき、同じ向きに2番線を交互に使うとその上限を出しきれる。現在 '
			+ S.lines + '本線 / 番線' + S.nTrack + '（理論上限 '
			+ Math.min(S.lines * 2 * 3600 / CFG.LINE_HEAD, S.nTrack * 3600 / CFG.TRACK_HEAD) + '本/時）',
		cost: () => 18000000 * Math.pow(1.55, S.lines - 1),
		can: () => S.lines < CFG.MAX_LINES && S.nTrack > S.lines,
		ng: () => S.lines >= CFG.MAX_LINES ? '上限' : '先に番線を増設',
		apply: () => { S.lines++; },
	},
	{
		id: 'track', ic: '🛤', name: '線路を増設',
		desc: '発着できる列車が増え、輸送力が上がる。ホーム1面につき2線まで。',
		cost: () => 3200000 * Math.pow(1.30, S.nTrack - 1),
		can: () => false,
		ng: () => '🗺配置で置く',
		// 増設した番線は反対方向を初期値にする。島式ホームの上下1本ずつと同じ
		apply: () => { S.trackDir[S.nTrack] = S.nTrack % 2; S.nTrack++; },
	},
	{
		id: 'plat', ic: '🏗', name: 'ホームを増設',
		desc: '島式ホームを1面追加。線路をさらに2本敷けるようになる。',
		cost: () => 14000000 * Math.pow(1.55, S.nPlat - 1),
		can: () => false,
		ng: () => '🗺配置で置く',
		apply: () => { S.nPlat++; },
	},
	{
		id: 'platw', ic: '↔️', name: 'ホームを拡幅',
		desc: 'ホームを2m広げる。待機客の密度が下がり、歩行が速くなる。',
		cost: () => 2600000 * Math.pow(1.4, (S.platW - 6) / 2),
		can: () => false,
		ng: () => '🗺配置で置く',
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
		apply: () => { facAutoPlace(K_CONV); },
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
			const why = u.apply();
			if (why) {                                  // 置く場所が無かった等
				S.money += c;
				alertOnce('noplace', '⚠ 置く場所がありません — ' + (NG_TEXT[why] || why), false, 8);
				renderUpgrades();
				return;
			}
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
			// 町は 🏗建てる で盤面に置くようになった。ここでは買えない
			alertOnce('devmoved', '町は 🏗建てる で置きます(道路で駅まで繋いでください)', false, 6);
			return;
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
	// 盤面と歩行グラフを先に起こす。下の経路再生成が距離場の番号を焼き込むので、
	// 順序が逆だと古い盤面の場を掴む
	try { gridFromParams(); } catch (e) { console.error('grid', e); }
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




/* ================= 町 =================
   道路と建物もユーザーが置く。乗客は「駅までの距離」と
   「道路で駅までつながっていること」で決まる。
   置いただけでは1人も来ない — 駅前まで道を通して初めて人が動く */

// 建物の大きさ。DEVS の id に対応する
const BLDG_SIZE = {
	home1: [2, 2], school: [4, 3], office1: [3, 3], shop1: [4, 4],
	univ: [5, 4], office2: [3, 4], home2: [5, 5], sub: [6, 6],
};
function bldgSize(id) { return BLDG_SIZE[id] || [2, 2]; }
function devOf(id) { for (const d of DEVS) if (d.id === id) return d; return null; }

/* 道路の連結。駅の出入口に接している道から辿れる道だけが「つながっている」 */
function roadReach() {
	const key = (x, z) => x * GRID.D + z;
	const road = new Set();
	for (const c of S.road) road.add(key(c.x, c.z));
	const seen = new Set();
	const q = [];
	// 出入口の帯に接している道路から始める
	if (WK.entRect) {
		const r = WK.entRect;
		for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
			for (let z = r.z0 - 1; z <= r.z1 + 2; z++) {
				const k = key(x, z);
				if (road.has(k) && !seen.has(k)) { seen.add(k); q.push([x, z]); }
			}
		}
	}
	let h = 0;
	while (h < q.length) {
		const [x, z] = q[h++];
		for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + d[0], nz = z + d[1], k = key(nx, nz);
			if (road.has(k) && !seen.has(k)) { seen.add(k); q.push([nx, nz]); }
		}
	}
	return seen;
}

/* 建物が道路につながっているか。建物の外周1マスに、駅まで通じた道があること */
function bldgConnected(b, reach) {
	const [w, d] = bldgSize(b.k);
	const key = (x, z) => x * GRID.D + z;
	for (let x = b.x - 1; x <= b.x + w; x++) {
		for (let z = b.z - 1; z <= b.z + d; z++) {
			if (x >= b.x && x < b.x + w && z >= b.z && z < b.z + d) continue;
			if (reach.has(key(x, z))) return true;
		}
	}
	return false;
}

/* 駅からの距離による効き方。近いほど多く使う。
   出入口からのマンハッタン距離(m)で見る */
function bldgDist(b) {
	const [w, d] = bldgSize(b.k);
	const cxm = wx(b.x + (w - 1) / 2), czm = wz(b.z + (d - 1) / 2);
	const ex = WK.entRect ? wx((WK.entRect.x0 + WK.entRect.x1) / 2) : 0;
	const ez = WK.entRect ? wz((WK.entRect.z0 + WK.entRect.z1) / 2) : 0;
	return Math.abs(cxm - ex) + Math.abs(czm - ez);
}
// 400m まで満額、そこから落ちて 1200m でほぼ0
function distFactor(m) {
	if (m <= 400) return 1;
	if (m >= 1200) return 0.05;
	return 0.05 + 0.95 * (1200 - m) / 800;
}

/* 置いてある建物から1日の需要を出す。
   道でつながっていない建物は1人も出さない */
/* 旧セーブの S.devs(種類ごとの個数)を、駅前に並べた建物と道路に起こす。
   移行してもその人の投資が消えないようにする */
function migrateTown() {
	const ez = GRID.OZ + 20;                 // 駅前より少し先から並べる
	let x = GRID.OX - 24, z = ez + 3, rowH = 0;   // 道路(ez+2)の1マス隣に並べる
	// 駅前から東西に伸びる幹線道路
	for (let i = GRID.OX - 30; i <= GRID.OX + 30; i++) S.road.push({ x: i, z: ez + 2 });
	for (let i = GRID.OZ + 2; i <= ez + 2; i++) S.road.push({ x: GRID.OX, z: i });
	for (const d of DEVS) {
		const n = (S.devs && S.devs[d.id]) | 0;
		for (let k = 0; k < n; k++) {
			const [w, h] = bldgSize(d.id);
			if (x + w > GRID.OX + 28) { x = GRID.OX - 24; z += rowH + 2; rowH = 0;
				for (let i = GRID.OX - 30; i <= GRID.OX + 30; i++) S.road.push({ x: i, z: z - 1 }); }
			if (z + h >= GRID.D - 2) return;
			S.bldg.push({ k: d.id, x: x, z: z });
			x += w + 1; rowH = Math.max(rowH, h);
		}
	}
}

function townPax() {
	const reach = roadReach();
	let n = 0;
	TOWN.live = 0; TOWN.off = 0;
	for (const b of S.bldg) {
		const d = devOf(b.k);
		if (!d) continue;
		if (!bldgConnected(b, reach)) { b.off = 1; TOWN.off++; continue; }
		b.off = 0; TOWN.live++;
		n += d.pax * distFactor(bldgDist(b));
	}
	return n;
}
const TOWN = { live: 0, off: 0 };

/* 建てられるか。盤の中で、駅の設備や線路・ホームに被らないこと */
function bldgWhy(id, x, z) {
	const [w, d] = bldgSize(id);
	for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
		const px = x + i, pz = z + j;
		if (!inBoard(px, pz)) return '盤の外';
		if (isRailCell(px, pz)) return '線路の上には置けない';
		if (isPlatCell(px, pz)) return 'ホームの上には置けない';
		if (tAt(0, px, pz) !== C_EMPTY && tAt(0, px, pz) !== C_ROAD) return '駅の敷地には置けない';
		for (const r of S.road) if (r.x === px && r.z === pz) return '道路の上には置けない';
		for (const o of S.bldg) {
			const [ow, od] = bldgSize(o.k);
			if (o !== null && px >= o.x && px < o.x + ow && pz >= o.z && pz < o.z + od) return '建物が重なる';
		}
	}
	return null;
}

function roadWhy(x, z) {
	if (!inBoard(x, z)) return '盤の外';
	if (isRailCell(x, z)) return '線路の上には置けない';
	if (isPlatCell(x, z)) return 'ホームの上には置けない';
	if (tAt(0, x, z) !== C_EMPTY && tAt(0, x, z) !== C_ROAD) return '駅の敷地には置けない';
	for (const b of S.bldg) {
		const [w, d] = bldgSize(b.k);
		if (x >= b.x && x < b.x + w && z >= b.z && z < b.z + d) return '建物の上には置けない';
	}
	return null;
}

/* 盤面へ焼く。道路と建物は歩行の対象ではないので WALKABLE には入れない */
function layTown() {
	for (const c of S.road) {
		if (!inBoard(c.x, c.z)) continue;
		const k = gidx(0, c.x, c.z);
		if (B.t[k] === C_EMPTY) B.t[k] = C_ROAD;
	}
	for (const b of S.bldg) {
		const [w, d] = bldgSize(b.k);
		for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
			if (!inBoard(b.x + i, b.z + j)) continue;
			const k = gidx(0, b.x + i, b.z + j);
			if (B.t[k] === C_EMPTY || B.t[k] === C_ROAD) B.t[k] = C_BLDG;
		}
	}
}

/* ================= 3Dの上で建てる =================
   指の下のマスをレイキャストで拾う。1本指は建てる操作、視点は2本指。
   ホームはドラッグで矩形を引き、寸法と両数を見ながら ✓ で確定する */
const BUILD = {
	on: false,
	tool: 'plat',        // 'plat' | 'rail' | 'erase'
	from: null, to: null,   // 引いている矩形
	ghost: null, ghostGeo: null,
	pending: null,       // 確定待ち {kind, cells, cost}
	pointers: 0,
	undo: [],
	savedSpeed: undefined,
};

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPt = new THREE.Vector3();

// 画面の点 → 盤面のマス
function pickCell(clientX, clientY, y) {
	if (!renderer) return null;
	const r = renderer.domElement.getBoundingClientRect();
	_ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
	_ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
	_ray.setFromCamera(_ndc, camera);
	_plane.constant = -(y || 0);
	if (!_ray.ray.intersectPlane(_plane, _hitPt)) return null;
	const x = cx(_hitPt.x), z = cz(_hitPt.z);
	return inBoard(x, z) ? { x: x, z: z } : null;
}

const BUILD_PRICE = { plat: 60000, rail: 4200000 };   // ホームは1マス、線路は1本
const BUILD_REFUND = 0.5;

/* ---- ホームの矩形 ---- */
function platRectCells(a, b) {
	const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
	const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
	const cells = [];
	for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) cells.push({ x: x, z: z });
	return { x0: x0, x1: x1, z0: z0, z1: z1, cells: cells };
}

/* 置けるか。空きマスであること、そして線路か既存ホームに接していること
   (宙に浮いたホームを作らせない) */
/* 判定は「ユーザーが置いたもの」だけを見る。
   駅前の帯や駅舎は骨格として毎回焼き直されるので、障害物として数えない
   (数えるとホームを南へ伸ばせなくなる) */
function isRailCell(x, z) {
	void z;
	for (const r of S.rail) if (x === r.x || x === r.x + 1) return true;
	return false;
}
function isPlatCell(x, z) {
	for (const c of S.plat) if (c.x === x && c.z === z) return true;
	return false;
}
function platRectWhy(r) {
	for (const c of r.cells) {
		if (!inBoard(c.x, c.z)) return '盤の外';
		if (isRailCell(c.x, c.z)) return '線路の上には置けない';
		if (isPlatCell(c.x, c.z)) return 'すでにホームがある';
	}
	// 線路か既存のホームに接していること(宙に浮いたホームを作らせない)
	for (const c of r.cells) {
		for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const x = c.x + d[0], z = c.z + d[1];
			if (isRailCell(x, z) || isPlatCell(x, z)) return null;
		}
	}
	return '線路かホームに接していないと置けない';
}

/* 引いている矩形が何両ぶんになるか。線路に沿った長さで決まる */
function platRectCars(r) {
	return Math.floor(((r.z1 - r.z0 + 1) * GRID.CELL) / CFG.CAR_LEN);
}

/* ---- ゴースト ---- */
function buildGhost() {
	if (!BUILD.ghost) {
		BUILD.ghostGeo = new THREE.BoxGeometry(1, 0.5, 1);
		const m = new THREE.MeshBasicMaterial({ color: C(0x7ee0a0), transparent: true, opacity: 0.5, depthTest: false });
		BUILD.ghost = new THREE.Mesh(BUILD.ghostGeo, m);
		BUILD.ghost.renderOrder = 999;
		scene.add(BUILD.ghost);
	}
	const g = BUILD.ghost;
	const p = BUILD.pending;
	if (!BUILD.on || !p) { g.visible = false; return; }
	g.visible = true;
	const w = (p.x1 - p.x0 + 1) * GRID.CELL, d = (p.z1 - p.z0 + 1) * GRID.CELL;
	g.scale.set(w, 1, d);
	g.position.set((wx(p.x0) + wx(p.x1)) / 2, CFG.PLAT_Y * 0.6, (wz(p.z0) + wz(p.z1)) / 2);
	g.material.color.set(p.why ? C(0xc8503c) : C(0x7ee0a0));
}

/* ---- 操作 ---- */
function buildUpdatePending() {
	if (BUILD.tool === 'road') return;          // 道路はなぞった端から敷く
	if (BUILD.tool === 'bldg' && BUILD.to) {
		const id = BUILD.bldg || DEVS[0].id, sz = bldgSize(id), d = devOf(id);
		const r = { kind: 'bldg', id: id, x0: BUILD.to.x, x1: BUILD.to.x + sz[0] - 1,
			z0: BUILD.to.z, z1: BUILD.to.z + sz[1] - 1, cost: d ? d.cost : 0 };
		r.why = bldgWhy(id, r.x0, r.z0);
		if (!r.why && S.money < r.cost) r.why = '資金が足りない';
		if (!r.why && d && S.rep < d.rep) r.why = '評判' + d.rep + 'から';
		BUILD.pending = r;
		buildGhost(); renderBuildBar();
		return;
	}
	if (BUILD.tool === 'plat' && BUILD.from && BUILD.to) {
		const r = platRectCells(BUILD.from, BUILD.to);
		r.kind = 'plat';
		r.why = platRectWhy(r);
		r.cost = r.cells.length * BUILD_PRICE.plat;
		if (!r.why && S.money < r.cost) r.why = '資金が足りない';
		BUILD.pending = r;
	} else if (BUILD.tool === 'rail' && BUILD.to) {
		const x = BUILD.to.x;
		const r = { kind: 'rail', x0: x, x1: x + 1, z0: 0, z1: GRID.D - 1, cells: [], cost: BUILD_PRICE.rail };
		r.why = null;
		for (let i = 0; i < 2; i++) {
			if (!inBoard(x + i, 0)) { r.why = '盤の外'; break; }
		}
		if (!r.why) {
			for (let i = 0; i < 2 && !r.why; i++) {
				if (isRailCell(x + i, 0)) r.why = 'すでに線路がある';
				else for (const c of S.plat) if (c.x === x + i) { r.why = 'ホームが乗っている'; break; }
			}
		}
		if (!r.why && S.money < r.cost) r.why = '資金が足りない';
		BUILD.pending = r;
	}
	buildGhost();
	renderBuildBar();
}

// ✓ 確定
function buildConfirm() {
	const p = BUILD.pending;
	if (!p || p.why) return;
	if (p.kind === 'plat') {
		for (const c of p.cells) S.plat.push({ x: c.x, z: c.z });
		BUILD.undo.push({ plat: p.cells.slice(), cost: p.cost });
	} else if (p.kind === 'rail') {
		S.rail.push({ x: p.x0 });
		S.rail.sort((a, b) => a.x - b.x);
		BUILD.undo.push({ rail: p.x0, cost: p.cost });
	} else if (p.kind === 'bldg') {
		S.bldg.push({ k: p.id, x: p.x0, z: p.z0 });
		BUILD.undo.push({ bldg: { x: p.x0, z: p.z0 }, cost: p.cost });
	}
	S.money -= p.cost;
	BUILD.pending = null; BUILD.from = null; BUILD.to = null;
	facApply(); buildGhost(); renderBuildBar(); save();
}

// ✕ 取り消し
function buildCancel() {
	BUILD.pending = null; BUILD.from = null; BUILD.to = null;
	buildGhost(); renderBuildBar();
}

function buildUndo() {
	const u = BUILD.undo.pop();
	if (!u) return;
	if (u.plat) {
		for (const c of u.plat) {
			const i = S.plat.findIndex(q => q.x === c.x && q.z === c.z);
			if (i >= 0) S.plat.splice(i, 1);
		}
	} else if (u.rail !== undefined) {
		const i = S.rail.findIndex(q => q.x === u.rail);
		if (i >= 0) S.rail.splice(i, 1);
	} else if (u.bldg) {
		const i = S.bldg.findIndex(q => q.x === u.bldg.x && q.z === u.bldg.z);
		if (i >= 0) S.bldg.splice(i, 1);
	} else if (u.road) {
		for (const c of u.road) {
			const i = S.road.findIndex(q => q.x === c.x && q.z === c.z);
			if (i >= 0) S.road.splice(i, 1);
		}
	}
	S.money += u.cost;
	facApply(); renderBuildBar(); save();
}

// 撤去。タップしたマスのホーム、無ければ線路
function buildEraseAt(c) {
	let i = S.plat.findIndex(q => q.x === c.x && q.z === c.z);
	if (i >= 0) {
		S.plat.splice(i, 1);
		S.money += Math.round(BUILD_PRICE.plat * BUILD_REFUND);
		facApply(); renderBuildBar(); save();
		return;
	}
	i = S.road.findIndex(q => q.x === c.x && q.z === c.z);
	if (i >= 0) {
		S.road.splice(i, 1);
		S.money += Math.round(ROAD_PRICE * BUILD_REFUND);
		facApply(); renderBuildBar(); save();
		return;
	}
	i = S.bldg.findIndex(q => { const sz = bldgSize(q.k);
		return c.x >= q.x && c.x < q.x + sz[0] && c.z >= q.z && c.z < q.z + sz[1]; });
	if (i >= 0) {
		const d = devOf(S.bldg[i].k);
		S.bldg.splice(i, 1);
		S.money += Math.round((d ? d.cost : 0) * BUILD_REFUND);
		facApply(); renderBuildBar(); save();
		return;
	}
	i = S.rail.findIndex(q => q.x === c.x || q.x + 1 === c.x);
	if (i >= 0) {
		const x = S.rail[i].x;
		// その線路に接しているホームが浮いてしまわないか見てから消す
		S.rail.splice(i, 1);
		S.money += Math.round(BUILD_PRICE.rail * BUILD_REFUND);
		facApply(); renderBuildBar(); save();
		void x;
	}
}

// なぞった1マスに道を敷く。連続して引けるようにストロークで貯める
function buildRoadAt(c) {
	if (!BUILD.stroke) BUILD.stroke = [];
	for (const q of BUILD.stroke) if (q.x === c.x && q.z === c.z) return;
	if (roadWhy(c.x, c.z)) return;
	for (const q of S.road) if (q.x === c.x && q.z === c.z) return;
	if (S.money < ROAD_PRICE) return;
	S.money -= ROAD_PRICE;
	S.road.push({ x: c.x, z: c.z });
	BUILD.stroke.push({ x: c.x, z: c.z });
	renderBuildBar();
}

function initBuild3D() {
	const dom = renderer.domElement;
	dom.addEventListener('pointerdown', e => {
		BUILD.pointers++;
		if (!BUILD.on || BUILD.pointers > 1) return;
		controls.enabled = false;                 // 1本指は建てる操作
		const c = pickCell(e.clientX, e.clientY, 0);
		if (!c) return;
		if (BUILD.tool === 'erase') { buildEraseAt(c); return; }
		if (BUILD.tool === 'road') { BUILD.stroke = []; buildRoadAt(c); return; }
		BUILD.from = c; BUILD.to = c;
		buildUpdatePending();
	});
	dom.addEventListener('pointermove', e => {
		if (!BUILD.on || BUILD.pointers !== 1) return;
		if (BUILD.tool !== 'road' && !BUILD.from) return;
		const c = pickCell(e.clientX, e.clientY, 0);
		if (!c) return;
		if (BUILD.tool === 'road') { buildRoadAt(c); return; }
		BUILD.to = c;
		buildUpdatePending();
	});
	const up = () => {
		BUILD.pointers = Math.max(0, BUILD.pointers - 1);
		if (BUILD.pointers === 0) {
			controls.enabled = true;
			if (BUILD.stroke && BUILD.stroke.length) {
				BUILD.undo.push({ road: BUILD.stroke.slice(), cost: BUILD.stroke.length * ROAD_PRICE });
				BUILD.stroke = null;
				facApply(); renderBuildBar(); save();
			}
		}
	};
	dom.addEventListener('pointerup', up);
	dom.addEventListener('pointercancel', up);
}

const B3_TOOLS = [
	{ id: 'plat', ic: '🚉', name: 'ホーム' },
	{ id: 'rail', ic: '🛤', name: '線路' },
	{ id: 'road', ic: '🛣', name: '道路' },
	{ id: 'bldg', ic: '🏘', name: '建物' },
	{ id: 'erase', ic: '🗑', name: '撤去' },
];
const ROAD_PRICE = 40000;

function renderBuildBar() {
	const el = document.getElementById('b3Tools');
	if (!el) return;
	el.innerHTML = '';
	for (const t of B3_TOOLS) {
		const b = document.createElement('button');
		b.innerHTML = '<b>' + t.ic + '</b><span>' + t.name + '</span>';
		if (BUILD.tool === t.id) b.className = 'on';
		b.onclick = () => { BUILD.tool = t.id; buildCancel(); renderBuildBar(); };
		el.appendChild(b);
	}
	// 建物の道具のときは、種類を選ぶ帯を出す
	const pick = document.getElementById('b3Pick');
	if (pick) {
		pick.hidden = BUILD.tool !== 'bldg';
		if (BUILD.tool === 'bldg') {
			pick.innerHTML = '';
			for (const d of DEVS) {
				const b = document.createElement('button');
				const lock = S.rep < d.rep;
				b.innerHTML = '<b>' + d.ic + '</b><span>' + d.name + '</span><i>'
					+ (lock ? '評判' + d.rep : yen(d.cost)) + '</i>';
				if ((BUILD.bldg || DEVS[0].id) === d.id) b.className = 'on';
				if (lock) b.classList.add('poor');
				b.onclick = () => { BUILD.bldg = d.id; buildCancel(); renderBuildBar(); };
				pick.appendChild(b);
			}
		}
	}
	const info = document.getElementById('b3Info');
	const ok = document.getElementById('b3Ok');
	const ng = document.getElementById('b3Ng');
	const p = BUILD.pending;
	if (info) {
		if (!p) {
			info.textContent = BUILD.tool === 'plat' ? 'ホームを引く'
				: BUILD.tool === 'rail' ? '線路を敷く場所をタップ'
				: BUILD.tool === 'road' ? 'なぞって道路を敷く(¥4万/マス) · 駅前から繋げないと人は来ない'
				: BUILD.tool === 'bldg' ? '建てる場所をタップ' : '消したいものをタップ';
		} else if (p.kind === 'plat') {
			const w = p.x1 - p.x0 + 1, d = p.z1 - p.z0 + 1;
			info.textContent = w + '×' + d + 'マス (' + (w * GRID.CELL) + 'm×' + (d * GRID.CELL) + 'm) '
				+ platRectCars(p) + '両 · ' + yen(p.cost) + (p.why ? ' — ' + p.why : '');
		} else if (p.kind === 'rail') {
			info.textContent = '線路1本 · ' + yen(p.cost) + (p.why ? ' — ' + p.why : '');
		} else {
			const d = devOf(p.id);
			info.textContent = (d ? d.name : '建物') + ' ' + (p.x1 - p.x0 + 1) + '×' + (p.z1 - p.z0 + 1) + 'マス · '
				+ yen(p.cost) + (d ? ' · ' + d.pax.toLocaleString() + '人/日' : '')
				+ (p.why ? ' — ' + p.why : '');
		}
	}
	if (ok) { ok.hidden = !p; ok.disabled = !!(p && p.why); }
	if (ng) ng.hidden = !p;
	const m = document.getElementById('b3Money');
	if (m) m.textContent = yen(S.money);
	const st = document.getElementById('b3Stat');
	if (st) {
		const np = DV.plats.length, nt = DV.tracks.length;
		potentialPax();      // TOWN を最新にしてから出す
		const base = np ? (np + '面' + nt + '線 ' + G.cars + '両') : (nt + '線 · ホームがまだ無い');
		st.textContent = base + ' · 町' + S.bldg.length + '棟' + (TOWN.off ? '(道が無い' + TOWN.off + ')' : '');
	}
	const un = document.getElementById('b3Undo');
	if (un) un.disabled = !BUILD.undo.length;
}

function openBuild3D() {
	BUILD.on = true;
	BUILD.undo.length = 0;
	buildCancel();
	document.getElementById('b3Bar').hidden = false;
	BUILD.savedSpeed = R.speed;
	R.speed = 0;
	document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', +x.dataset.speed === 0));
	renderBuildBar();
}
function closeBuild3D() {
	BUILD.on = false;
	buildCancel();
	document.getElementById('b3Bar').hidden = true;
	controls.enabled = true;
	if (BUILD.savedSpeed !== undefined) {
		R.speed = BUILD.savedSpeed;
		document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', +x.dataset.speed === R.speed));
	}
	save();
}

function initBuildUI() {
	document.getElementById('b3Btn').onclick = () => (BUILD.on ? closeBuild3D() : openBuild3D());
	document.getElementById('b3Close').onclick = closeBuild3D;
	document.getElementById('b3Ok').onclick = buildConfirm;
	document.getElementById('b3Ng').onclick = buildCancel;
	document.getElementById('b3Undo').onclick = buildUndo;
}

/* ================= 2Dの配置ビュー =================
   盤面をそのまま真上から見る。駅は細長い(新宿級で72×172マス)ので、
   盤面ぜんぶを画面に収める倍率は存在しない。
   世界を「置ける領域 + 余白4マス」に絞ったうえで、パンとピンチで動かす */
const PLAN = {
	open: false,
	s: 20,            // 1マスのpt
	ox: 0, oz: 0,     // 画面左上に来る盤面座標(マス、実数)
	lay: 0,           // 表示中のレイヤー
	cv: null, ctx: null, w: 0, h: 0, dpr: 1,
	ptr: new Map(),   // pointerId → {x,y}  2本指を取りこぼさないため
	pinch: null,
	drag: null,
	tool: 0,          // 選んでいる道具(PLAN_TOOLS の添字)
	sel: null,        // 選んでいる設備
	moving: false,    // 動かす先を待っている
	ghost: null,      // 置こうとしている場所
	undo: [],         // 取り消し(深さ20)
	ng: null, ngAt: 0,
	savedSpeed: undefined,
	dirty: true,
};

// セルの色。置ける床は明るく、置けない所は暗く
const PLAN_COL = {};
PLAN_COL[C_EMPTY] = null;
PLAN_COL[C_RAIL_L] = '#2b2f38';
PLAN_COL[C_RAIL_R] = '#2b2f38';
PLAN_COL[C_PLAT] = '#5b6472';
PLAN_COL[C_FLOOR] = '#3a4152';
PLAN_COL[C_WALL] = '#8a8f99';
PLAN_COL[C_STAIR] = '#c8a05a';
PLAN_COL[C_ESCAL] = '#d8b46a';
PLAN_COL[C_GATE] = '#2f7de0';
PLAN_COL[C_SHOP] = '#d8663c';
PLAN_COL[C_VEND] = '#e0b040';
PLAN_COL[C_BENCH] = '#7a6a52';
PLAN_COL[C_PILLAR] = '#6a7080';
PLAN_COL[C_ENTRANCE] = '#3d7a56';

/* いま見ているレイヤーの中身の外接。ここに余白を足したものが2Dビューの世界。
   駅全体に合わせるとホームが200m あるせいでコンコースが画面の外に出る */
function planEditableBBox(lay) {
	const l = lay === undefined ? PLAN.lay : lay;
	let x0 = 1e9, x1 = -1, z0 = 1e9, z1 = -1;
	const hit = (x, z) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; };
	for (let x = 0; x < GRID.W; x++) for (let z = 0; z < GRID.D; z++) {
		const t = B.t[gidx(l, x, z)];
		if (t === C_EMPTY || t === C_RAIL_L || t === C_RAIL_R) continue;   // 線路は端から端まであるので外す
		hit(x, z);
	}
	if (x1 < 0) { x0 = GRID.OX - 8; x1 = GRID.OX + 8; z0 = GRID.OZ - 8; z1 = GRID.OZ + 8; }
	return { x0: x0, x1: x1, z0: z0, z1: z1, w: x1 - x0 + 1, d: z1 - z0 + 1 };
}

function planFit() {
	const b = planEditableBBox();
	PLAN.s = Math.max(12, Math.min(40, Math.min(PLAN.w / (b.w + 4), PLAN.h / (b.d + 4))));
	// 横は領域の中央に寄せる
	PLAN.ox = b.x0 - 2 - Math.max(0, (PLAN.w / PLAN.s - (b.w + 4)) / 2);
	/* 縦は「設備のある高さ」に寄せる。ホームは200m あって画面に入りきらないので、
	   真ん中に合わせると階段も改札も画面の外に出てしまう */
	let cz = (b.z0 + b.z1) / 2, n = 0, sum = 0;
	for (const o of B.objs.values()) if (o.l === PLAN.lay) { sum += o.z + o.d / 2; n++; }
	if (n) cz = sum / n;
	PLAN.oz = Math.min(b.z1 + 2 - PLAN.h / PLAN.s, Math.max(b.z0 - 2, cz - PLAN.h / PLAN.s / 2));
	if (b.d + 4 < PLAN.h / PLAN.s) PLAN.oz = b.z0 - 2 - (PLAN.h / PLAN.s - (b.d + 4)) / 2;
}

function planResize() {
	const cv = PLAN.cv;
	if (!cv) return;
	PLAN.dpr = Math.min(window.devicePixelRatio || 1, 2);
	const r = cv.getBoundingClientRect();
	PLAN.w = Math.max(200, r.width);
	PLAN.h = Math.max(200, r.height);
	cv.width = Math.round(PLAN.w * PLAN.dpr);
	cv.height = Math.round(PLAN.h * PLAN.dpr);
	PLAN.ctx.setTransform(PLAN.dpr, 0, 0, PLAN.dpr, 0, 0);
	PLAN.dirty = true;
}

// 画面px ↔ 盤面セル。cx()/cz() と同じく Math.floor を使う(西半分は座標が負)
function planPxToCellF(px, py) { return { x: PLAN.ox + px / PLAN.s, z: PLAN.oz + py / PLAN.s }; }
function planPxToCell(px, py) {
	const f = planPxToCellF(px, py);
	return { x: Math.floor(f.x), z: Math.floor(f.z) };
}

function planDraw() {
	if (!PLAN.ctx || !PLAN.w) return;
	const g = PLAN.ctx, s = PLAN.s;
	g.fillStyle = '#171d28';
	g.fillRect(0, 0, PLAN.w, PLAN.h);

	const x0 = Math.max(0, Math.floor(PLAN.ox)), z0 = Math.max(0, Math.floor(PLAN.oz));
	const x1 = Math.min(GRID.W - 1, Math.ceil(PLAN.ox + PLAN.w / s));
	const z1 = Math.min(GRID.D - 1, Math.ceil(PLAN.oz + PLAN.h / s));
	const LU = hasLink() ? 1 : 0;
	const other = PLAN.lay === 0 ? LU : 0;

	// 見えている範囲だけ描く。盤面ぜんぶ(39,424セル)を毎回描くと重い
	for (let x = x0; x <= x1; x++) {
		const sx = (x - PLAN.ox) * s;
		for (let z = z0; z <= z1; z++) {
			const sz = (z - PLAN.oz) * s;
			// 裏のレイヤーを薄く敷いて、上下の位置関係が分かるようにする
			if (other !== PLAN.lay) {
				const tb = B.t[gidx(other, x, z)];
				const cb = PLAN_COL[tb];
				if (cb) { g.globalAlpha = 0.18; g.fillStyle = cb; g.fillRect(sx, sz, s, s); g.globalAlpha = 1; }
			}
			const t = B.t[gidx(PLAN.lay, x, z)];
			const c = PLAN_COL[t];
			if (c) { g.fillStyle = c; g.fillRect(sx, sz, s, s); }
			// 構内踏切は縞で重ねる
			if (B.f[gidx(PLAN.lay, x, z)] & F_CROSS) {
				g.fillStyle = 'rgba(224,176,64,.35)';
				g.fillRect(sx, sz, s, s * 0.35);
			}
		}
	}

	// 設備の枠。1マスのものは点、大きいものは外形を描く
	if (s >= 8) {
		g.lineWidth = 1;
		for (const o of B.objs.values()) {
			if (o.l !== PLAN.lay) continue;
			if (o.x + o.w < x0 || o.x > x1 || o.z + o.d < z0 || o.z > z1) continue;
			g.strokeStyle = 'rgba(255,255,255,.35)';
			g.strokeRect((o.x - PLAN.ox) * s + .5, (o.z - PLAN.oz) * s + .5, o.w * s - 1, o.d * s - 1);
		}
	}
	// マス目
	if (s >= 10) {
		g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
		g.beginPath();
		for (let x = x0; x <= x1 + 1; x++) { const sx = Math.round((x - PLAN.ox) * s) + .5; g.moveTo(sx, 0); g.lineTo(sx, PLAN.h); }
		for (let z = z0; z <= z1 + 1; z++) { const sz = Math.round((z - PLAN.oz) * s) + .5; g.moveTo(0, sz); g.lineTo(PLAN.w, sz); }
		g.stroke();
	}
	planOverlay(g);
	PLAN.dirty = false;
}


/* ---- 道具と配置の操作 ----
   指の下はセルが隠れるので、カーソルは押した位置の 24pt 上に出す。
   置く/消すは指を離したとき。動かしたときはパン扱いにする */
const PLAN_TOOLS = [
	{ id: 'pan', ic: '✋', name: 'パン' },
	{ id: 'del', ic: '🗑', name: '撤去' },
	{ k: K_GATEA }, { k: K_GATEM }, { k: K_STAIR }, { k: K_ESCAL }, { k: K_CONV }, { k: K_VEND },
];
const CUR_LIFT = 24;   // カーソルを指より上に出す量(pt)

function planTool() { return PLAN_TOOLS[PLAN.tool] || PLAN_TOOLS[0]; }
function planToolKind() { const t = planTool(); return t.k === undefined ? -1 : t.k; }

// カーソル(=置く場所)のセル。設備は左上を合わせるので大きさのぶん戻す
function planCursorCell(px, py) {
	const c = planPxToCell(px, py - CUR_LIFT);
	const k = planToolKind();
	if (k < 0) return c;
	const F = FACS[k];
	return { x: c.x - ((F.w - 1) >> 1), z: c.z - ((F.d - 1) >> 1) };
}

// 盤面の絶対セル → アンカー相対。いま見ているレイヤーで決まる
function planAnchorOf(gx, gz) {
	const SK = B.sk;
	if (PLAN.lay === 0 && hasLink()) {
		// ホーム層。いちばん近いホーム面を選ぶ
		let best = 0, bd = 1e9;
		for (let i = 0; i < SK.px0.length; i++) {
			const d = Math.abs(gx - (SK.px0[i] + SK.pw / 2));
			if (d < bd) { bd = d; best = i; }
		}
		return { a: 1, n: best, x: gx - SK.px0[best], z: gz - SK.pz1 };
	}
	return { a: 0, n: 0, x: gx - SK.fx0, z: gz - SK.pz1 };
}

function renderPlanTools() {
	const el = document.getElementById('planTools');
	if (!el) return;
	el.innerHTML = '';
	PLAN_TOOLS.forEach((t, i) => {
		const b = document.createElement('button');
		const F = t.k === undefined ? null : FACS[t.k];
		const price = F ? facPrice(t.k, 0) : 0;
		b.innerHTML = '<b>' + (F ? F.ic || planIcon(t.k) : t.ic) + '</b>'
			+ '<span>' + (F ? F.name : t.name) + '</span>'
			+ (F ? '<i>' + yen(price) + '</i>' : '');
		if (PLAN.tool === i) b.className = 'on';
		if (F && S.money < price) b.classList.add('poor');
		b.onclick = () => { PLAN.tool = i; PLAN.ghost = null; PLAN.moving = false;
			if (t.id !== 'pan') PLAN.sel = null;
			renderPlanTools(); renderPlanSel(); planDraw(); };
		el.appendChild(b);
	});
	const u = document.getElementById('planUndo');
	if (u) u.disabled = !PLAN.undo.length;
	const m = document.getElementById('planMoney');
	if (m) m.textContent = yen(S.money);
}
function planIcon(k) { return ['🎫', '👮', '🪜', '🛗', '🏪', '🥤'][k] || '▪'; }

// 層が2つある駅でだけ「⇅で切り替え」を添える
function planNGText(why) {
	let t = NG_TEXT[why] || why;
	if (hasLink() && (why === 'noflo' || why === 'noplat')) t += '(⇅で層を切り替え)';
	return t;
}

function planNG(msg) {
	PLAN.ng = msg;
	PLAN.ngAt = Date.now();
	planDraw();
}

// 指を離したときに1回だけ実行する
function planCommit(px, py) {
	const t = planTool();
	const c0 = planPxToCell(px, py - CUR_LIFT);
	// 動かす先を指定しているところ
	if (PLAN.moving && PLAN.sel) {
		const F = FACS[PLAN.sel.k];
		const cc = { x: c0.x - ((F.w - 1) >> 1), z: c0.z - ((F.d - 1) >> 1) };
		const A = planAnchorOf(cc.x, cc.z);
		const why = facMove(PLAN.sel, A.a, A.n, A.x, A.z);
		if (why) { planNG(planNGText(why)); return; }
		PLAN.moving = false;
		planNG(F.name + 'を動かした(工事 ' + Math.ceil(facBuildLeft(PLAN.sel.i)) + '秒)');
		renderPlanTools(); renderPlanHead(); renderPlanSel(); planDraw();
		return;
	}
	// パンの道具なら設備を選ぶ
	if (t.id === 'pan') {
		PLAN.sel = facAt(PLAN.lay, c0.x, c0.z);
		PLAN.moving = false;
		renderPlanSel(); planDraw();
		return;
	}
	const c = planCursorCell(px, py);
	if (t.id === 'del') {
		const rec = facAt(PLAN.lay, c.x, c.z);
		if (!rec) { planNG('ここには設備が無い'); return; }
		const kind = FACS[rec.k].name;
		const back = facRemove(rec);
		PLAN.undo.push({ del: Object.assign({}, rec) });
		planNG(kind + 'を撤去 +' + yen(back));
		renderPlanTools(); renderPlanHead(); planDraw();
		return;
	}
	const k = planToolKind();
	const A = planAnchorOf(c.x, c.z);
	const why = facAdd(k, A.a, A.n, A.x, A.z);
	if (why) { planNG(planNGText(why)); return; }
	PLAN.undo.push({ add: S.fac[S.fac.length - 1].i });
	if (PLAN.undo.length > 20) PLAN.undo.shift();
	planNG(FACS[k].name + 'を設置 −' + yen(facPrice(k, A.a === 1 ? A.n : 0)));
	renderPlanTools(); renderPlanHead(); planDraw();
}

/* 設備を選んだときの内訳。どこが詰まっているかを見せる */
function renderPlanSel() {
	const el = document.getElementById('planSel');
	if (!el) return;
	const rec = PLAN.sel && S.fac.indexOf(PLAN.sel) >= 0 ? PLAN.sel : null;
	PLAN.sel = rec;
	el.hidden = !rec;
	if (!rec) return;
	const F = FACS[rec.k], slot = laneOf(rec.i);
	const left = facBuildLeft(rec.i);
	const wait = slot >= 0 ? Math.max(0, R.facFree[slot] - R.now) : 0;
	const use = slot >= 0 ? Math.round(R.facUse[slot]) : 0;
	const back = Math.round(facPrice(rec.k, rec.a === 1 ? rec.n : 0) * FAC_REFUND);
	el.innerHTML =
		'<div class="t"><b>' + planIcon(rec.k) + ' ' + F.name + '</b> #' + rec.i
		+ '<span>' + (rec.a === 1 ? 'ホーム' + (rec.n + 1) : '駅舎') + '</span>'
		+ (left > 0 ? '<i>工事中 残' + Math.ceil(left) + '秒</i>' : '') + '</div>'
		+ '<div class="s">今日の利用 ' + use.toLocaleString() + '人 · いま待ち ' + wait.toFixed(1) + '秒</div>';
	const bm = document.createElement('button');
	bm.textContent = PLAN.moving ? '↔ 置く場所をタップ' : '↔ 動かす';
	if (PLAN.moving) bm.className = 'on';
	bm.onclick = () => { PLAN.moving = !PLAN.moving; renderPlanSel(); planDraw(); };
	const bd = document.createElement('button');
	bd.className = 'del';
	bd.textContent = '🗑 撤去 +' + yen(back);
	bd.onclick = () => {
		const name = F.name;
		PLAN.undo.push({ del: Object.assign({}, rec) });
		facRemove(rec);
		PLAN.sel = null; PLAN.moving = false;
		planNG(name + 'を撤去 +' + yen(back));
		renderPlanTools(); renderPlanHead(); renderPlanSel(); planDraw();
	};
	const row = document.createElement('div');
	row.className = 'b';
	row.appendChild(bm); row.appendChild(bd);
	el.appendChild(row);
}

function planUndo() {
	const u = PLAN.undo.pop();
	if (!u) return;
	if (u.add !== undefined) {
		const r = S.fac.find(x => x.i === u.add);
		if (r) { facRemove(r, 1); planNG('取り消した'); }
	} else if (u.del) {
		const r = u.del;
		const why = facAdd(r.k, r.a, r.n, r.x, r.z, true);   // 戻すぶんは無料
		planNG(why ? '戻せなかった: ' + (NG_TEXT[why] || why) : '戻した');
	}
	renderPlanTools(); renderPlanHead(); planDraw();
}

// ゴーストと警告を盤面の上に重ねる
function planOverlay(g) {
	const s = PLAN.s;
	if (PLAN.ghost) {
		const k = planToolKind();
		const gh = PLAN.ghost;
		if (k >= 0) {
			const F = FACS[k];
			const A = planAnchorOf(gh.x, gh.z);
			const why = facCanPlace(k, A.a, A.n, A.x, A.z);
			const money = S.money >= facPrice(k, A.a === 1 ? A.n : 0);
			g.globalAlpha = 0.75;
			g.fillStyle = (!why && money) ? PLAN_COL[F.cell] : '#c8503c';
			g.fillRect((gh.x - PLAN.ox) * s, (gh.z - PLAN.oz) * s, F.w * s, F.d * s);
			g.globalAlpha = 1;
			g.strokeStyle = '#fff'; g.lineWidth = 2;
			g.strokeRect((gh.x - PLAN.ox) * s + 1, (gh.z - PLAN.oz) * s + 1, F.w * s - 2, F.d * s - 2);
		} else {
			g.strokeStyle = '#fff'; g.lineWidth = 2;
			g.strokeRect((gh.x - PLAN.ox) * s + 1, (gh.z - PLAN.oz) * s + 1, s - 2, s - 2);
		}
	}
	if (PLAN.sel && S.fac.indexOf(PLAN.sel) >= 0 && !PLAN.sel.off) {
		const F = FACS[PLAN.sel.k], c = facCell(PLAN.sel);
		if (c.l === PLAN.lay) {
			g.strokeStyle = PLAN.moving ? '#e0b040' : '#7ee0a0'; g.lineWidth = 3;
			g.strokeRect((c.x - PLAN.ox) * s - 1, (c.z - PLAN.oz) * s - 1, F.w * s + 2, F.d * s + 2);
		}
	}
	if (PLAN.ng && Date.now() - PLAN.ngAt < 2000) {
		g.font = 'bold 13px system-ui, sans-serif';
		const w = g.measureText(PLAN.ng).width + 20;
		g.fillStyle = 'rgba(20,26,36,.92)';
		g.fillRect((PLAN.w - w) / 2, 12, w, 30);
		g.fillStyle = '#e8eef7'; g.textAlign = 'center'; g.textBaseline = 'middle';
		g.fillText(PLAN.ng, PLAN.w / 2, 27);
	}
}

function initPlanCanvas() {
	const cv = PLAN.cv = document.getElementById('planCv');
	PLAN.ctx = cv.getContext('2d');

	const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

	cv.addEventListener('pointerdown', e => {
		cv.setPointerCapture(e.pointerId);
		PLAN.ptr.set(e.pointerId, local(e));
		if (PLAN.ptr.size === 2) {
			const v = Array.from(PLAN.ptr.values());
			PLAN.pinch = { d0: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1, s0: PLAN.s };
			PLAN.drag = null;
		} else if (PLAN.ptr.size === 1) {
			const p = local(e);
			PLAN.drag = Object.assign({}, p);
			PLAN.down = { x: p.x, y: p.y, moved: 0 };
			if (planTool().id !== 'pan') { PLAN.ghost = planCursorCell(p.x, p.y); planDraw(); }
		}
	});

	cv.addEventListener('pointermove', e => {
		if (!PLAN.ptr.has(e.pointerId)) return;
		PLAN.ptr.set(e.pointerId, local(e));
		if (PLAN.ptr.size >= 2 && PLAN.pinch) {
			// 2本指の中点にあるセルを固定点にして拡大縮小する
			const v = Array.from(PLAN.ptr.values()), a = v[0], b = v[1];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
			const c0 = planPxToCellF(mx, my);
			PLAN.s = Math.max(4, Math.min(40, PLAN.pinch.s0 * d / PLAN.pinch.d0));
			PLAN.ox = c0.x - mx / PLAN.s;
			PLAN.oz = c0.z - my / PLAN.s;
			PLAN.dirty = true;
		} else if (PLAN.drag) {
			const p = local(e);
			if (PLAN.down) PLAN.down.moved += Math.abs(p.x - PLAN.drag.x) + Math.abs(p.y - PLAN.drag.y);
			if (planTool().id === 'pan' || (PLAN.down && PLAN.down.moved > 14)) {
				// 道具を持っていても大きく動かしたらパン(指1本で両方できるようにする)
				PLAN.ox -= (p.x - PLAN.drag.x) / PLAN.s;
				PLAN.oz -= (p.y - PLAN.drag.y) / PLAN.s;
				PLAN.ghost = null;
			} else {
				PLAN.ghost = planCursorCell(p.x, p.y);
			}
			PLAN.drag = p;
			PLAN.dirty = true;
		}
		if (PLAN.dirty) planDraw();
	});

	const up = e => {
		const was = PLAN.ptr.get(e.pointerId);
		PLAN.ptr.delete(e.pointerId);
		if (was && PLAN.ptr.size === 0 && PLAN.down && PLAN.down.moved <= 14 && !PLAN.pinch) {
			planCommit(was.x, was.y);
		}
		if (PLAN.ptr.size === 0) { PLAN.down = null; PLAN.ghost = null; PLAN.dirty = true; planDraw(); }
		if (PLAN.ptr.size < 2) PLAN.pinch = null;
		if (PLAN.ptr.size === 0) PLAN.drag = null;
		else PLAN.drag = Array.from(PLAN.ptr.values())[0];   // 指が1本残ったらそこからパンを続ける
	};
	cv.addEventListener('pointerup', up);
	cv.addEventListener('pointercancel', up);
}

function planLayerName(l) {
	if (!hasLink()) return '地上';
	return l === 0 ? 'ホーム' : (isUnder() ? '地下コンコース' : '橋上コンコース');
}

function renderPlanHead() {
	const el = document.getElementById('planLayer');
	if (el) el.textContent = planLayerName(PLAN.lay);
	const sw = document.getElementById('planSwap');
	if (sw) sw.hidden = !hasLink();
	const info = document.getElementById('planInfo');
	if (info) {
		const f = S.fac.length, off = S.fac.filter(r => r.off).length;
		info.textContent = '設備' + f + '個' + (off ? ' / 休止' + off : '') + ' · ' + PLAN.s.toFixed(0) + 'pt/マス';
	}
}

/* スマホでは開発者コンソールが見られないので、例外は画面に出す。
   真っ黒な画面だけが残って原因が分からない、という状態を作らない */
function showErr(msg) {
	let el = document.getElementById('errBar');
	if (!el) {
		el = document.createElement('div');
		el.id = 'errBar';
		el.onclick = () => el.remove();
		document.body.appendChild(el);
	}
	el.textContent = String(msg).slice(0, 300);
}
if (typeof window !== 'undefined') {
	window.addEventListener('error', e => {
		showErr('⚠ ' + (e.message || e.error) + ' @ ' + (e.filename || '?').split('/').pop() + ':' + e.lineno);
	});
	window.addEventListener('unhandledrejection', e => showErr('⚠ ' + (e.reason && e.reason.message || e.reason)));
}

// いまの状態を1行にまとめる。何が起きているか画面で確かめるため
function planDiag() {
	try {
		const cv = document.getElementById('planCv');
		const r = cv ? cv.getBoundingClientRect() : { width: 0, height: 0 };
		return '設備' + (S.fac ? S.fac.length : '?') + '個 · ' + PLAN.s.toFixed(0) + 'pt/マス'
			+ ' · 画面' + Math.round(r.width) + '×' + Math.round(r.height)
			+ ' · 道具' + (document.getElementById('planTools') || { children: [] }).children.length;
	} catch (e) { return '診断できず: ' + e.message; }
}

function openPlan() {
	PLAN.open = true;
	document.getElementById('planView').hidden = false;
	PLAN.savedSpeed = R.speed;
	R.speed = 0;                       // 見ているあいだは時間を止める
	document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', +x.dataset.speed === 0));
	/* 途中で転ぶと真っ黒な画面だけが残って原因が分からなくなる。
	   スマホでは開発者コンソールが見られないので、画面に理由を出す */
	const steps = [
		['canvas', () => { if (!PLAN.cv) initPlanCanvas(); }],
		['init', () => {
			PLAN.lay = hasLink() ? 1 : 0;
			PLAN.tool = 0; PLAN.undo.length = 0; PLAN.ghost = null; PLAN.ng = null;
			PLAN.sel = null; PLAN.moving = false;
		}],
		['resize', planResize], ['fit', planFit],
		['tools', renderPlanTools], ['head', renderPlanHead],
		['sel', renderPlanSel], ['draw', planDraw],
	];
	const bad = [];
	for (const [name, fn] of steps) {
		try { fn(); } catch (e) { bad.push(name + ':' + (e && e.message ? e.message : e)); }
	}
	const info = document.getElementById('planInfo');
	if (bad.length) {
		showErr('⚠ 配置 ' + bad.join(' / '));
		if (info) info.textContent = bad[0].slice(0, 60);
	} else if (info && !info.textContent) {
		info.textContent = planDiag();
	}
}

function closePlan() {
	PLAN.open = false;
	document.getElementById('planView').hidden = true;
	if (PLAN.savedSpeed !== undefined) {
		R.speed = PLAN.savedSpeed;
		document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', +x.dataset.speed === R.speed));
	}
}

function initPlanUI() {
	document.getElementById('planBtn').onclick = openPlan;
	document.getElementById('planClose').onclick = closePlan;
	document.getElementById('planSwap').onclick = () => {
		PLAN.lay = PLAN.lay === 0 ? (hasLink() ? 1 : 0) : 0;
		planFit(); renderPlanHead(); planDraw();
	};
	document.getElementById('planFit').onclick = () => { planFit(); renderPlanHead(); planDraw(); };
	document.getElementById('planUndo').onclick = planUndo;
	window.addEventListener('resize', () => { if (PLAN.open) { planResize(); planFit(); planDraw(); } });
}

/* ================= ダイヤ編集UI =================
   番線別のタイムライン。帯は展開されたスジ、編集の実体はパターン(S.dia) */
const DIA = {
	open: false, tab: 'dia', sel: null,
	track: 0,                // 編集中の番線(-1 = 全て)
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

	// 番線のレーン。選択中の番線だけ明るくして、どこを編集しているか分かるようにする
	for (let t = 0; t < diaLaneCount(); t++) {
		const y = AXIS_H + t * LANE_H, on = DIA.track === t;
		g.fillStyle = on ? 'rgba(47,125,224,.16)' : t % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.015)';
		g.fillRect(LABEL_W, y, w - LABEL_W, LANE_H);
		g.fillStyle = on ? '#8fc4ff' : 'rgba(220,232,246,.8)';
		g.textAlign = 'left'; g.font = 'bold 10px system-ui, sans-serif';
		g.fillText((t + 1) + '番', 3, y + LANE_H / 2 - 4);
		g.font = '9px system-ui, sans-serif'; g.fillStyle = 'rgba(220,232,246,.45)';
		g.fillText(dirOf(t) === 1 ? '↓南' : '↑北', 3, y + LANE_H / 2 + 6);
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
		const on = DIA.sel === slotKey(s);
		g.globalAlpha = (DIA.track < 0 || DIA.track === s.track) ? 1 : 0.32;
		g.fillStyle = s.ok ? '#' + T.col.toString(16).padStart(6, '0') : '#7a2f2a';
		g.beginPath();
		if (g.roundRect) g.roundRect(x0, y, x1 - x0, LANE_H - 8, 3); else g.rect(x0, y, x1 - x0, LANE_H - 8);
		g.fill();
		if (on) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
		if (x1 - x0 > 16) {
			g.fillStyle = 'rgba(16,22,29,.9)'; g.textAlign = 'center'; g.font = 'bold 9px system-ui, sans-serif';
			g.fillText(T.abbr, (x0 + x1) / 2, y + (LANE_H - 8) / 2);
		}
		// 単発スジは上辺に印を付けて、パターンと見分けられるようにする
		if (s.run !== undefined) {
			g.fillStyle = 'rgba(255,255,255,.85)';
			g.fillRect(x0, y - 2, Math.max(4, x1 - x0), 2);
		}
		g.globalAlpha = 1;
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

// 選択の識別子。パターンと単発はIDが別空間なので接頭辞を付ける
function slotKey(s) { return s.run !== undefined ? 'r' + s.run : 'd' + s.dia; }

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
			DIA.sel = slotKey(hit);
			if (DIA.track >= 0) DIA.track = hit.track;   // 掴んだ帯の番線に切り替える
			if (hit.run !== undefined) {
				const r = S.runs.find(p => p.id === hit.run);
				DIA.drag = r ? { run: r, at0: r.at, mn0: xToMin(x) } : null;
			} else {
				const d = S.dia.find(p => p.id === hit.dia);
				DIA.drag = d ? { pat: d, off0: d.off || 0, mn0: xToMin(x) } : null;
			}
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
			const delta = Math.round(xToMin(x) - DIA.drag.mn0);
			if (DIA.drag.run) {
				// 単発スジはその1本だけを動かす
				const r = DIA.drag.run;
				r.at = ((DIA.drag.at0 + delta) % 1440 + 1440) % 1440;
			} else {
				// パターンは全体をずらす
				const d = DIA.drag.pat;
				const ev = Math.max(1, d.every);
				d.off = ((DIA.drag.off0 + delta) % ev + ev) % ev;
			}
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

/* ---- スジ一覧とインスペクタ ----
   ダイヤは番線ごとに編集する。上のタブで番線を選ぶと、その番線のスジだけが並ぶ */
function patLabel(d) {
	const m = modelOf(d.m);
	return m.name + ' ' + d.cars + '両';
}
function patSub(d) {
	return (d.track + 1) + '番線 / ' + clockOf(d.from) + '〜' + clockOf(d.to)
		+ ' / ' + d.every + '分毎 / 停車' + d.dwell + '秒';
}
function runSub(r) {
	return (r.track + 1) + '番線 / ' + clockOf(r.at) + '着 '
		+ clockOf(r.at + Math.max(15, r.dwell) / 60) + '発 / 臨時 '
		+ yen(runFee(r.m, r.cars)) + '/本';
}

// 臨時に借りられる編成。契約と違って解禁済みなら何でも1本から呼べる
function runCombos() {
	const out = [];
	for (const m of MODELS) {
		if (S.rank < m.rank) continue;
		for (const c of m.cars) if (c <= S.cars) out.push({ m: m.id, cars: c });
	}
	return out;
}


/* ================= 時刻表 =================
   駅の壁に貼ってある形そのまま。縦が時、横が分、セルに分と行先、色が種別。
   ダイヤの作成も編集もここから行う */

/* 行先。番線の進行方向ごとに、駅からの距離(km)つきで並べる。
   距離が運賃の取り分に効くので、行先を選ぶことが数字として意味を持つ */
function destList(dir) {
	return (S.dests || []).filter(d => d.dir === dir);
}
function destOf(id) {
	for (const d of (S.dests || [])) if (d.id === id) return d;
	return null;
}
function destName(id) { const d = destOf(id); return d ? d.name : '—'; }
// 行先の距離による運賃の倍率。近距離1.0、遠いほど大きい
function destFare(id) {
	const d = destOf(id);
	if (!d) return 1;
	return 1 + Math.min(1.4, d.km / 40);
}
// その番線で選べる既定の行先
function defaultDest(track) {
	const l = destList(dirOf(track));
	return l.length ? l[0].id : 0;
}

const TT = { hour0: 5, hour1: 24 };

/* 1本のスジを時刻表のセルにする */
function ttCell(slot) {
	const T = TYPES[slot.ty];
    const el = document.createElement('button');
	el.className = 'ttCell' + (slot.ok ? '' : ' bad') + (DIA.sel === slotKey(slot) ? ' sel' : '');
	el.style.background = slot.ok ? '#' + T.col.toString(16).padStart(6, '0') : '#7a2f2a';
	el.innerHTML = '<b>' + String(Math.floor(slot.arr / 60) % 60).padStart(2, '0') + '</b>'
		+ '<span>' + destName(slot.dest) + '</span>';
	el.onclick = () => {
		DIA.sel = DIA.sel === slotKey(slot) ? null : slotKey(slot);
		renderTimetable();
	};
	return el;
}

function renderTimetable() {
	const el = document.getElementById('ttBody');
	if (!el) return;
	renderTrackTabs();
	renderTrackDir();
	el.innerHTML = '';

	const tf = DIA.track < 0 ? 0 : DIA.track;
	if (DIA.track < 0) DIA.track = 0;
	const slots = (R.allSlots || []).filter(s => s.track === tf).slice().sort((a, b) => a.arr - b.arr);

	// 時ごとに束ねる。4:00起点の分を「時計の時」に直す
	const rows = new Map();
	for (const s of slots) {
		const h = Math.floor(((s.arr / 60) + 4 * 60) / 60) % 24;
		if (!rows.has(h)) rows.set(h, []);
		rows.get(h).push(s);
	}

	for (let i = 0; i < 20; i++) {
		const h = (TT.hour0 + i) % 24;
		const list = rows.get(h) || [];
		const row = document.createElement('div');
		row.className = 'ttRow';
		const hh = document.createElement('div');
		hh.className = 'ttHour';
		hh.textContent = h;
		row.appendChild(hh);
		const cells = document.createElement('div');
		cells.className = 'ttCells';
		for (const s of list) cells.appendChild(ttCell(s));
		// その時間に1本足す
		const add = document.createElement('button');
		add.className = 'ttAdd';
		add.textContent = '＋';
		add.onclick = () => ttAddAt(h);
		cells.appendChild(add);
		row.appendChild(cells);
		el.appendChild(row);
	}
	renderTtSel();
	renderDiaStat();
}

/* その時間に臨時を1本置く。分は空いているところを選ぶ */
function ttAddAt(h) {
	const combos = runCombos();
	if (!combos.length) return;
	const tr = Math.max(0, Math.min(S.nTrack - 1, DIA.track));
	const base = ((h - 4 + 24) % 24) * 60;        // 4:00起点の分
	const used = (R.allSlots || []).filter(x => x.track === tr).map(x => Math.round(x.arr / 60));
	let at = base;
	for (let k = 0; k < 60 && used.indexOf(at) >= 0; k++) at = base + k;
	const prev = S.runs[S.runs.length - 1];
	const r = {
		id: S.runId++, track: tr, at: ((at % 1440) + 1440) % 1440, dwell: 45,
		m: prev ? prev.m : combos[0].m, cars: prev ? prev.cars : combos[0].cars,
		ty: prev ? prev.ty : 0, dest: defaultDest(tr),
	};
	if (r.cars > S.cars) { r.m = combos[0].m; r.cars = combos[0].cars; }
	S.runs.push(r);
	DIA.sel = 'r' + r.id;
	compileSched(); renderTimetable(); save();
}

/* 選んだ1本の詳細。種別・行先・編成・時刻・停車をここで直す */
function renderTtSel() {
	const el = document.getElementById('ttSel');
	if (!el) return;
	el.innerHTML = '';
	const key = DIA.sel;
	if (!key) { el.hidden = true; return; }
	el.hidden = false;
	const isRun = key[0] === 'r';
	const id = +key.slice(1);
	const rec = isRun ? S.runs.find(x => x.id === id) : S.dia.find(x => x.id === id);
	if (!rec) { el.hidden = true; DIA.sel = null; return; }

	const head = document.createElement('div');
	head.className = 'ttSelHead';
	head.innerHTML = '<b>' + (isRun ? '⚡ 臨時' : '🔁 パターン') + '</b>'
		+ '<span>' + modelOf(rec.m).name + ' ' + rec.cars + '両</span>';
	const del = document.createElement('button');
	del.className = 'del'; del.textContent = '✕';
	del.onclick = () => {
		if (isRun) S.runs = S.runs.filter(x => x.id !== id);
		else S.dia = S.dia.filter(x => x.id !== id);
		DIA.sel = null;
		compileSched(); renderTimetable(); save();
	};
	head.appendChild(del);
	el.appendChild(head);

	// 種別
	el.appendChild(typeRow(rec));
	// 行先
	const dl = destList(dirOf(rec.track));
	if (dl.length) {
		const at = Math.max(0, dl.findIndex(d => d.id === rec.dest));
		el.appendChild(stepper('行先', () => at,
			v => { const n = dl.length; rec.dest = dl[((v % n) + n) % n].id; },
			v => { const n = dl.length; const d = dl[((v % n) + n) % n];
				return d.name + ' ' + d.km + 'km (運賃×' + destFare(d.id).toFixed(2) + ')'; }));
	}
	// 編成
	const combos = isRun ? runCombos() : S.fleet.map(f => ({ m: f.m, cars: f.cars }));
	if (combos.length) {
		const at = Math.max(0, combos.findIndex(c => c.m === rec.m && c.cars === rec.cars));
		const pick = v => combos[((v % combos.length) + combos.length) % combos.length];
		el.appendChild(stepper('編成', () => at,
			v => { const c = pick(v); rec.m = c.m; rec.cars = c.cars; },
			v => modelOf(pick(v).m).name + ' ' + pick(v).cars + '両'));
	}
	el.appendChild(stepper('番線', () => rec.track,
		v => { rec.track = Math.max(0, Math.min(S.nTrack - 1, v)); DIA.track = rec.track; }, v => (v + 1) + '番線'));
	if (isRun) {
		el.appendChild(stepper('時刻', () => rec.at, v => { rec.at = ((v % 1440) + 1440) % 1440; }, clockOf));
	} else {
		el.appendChild(stepper('間隔', () => rec.every,
			v => { rec.every = Math.max(2, Math.min(240, v)); rec.off = ((rec.off || 0) % rec.every + rec.every) % rec.every; }, v => v + '分毎'));
		el.appendChild(stepper('ずらし', () => rec.off || 0,
			v => { const e = Math.max(1, rec.every); rec.off = ((v % e) + e) % e; }, v => v + '分'));
		el.appendChild(stepper('開始', () => rec.from,
			v => { rec.from = Math.max(0, Math.min(rec.to - 30, Math.round(v / 30) * 30)); }, clockOf, 30));
		el.appendChild(stepper('終了', () => rec.to,
			v => { rec.to = Math.max(rec.from + 30, Math.min(1440, Math.round(v / 30) * 30)); }, clockOf, 30));
	}
	el.appendChild(stepper('停車', () => rec.dwell,
		v => { rec.dwell = Math.max(15, Math.min(300, Math.round(v / 5) * 5)); }, v => v + '秒', 5));
}

function renderTrackTabs() {
	const el = document.getElementById('diaTracks');
	if (!el) return;
	el.innerHTML = '';
	const mk = (t, label) => {
		const b = document.createElement('button');
		b.textContent = label;
		if (DIA.track === t) b.className = 'on';
		b.onclick = () => { DIA.track = t; renderTimetable(); };
		el.appendChild(b);
	};
	mk(-1, '全て');
	for (let t = 0; t < S.nTrack; t++) mk(t, (t + 1) + '番');
}

/* 選んだ番線の設定。進行方向と所属本線はここで決める。
   方向が違う番線は別の線路なので、発車間隔で競合しない */
function renderTrackDir() {
	const el = document.getElementById('diaDir');
	if (!el) return;
	el.innerHTML = '';
	const t = DIA.track;
	if (t < 0 || t >= S.nTrack) return;

	const dirRow = document.createElement('div');
	dirRow.className = 'stepRow';
	dirRow.innerHTML = '<span>進行方向</span>';
	for (let d = 0; d < 2; d++) {
		const b = document.createElement('button');
		b.className = 'wide';
		b.textContent = (d ? '↓ ' : '↑ ') + DIR_NAME[d];
		const on = dirOf(t) === d;
		b.style.background = on ? '#2f7de0' : 'rgba(255,255,255,.1)';
		b.onclick = () => {
			if (!S.trackDir) S.trackDir = [];
			S.trackDir[t] = d;
			compileSched(); renderTimetable(); save();
		};
		dirRow.appendChild(b);
	}
	el.appendChild(dirRow);

	if (S.lines > 1) {
		el.appendChild(stepper('本線', () => lineOf(t),
			v => {
				const n = S.lines;
				if (!S.trackLine) S.trackLine = [];
				S.trackLine[t] = ((v % n) + n) % n;
			}, v => '本線' + (v + 1)));
	}

	const note = document.createElement('p');
	note.className = 'hint';
	note.style.margin = '2px 2px 6px';
	const same = lineTracks(lineOf(t), dirOf(t));
	note.textContent = '本線' + (lineOf(t) + 1) + 'の' + DIR_NAME[dirOf(t)] + 'に割り当てた番線は'
		+ same + '本。この番線は' + Math.round(CFG.TRACK_HEAD / 60) + '分に1本まで、'
		+ '同じ向きの番線を合わせて' + Math.round(CFG.LINE_HEAD / 60) + '分に1本まで発車できます。';
	el.appendChild(note);
}

function renderDiaList() {
	const el = document.getElementById('diaList');
	if (!el) return;
	if (DIA.track >= S.nTrack) DIA.track = S.nTrack - 1;
	renderTrackTabs();
	renderTrackDir();
	el.innerHTML = '';

	const badD = {}, badR = {};
	for (const it of R.issues) {
		if (it.dia !== undefined) badD[it.dia] = true;
		if (it.run !== undefined) badR[it.run] = true;
	}
	const tf = DIA.track;
	const pats = S.dia.filter(d => tf < 0 || d.track === tf);
	const runs = S.runs.filter(r => tf < 0 || r.track === tf).slice().sort((a, b) => a.at - b.at);

	const row = (key, ty, title, sub, bad, del) => {
		const el2 = document.createElement('div');
		el2.className = 'diaRow' + (DIA.sel === key ? ' sel' : '') + (bad ? ' bad' : '');
		const T = TYPES[ty];
		el2.innerHTML =
			'<span class="ty" style="background:#' + T.col.toString(16).padStart(6, '0') + '">' + T.abbr + '</span>' +
			'<span class="tx"><b>' + title + '</b><span>' + sub + '</span></span>';
		const b = document.createElement('button');
		b.className = 'del'; b.textContent = '✕';
		b.onclick = ev => { ev.stopPropagation(); del(); };
		el2.appendChild(b);
		el2.onclick = () => { DIA.sel = DIA.sel === key ? null : key; renderTimetable(); };
		el.appendChild(el2);
		return el2;
	};

	for (const r of runs) {
		const key = 'r' + r.id;
		row(key, r.ty, '⚡ ' + modelOf(r.m).name + ' ' + r.cars + '両', runSub(r), badR[r.id], () => {
			S.runs = S.runs.filter(x => x.id !== r.id);
			if (DIA.sel === key) DIA.sel = null;
			compileSched(); renderTimetable(); save();
		});
		if (DIA.sel === key) el.appendChild(buildRunInspector(r));
	}

	for (const d of pats) {
		const key = 'd' + d.id;
		row(key, d.ty, patLabel(d), patSub(d), badD[d.id], () => {
			S.dia = S.dia.filter(x => x.id !== d.id);
			if (DIA.sel === key) DIA.sel = null;
			compileSched(); renderTimetable(); save();
		});
		if (DIA.sel === key) el.appendChild(buildInspector(d));
	}

	if (!pats.length && !runs.length) {
		el.innerHTML = '<p class="hint">'
			+ (tf < 0 ? 'スジがありません。' : (tf + 1) + '番線にはまだ何も走っていません。')
			+ '「＋1本」なら契約なしで1本だけ走らせられます（走った日だけ運行料）。'
			+ '終日走らせるなら「契約」タブで編成を契約して、パターンで置くほうが安上がりです。</p>';
	}
	if (tf < 0 && (S.nTrack > 1 || S.lines > 1)) el.appendChild(buildLineMap());
	renderDiaStat();
}

/* 番線がどの本線・どの向きに属するかの一覧。1本線に同じ向きの2番線があると交互発車ができる */
function buildLineMap() {
	const box = document.createElement('div');
	box.style.cssText = 'background:rgba(0,0,0,.22);border-radius:9px;padding:8px 9px;margin-top:8px;';
	const cap = Math.min(S.lines * 2 * 3600 / CFG.LINE_HEAD, S.nTrack * 3600 / CFG.TRACK_HEAD);
	box.innerHTML = '<p class="hint" style="margin:0 0 6px">番線の割り当て　'
		+ '<b style="color:#7ee0a0">理論上限 ' + cap + '本/時</b>（上下の合計）</p>';
	for (let t = 0; t < S.nTrack; t++) {
		const p = document.createElement('div');
		p.className = 'stepRow';
		p.innerHTML = '<span>' + (t + 1) + '番線</span>'
			+ '<span class="val" style="min-width:auto;flex:1;text-align:left">本線'
			+ (lineOf(t) + 1) + ' / ' + (dirOf(t) ? '↓ ' : '↑ ') + DIR_NAME[dirOf(t)] + '</span>';
		const b = document.createElement('button');
		b.className = 'wide'; b.textContent = '編集';
		b.onclick = () => { DIA.track = t; renderTimetable(); };
		p.appendChild(b);
		box.appendChild(p);
	}
	const note = document.createElement('p');
	note.className = 'hint';
	note.style.margin = '6px 2px 0';
	const per = [];
	for (let l = 0; l < S.lines; l++) {
		for (let d = 0; d < 2; d++) {
			const n = lineTracks(l, d);
			if (n) per.push('本線' + (l + 1) + DIR_NAME[d] + ':' + n + '本');
		}
	}
	note.textContent = per.join(' / ') + '　同じ本線の同じ向きに2番線あると、交互発車で本線の上限まで出せます。';
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
		b.onclick = () => { set(get() + dv); compileSched(); renderTimetable(); save(); };
		return b;
	};
	row.appendChild(mk('−', -st));
	const v = document.createElement('span');
	v.className = 'val'; v.textContent = fmt(get());
	row.appendChild(v);
	row.appendChild(mk('＋', st));
	return row;
}

function inspectorBox() {
	const box = document.createElement('div');
	box.style.cssText = 'background:rgba(0,0,0,.22);border-radius:9px;padding:8px 9px;margin:-2px 0 8px;';
	return box;
}

// 種別の選択。パターンと単発で共通
function typeRow(o) {
	const tyRow = document.createElement('div');
	tyRow.className = 'stepRow';
	tyRow.innerHTML = '<span>種別</span>';
	for (const T of TYPES) {
		const b = document.createElement('button');
		b.className = 'wide';
		b.textContent = T.name;
		b.style.background = o.ty === T.id ? '#' + T.col.toString(16).padStart(6, '0') : 'rgba(255,255,255,.1)';
		b.style.color = o.ty === T.id ? '#10161d' : '#e8eef7';
		if (S.rank < T.rank) { b.disabled = true; b.style.opacity = '.4'; b.textContent = T.name + '(未解禁)'; }
		b.onclick = () => { o.ty = T.id; compileSched(); renderTimetable(); save(); };
		tyRow.appendChild(b);
	}
	return tyRow;
}

/* 単発スジ(臨時列車)のインスペクタ。契約が要らないぶん、編成は解禁済みなら何でも選べる */
function buildRunInspector(r) {
	const box = inspectorBox();
	box.appendChild(typeRow(r));

	const combos = runCombos();
	if (combos.length) {
		const at = Math.max(0, combos.findIndex(c => c.m === r.m && c.cars === r.cars));
		const pick = v => combos[((v % combos.length) + combos.length) % combos.length];
		box.appendChild(stepper('編成', () => at,
			v => { const c = pick(v); r.m = c.m; r.cars = c.cars; },
			v => modelOf(pick(v).m).name + ' ' + pick(v).cars + '両'));
	}
	box.appendChild(stepper('番線', () => r.track,
		v => { r.track = Math.max(0, Math.min(S.nTrack - 1, v)); DIA.track = r.track; }, v => (v + 1) + '番線'));
	box.appendChild(stepper('着時刻', () => r.at,
		v => { r.at = ((v % 1440) + 1440) % 1440; }, clockOf));
	box.appendChild(stepper('停車', () => r.dwell,
		v => { r.dwell = Math.max(15, Math.min(300, Math.round(v / 5) * 5)); }, v => v + '秒', 5));

	const info = document.createElement('p');
	info.className = 'hint';
	info.style.margin = '6px 2px 0';
	const fee = runFee(r.m, r.cars);
	info.textContent = '臨時列車。契約は要らず、1本走らせるごとに借り賃 ' + yen(fee) + '。'
		+ '定員' + slotCap(r.m, r.cars) + '人。同じ編成を1日8本以上走らせるなら、契約したほうが安くなります（リース '
		+ yen(contractLease(r.m, r.cars)) + '/日）。';
	box.appendChild(info);
	return box;
}

function buildInspector(d) {
	const box = inspectorBox();
	box.appendChild(typeRow(d));

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
		v => { d.track = Math.max(0, Math.min(S.nTrack - 1, v)); DIA.track = d.track; }, v => (v + 1) + '番線'));
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
	const nRun = R.sched.filter(x => x.run !== undefined).length;
	el.innerHTML = '本日 <b>' + R.sched.length + '本</b>'
		+ (nRun ? '（臨時' + nRun + '）' : '') + '<br>'
		+ '所要' + R.need + ' / 契約' + R.have
		+ (R.short > 0 ? ' <i>' + R.short + '本不足</i>' : '')
		+ (nRun ? '<br>臨時の借り賃 ' + yen(runFeeTotal()) + '/日' : '');
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
	// 時刻表はDOMで組むのでキャンバスは使わない
	if (DIA.track < 0) DIA.track = 0;
	renderTimetable(); renderFleet();
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
			if (DIA.tab === 'dia') renderTimetable(); else renderFleet();
		};
	});

	document.querySelectorAll('#diaZoom button').forEach(b => {   // 旧UI。いまは要素が無い
		b.onclick = () => {
			const c = DIA.t0 + DIA.span / 2;
			DIA.span = +b.dataset.span;
			DIA.t0 = Math.max(0, Math.min(1440 - DIA.span, c - DIA.span / 2));
			document.querySelectorAll('#diaZoom button').forEach(x => x.classList.toggle('on', x === b));
			drawDia();
		};
	});

	const addOne = document.getElementById('diaAddOne');
	if (addOne) addOne.onclick = () => {
		const combos = runCombos();
		if (!combos.length) return;
		const tr = Math.max(0, Math.min(S.nTrack - 1, DIA.track));
		// 画面の中央の時刻に置く。既にスジがあれば重ならないところまでずらす
		let at = Math.round(DIA.t0 + DIA.span / 2);
		const used = S.runs.filter(r => r.track === tr).map(r => r.at)
			.concat((R.allSlots || []).filter(x => x.track === tr).map(x => Math.round(x.arr / 60)));
		for (let k = 0; k < 240 && used.indexOf(((at % 1440) + 1440) % 1440) >= 0; k++) at++;
		const prev = S.runs[S.runs.length - 1];
		const base = prev ? { m: prev.m, cars: prev.cars, ty: prev.ty } : { m: combos[0].m, cars: combos[0].cars, ty: 0 };
		const r = {
			id: S.runId++, m: base.m, cars: base.cars, ty: base.ty,
			track: tr, at: ((at % 1440) + 1440) % 1440, dwell: 45,
			dest: defaultDest(tr),
		};
		if (r.cars > S.cars) { r.m = combos[0].m; r.cars = combos[0].cars; }
		S.runs.push(r);
		DIA.sel = 'r' + r.id;
		DIA.track = tr;
		compileSched(); renderTimetable(); save();
		alertOnce('addrun', '臨時列車を1本追加（借り賃 ' + yen(runFee(r.m, r.cars)) + '/本）', true, 4);
	};

	const addPat = document.getElementById('diaAdd');
	if (addPat) addPat.onclick = () => {
		if (!S.fleet.length) {
			alertOnce('nofleet', '先に「契約」タブで編成を契約してください', false, 5);
			return;
		}
		const f = S.fleet[0];
		const d = {
			id: S.diaId++, m: f.m, cars: f.cars, ty: 0,
			track: Math.max(0, Math.min(S.nTrack - 1, DIA.track)),
			from: 60, to: 20 * 60, every: 30, off: 0, dwell: 45,
			dest: defaultDest(Math.max(0, Math.min(S.nTrack - 1, DIA.track))),
		};
		S.dia.push(d);
		DIA.sel = 'd' + d.id;
		DIA.track = d.track;
		compileSched(); renderTimetable(); save();
	};

	window.addEventListener('resize', () => { if (DIA.open) renderTimetable(); });
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
	const wait = fid => { const sl = laneOf(fid); return sl < 0 ? 0 : R.facFree[sl] - R.now; };
	let gq = 0;
	for (const fid of (WK.gateFid || [])) gq = Math.max(gq, wait(fid));
	if (gq > 90) alertOnce('gate', '⚠ 改札に長い行列 — 改札を増設', false, 30);
	if (!WK.gateFid || !WK.gateFid.length) {
		alertOnce('nogate', '⚠ 改札が無く運賃を取りこぼしています', false, 90);
	}
	let sq = 0;
	for (const fid of (WK.stairEnds || new Map()).keys()) sq = Math.max(sq, wait(fid));
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
	const n = Math.min(R.pax.length, paxLimit());
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
	if (PLAN.open) return;      // 2Dの配置ビュー中は3Dを描かない

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
	initPlanUI();
	initBuild3D();
	initBuildUI();
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
			const ow = Math.max(1, window.innerWidth || 1), oh = Math.max(1, window.innerHeight || 1);
			renderer.setSize(w || 1280, h || 800, false);
			camera.aspect = (w || 1280) / (h || 800);
			camera.updateProjectionMatrix();
			renderPax();
			renderer.render(scene, camera);
			const url = renderer.domElement.toDataURL('image/png');
			renderer.setSize(ow, oh);
			camera.aspect = ow / oh; camera.updateProjectionMatrix();
			return fetch('/__shot', { method: 'POST', body: url }).then(r => r.text());
		},
		reset: () => { noSave = true; localStorage.removeItem(SAVE_KEY); location.reload(); },
		// S を直接いじった後に呼ぶ(レイアウト反映)
		rebuild: () => { resetRuntimeForLayout(); buildStation(); renderUpgrades(); },
		// ダイヤだけ組み直す(検証結果を見たいとき)
		compile: () => { compileSched(); return { slots: R.sched.length, issues: R.issues.slice() }; },
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
		// 盤面(Stage1)
		grid: GRID, board: B, dv: DV, wk: WK, plan: PLAN,
		regrid: () => { gridFromParams(); return gridStats(); },
		// 歩行グラフ(Stage3)。乗客を1人も動かさずに盤面の健全性を測る
		walkStats: () => walkStats(),
		walkSweep: () => walkSweep(),
		boardHash: () => boardHash(),
		// 町: 需要と、道でつながっているか
		town: () => { const n = potentialPax();
			return { pax: Math.round(n), 建物: S.bldg.length, つながり: TOWN.live, 切れ: TOWN.off,
				道路: S.road.length,
				内訳: S.bldg.map(b => b.k + '(' + Math.round(bldgDist(b)) + 'm ×' + distFactor(bldgDist(b)).toFixed(2) + ')' + (b.off ? ' 休' : '')) }; },
		// 検証用: 全レーンの予約を捨てる(R.now を巻き戻す計測でだけ使う)
		clearQueues: () => { R.facFree.fill(R.now); return FACR.lane.size; },
		// 設備ごとの待ち時間(秒)。増築を挟んでも連続しているべき
		queues: () => {
			const o = { gate: [], stair: [], cross: 0 };
			for (const fid of (WK.gateFid || [])) { const sl = laneOf(fid); o.gate.push(sl < 0 ? -1 : +(R.facFree[sl] - R.now).toFixed(1)); }
			for (const fid of (WK.stairEnds || new Map()).keys()) { const sl = laneOf(fid); o.stair.push(sl < 0 ? -1 : +(R.facFree[sl] - R.now).toFixed(1)); }
			const c = laneOf(0); o.cross = c < 0 ? -1 : +(R.facFree[c] - R.now).toFixed(1);
			o.slots = FACR.nSlot; o.free = FACR.freeSlots.length;
			return o;
		},
		// 置いてある設備の一覧(種別ごとの台数と、休止しているもの)
		fac: () => {
			const n = {}, off = [];
			for (const r of S.fac) { const id = FACS[r.k].id; n[id] = (n[id] || 0) + 1; if (r.off) off.push(r); }
			return { n: n, total: S.fac.length, off: off.length, list: S.fac };
		},
		// 9構成を順に組んで盤面の指紋を並べる。作りかたを組み替えても一致するべき
		hashSweep: () => hashSweep(),
		// アンカーを盤面のセルへ寄せるか(C3)
		anchor: on => { WK.anchor = on !== false; resetRuntimeForLayout(); buildStation(); return WK.anchor; },
		// 距離場で歩かせるか(C5)
		useField: on => { WK.on = on !== false; return WK.on; },
		// 種付き乱数。同じ種なら同じ客列になるので、歩き方の違いだけを比べられる
		seed: n => { _wkR = (n === undefined || n === null) ? null : ((n >>> 0) || 1); return _wkR; },
		// 影エージェント: 距離場だけで動く2つ目の位置を並走させて本体と比べる
		audit: on => {
			WK.audit.on = on !== false;
			WK.audit.gap = []; WK.audit.cos = []; WK.audit.n = 0;
			WK.audit.offGraph = 0; WK.audit.legOver = 0; WK.audit.by = {}; WK.audit.legEnd = [];
			WK.stat.stale = 0; WK.stat.fallback = 0; WK.stat.evicted = 0;
			return WK.audit.on;
		},
		auditReport: () => auditReport(),
		resN: () => Object.assign({}, R.resN),
		gridStats: () => gridStats(),
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
			const why = u.apply();
			if (why) { S.money += c; return why; }      // 置けなかったら代金は取らない
			resetRuntimeForLayout(); buildStation(); renderUpgrades();
			return true;
		},
	};
}

boot();
})();
