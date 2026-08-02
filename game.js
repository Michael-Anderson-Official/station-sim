/* 駅シム — 1面1線のしょぼい駅から新宿級の巨大ターミナルへ
   操作: 1本指ドラッグで回転 / 2本指で拡大・移動 */
(function () {
'use strict';

/* ================= 定数 ================= */
const CFG = {
	TRACK_W: 4.4,          // 線路1本が占める幅(m)
	CAR_LEN: 20,           // 1両の長さ(m)
	CARS_MIN: 2,
	CARS_MAX: 16,
	CAR_CAP: 150,          // 1両の定員
	CAR_FLOW: 1.6,         // 1両あたりのドア扱い人数/秒
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
		nPlat: 1,             // ホーム面数
		nTrack: 1,            // 線路本数
		platW: 6,             // ホーム幅
		stairs: 1,            // 各ホームの階段数
		esc: false,           // エスカレーター化
		gateM: 0,             // 手動改札(駅員配置)の通路数
		gateA: 0,             // 自動改札の通路数
		concW: 0,             // コンコースの片側拡張幅
		shops: 0,             // 駅ナカ店舗
		todayPax: 0, todayRev: 0, todayCost: 0,
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
	G.over = Math.min(G.concD * 0.55, Math.max(10, G.platLen * 0.32));
	G.concZ0 = G.platZ1 - G.over;
	G.concZ1 = G.concZ0 + G.concD;
	G.gateZ = G.concZ1 - Math.min(18, G.concD * 0.34);
	G.exitZ = G.concZ1 + 8;
	G.concX0 = platX(0) - G.unitW / 2 - 7 - S.concW;
	G.concX1 = platX(S.nPlat - 1) + G.unitW / 2 + 7 + S.concW;
	G.concCx = (G.concX0 + G.concX1) / 2;
	G.concArea = (G.concX1 - G.concX0) * G.concD;
	G.platArea = S.platW * G.platLen;
	G.trainCap = S.cars * CFG.CAR_CAP;
	G.doorFlow = S.cars * CFG.CAR_FLOW;
	G.nDoors = Math.max(2, S.cars * 2);
	// 階段はコンコースに覆われた範囲に収める
	G.stairA = G.concZ0 + 4;
	G.stairB = G.platZ1 - 4;
}

// ホームが短いと階段は何本も置けない。延伸すると増やせるようになる
function maxStairs() {
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
	const ground = new THREE.Mesh(
		new THREE.PlaneGeometry(9000, 9000),
		new THREE.MeshStandardMaterial({ map: rep(TEX.land, 110, 110), color: 0xffffff, roughness: 1 })
	);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.45;
	ground.receiveShadow = true;
	scene.add(ground);

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

	const L = G.platLen;
	const RUN = 10;                        // 階段の水平投影長
	const rise = CFG.CONC_Y - CFG.PLAT_Y;
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

		/* ---- 階段 / エスカレーター ---- */
		for (let k = 0; k < S.stairs; k++) {
			const sz = stairZ(k);
			if (S.esc) {
				// トラス + ステップ帯 + 手すり
				const len = Math.hypot(rise, RUN);
				const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, len), MAT.esc);
				body.position.set(x, CFG.PLAT_Y + rise / 2, sz - RUN / 2);
				body.rotation.x = -Math.atan2(rise, RUN);
				body.castShadow = body.receiveShadow = true;
				stationGroup.add(body);
				for (const s of [-1, 1]) {
					const hr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, len), MAT.handrail);
					hr.position.set(x + s * 1.45, CFG.PLAT_Y + rise / 2 + 0.6, sz - RUN / 2);
					hr.rotation.x = -Math.atan2(rise, RUN);
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
					const len = Math.hypot(rise, RUN);
					const hr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, len), MAT.handrail);
					hr.position.set(x + s * 1.5, CFG.PLAT_Y + rise / 2 + 0.55, sz - RUN / 2);
					hr.rotation.x = -Math.atan2(rise, RUN);
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

	/* ---- コンコース(橋上駅舎) ---- */
	box(cw, 0.6, G.concD, MAT.concUnder, G.concCx, CFG.CONC_Y - 0.6, (G.concZ0 + G.concZ1) / 2, stationGroup);
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(cw, G.concD), MAT.conc);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(G.concCx, CFG.CONC_Y + 0.01, (G.concZ0 + G.concZ1) / 2);
	floor.receiveShadow = true;
	stationGroup.add(floor);

	// 壁は腰壁+ガラス。俯瞰で中が見えるよう天井は張らない
	const wallH = 3.6;
	for (const s of [-1, 1]) {
		const wx = G.concCx + s * cw / 2;
		box(0.35, 1.0, G.concD, MAT.concUnder, wx, CFG.CONC_Y, (G.concZ0 + G.concZ1) / 2, stationGroup);
		box(0.3, wallH - 1.0, G.concD, MAT.glass, wx, CFG.CONC_Y + 1.0, (G.concZ0 + G.concZ1) / 2, stationGroup, true);
	}
	for (const z of [G.concZ0, G.concZ1]) {
		box(cw, 1.0, 0.35, MAT.concUnder, G.concCx, CFG.CONC_Y, z, stationGroup);
		box(cw, wallH - 1.0, 0.3, MAT.glass, G.concCx, CFG.CONC_Y + 1.0, z, stationGroup, true);
	}
	// 屋根の縁(庇)だけ回して建物の輪郭を出す
	box(cw + 1.4, 0.3, 0.9, MAT.roof, G.concCx, CFG.CONC_Y + wallH, G.concZ0 - 0.4, stationGroup, true);
	box(cw + 1.4, 0.3, 0.9, MAT.roof, G.concCx, CFG.CONC_Y + wallH, G.concZ1 + 0.4, stationGroup, true);
	// 天井の照明
	const clampGeo = new THREE.BoxGeometry(3.0, 0.14, 0.3);
	const clamps = [];
	for (let x = G.concX0 + 6; x < G.concX1 - 3; x += 9) {
		for (let z = G.concZ0 + 6; z < G.concZ1 - 3; z += 12) clamps.push([x, CFG.CONC_Y + wallH - 0.4, z]);
	}
	addInstanced(clampGeo, MAT.lamp, clamps, stationGroup, false);

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
				md.push([g.x + s * 0.95, CFG.CONC_Y, g.z]);
				mp.push([g.x + s * 0.95, CFG.CONC_Y, g.z - 1.6]);
			}
			staff.push([g.x + 1.55, CFG.CONC_Y, g.z - 0.4, 0, Math.PI, 0]);
		} else {
			for (const s of [-1, 1]) {
				gb.push([g.x + s * 0.85, CFG.CONC_Y + 0.5, g.z]);
				gt.push([g.x + s * 0.85, CFG.CONC_Y + 1.05, g.z]);
				gf.push([g.x + s * 0.55, CFG.CONC_Y + 0.36, g.z + 1.2]);
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
		box(sgW, 0.55, 0.12, MAT.sign, G.concCx, CFG.CONC_Y + 2.55, G.gateZ + 2.4, stationGroup, true);
		box(sgW * 0.9, 0.34, 0.14, MAT.signFace, G.concCx, CFG.CONC_Y + 2.65, G.gateZ + 2.33, stationGroup, true);
	}

	/* ---- 駅ナカ店舗 / 券売機 ---- */
	for (let s = 0; s < S.shops; s++) {
		const side = s % 2 ? 1 : -1;
		const idx = Math.floor(s / 2);
		const sx = G.concCx + side * (cw / 2 - 5.5 - idx * 9);
		const sz = G.gateZ - 18 - (idx % 2) * 9;
		box(7, 2.9, 6, MAT.shop, sx, CFG.CONC_Y + 0.02, sz, stationGroup);
		box(7.2, 0.5, 0.3, MAT.lamp, sx, CFG.CONC_Y + 2.5, sz - 3.1, stationGroup, false);
	}
	const vendGeo = new THREE.BoxGeometry(1.1, 1.9, 0.7);
	const vends = [];
	for (let i = 0; i < Math.min(6, 1 + gateCount() / 8); i++) {
		vends.push([G.concX0 + 3, CFG.CONC_Y + 0.95, G.gateZ + 6 + i * 2.2]);
	}
	addInstanced(vendGeo, MAT.vend, vends, stationGroup, true);

	/* ---- 出口デッキ ----
	   線路の真上に降りられないので、デッキを線路脇まで横に渡してから地上に降ろす */
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

function buildCity() {
	disposeGroup(cityGroup);
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
			if (x > G.concX0 - 10 && x < plazaX + 78 && z > G.concZ0 - 30 && z < G.exitZ + 40) continue;
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

	// 駅前広場(線路の東側)。駅の規模に合わせる
	const pw = 34 + grow * 60, pd = 30 + grow * 54;
	const sq = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), MAT.road);
	sq.rotation.x = -Math.PI / 2;
	sq.position.set(plazaX + 18 + pw / 2, -0.38, G.exitZ);
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

