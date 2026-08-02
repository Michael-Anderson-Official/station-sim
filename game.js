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
	CONC_D: 70,            // コンコース奥行き(固定。広げるのは幅方向)
	CONC_OVER: 40,         // コンコースがホーム北端を覆う長さ
	WALK: 1.35,            // 歩行速度 m/s
	GATE_HEADWAY: 1.6,     // 改札機1台が1人を通す秒数
	STAIR_HEADWAY: 0.85,   // 階段1basis
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
		gates: 2,             // 改札機の台数
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
	// 駅舎はホーム北端を覆う。短いホームでは覆う長さも縮める
	G.over = Math.min(CFG.CONC_OVER, G.platLen * 0.6);
	G.concZ0 = G.platZ1 - G.over;
	G.concZ1 = G.concZ0 + CFG.CONC_D;
	G.gateZ = G.concZ1 - 18;
	G.exitZ = G.concZ1 + 10;
	G.concX0 = platX(0) - G.unitW / 2 - 7 - S.concW;
	G.concX1 = platX(S.nPlat - 1) + G.unitW / 2 + 7 + S.concW;
	G.concCx = (G.concX0 + G.concX1) / 2;
	G.concArea = (G.concX1 - G.concX0) * CFG.CONC_D;
	G.platArea = S.platW * G.platLen;
	G.trainCap = S.cars * CFG.CAR_CAP;
	G.doorFlow = S.cars * CFG.CAR_FLOW;
	G.nDoors = Math.max(2, S.cars * 2);
	// 階段はコンコースに覆われた範囲に収める
	G.stairA = G.concZ0 + 5;
	G.stairB = G.platZ1 - 5;
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
function gateCols() { return Math.max(4, Math.floor((G.concX1 - G.concX0 - 8) / 1.7)); }
function gatePos(j) {
	const cols = gateCols();
	const row = Math.floor(j / cols);
	const col = j % cols;
	const n = Math.min(S.gates - row * cols, cols);
	return { x: G.concCx + (col - (n - 1) / 2) * 1.7, z: G.gateZ - row * 7 };
}
// ドア位置のZ (1両あたり2ドア)
function doorZ(i) {
	if (G.nDoors < 2) return 0;
	return G.platZ0 + 3 + i * (G.platLen - 6) / (G.nDoors - 1);
}

/* ================= Three.js ================= */
let renderer, scene, camera, controls, paxMesh, dummy, stationGroup, trainGroup;
const COL_OUT = new THREE.Color(0x5fa8ff);   // 降車客(出場)
const COL_IN = new THREE.Color(0xffb055);    // 入場客

function initThree() {
	const app = document.getElementById('app');
	renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.outputEncoding = THREE.sRGBEncoding;
	app.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x121b28);
	scene.fog = new THREE.Fog(0x121b28, 500, 3000);

	camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 6000);

	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.09;
	controls.maxPolarAngle = Math.PI * 0.47;
	controls.minDistance = 25;
	controls.maxDistance = 2500;

	scene.add(new THREE.AmbientLight(0xbcd0e8, 0.72));
	const sun = new THREE.DirectionalLight(0xffffff, 0.75);
	sun.position.set(120, 220, 90);
	scene.add(sun);
	const fill = new THREE.DirectionalLight(0x88aaff, 0.28);
	fill.position.set(-140, 80, -120);
	scene.add(fill);

	// 地面
	const ground = new THREE.Mesh(
		new THREE.PlaneGeometry(3000, 3000),
		new THREE.MeshLambertMaterial({ color: 0x1b2636 })
	);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.4;
	scene.add(ground);

	stationGroup = new THREE.Group();
	scene.add(stationGroup);
	trainGroup = new THREE.Group();
	scene.add(trainGroup);

	// 乗客(インスタンス描画)
	dummy = new THREE.Object3D();
	const pg = new THREE.BoxGeometry(0.5, 1.7, 0.4);
	pg.translate(0, 0.85, 0);
	paxMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial(), CFG.MAX_PAX);
	paxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	paxMesh.frustumCulled = false;
	for (let i = 0; i < CFG.MAX_PAX; i++) paxMesh.setColorAt(i, COL_OUT);
	paxMesh.count = 0;
	scene.add(paxMesh);

	window.addEventListener('resize', onResize);
}

function onResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ================= 駅の造形 ================= */
const MAT = {
	ballast: new THREE.MeshLambertMaterial({ color: 0x2e3644 }),
	rail: new THREE.MeshLambertMaterial({ color: 0x8d98a8 }),
	plat: new THREE.MeshLambertMaterial({ color: 0x9aa4b2 }),
	platEdge: new THREE.MeshLambertMaterial({ color: 0xe0c33a }),
	conc: new THREE.MeshLambertMaterial({ color: 0xc8d2e0, transparent: true, opacity: 0.5 }),
	stair: new THREE.MeshLambertMaterial({ color: 0xb9c4d2 }),
	esc: new THREE.MeshLambertMaterial({ color: 0x59b98a }),
	gate: new THREE.MeshLambertMaterial({ color: 0x334a66 }),
	gateTop: new THREE.MeshLambertMaterial({ color: 0x4fd1ff }),
	shop: new THREE.MeshLambertMaterial({ color: 0xd9724a }),
	pillar: new THREE.MeshLambertMaterial({ color: 0x6f7a8a }),
	car: new THREE.MeshLambertMaterial({ color: 0xd8dde4 }),
	carBand: new THREE.MeshLambertMaterial({ color: 0xd8006c }),
};

function box(w, h, d, mat, x, y, z, parent) {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
	m.position.set(x, y + h / 2, z);
	parent.add(m);
	return m;
}

function buildStation() {
	recalcGeometry();
	// 旧ジオメトリを破棄
	while (stationGroup.children.length) {
		const c = stationGroup.children.pop();
		if (c.geometry) c.geometry.dispose();
	}

	const L = G.platLen;

	// 線路
	for (let t = 0; t < S.nTrack; t++) {
		const x = trackX(t);
		box(CFG.TRACK_W, 0.35, L + 460, MAT.ballast, x, -0.3, 0, stationGroup);
		box(0.14, 0.16, L + 460, MAT.rail, x - 0.72, 0.05, 0, stationGroup);
		box(0.14, 0.16, L + 460, MAT.rail, x + 0.72, 0.05, 0, stationGroup);
	}

	// ホーム
	for (let i = 0; i < S.nPlat; i++) {
		const x = platX(i);
		box(S.platW, CFG.PLAT_Y, L, MAT.plat, x, 0, 0, stationGroup);
		box(0.4, 0.06, L, MAT.platEdge, x - S.platW / 2 + 0.3, CFG.PLAT_Y, 0, stationGroup);
		box(0.4, 0.06, L, MAT.platEdge, x + S.platW / 2 - 0.3, CFG.PLAT_Y, 0, stationGroup);
		// 上家を支える柱
		for (let z = -L / 2 + 12; z < L / 2 - 6; z += 26) {
			box(0.5, CFG.CONC_Y - CFG.PLAT_Y, 0.5, MAT.pillar, x, CFG.PLAT_Y, z, stationGroup);
		}
		// 階段 / エスカレーター
		for (let k = 0; k < S.stairs; k++) {
			const sz = stairZ(k);
			const mat = S.esc ? MAT.esc : MAT.stair;
			const rise = CFG.CONC_Y - CFG.PLAT_Y;
			const run = 9;
			const st = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, Math.hypot(rise, run)), mat);
			st.position.set(x, CFG.PLAT_Y + rise / 2, sz - run / 2);
			st.rotation.x = -Math.atan2(rise, run);
			stationGroup.add(st);
		}
	}

	// コンコース床(半透明。ホームを覆う部分は見えるように)
	const cw = G.concX1 - G.concX0;
	const cf = box(cw, 0.5, CFG.CONC_D, MAT.conc, G.concCx, CFG.CONC_Y, (G.concZ0 + G.concZ1) / 2, stationGroup);
	cf.renderOrder = 2;

	// 改札機
	for (let j = 0; j < S.gates; j++) {
		const g = gatePos(j);
		box(0.55, 1.0, 3.2, MAT.gate, g.x - 0.85, CFG.CONC_Y + 0.5, g.z, stationGroup);
		box(0.55, 1.0, 3.2, MAT.gate, g.x + 0.85, CFG.CONC_Y + 0.5, g.z, stationGroup);
		box(0.55, 0.08, 3.2, MAT.gateTop, g.x - 0.85, CFG.CONC_Y + 1.5, g.z, stationGroup);
		box(0.55, 0.08, 3.2, MAT.gateTop, g.x + 0.85, CFG.CONC_Y + 1.5, g.z, stationGroup);
	}

	// 駅ナカ店舗
	for (let s = 0; s < S.shops; s++) {
		const side = s % 2 ? 1 : -1;
		const idx = Math.floor(s / 2);
		const sx = G.concCx + side * (cw / 2 - 5 - idx * 9);
		box(7, 2.6, 6, MAT.shop, sx, CFG.CONC_Y + 0.5, G.gateZ - 22, stationGroup);
	}

	// 出口デッキ
	box(Math.min(cw, 60), 0.5, 26, MAT.conc, G.concCx, CFG.CONC_Y, G.exitZ + 6, stationGroup);
}

