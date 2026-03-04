import { gridCoords } from "../utils/geom.js";

export class AiExport {
  buildTurnPacket(st) {
    const turnTok = st.tokens.find(t => t.id === st.turn.currentTurnTokenId) ?? null;

    const lines = [];
    lines.push("SYSTEM: You are the tactical controller for the side specified below in a D&D 5e grid combat.");
    lines.push("You must follow the rules, use legal actions, and play competently.");
    lines.push("If information is missing, make conservative assumptions and state them briefly.");
    lines.push("");
    lines.push("RULES:");
    lines.push("- D&D 5e, grid-based. Each grid cell = 5 ft.");
    lines.push("- Positions are integer cells (x,y), 0-based; x increases right, y increases down.");
    lines.push("- Diagonals cost 5 ft (default).");
    lines.push("- No walls/cover unless specified; do not assume you can Hide unless cover/concealment exists.");
    lines.push("");
    lines.push(`AI CONTROLS: ${st.turn.aiControls}`);
    lines.push(`ROUND: ${st.turn.round}`);
    lines.push(`TURN: ${turnTok ? `${turnTok.type} "${turnTok.name}"` : "(none)"}`);
    lines.push("");
    lines.push("MAP:");
    lines.push(`- Grid size px (visual): ${st.gridSize}`);
    lines.push(`- Map transform (for reference): offX=${Math.round(st.map.offX)}, offY=${Math.round(st.map.offY)}, scale=${st.map.scale.toFixed(2)}, rotDeg=${(st.map.rot*180/Math.PI).toFixed(2)}`);
    lines.push(`- Blocked cells: []`);
    lines.push(`- Difficult terrain: []`);
    lines.push("");
    lines.push("TOKENS:");
    if (st.tokens.length === 0) {
      lines.push("- (none)");
    } else {
      for (const t of st.tokens) {
        const c = gridCoords(st.gridSize, st.snapMode, t);
        lines.push(`- ${t.type}: "${t.name}" at (${c.x}, ${c.y}), size ${t.sizeCells}x${t.sizeCells}, AC ${t.ac}, HP ${t.hp}, Speed ${t.speed} ft, Notes: ${t.notes || "none"}`);
      }
    }
    lines.push("");
    lines.push("STATBLOCK (current turn token):");
    lines.push(turnTok?.statblock ? turnTok.statblock : "(not provided)");
    lines.push("");
    lines.push("OUTPUT CONTRACT:");
    lines.push("Return ONLY this JSON shape (no prose, no markdown):");
    lines.push("{");
    lines.push('  "moves": [{"token":"Name","to":[x,y]}],');
    lines.push('  "actions": [{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"..."}],');
    lines.push('  "end_turn": true');
    lines.push("}");
    return lines.join("\n");
  }
}