/* ================= 列車 ================= */
function buildTrainMesh() {
	const g = new THREE.Group();
	const cl = CFG.CAR_LEN - 1.2;          // 連結部を空ける
	const bodyGeo = new THREE.BoxGeometry(3.0, 2.6, cl);
	const roofGeo = new THREE.BoxGeometry(2.86, 0.34, cl);
	const skirtGeo = new THREE.BoxGeometry(2.8, 0.55, cl - 1.5);
	const bogieGeo = new THREE.BoxGeometry(2.5, 0.7, 3.0);
	const bodies = [], roofs = [], skirts = [], bogies = [], pantos = [];

	for (let i = 0; i < S.cars; i++) {
		const z = G.platZ0 + i * CFG.CAR_LEN + CFG.CAR_LEN / 2;
		bodies.push([0, 2.35, z]);
		roofs.push([0, 3.79, z]);
		skirts.push([0, 0.85, z]);
		bogies.push([0, 0.6, z - cl / 2 + 2.6]);
		bogies.push([0, 0.6, z + cl / 2 - 2.6]);
		if (i % 2 === 1) pantos.push([0, 4.05, z + 3]);
	}
	// 車体はテクスチャで窓とドアと帯を表現する
	const body = addInstanced(bodyGeo, MAT.carSide, bodies, g, true);
	if (body) body.receiveShadow = false;
	addInstanced(roofGeo, MAT.carRoof, roofs, g, true);
	addInstanced(skirtGeo, MAT.bogie, skirts, g, false);
	addInstanced(bogieGeo, MAT.bogie, bogies, g, false);
	// 夜に光る窓(車体より少しだけ外側に重ねる)
	const winGeo = new THREE.BoxGeometry(3.04, 0.95, cl - 2.2);
	const win = addInstanced(winGeo, MAT.carWin, bodies.map(b => [b[0], b[1] + 0.5, b[2]]), g, false);
	if (win) win.receiveShadow = false;
	// パンタグラフ
	const pGeo = new THREE.BoxGeometry(1.9, 0.12, 0.5);
	addInstanced(pGeo, MAT.panto, pantos, g, false);

	// 先頭部の前面
	box(2.9, 2.4, 0.4, MAT.carEnd, 0, 2.4, G.platZ0 + 0.3, g, true);
	box(2.9, 2.4, 0.4, MAT.carEnd, 0, 2.4, G.platZ1 - 0.3, g, true);
	return g;
}

