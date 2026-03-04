import { el, escapeHtml } from "../utils/dom.js";
import { gridCoords } from "../utils/geom.js";

export class TokenList {
  constructor(state) {
    this.state = state;
    this.root = el("div", { class: "list" });
    this.state.subscribe(() => this.render());
  }

  mount(container) { container.appendChild(this.root); this.render(); }

  render() {
    const s = this.state.get();
    this.root.innerHTML = "";

    for (const t of s.tokens) {
      const c = gridCoords(s.gridSize, s.snapMode, t);

      const row = el("div", { class: "tokRow" }, [
        el("div", {
          html: `<b>${escapeHtml(t.name)}</b>
                <div class="meta">${escapeHtml(t.type)} • ${t.sizeCells}×${t.sizeCells} • cell=(${c.x},${c.y}) • AC ${t.ac} • HP ${escapeHtml(t.hp)}</div>`
        }),
      ]);

      const selectBtn = el("button", {
        class: t.id === s.selectedTokenId ? "primary" : "",
        html: t.id === s.selectedTokenId ? "Selected" : "Select",
        onclick: (ev) => {
          ev.stopPropagation();
          this.state.set(st => {
            st.selectedTokenId = t.id;
          });
        }
      });

      const delBtn = el("button", {
        class: "danger",
        html: "Delete",
        onclick: (ev) => {
          ev.stopPropagation();
          this.state.set(st => {
            st.tokens = st.tokens.filter(x => x.id !== t.id);
            if (st.selectedTokenId === t.id) st.selectedTokenId = st.tokens[0]?.id ?? null;
            if (st.turn.currentTurnTokenId === t.id) st.turn.currentTurnTokenId = st.tokens[0]?.id ?? null;
          });
        }
      });

      row.appendChild(selectBtn);
      row.appendChild(delBtn);

      row.addEventListener("click", () => {
        this.state.set(st => {
          st.selectedTokenId = t.id;
        });
      });

      this.root.appendChild(row);
    }
  }
}