// 駅全体が画角に収まる位置へカメラを置く(起動時のみ)
function fitCamera() {
	const span = Math.max(G.platLen + CFG.CONC_D, G.concX1 - G.concX0);
	const d = span * 1.15 + 60;
	const cz = (G.platZ0 + G.exitZ) / 2;
	controls.target.set(0, 0, cz);
	camera.position.set(d * 0.35, d * 0.55, cz + d * 0.8);
	controls.update();
}

/* ================= 列車 ================= */
function buildTrainMesh() {
	const g = new THREE.Group();
	const carLen = CFG.CAR_LEN - 1;
	for (let i = 0; i < S.cars; i++) {
		const z = G.platZ0 + i * CFG.CAR_LEN + CFG.CAR_LEN / 2;
		box(3.0, 3.4, carLen, MAT.car, 0, 0.5, z, g);
		box(3.06, 0.5, carLen, MAT.carBand, 0, 1.9, z, g);
	}
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
		dwell: 0, room: 0, alightLeft: 0, cars: S.cars,
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
			// 乗車
			if (tr.room > 0) {
				tr.room -= boardWaiting(tr, Math.min(tr.room, G.doorFlow * dt));
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
		state: 'walk', until: 0, born: 0, readyAt: undefined, w: 1, sx: 0, sz: 0 };
}

function pathOut(p) {
	// 降車 → 階段 → コンコース → 改札 → 出口
	const px = platX(p.plat);
	const k = pickStair(p.plat);
	const sz = stairZ(k);
	const j = pickGate();
	const g = gatePos(j);
	return [
		{ x: px, y: CFG.PLAT_Y, z: sz + 2, res: 'stair', k: k },
		{ x: px, y: CFG.CONC_Y, z: sz - 10, climb: true },
		{ x: g.x, y: CFG.CONC_Y, z: g.z - 4, res: 'gate', j: j },
		{ x: g.x, y: CFG.CONC_Y, z: g.z + 4 },
		{ x: G.concCx + (Math.random() - 0.5) * 30, y: CFG.CONC_Y, z: G.exitZ + 12, exit: true },
	];
}