// 列車が場外に待避する距離
function trainOffZ() { return G.platLen / 2 + 220; }

function spawnTrain(track) {
	const mesh = buildTrainMesh();
	mesh.position.x = trackX(track);
	mesh.position.z = -trainOffZ();
	trainGroup.add(mesh);
	R.trains.push({
		track, mesh, phase: 'approach', z: -trainOffZ(),
		dwell: 0, room: 0, boardAcc: 0, alightLeft: 0, cars: S.cars,
	});
}

function trainHeadway() {
	// ランクが上がるほど増発される。短い編成はローカル運用なので本数も少ない
	const base = Math.max(180, 900 - S.rank * 90);
	const carFactor = 1 + (CFG.CARS_MAX - S.cars) / CFG.CARS_MAX * 0.5;
	return base * carFactor;
}

function updateTrains(dt) {
	// 発車→次の列車の生成
	for (let t = 0; t < S.nTrack; t++) {
		if (!R.trackTimer) R.trackTimer = [];
		if (R.trackTimer[t] === undefined) R.trackTimer[t] = t * 40;
		R.trackTimer[t] -= dt;
		const busy = R.trains.some(tr => tr.track === t);
		if (R.trackTimer[t] <= 0 && !busy) {
			R.trackTimer[t] = trainHeadway();
			spawnTrain(t);
		}
	}

	for (let i = R.trains.length - 1; i >= 0; i--) {
		const tr = R.trains[i];
		if (tr.phase === 'approach') {
			tr.z += 42 * dt;
			if (tr.z >= 0) {
				tr.z = 0;
				tr.phase = 'dwell';
				tr.dwell = 0;
				// 降車客を確定。混んだ編成が入ってきて、降りた分だけ空く
				const cap = G.trainCap;
				const n = Math.min(R.outPool, cap);
				R.outPool -= n;
				tr.alightLeft = n;
				tr.room = Math.min(cap, cap * CFG.LOAD_ROOM + n * CFG.ALIGHT_ROOM);
			}
		} else if (tr.phase === 'dwell') {
			tr.dwell += dt;
			// 降車
			if (tr.alightLeft > 0) {
				const n = Math.min(tr.alightLeft, G.doorFlow * dt);
				tr.alightLeft -= n;
				spawnAlighted(tr, n);
			}
			// 乗車。エージェント粒度(1体=paxScale人)でも平均レートがドア扱い量に一致するよう、
			// 積み残した端数を列車ごとに繰り越す
			if (tr.room > 0) {
				// 上限は「待っている中で最も重いエージェント」まで許す。
				// paxScale が下がった後に古い重いエージェントが永久に乗れなくなるのを防ぐ
				tr.boardAcc = Math.min(tr.boardAcc + G.doorFlow * dt,
					G.doorFlow * dt + Math.max(R.paxScale, R.maxWaitW));
				const take = Math.min(tr.boardAcc, tr.room);
				const got = boardWaiting(tr, take);
				tr.boardAcc -= got;
				tr.room -= got;
			}
			const stillWaiting = countWaiting(tr.track) > 0 && tr.room > 0;
			const done = tr.alightLeft <= 0.01 && !stillWaiting && tr.dwell >= CFG.DWELL_MIN;
			if (done || tr.dwell >= CFG.DWELL_MAX) {
				tr.phase = 'depart';
				if (tr.dwell > CFG.DWELL_MIN + 25) {
					// 停車時間超過 = 遅延。評判に直接効かせる
					S.rep = Math.max(0, S.rep - 0.05);
					alertOnce('delay', '停車時間超過 — 遅延発生', false, 40);
				}
			}
		} else {
			tr.z += 40 * dt;
			if (tr.z > trainOffZ()) {
				trainGroup.remove(tr.mesh);
				tr.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
				R.trains.splice(i, 1);
				continue;
			}
		}
		tr.mesh.position.z = tr.z;
	}
}

