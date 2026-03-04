import { snapWorldPoint } from "../utils/geom.js";

export class Apply {
  constructor(pushLog) {
    this.pushLog = pushLog;
  }

  applyJsonText(s, jsonText) {
    const text = (jsonText ?? "").trim();
    if (!text) return { ok: false, msg: "Paste JSON first." };

    let obj;
    try { obj = JSON.parse(text); }
    catch { return { ok: false, msg: "Invalid JSON." }; }

    const moves = Array.isArray(obj.moves) ? obj.moves : [];
    const actions = Array.isArray(obj.actions) ? obj.actions : [];

    for (const m of moves) {
      const name = (m?.token ?? "").toString();
      const to = m?.to;
      if (!name || !Array.isArray(to) || to.length !== 2) continue;

      const tok = s.tokens.find(t => t.name === name);
      if (!tok) { this.pushLog(`Move ignored (token not found): ${name}`); continue; }

      const gx = Number(to[0]), gy = Number(to[1]);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;

      const g = s.gridSize;
      if (s.snapMode === "topleft") {
        tok.x = gx * g; tok.y = gy * g;
      } else {
        tok.x = (gx + 0.5) * g; tok.y = (gy + 0.5) * g;
      }

      const snapped = snapWorldPoint(s.gridSize, s.snapMode, tok.x, tok.y);
      tok.x = snapped.x; tok.y = snapped.y;

      this.pushLog(`Moved ${name} -> (${gx},${gy})`);
    }

    for (const a of actions) {
      const token = (a?.token ?? "").toString();
      const type = (a?.type ?? "other").toString();
      const target = (a?.target ?? null);
      const details = (a?.details ?? "").toString();
      if (!token) continue;
      this.pushLog(`Action: ${token} ${type}${target ? " vs " + target : ""} — ${details}`);
    }

    if (obj.end_turn) this.pushLog("End turn ✓");
    return { ok: true, msg: "Applied ✓" };
  }
}
