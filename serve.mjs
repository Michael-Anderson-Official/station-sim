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
};

// 開発用: `node serve.mjs --dev` のときだけ、描画結果のPNGを受け取って保存する。
// ブラウザの画面を直接見られない環境で見た目を確認するための口。
const DEV = process.argv.includes("--dev");

const server = http.createServer((req, res) => {
	if (DEV && req.method === "POST" && req.url === "/__shot") {
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
			fs.writeFileSync(path.join(ROOT, "shot.png"), Buffer.from(b64, "base64"));
			res.writeHead(200); res.end("ok");
		});
		return;
	}

	let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
	if (p === "/") p = "/index.html";
	const file = path.join(ROOT, path.normalize(p));
	if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		res.writeHead(404); res.end("not found"); return;
	}
	res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
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
