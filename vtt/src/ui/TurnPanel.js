import { el } from "../utils/dom.js";

export class TurnPanel {
  constructor(state, onTurnTokenChanged) {
    this.state = state;
    this.onTurnTokenChanged = onTurnTokenChanged;
    this.root = el("div", { class: "card" });
    this.state.subscribe(() => this.render());
  }

  mount(container) { container.appendChild(this.root); this.render(); }

  render() {
    const s = this.state.get();
    this.root.innerHTML = "";

    const aiControls = el("select", {});
    for (const v of ["Monsters", "PCs", "Both", "None"]) {
      const opt = el("option", { value: v });
      opt.textContent = v;
      if (s.turn.aiControls === v) opt.selected = true;
      aiControls.appendChild(opt);
    }
    aiControls.addEventListener("change", () => {
      this.state.set(st => { st.turn.aiControls = aiControls.value; });
    });

    const round = el("input", { type: "number", min: "1", step: "1", value: String(s.turn.round) });
    round.addEventListener("input", () => {
      this.state.set(st => { st.turn.round = Number(round.value) || 1; });
    });

    const turnSel = el("select", {});
    if (s.tokens.length === 0) {
      const opt = el("option", { value: "" }); opt.textContent = "(no tokens)";
      turnSel.appendChild(opt);
    } else {
      for (const t of s.tokens) {
        const opt = el("option", { value: t.id });
        opt.textContent = `${t.type}: ${t.name}`;
        if (t.id === s.turn.currentTurnTokenId) opt.selected = true;
        turnSel.appendChild(opt);
      }
    }

    // Uncoupled: changing current turn does NOT change selection.
    turnSel.addEventListener("change", () => {
      const id = turnSel.value || null;
      this.state.set(st => {
        st.turn.currentTurnTokenId = id;
      });
      this.onTurnTokenChanged?.();
    });

    this.root.appendChild(el("div", { class: "row" }, [
      el("div", {}, [ el("label", { html: "AI controls" }), aiControls ]),
      el("div", {}, [ el("label", { html: "Round" }), round ]),
    ]));

    this.root.appendChild(el("div", { style: "margin-top:8px" }, [
      el("label", { html: "Current turn token" }),
      turnSel
    ]));
  }
}
