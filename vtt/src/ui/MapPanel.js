import { el } from "../utils/dom.js";

export class MapPanel {
  constructor(state, stage) {
    this.state = state;
    this.stage = stage;
    this.root = el("div", { class: "card" });
  }

  mount(container) {
    container.appendChild(this.root);
    this.render();
    this.state.subscribe(() => {
      // update dynamic button label (drag mode)
      const s = this.state.get();
      if (this.dragModeBtn) this.dragModeBtn.textContent = `Drag: ${s.dragMode === "tokens" ? "Tokens" : "Map"}`;
    });
  }

  render() {
    const s = this.state.get();
    this.root.innerHTML = "";

    const mapFile = el("input", { type: "file", accept: "image/*" });
    mapFile.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        this.state.set(st => {
          st.map.img = img;
          st.map.w = img.naturalWidth;
          st.map.h = img.naturalHeight;
          st.map.offX = 0; st.map.offY = 0; st.map.scale = 1; st.map.rot = 0; st.map.opacity = 1;
        });
        this.fitMapToCanvas();
      };
      img.src = URL.createObjectURL(file);
    });

    const gridSize = el("input", { type: "number", min: "10", max: "200", step: "1", value: String(s.gridSize) });
    gridSize.addEventListener("input", () => {
      const v = Number(gridSize.value);
      if (!Number.isFinite(v) || v < 10) return;
      this.state.set(st => { st.gridSize = v; });
    });

    const snapMode = el("select", {});
    for (const v of ["center", "topleft"]) {
      const opt = el("option", { value: v });
      opt.textContent = v === "center" ? "Token to cell center" : "Token to cell top-left";
      if (s.snapMode === v) opt.selected = true;
      snapMode.appendChild(opt);
    }
    snapMode.addEventListener("change", () => this.state.set(st => { st.snapMode = snapMode.value; }));

    const fitBtn = el("button", { class: "primary", html: "Fit map to canvas", onclick: () => this.fitMapToCanvas() });
    const resetView = el("button", { html: "Reset view", onclick: () => this.state.set(st => { st.view.zoom=1; st.view.panX=0; st.view.panY=0; }) });

    this.dragModeBtn = el("button", { class: "primary", html: `Drag: ${s.dragMode === "tokens" ? "Tokens" : "Map"}` });
    this.dragModeBtn.addEventListener("click", () => {
      this.state.set(st => { st.dragMode = (st.dragMode === "tokens") ? "map" : "tokens"; });
    });

    const nudgeCells = el("input", { type: "number", min: "0.1", step: "0.1", value: "0.5" });
    const nudge = (dx, dy) => {
      const cells = Number(nudgeCells.value) || 0.5;
      this.state.set(st => {
        st.map.offX += dx * cells * st.gridSize;
        st.map.offY += dy * cells * st.gridSize;
      });
    };

    const nL = el("button", { html: "◀", onclick: () => nudge(-1, 0) });
    const nR = el("button", { html: "▶", onclick: () => nudge(1, 0) });
    const nU = el("button", { html: "▲", onclick: () => nudge(0, -1) });
    const nD = el("button", { html: "▼", onclick: () => nudge(0, 1) });

    const mapScale = el("input", { type: "number", min: "0.1", step: "0.01", value: String(s.map.scale) });
    mapScale.addEventListener("input", () => {
      const v = Number(mapScale.value);
      if (!Number.isFinite(v) || v <= 0) return;
      this.state.set(st => { st.map.scale = v; });
    });

    const mapRot = el("input", { type: "number", min: "-10", max: "10", step: "0.05", value: String((s.map.rot*180/Math.PI).toFixed(2)) });
    mapRot.addEventListener("input", () => {
      const deg = Number(mapRot.value) || 0;
      this.state.set(st => { st.map.rot = deg * Math.PI / 180; });
    });

    const mapOpacity = el("input", { type: "number", min: "0.05", max: "1", step: "0.05", value: String(s.map.opacity) });
    mapOpacity.addEventListener("input", () => {
      const v = Number(mapOpacity.value);
      if (!Number.isFinite(v)) return;
      this.state.set(st => { st.map.opacity = Math.max(0.05, Math.min(1, v)); });
    });

    this.root.appendChild(el("label", { html: "Load map image" }));
    this.root.appendChild(mapFile);

    this.root.appendChild(el("div", { class: "row", style: "margin-top:10px;" }, [
      el("div", {}, [ el("label", { html: "Grid size (px)" }), gridSize ]),
      el("div", {}, [ el("label", { html: "Snap" }), snapMode ]),
    ]));

    this.root.appendChild(el("div", { class: "btnbar", style: "margin-top:10px;" }, [fitBtn, resetView]));

    this.root.appendChild(el("div", { class: "btnbar", style: "margin-top:10px;" }, [
      this.dragModeBtn, nL, nR, nU, nD
    ]));

    this.root.appendChild(el("div", { class: "row", style: "margin-top:8px;" }, [
      el("div", {}, [ el("label", { html: "Nudge (cells)" }), nudgeCells ]),
      el("div", {}, [ el("label", { html: "Map scale" }), mapScale ]),
    ]));

    this.root.appendChild(el("div", { class: "row", style: "margin-top:8px;" }, [
      el("div", {}, [ el("label", { html: "Map rotation (deg)" }), mapRot ]),
      el("div", {}, [ el("label", { html: "Opacity" }), mapOpacity ]),
    ]));
  }

  fitMapToCanvas() {
    const s = this.state.get();
    if (!s.map.img) return;

    const rect = this.stage.canvas.getBoundingClientRect();
    const fitZoom = Math.min(rect.width / s.map.w, rect.height / s.map.h);

    this.state.set(st => {
      st.view.zoom = fitZoom;
      st.view.panX = (rect.width - st.map.w * st.view.zoom) / 2;
      st.view.panY = (rect.height - st.map.h * st.view.zoom) / 2;
      st.map.offX = 0; st.map.offY = 0;
    });
  }
}
