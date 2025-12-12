/**
 * Simple leaderboard server for the quiz.
 *
 * Endpoints:
 *   GET  /leaderboard  -> { humanities: [...], science: [...], mixed: [...] } (each max 3)
 *   POST /submit       -> body: { name, school, mode, score }
 *
 * Run:
 *   1) npm init -y
 *   2) npm i express cors
 *   3) node server.js
 *
 * Env:
 *   PORT=3000
 *   DB_FILE=./leaderboard.json
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const PORT = parseInt(process.env.PORT || "3000", 10);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "leaderboard.json");

const MODES = ["humanities", "science", "mixed"];

function nowISO(){ return new Date().toISOString(); }

function safeText(v, maxLen){
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, maxLen);
}

function safeScore(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(9999, Math.floor(n)));
}

function loadDB(){
  try{
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const data = JSON.parse(raw);
    return normalizeDB(data);
  }catch(e){
    return normalizeDB({});
  }
}

function normalizeDB(data){
  const out = { humanities: [], science: [], mixed: [] };
  for (const m of MODES){
    const arr = Array.isArray(data?.[m]) ? data[m] : [];
    out[m] = arr
      .filter(e => e && typeof e.name === "string" && typeof e.school === "string" && typeof e.score === "number")
      .map(e => ({
        name: safeText(e.name, 30),
        school: safeText(e.school, 40),
        score: safeScore(e.score),
        ts: typeof e.ts === "string" ? e.ts : nowISO()
      }));
  }
  // sort and trim to 3
  for (const m of MODES){
    out[m] = sortBoard(out[m]).slice(0, 3);
  }
  return out;
}

function saveDB(db){
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function keyOf(e){
  return `${e.name.toLowerCase()}|${e.school.toLowerCase()}`;
}

function sortBoard(arr){
  // score desc, then older ts first (earlier record wins)
  return [...arr].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = Date.parse(a.ts) || 0;
    const bt = Date.parse(b.ts) || 0;
    return at - bt;
  });
}

function upsertBest(board, entry){
  const k = keyOf(entry);
  const idx = board.findIndex(e => keyOf(e) === k);
  if (idx === -1) return [...board, entry];
  const cur = board[idx];
  // keep the best score; if equal score, keep existing (earlier ts)
  if (entry.score > cur.score) {
    const copy = [...board];
    copy[idx] = entry;
    return copy;
  }
  return board;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

app.get("/health", (req, res) => res.json({ ok: true, ts: nowISO() }));

app.get("/leaderboard", (req, res) => {
  const db = loadDB();
  res.json(db);
});

app.post("/submit", (req, res) => {
  const name = safeText(req.body?.name, 30);
  const school = safeText(req.body?.school, 40);
  const mode = safeText(req.body?.mode, 20);
  const score = safeScore(req.body?.score);

  if (!name || !school) return res.status(400).json({ error: "name/school required" });
  if (!MODES.includes(mode)) return res.status(400).json({ error: "invalid mode" });

  const entry = { name, school, score, ts: nowISO() };

  const db = loadDB();
  db[mode] = upsertBest(db[mode], entry);
  db[mode] = sortBoard(db[mode]).slice(0, 3);

  saveDB(db);
  res.json({ ok: true, board: db[mode], all: db });
});

app.listen(PORT, () => {
  console.log(`[quiz-server] listening on http://localhost:${PORT}`);
  console.log(`[quiz-server] DB_FILE=${DB_FILE}`);
});
