import { el } from "../utils/dom.js";

export class ExportPanel {
  constructor(state, aiExport, backend, applyService, pushLog) {
    this.state = state;
    this.aiExport = aiExport;
    this.backend = backend;
    this.applyService = applyService;
    this.pushLog = pushLog;

    this.root = el("div", { class: "card" });
    this.state.subscribe(() => this.refresh());
  }

  mount(container) { container.appendChild(this.root); this.render(); }

  render() {
    this.root.innerHTML = "";

    this.exportBox = el("textarea", { spellcheck: "false" });
    this.copyBtn = el("button", { class: "primary", html: "Copy" });
    this.refreshBtn = el("button", { html: "Refresh" });

    this.copyBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(this.exportBox.value); }
      catch { this.exportBox.select(); document.execCommand("copy"); }
    });
    this.refreshBtn.addEventListener("click", () => this.refresh());

    this.apiUrl = el("input", { type: "text", value: "http://localhost:3000/api/vtt" });
    this.sendBtn = el("button", { class: "primary", html: "Send state to backend" });
    this.sendStatus = el("div", { class: "small", style: "margin-top:8px;" });

    this.sendBtn.addEventListener("click", async () => {
      const url = this.apiUrl.value.trim();
      if (!url) return;
      const s = this.state.get();
      const payload = {
        timestamp: new Date().toISOString(),
        gridSize: s.gridSize,
        snapMode: s.snapMode,
        view: { ...s.view },
        map: s.map.img ? { w:s.map.w,h:s.map.h,offX:s.map.offX,offY:s.map.offY,scale:s.map.scale,rot:s.map.rot,opacity:s.map.opacity } : null,
        tokens: s.tokens.map(t => ({ ...t })),
        turn: { ...s.turn },
        aiExport: this.exportBox.value
      };
      this.sendStatus.textContent = "Sending…";
      try { await this.backend.send(url, payload); this.sendStatus.textContent = "Sent ✓"; }
      catch (e) { this.sendStatus.textContent = `Send failed: ${e.message || e}`; }
    });

    this.applyBox = el("textarea", { spellcheck: "false", placeholder: '{"moves":[...],"actions":[...],"end_turn":true}' });
    this.applyBtn = el("button", { class: "primary", html: "Apply" });
    this.clearLogBtn = el("button", { html: "Clear log" });
    this.applyStatus = el("div", { class: "small", style: "margin-top:8px;" });
    this.logBox = el("div", { class: "small", style: "margin-top:8px;white-space:pre-wrap" });

    this.applyBtn.addEventListener("click", () => {
      const s = this.state.get();
      const res = this.applyService.applyJsonText(s, this.applyBox.value);
      this.applyStatus.textContent = res.msg;
      this.refresh();
    });

    this.clearLogBtn.addEventListener("click", () => {
      this.pushLog("__CLEAR__");
    });

    this.root.appendChild(el("label", { html: "AI turn packet (copy/paste into chat)" }));
    this.root.appendChild(this.exportBox);
    this.root.appendChild(el("div", { class: "btnbar", style:"margin-top:10px;" }, [this.copyBtn, this.refreshBtn]));

    this.root.appendChild(el("hr"));
    this.root.appendChild(el("label", { html: "Backend endpoint (POST JSON)" }));
    this.root.appendChild(this.apiUrl);
    this.root.appendChild(el("div", { class: "btnbar", style:"margin-top:10px;" }, [this.sendBtn]));
    this.root.appendChild(this.sendStatus);

    this.root.appendChild(el("hr"));
    this.root.appendChild(el("label", { html: "Apply AI JSON (paste response here)" }));
    this.root.appendChild(this.applyBox);
    this.root.appendChild(el("div", { class: "btnbar", style:"margin-top:10px;" }, [this.applyBtn, this.clearLogBtn]));
    this.root.appendChild(this.applyStatus);
    this.root.appendChild(this.logBox);

    this.refresh();
  }

  refresh() {
    const s = this.state.get();
    this.exportBox.value = this.aiExport.buildTurnPacket(s);
    this.logBox.textContent = (s.turn.logLines ?? []).join("\n");
  }
}
