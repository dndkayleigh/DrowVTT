export const vttResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { anyOf: [{ type: "string" }, { type: "null" }] },
    moves: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          token: { type: "string" },
          rationale: { anyOf: [{ type: "string" }, { type: "null" }] },
          path: {
            anyOf: [
              {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "integer" },
                  minItems: 2,
                  maxItems: 2
                }
              },
              { type: "null" }
            ]
          },
          to: {
            type: "array",
            items: { type: "integer" },
            minItems: 2,
            maxItems: 2
          }
        },
        required: ["token", "rationale", "path", "to"]
      }
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          token: { type: "string" },
          type: { type: "string" },
          target: { anyOf: [{ type: "string" }, { type: "null" }] },
          details: { type: "string" },
          rationale: { anyOf: [{ type: "string" }, { type: "null" }] },
          attack_kind: { anyOf: [{ type: "string" }, { type: "null" }] },
          range_ft: { anyOf: [{ type: "integer" }, { type: "null" }] }
        },
        required: ["token", "type", "target", "details", "rationale", "attack_kind", "range_ft"]
      }
    },
    end_turn: { type: "boolean" }
  },
  required: ["summary", "moves", "actions", "end_turn"]
};
