import { State } from "./State.js";
import { Token } from "../models/Token.js";
import { MapLayer } from "../models/MapLayer.js";

import { CanvasStage } from "../ui/CanvasStage.js";
import { Sidebar } from "../ui/Sidebar.js";

import { AiExport } from "../services/AiExport.js";
import { Backend } from "../services/Backend.js";
import { Apply } from "../services/Apply.js";

import { el } from "../utils/dom.js";
import { snapWorldPoint } from "../utils/geom.js";

export class App {
  constructor(rootEl) {
    this.rootEl = rootEl;

    this.state = new State({
      gridSize: 64,
      snapMode: "center",
      dragMode: "tokens",
      view: { zoom: 1, panX: 0, panY: 0 },
      map: new MapLayer(),
      tokens: [],
      selectedTokenId: null,
      turn: {
        aiControls: "Monsters",
        round: 1,
        currentTurnTokenId: null,
        logLines: []
      }
    });

    this.aiExport = new AiExport();
    this.backend = new Backend();
    this.applyService = new Apply((line) => this.pushLog(line));
  }

  start() {
    this.rootEl.innerHTML = "";

    const app = el("div", { class: "app" });
    this.rootEl.appendChild(app);

    const stageWrap = el("main", { class: "stageWrap" });
    const topbar = el("div", { class: "topbar" });

    this.pills = {
      view: el("span", { class: "pill", html: "Zoom: 100% • Pan: (0,0)" }),
      grid: el("span", { class: "pill", html: "Grid: 64px" }),
      map:  el("span", { class: "pill", html: "Map: off(0,0) scale 1 rot 0°" }),
      hint: el("span", { class: "hint", html: "Prototype: grid + tokens + map align + AI turn packet." })
    };
    topbar.appendChild(this.pills.view);
    topbar.appendChild(this.pills.grid);
    topbar.appendChild(this.pills.map);
    topbar.appendChild(this.pills.hint);

    stageWrap.appendChild(topbar);

    this.stage = new CanvasStage(this.state);
    this.stage.mount(stageWrap);

    this.sidebar = new Sidebar(this.state, this.stage, {
      aiExport: this.aiExport,
      backend: this.backend,
      apply: this.applyService,
      pushLog: (line) => this.pushLog(line),
      addToken: (args) => this.addToken(args),
      clearTokens: () => this.clearTokens()
    });

    this.sidebar.mount(app);
    app.appendChild(stageWrap);

    this.state.subscribe((s) => this.updatePills(s));

    this.seed();
  }

  updatePills(s) {
    this.pills.view.textContent = `Zoom: ${Math.round(s.view.zoom * 100)}% • Pan: (${Math.round(s.view.panX)},${Math.round(s.view.panY)})`;
    this.pills.grid.textContent = `Grid: ${s.gridSize}px`;
    this.pills.map.textContent =
      `Map: off(${Math.round(s.map.offX)},${Math.round(s.map.offY)}) scale ${s.map.scale.toFixed(2)} rot ${(s.map.rot*180/Math.PI).toFixed(2)}°`;
  }

  pushLog(line) {
    this.state.set(st => {
      if (line === "__CLEAR__") { st.turn.logLines = []; return; }
      st.turn.logLines.push(`[${new Date().toLocaleTimeString()}] ${line}`);
      if (st.turn.logLines.length > 200) st.turn.logLines.shift();
    });
  }

  seed() {
    this.addToken({
      name: "Aria",
      type: "PC",
      sizeCells: 1,
      color: "#5aa9ff",
      ac: 15,
      hp: "18/18",
      speed: 30,
      statblock: ""
    });

    this.addToken({
      name: "Goblin A",
      type: "Monster",
      sizeCells: 1,
      color: "#ff5a7a",
      ac: 15,
      hp: "7/7",
      speed: 30,
      statblock:
`Goblin (5e)
- Speed 30 ft
- Actions:
  - Scimitar: +4 to hit, 5 ft, 1d6+2 slashing
  - Shortbow: +4 to hit, range 80/320, 1d6+2 piercing
- Bonus Action: Nimble Escape (Disengage or Hide)`
    });

    // Initialize turn to first token; selection is independent (can stay null or first token)
    this.state.set(st => {
      st.turn.currentTurnTokenId = st.tokens[0]?.id ?? null;
      st.selectedTokenId = st.tokens[0]?.id ?? null;
    });
  }

  addToken({ name, type, sizeCells, color, ac=15, hp="7/7", speed=30, notes="", statblock="" }) {
    this.state.set(st => {
      const world = { x: 70, y: 70 };
      const w = snapWorldPoint(st.gridSize, st.snapMode, world.x, world.y);

      const t = new Token({
        id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        name, type, sizeCells, color,
        x: w.x, y: w.y,
        ac, hp, speed, notes, statblock
      });

      st.tokens.push(t);
      st.selectedTokenId = t.id;

      if (!st.turn.currentTurnTokenId) st.turn.currentTurnTokenId = t.id;
    });
  }

  clearTokens() {
    this.state.set(st => {
      st.tokens = [];
      st.selectedTokenId = null;
      st.turn.currentTurnTokenId = null;
    });
  }
}
