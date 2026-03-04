import { el } from "../utils/dom.js";
import { TokenList } from "./TokenList.js";
import { TurnPanel } from "./TurnPanel.js";
import { MapPanel } from "./MapPanel.js";
import { ExportPanel } from "./ExportPanel.js";

export class Sidebar {
  constructor(state, stage, services) {
    this.state = state;
    this.stage = stage;
    this.services = services;
    this.root = el("aside", { class: "sidebar" });
  }

  mount(container) {
    container.appendChild(this.root);

    // Map & Grid
    this.root.appendChild(el("h2", { html: "Map & Grid" }));
    this.mapPanel = new MapPanel(this.state, this.stage);
    this.mapPanel.mount(this.root);

    // Tokens
    this.root.appendChild(el("h2", { html: "Tokens" }));
    this.tokensCard = el("div", { class: "card" });
    this.root.appendChild(this.tokensCard);
    this.buildTokenCreator(this.tokensCard);

    this.tokenList = new TokenList(this.state);
    this.tokenList.mount(this.tokensCard);

    // Turn + Editor
    this.root.appendChild(el("h2", { html: "Turn & Statblock" }));
    this.turnCard = el("div", { class: "card" });
    this.root.appendChild(this.turnCard);

    this.turnPanel = new TurnPanel(this.state, () => this.loadEditorFromTurnToken());
    this.turnPanel.mount(this.turnCard);

    this.buildEditor(this.turnCard);

    // Export + Backend + Apply
    this.root.appendChild(el("h2", { html: "AI Export + Backend" }));
    this.exportPanel = new ExportPanel(
      this.state,
      this.services.aiExport,
      this.services.backend,
      this.services.apply,
      this.services.pushLog
    );
    this.exportPanel.mount(this.root);

    this.loadEditorFromTurnToken();

    // Keep editor synced with turn even if state changes elsewhere
    this.state.subscribe(() => this.loadEditorFromTurnToken());
  }

  buildTokenCreator(container) {
    const name = el("input", { type: "text", value: "Goblin A" });

    const type = el("select", {});
    ["NPC","Monster","PC"].forEach(v => {
      const opt = el("option", { value: v }); opt.textContent = v;
      if (v === "Monster") opt.selected = true;
      type.appendChild(opt);
    });

    const size = el("select", {});
    ["1","2","3"].forEach(v => {
      const opt = el("option", { value: v }); opt.textContent = `${v}×${v}`;
      if (v === "1") opt.selected = true;
      size.appendChild(opt);
    });

    const color = el("select", {});
    const colors = [
      ["#5aa9ff","Blue"],["#7dffb2","Green"],["#ffd36a","Gold"],["#ff5a7a","Red"],["#caa7ff","Purple"]
    ];
    for (const [val, label] of colors) {
      const opt = el("option", { value: val }); opt.textContent = label;
      if (val === "#ff5a7a") opt.selected = true;
      color.appendChild(opt);
    }

    const addBtn = el("button", { class: "primary", html: "Add token" });
    const clearBtn = el("button", { class: "danger", html: "Clear all" });

    addBtn.addEventListener("click", () => {
      this.services.addToken({
        name: name.value.trim() || "Token",
        type: type.value,
        sizeCells: Number(size.value),
        color: color.value
      });
    });

    clearBtn.addEventListener("click", () => this.services.clearTokens());

    container.appendChild(el("div", { class:"row" }, [
      el("div", {}, [ el("label", { html:"Name" }), name ]),
      el("div", {}, [ el("label", { html:"Type" }), type ]),
    ]));
    container.appendChild(el("div", { class:"row", style:"margin-top:8px;" }, [
      el("div", {}, [ el("label", { html:"Size (cells)" }), size ]),
      el("div", {}, [ el("label", { html:"Color" }), color ]),
    ]));
    container.appendChild(el("div", { class:"btnbar", style:"margin-top:10px;" }, [addBtn, clearBtn]));
    container.appendChild(el("div", { class:"footerNote" , html:"Tip: selected token is highlighted. Current turn token is independent." }));
  }

  buildEditor(container) {
    this.editor = {
      ac: el("input", { type:"number", min:"1", step:"1", value:"15" }),
      hp: el("input", { type:"text", value:"" }),
      speed: el("input", { type:"number", min:"0", step:"5", value:"30" }),
      notes: el("input", { type:"text", value:"" }),
      statblock: el("textarea", { spellcheck:"false" })
    };

    const save = () => this.saveEditorToTurnToken();
    Object.values(this.editor).forEach(input => input.addEventListener("input", save));

    container.appendChild(el("div", { class:"row", style:"margin-top:8px;" }, [
      el("div", {}, [ el("label", { html:"AC (current turn token)" }), this.editor.ac ]),
      el("div", {}, [ el("label", { html:"HP (current turn token)" }), this.editor.hp ]),
    ]));

    container.appendChild(el("div", { class:"row", style:"margin-top:8px;" }, [
      el("div", {}, [ el("label", { html:"Speed ft (current turn token)" }), this.editor.speed ]),
      el("div", {}, [ el("label", { html:"Notes (current turn token)" }), this.editor.notes ]),
    ]));

    container.appendChild(el("div", { style:"margin-top:8px;" }, [
      el("label", { html:"Statblock / actions (current turn token)" }),
      this.editor.statblock
    ]));
  }

  loadEditorFromTurnToken() {
    const s = this.state.get();
    const id = s.turn.currentTurnTokenId;
    const tok = s.tokens.find(t => t.id === id) || null;

    const disabled = !tok;
    for (const elx of Object.values(this.editor)) elx.disabled = disabled;

    if (!tok) {
      this.editor.ac.value = "15";
      this.editor.hp.value = "";
      this.editor.speed.value = "30";
      this.editor.notes.value = "";
      this.editor.statblock.value = "";
      return;
    }

    // only update if different to avoid cursor jumping while typing
    const setIfDiff = (input, v) => { const sv = String(v ?? ""); if (input.value !== sv) input.value = sv; };

    setIfDiff(this.editor.ac, tok.ac ?? 10);
    setIfDiff(this.editor.hp, tok.hp ?? "");
    setIfDiff(this.editor.speed, tok.speed ?? 30);
    setIfDiff(this.editor.notes, tok.notes ?? "");
    if (this.editor.statblock.value !== String(tok.statblock ?? "")) this.editor.statblock.value = String(tok.statblock ?? "");
  }

  saveEditorToTurnToken() {
    const s = this.state.get();
    const id = s.turn.currentTurnTokenId;
    if (!id) return;

    this.state.set(st => {
      const tok = st.tokens.find(t => t.id === id);
      if (!tok) return;
      tok.ac = Number(this.editor.ac.value) || tok.ac;
      tok.hp = (this.editor.hp.value ?? "").trim();
      tok.speed = Number(this.editor.speed.value) || tok.speed;
      tok.notes = (this.editor.notes.value ?? "").trim();
      tok.statblock = (this.editor.statblock.value ?? "").trim();
    });
  }
}