/* ================= 乗客 ================= */
function newPax() {
	return { x: 0, y: 0, z: 0, path: null, pi: 0, dir: 0, plat: 0, track: 0,
		state: 'walk', until: 0, born: 0, readyAt: undefined, w: 1, sx: 0, sz: 0,
		ph: 0, head: 0, col: COL_OUT };
}

function pathOut(p) {
	// 降車 → 階段 → コンコース → 改札 → 出口
	const px = platX(p.plat);
	const k = pickStair(p.plat);
	const sz = stairZ(k);
	const path = [
		{ x: px, y: CFG.PLAT_Y, z: sz + 2, res: 'stair', k: k },
		{ x: px, y: CFG.CONC_Y, z: sz - 10, climb: true },
	];
	// 改札が1つも無い無人駅では素通りする
	const j = pickGate();
	if (j >= 0) {
		const g = gatePos(j);
		path.push({ x: g.x, y: CFG.CONC_Y, z: g.z - 4, res: 'gate', j: j });
		path.push({ x: g.x, y: CFG.CONC_Y, z: g.z + 4 });
	}
	path.push({ x: G.concCx + (Math.random() - 0.5) * 30, y: CFG.CONC_Y, z: G.exitZ + 12, exit: true });
	return path;
}

function pathIn(p) {
	const px = platX(p.plat);
	const k = pickStair(p.plat);
	const sz = stairZ(k);
	const side = trackSide(p.track);
	const di = Math.floor(Math.random() * G.nDoors);
	const path = [];
	const j = pickGate();
	if (j >= 0) {
		const g = gatePos(j);
		path.push({ x: g.x, y: CFG.CONC_Y, z: g.z + 6, res: 'gate', j: j });
		path.push({ x: g.x, y: CFG.CONC_Y, z: g.z - 6 });
	}
	path.push({ x: px, y: CFG.CONC_Y, z: sz - 10, res: 'stair', k: k });
	path.push({ x: px, y: CFG.PLAT_Y, z: sz + 2, climb: true });
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
	countPax(n);
}

