import { clamp, screenToWorld, worldToScreen, snapWorldPoint } from "../utils/geom.js";

export class CanvasStage {
  constructor(state) {
    this.state = state;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    this.draggingTokenId = null;
    this.draggingPan = false;
    this.draggingMap = false;
    this.dragOffset = { x: 0, y: 0 };
    this.lastMouse = { x: 0, y: 0 };
    this.spaceDown = false;

    window.addEventListener("resize", () => this.resizeToCSS());
    window.addEventListener("keydown", (e) => { if (e.code === "Space") this.spaceDown = true; });
    window.addEventListener("keyup", (e) => { if (e.code === "Space") this.spaceDown = false; });

    this.canvas.addEventListener("mousedown", (e) => this.onDown(e));
    window.addEventListener("mousemove", (e) => this.onMove(e));
    window.addEventListener("mouseup", () => this.onUp());
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });

    this.state.subscribe(() => this.draw());
  }

  mount(container) { container.appendChild(this.canvas); this.resizeToCSS(); }

  resizeToCSS() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(600, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(400, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  getMousePos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  tokenRadiusPx(s, t) { return s.gridSize * 0.42 * t.sizeCells; }

  hitTestToken(s, wx, wy) {
    for (let i = s.tokens.length - 1; i >= 0; i--) {
      const t = s.tokens[i];
      const r = this.tokenRadiusPx(s, t);
      const dx = wx - t.x, dy = wy - t.y;
      if (dx*dx + dy*dy <= r*r) return t;
    }
    return null;
  }

  onDown(e) {
    const s = this.state.get();
    const m = this.getMousePos(e);
    this.lastMouse = m;

    const world = screenToWorld(s.view, m.x, m.y);
    const hit = this.hitTestToken(s, world.x, world.y);

    const isMiddle = e.button === 1;
    const wantPan = this.spaceDown || isMiddle;

    if (hit && !wantPan && s.dragMode === "tokens") {
      this.draggingTokenId = hit.id;
      this.dragOffset.x = world.x - hit.x;
      this.dragOffset.y = world.y - hit.y;

      // Uncoupled: interaction only changes selection
      this.state.set(st => {
        st.selectedTokenId = hit.id;
      });
      return;
    }

    if (!wantPan && s.dragMode === "map") {
      this.draggingMap = true;
      return;
    }

    this.draggingPan = true;
    this.canvas.classList.add("dragging");
  }

  onUp() {
    const s = this.state.get();
    if (this.draggingTokenId) {
      this.state.set(st => {
        const t = st.tokens.find(x => x.id === this.draggingTokenId);
        if (t) {
          const snapped = snapWorldPoint(st.gridSize, st.snapMode, t.x, t.y);
          t.x = snapped.x; t.y = snapped.y;
        }
      });
      this.draggingTokenId = null;
    }
    this.draggingMap = false;
    if (this.draggingPan) {
      this.draggingPan = false;
      this.canvas.classList.remove("dragging");
    }
  }

  onMove(e) {
    const s = this.state.get();
    const m = this.getMousePos(e);
    const dx = m.x - this.lastMouse.x;
    const dy = m.y - this.lastMouse.y;
    this.lastMouse = m;

    if (this.draggingTokenId) {
      this.state.set(st => {
        const t = st.tokens.find(x => x.id === this.draggingTokenId);
        if (!t) return;
        const world = screenToWorld(st.view, m.x, m.y);
        t.x = world.x - this.dragOffset.x;
        t.y = world.y - this.dragOffset.y;
        const snapped = snapWorldPoint(st.gridSize, st.snapMode, t.x, t.y);
        t.x = snapped.x; t.y = snapped.y;
      });
      return;
    }

    if (this.draggingMap) {
      this.state.set(st => {
        st.map.offX += dx / st.view.zoom;
        st.map.offY += dy / st.view.zoom;
      });
      return;
    }

    if (this.draggingPan) {
      this.state.set(st => {
        st.view.panX += dx;
        st.view.panY += dy;
      });
    }
  }

  onWheel(e) {
    e.preventDefault();
    const s = this.state.get();
    const m = this.getMousePos(e);

    const before = screenToWorld(s.view, m.x, m.y);
    const factor = (e.deltaY < 0) ? 1.08 : (1 / 1.08);

    this.state.set(st => {
      st.view.zoom = clamp(st.view.zoom * factor, 0.15, 6);
      const after = screenToWorld(st.view, m.x, m.y);
      st.view.panX += (after.x - before.x) * st.view.zoom;
      st.view.panY += (after.y - before.y) * st.view.zoom;
    });
  }

  clear() {
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = "#081022";
    this.ctx.fillRect(0, 0, w, h);
  }

  drawMap(s) {
    if (!s.map.img) return;
    const origin = worldToScreen(s.view, s.map.offX, s.map.offY);

    this.ctx.save();
    this.ctx.globalAlpha = clamp(s.map.opacity, 0.05, 1);

    this.ctx.translate(origin.x, origin.y);
    if (s.map.rot) this.ctx.rotate(s.map.rot);

    const drawW = s.map.w * s.map.scale * s.view.zoom;
    const drawH = s.map.h * s.map.scale * s.view.zoom;
    this.ctx.drawImage(s.map.img, 0, 0, drawW, drawH);

    this.ctx.restore();
  }

  drawGrid(s) {
    const g = s.gridSize;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;

    const tl = screenToWorld(s.view, 0, 0);
    const br = screenToWorld(s.view, w, h);

    const startX = Math.floor(tl.x / g) * g - g * 2;
    const endX   = Math.ceil(br.x / g) * g + g * 2;
    const startY = Math.floor(tl.y / g) * g - g * 2;
    const endY   = Math.ceil(br.y / g) * g + g * 2;

    const grid = getComputedStyle(document.documentElement).getPropertyValue("--grid").trim();
    const gridBold = getComputedStyle(document.documentElement).getPropertyValue("--grid-bold").trim();

    this.ctx.save();
    this.ctx.lineWidth = 1;

    for (let x = startX; x <= endX; x += g) {
      const sx = x * s.view.zoom + s.view.panX;
      this.ctx.strokeStyle = (Math.round(x / g) % 5 === 0) ? gridBold : grid;
      this.ctx.beginPath(); this.ctx.moveTo(sx, 0); this.ctx.lineTo(sx, h); this.ctx.stroke();
    }
    for (let y = startY; y <= endY; y += g) {
      const sy = y * s.view.zoom + s.view.panY;
      this.ctx.strokeStyle = (Math.round(y / g) % 5 === 0) ? gridBold : grid;
      this.ctx.beginPath(); this.ctx.moveTo(0, sy); this.ctx.lineTo(w, sy); this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawTokens(s) {
    for (const t of s.tokens) {
      const screen = worldToScreen(s.view, t.x, t.y);
      const r = this.tokenRadiusPx(s, t) * s.view.zoom;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = t.color;
      this.ctx.globalAlpha = 0.85;
      this.ctx.fill();

      this.ctx.globalAlpha = 1;
      this.ctx.lineWidth = (t.id === s.selectedTokenId) ? 4 : 2;
      this.ctx.strokeStyle = (t.id === s.selectedTokenId) ? "#fff" : "rgba(255,255,255,0.75)";
      this.ctx.stroke();

      this.ctx.font = `${Math.max(11, 12 * s.view.zoom)}px ui-sans-serif, system-ui`;
      this.ctx.textAlign = "center"; this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = "rgba(0,0,0,0.65)";
      this.ctx.fillText(t.name, screen.x + 1, screen.y + r + 14);
      this.ctx.fillStyle = "rgba(255,255,255,0.95)";
      this.ctx.fillText(t.name, screen.x, screen.y + r + 13);

      this.ctx.font = `${Math.max(10, 11 * s.view.zoom)}px ui-sans-serif, system-ui`;
      this.ctx.fillStyle = "rgba(0,0,0,0.55)";
      this.ctx.fillRect(screen.x - 32, screen.y - r - 22, 64, 18);
      this.ctx.fillStyle = "rgba(255,255,255,0.9)";
      this.ctx.fillText(t.type, screen.x, screen.y - r - 13);

      this.ctx.restore();
    }
  }

  draw() {
    const s = this.state.get();
    this.clear();
    this.drawMap(s);
    this.drawGrid(s);
    this.drawTokens(s);
  }
}