function pathIn(p) {
	const px = platX(p.plat);
	const k = pickStair(p.plat);
	const sz = stairZ(k);
	const j = pickGate();
	const g = gatePos(j);
	const side = trackSide(p.track);
	const di = Math.floor(Math.random() * G.nDoors);
	return [
		{ x: g.x, y: CFG.CONC_Y, z: g.z + 6, res: 'gate', j: j },
		{ x: g.x, y: CFG.CONC_Y, z: g.z - 6 },
		{ x: px, y: CFG.CONC_Y, z: sz - 10, res: 'stair', k: k },
		{ x: px, y: CFG.PLAT_Y, z: sz + 2, climb: true },
		{ x: px + side * (S.platW / 2 - 1.3), y: CFG.PLAT_Y, z: doorZ(di), board: true },
	];
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
	let best = 0, bt = Infinity;
	for (let j = 0; j < S.gates; j++) {
		if (R.gateFree[j] < bt) { bt = R.gateFree[j]; best = j; }
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

function countWaiting(track) {
	let n = 0;
	for (let i = 0; i < R.pax.length; i++) {
		const p = R.pax[i];
		if (p.state === 'waitTrain' && p.track === track) n++;
	}
	return n;
}

function boardWaiting(tr, maxPeople) {
	let took = 0;
	for (let i = R.pax.length - 1; i >= 0 && took < maxPeople; i--) {
		const p = R.pax[i];
		if (p.state !== 'waitTrain' || p.track !== tr.track) continue;
		finishPax(p);
		R.pax.splice(i, 1);
		took += p.w;
	}
	countPax(took);
	return took;
}

function countPax(people) {
	S.todayPax += people;
	// 運賃の駅取り分 + 駅ナカ店舗の売上(通行客の一部が買う)
	const rev = people * CFG.FARE + people * S.shops * 6.2;
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
			const hw = (isStair ? (S.esc ? CFG.ESC_HEADWAY : CFG.STAIR_HEADWAY) : CFG.GATE_HEADWAY) * R.paxScale;
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
			if (node.board) { p.state = 'waitTrain'; p.readyAt = R.now; continue; }
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

	while (R.inQHead < R.inQ.length) {
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
		+ 9000 * S.gates + 900 * S.concW + 55000 * S.shops
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
		can: () => S.stairs < CFG.MAX_STAIRS,
		ng: () => '階段はホームあたり' + CFG.MAX_STAIRS + 'つまで',
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
		id: 'gates', ic: '🎫', name: '改札機を増設 (+2)',
		desc: '改札の通過待ち行列を短くする。1台=約1.6秒に1人。',
		cost: () => 480000 * Math.pow(1.22, S.gates / 2 - 1),
		can: () => S.gates < 240,
		ng: () => '上限',
		apply: () => { S.gates += 2; },
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
	recalcGeometry();
	R.stairFree = [];
	for (let i = 0; i < S.nPlat; i++) {
		R.stairFree.push(new Array(CFG.MAX_STAIRS).fill(0));
	}
	R.gateFree = new Array(S.gates).fill(0);
	R.platCount = new Array(S.nPlat).fill(0);
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
	UI.clockBox.textContent = S.day + '日目 ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
		+ ' · ' + S.cars + '両 ' + S.nPlat + '面' + S.nTrack + '線';
	UI.moneyBox.textContent = yen(S.money);
	UI.rankBox.textContent = RANKS[S.rank].name;
	UI.paxBox.textContent = num(S.todayPax);

	let waiting = 0;
	for (let i = 0; i < R.pax.length; i++) if (R.pax[i].state === 'waitTrain') waiting += R.pax[i].w;
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
	if (gq > 90) alertOnce('gate', '⚠ 改札に長い行列 — 改札機を増設', false, 30);
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
	for (let i = 0; i < n; i++) {
		const p = R.pax[i];
		dummy.position.set(p.x, p.y, p.z);
		dummy.updateMatrix();
		paxMesh.setMatrixAt(i, dummy.matrix);
		paxMesh.setColorAt(i, p.dir === 0 ? COL_OUT : COL_IN);
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
	renderLog();
	requestAnimationFrame(loop);
	window.addEventListener('beforeunload', save);
	setInterval(save, 30000);

	// デバッグ用: コンソールから sim.step(3600) で1時間進められる
	window.sim = {
		get S() { return S; }, R, CFG, G,
		reset: () => { noSave = true; localStorage.removeItem(SAVE_KEY); location.reload(); },
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