// 線路ごとの待機客はカウンタで持つ(毎回 R.pax を全走査すると高速再生で潰れる)
function countWaiting(track) { return R.waitN[track] || 0; }

function recountWaiting() {
	R.waitN = new Array(Math.max(1, S.nTrack)).fill(0);
	R.waitW = new Array(Math.max(1, S.nTrack)).fill(0);
	R.maxWaitW = 1;
	for (let i = 0; i < R.pax.length; i++) {
		const p = R.pax[i];
		if (p.state !== 'waitTrain') continue;
		if (p.track >= R.waitN.length) p.track = R.waitN.length - 1;
		R.waitN[p.track]++; R.waitW[p.track] += p.w;
		if (p.w > R.maxWaitW) R.maxWaitW = p.w;
	}
}

function boardWaiting(tr, maxPeople) {
	let took = 0;
	for (let i = R.pax.length - 1; i >= 0; i--) {
		const p = R.pax[i];
		if (p.state !== 'waitTrain' || p.track !== tr.track) continue;
		// 1エージェント = p.w 人。人数で先に判定しないとドア扱い量を超える
		if (took + p.w > maxPeople) break;
		finishPax(p);
		R.pax.splice(i, 1);
		R.waitN[p.track]--; R.waitW[p.track] -= p.w;
		took += p.w;
	}
	countPax(took);
	return took;
}

function countPax(people) {
	S.todayPax += people;
	// 改札が無いと運賃を取りこぼす
	const fare = CFG.FARE * (gateCount() > 0 ? 1 : CFG.NO_GATE_FARE);
	// 運賃の駅取り分 + 駅ナカ店舗の売上(通行客の一部が買う)
	const rev = people * fare + people * S.shops * 6.2;
	S.todayRev += rev;
	S.money += rev;
}

