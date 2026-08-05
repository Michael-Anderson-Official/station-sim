// 駅シムをスマホで遊ぶための簡易配信サーバー
// 使い方: このフォルダで `node serve.mjs` → 表示されたURLをスマホ（同じWi-Fi）で開く
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8370;
const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".png": "image/png",
	".ico": "image/x-icon",
	".webmanifest": "application/manifest+json; charset=utf-8",
};

// 開発用: `node serve.mjs --dev` のときだけ、描画結果のPNGを受け取って保存する。
// ブラウザの画面を直接見られない環境で見た目を確認するための口。
const DEV = process.argv.includes("--dev");

/* ---- ライブリロード ----
   ファイルを保存したら、繋がっているスマホを即座に読み込み直させる。
   受信側のスクリプトは index.html を返すときに差し込むので、
   GitHub Pages に置く静的ファイルには一切入らない */
const liveClients = new Set();
const LIVE_TAG = `<script>
(function () {
	var es = new EventSource('/__live');
	es.onmessage = function () { location.reload(); };
})();
</script>
`;

function broadcastReload() {
	for (const c of liveClients) {
		try { c.write("data: reload\n\n"); } catch (e) { liveClients.delete(c); }
	}
}

let watchTimer = null;
try {
	fs.watch(ROOT, { recursive: true }, (ev, name) => {
		if (!name || !/\.(html|js|css|webmanifest)$/.test(name)) return;
		clearTimeout(watchTimer);
		watchTimer = setTimeout(broadcastReload, 150);   // 保存が連続しても1回にまとめる
	});
} catch (e) {
	console.log("  (ファイル監視を開始できませんでした: " + e.message + ")");
}

const server = http.createServer((req, res) => {
	// ライブリロードの通知路。切れたら EventSource が勝手に繋ぎ直す
	if (req.url === "/__live") {
		res.writeHead(200, {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-store",
			"Connection": "keep-alive",
		});
		res.write("retry: 1000\n\n");
		liveClients.add(res);
		req.on("close", () => liveClients.delete(res));
		return;
	}

	if (DEV && req.method === "POST" && req.url.startsWith("/__shot")) {
		// ?name= で保存先を指定できる(英数字とハイフンの .png のみ)
		const q = new URL(req.url, "http://x").searchParams.get("name");
		const name = /^[\w-]+\.png$/.test(q ?? "") ? q : "shot.png";
		const chunks = [];
		let size = 0;
		req.on("data", c => {
			size += c.length;
			if (size > 12 * 1024 * 1024) { req.destroy(); return; }
			chunks.push(c);
		});
		req.on("end", () => {
			const body = Buffer.concat(chunks).toString("utf8");
			const b64 = body.replace(/^data:image\/png;base64,/, "");
			fs.writeFileSync(path.join(ROOT, name), Buffer.from(b64, "base64"));
			res.writeHead(200); res.end(name);
		});
		return;
	}

	let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
	if (p === "/") p = "/index.html";
	const file = path.join(ROOT, path.normalize(p));
	if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		res.writeHead(404); res.end("not found"); return;
	}
	/* 開発中は絶対にキャッシュさせない。
	   ヘッダを何も付けないと iOS Safari が独自の判断で game.js を握り続け、
	   「HTML だけ新しくて JS が古い」状態になる。新しい画面の箱はあるのに
	   中身を作る関数が無いので、開いた瞬間に例外で止まって真っ黒になる */
	const ext = path.extname(file);
	const head = { "Content-Type": MIME[ext] ?? "application/octet-stream" };
	if (ext === ".html" || ext === ".js" || ext === ".css" || ext === ".webmanifest") {
		head["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
		head["Pragma"] = "no-cache";
		head["Expires"] = "0";
	}
	if (ext === ".html") {
		/* index.html にだけ手を入れる。
		   ?v= は game.js / style.css の更新時刻に書き換えるので、
		   版番号を手で上げなくても必ず新しいものが取り直される */
		let html = fs.readFileSync(file, "utf8");
		const stamp = f => {
			try { return fs.statSync(path.join(ROOT, f)).mtimeMs.toString(36); } catch (e) { return "0"; }
		};
		// 画面に出す版は game.js の更新時刻。届いている版がひと目で分かる
		const jsTime = () => {
			try {
				const d = fs.statSync(path.join(ROOT, "game.js")).mtime;
				return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
			} catch (e) { return "?"; }
		};
		const jv = stamp("game.js");
		html = html.replace(/game\.js\?v=[\w.]+/, "game.js?v=" + jv)
			.replace(/style\.css\?v=[\w.]+/, "style.css?v=" + stamp("style.css"))
			.replace(/(<span id="planVer">)[^<]*(<\/span>)/, "$1" + jsTime() + "$2")
			.replace("</body>", LIVE_TAG + "</body>");
		head["Content-Length"] = Buffer.byteLength(html);
		res.writeHead(200, head);
		res.end(html);
		return;
	}
	res.writeHead(200, head);
	fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
	console.log("==============================================");
	console.log("  Station Sim - server running");
	console.log("");
	console.log("  Open on this PC:   http://localhost:" + PORT);
	for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
		for (const a of addrs ?? []) {
			if (a.family === "IPv4" && !a.internal) {
				console.log(`  Open on phone:     http://${a.address}:${PORT}   (${name})`);
			}
		}
	}
	console.log("");
	console.log("  Phone must be on the same Wi-Fi.");
	console.log("  Stop server: close this window / Ctrl+C");
	console.log("==============================================");
});
