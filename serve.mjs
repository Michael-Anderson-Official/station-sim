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

const server = http.createServer((req, res) => {
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