function finishPax(p) {
	// 駅内滞在時間から満足度を算出。
	// ただし乗車客が「次の列車を待つ」時間は駅のせいではないので除き、
	// 1本乗り遅れた分(積み残し)だけを罰する。運行間隔の不便さは軽い係数で反映。
	let dur;
	if (p.dir === 1 && p.readyAt !== undefined) {
		const hw = trainHeadway();
		dur = (p.readyAt - p.born) + Math.max(0, (R.now - p.readyAt) - hw) + hw * 0.075;
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
	if (p.y > CFG.CONC_Y - 1) {
		dens = R.concCount / Math.max(1, G.concArea);
	} else {
		dens = R.platCount[p.plat] / Math.max(1, G.platArea);
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
		if (p.y > CFG.CONC_Y - 1) R.concCount += p.w;
		else if (p.plat < R.platCount.length) R.platCount[p.plat] += p.w;
	}

	for (let i = R.pax.length - 1; i >= 0; i--) {
		const p = R.pax[i];
		if (p.state === 'waitTrain') continue;

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

		// リソース(階段/改札)の取得
		if (node.res && !p.gotRes) {
			const isStair = node.res === 'stair';
			const pool = isStair ? R.stairFree[p.plat] : R.gateFree;
			const idx = isStair ? node.k : node.j;
			// 1エージェントが paxScale 人を表すので、占有時間もその分かかる
			const hw = (isStair ? (S.esc ? CFG.ESC_HEADWAY : CFG.STAIR_HEADWAY)
				: gateHeadway(node.j)) * R.paxScale;
			const start = Math.max(pool[idx], R.now);
			pool[idx] = start + hw;
			p.gotRes = true;
			p.until = start;
			const ahead = Math.max(0, Math.ceil((start - R.now) / hw));
			// 行列は来た方向へ伸ばす
			const dz = p.dir === 0 ? -1 : 1;
			p.sx = node.x;
			p.sz = node.z + dz * Math.min(ahead * 0.75, 40);
			if (start > R.now) { p.state = 'queue'; continue; }
		}

		const arrived = stepTo(p, node.x, node.y, node.z, dt, node.climb);
		if (arrived) {
			p.gotRes = false;
			if (node.exit) { finishPax(p); R.pax.splice(i, 1); continue; }
			if (node.board) {
				p.state = 'waitTrain'; p.readyAt = R.now;
				R.waitN[p.track]++; R.waitW[p.track] += p.w;
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

function demandPerSec() {
	// 街の発展度 × 時間帯 × 評判
	const base = 120 * S.town;                       // 人/時 の基準
	const rep = 0.55 + (S.rep / 100) * 0.75;
	return base * hourFactor() * rep / 3600;
}

function updateDemand(dt) {
	const d = demandPerSec();
	// エージェント数が上限に近づいたら1人=N人にスケール
	const want = Math.ceil(d * 220 / CFG.MAX_PAX);
	R.paxScale = Math.max(1, want);

	// 降車客は列車が運んでくる
	R.outPool += d * 0.5 * dt;

	// 入場客は駅前から入ってくる。駅が飽和していたら外で待たされる(入場規制)
	R.inAccum += d * 0.5 * dt / R.paxScale;
	while (R.inAccum >= 1) { R.inAccum -= 1; R.inQ.push(R.now); }

	// 満員なら1回も生成できないので、行き先の選定は生成できるときだけ行う
	while (R.inQHead < R.inQ.length && R.pax.length < CFG.MAX_PAX) {
		const track = pickBoardTrack();
		const p = addPax(1, trackPlat(track), track,
			G.concCx + (Math.random() - 0.5) * 26, CFG.CONC_Y, G.exitZ + 12, R.inQ[R.inQHead]);
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

function pickBoardTrack() {
	// 待機客が最も少ない線路を選ぶ
	let best = 0, bn = Infinity;
	for (let t = 0; t < S.nTrack; t++) {
		const n = countWaiting(t);
		if (n < bn) { bn = n; best = t; }
	}
	return best;
}

/* ================= 経済・日次 ================= */
function dailyCost() {
	return S.nPlat * (10000 + 3500 * S.cars) + 25000 * S.nTrack + 12000 * S.stairs * S.nPlat
		+ 9000 * S.gateA + CFG.STAFF_WAGE * S.gateM + 900 * S.concW + 55000 * S.shops
		+ (S.esc ? 120000 : 0);
}

function endOfDay() {
	const cost = dailyCost();
	S.money -= cost;
	S.todayCost = cost;

	const sat = R.satN > 0 ? R.satSum / R.satN : S.rep;
	// 評判はその日の満足度へ寄っていく
	S.rep = Math.max(0, Math.min(100, S.rep + (sat - S.rep) * 0.35));
	// 評判が良ければ街が発展 = 需要増 (悪ければ客離れ)
	const growth = (S.rep - 50) / 120;
	S.town = Math.max(0.3, S.town * (1 + growth));

	S.yesterdayPax = S.todayPax;
	const oldRank = S.rank;
	while (S.rank < RANKS.length - 1 && S.yesterdayPax >= RANKS[S.rank + 1].need) S.rank++;

	S.log.unshift({
		day: S.day, pax: Math.round(S.todayPax), rev: Math.round(S.todayRev),
		cost: cost, sat: Math.round(sat), town: S.town, rank: RANKS[S.rank].name,
	});
	if (S.log.length > 40) S.log.length = 40;

	if (S.rank > oldRank) {
		alertOnce('rank', '🎉 ' + RANKS[S.rank].name + ' に昇格！', true, 0);
	}

	S.day++;
	S.todayPax = 0; S.todayRev = 0;
	R.satSum = 0; R.satN = 0;
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
		S.cars = Math.max(CFG.CARS_MIN, Math.min(CFG.CARS_MAX, Math.round(S.cars / 2) * 2));
		S.nPlat = Math.max(1, Math.min(10, Math.round(S.nPlat)));
		S.nTrack = Math.max(1, Math.min(S.nPlat * 2, Math.round(S.nTrack)));
		S.stairs = Math.max(1, Math.round(S.stairs));
		// 改札が「最初から2台」だった頃のセーブは、その台数を自動改札とみなす
		if (typeof o.gateA !== 'number' && typeof o.gates === 'number') {
			S.gateA = Math.max(0, Math.round(o.gates));
			S.gateM = 0;
		}
		S.gateA = Math.max(0, Math.round(S.gateA));
		S.gateM = Math.max(0, Math.round(S.gateM));
		return true;
	} catch (e) { return false; }
}

/* ================= 増築 ================= */
const UPGRADES = [
	{
		id: 'cars', ic: '📏', name: 'ホームを延伸 (+2両)',
		desc: () => 'ホーム有効長 ' + S.cars + '両 → ' + (S.cars + 2) + '両。'
			+ '1本の列車で運べる人数が ' + (S.cars * CFG.CAR_CAP) + '人 → ' + ((S.cars + 2) * CFG.CAR_CAP) + '人 になる。',
		cost: () => 2200000 * Math.pow(1.42, (S.cars - CFG.CARS_MIN) / 2) * S.nPlat,
		can: () => S.cars < CFG.CARS_MAX,
		ng: () => CFG.CARS_MAX + '両が上限',
		apply: () => { S.cars += 2; },
	},
	{
		id: 'stairs', ic: '🪜', name: '階段を増設',
		desc: 'ホームとコンコースを結ぶ階段。少ないとホームに人が溜まる。',
		cost: () => 700000 * Math.pow(1.9, S.stairs - 1) * S.nPlat,
		can: () => S.stairs < maxStairs(),
		ng: () => S.stairs < CFG.MAX_STAIRS ? 'ホームが短い(要延伸)' : '上限',
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
		cost: () => 260000 * Math.pow(1.12, S.gateM),
		can: () => S.gateM < 40,
		ng: () => '上限',
		apply: () => { S.gateM++; },
	},
	{
		id: 'gateA', ic: '🎫', name: '自動改札を1台設置',
		desc: () => '約' + CFG.GATE_A_HEADWAY + '秒に1人と速く、維持費も安い。'
			+ '初期費用は高い。現在 ' + S.gateA + '台。',
		cost: () => 1900000 * Math.pow(1.10, S.gateA),
		can: () => S.gateA < 220,
		ng: () => '上限',
		apply: () => { S.gateA++; },
	},
	{
		id: 'track', ic: '🛤', name: '線路を増設',
		desc: '発着できる列車が増え、輸送力が上がる。ホーム1面につき2線まで。',
		cost: () => 3200000 * Math.pow(1.45, S.nTrack - 1),
		can: () => S.nTrack < S.nPlat * 2,
		ng: () => '先にホームを増設',
		apply: () => { S.nTrack++; },
	},
	{
		id: 'plat', ic: '🏗', name: 'ホームを増設',
		desc: '島式ホームを1面追加。線路をさらに2本敷けるようになる。',
		cost: () => 14000000 * Math.pow(1.55, S.nPlat - 1),
		can: () => S.nPlat < 10,
		ng: () => '上限',
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
		id: 'conc', ic: '🏢', name: 'コンコース拡張',
		desc: '改札階を左右に8mずつ拡張。滞留スペースと改札を置ける幅が増える。',
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

function renderUpgrades() {
	const el = document.getElementById('upgrades');
	el.innerHTML = '';
	for (const u of UPGRADES) {
		const ok = u.can();
		const cost = Math.round(u.cost());
		const afford = S.money >= cost;
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
			if (!u.can() || S.money < c) return;
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

function resetRuntimeForLayout() {
	S.stairs = Math.max(1, Math.min(S.stairs, maxStairs()));
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
	// 編成長が変わると車両数が合わなくなるので、走行中の列車は作り直す
	for (const tr of R.trains) {
		trainGroup.remove(tr.mesh);
		tr.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
	}
	R.trains.length = 0;
	R.trackTimer = [];
	recountWaiting();
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
	document.getElementById('buildBtn').onclick = () => { renderUpgrades(); sheet.hidden = false; };
	document.getElementById('sheetClose').onclick = () => { sheet.hidden = true; };

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
		+ ' · ' + S.cars + '両 ' + S.nPlat + '面' + S.nTrack + '線' + gtxt;
	UI.moneyBox.textContent = yen(S.money);
	UI.rankBox.textContent = RANKS[S.rank].name;
	UI.paxBox.textContent = num(S.todayPax);

	let waiting = 0;
	for (let i = 0; i < R.waitW.length; i++) waiting += R.waitW[i];
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
	el.innerHTML = S.log.map(r =>
		'<div class="rep"><b>' + r.day + '日目</b><i>' + r.rank + '</i><br>' +
		'乗降 <b>' + num(r.pax) + '</b>人<i>満足度 ' + r.sat + '</i><br>' +
		'収入 ' + yen(r.rev) + '<i>維持費 ' + yen(r.cost) + '</i><br>' +
		'街の発展 ' + r.town.toFixed(2) + '</div>'
	).join('');
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
