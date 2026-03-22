import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors());              // dev only; lock down origins in production
app.use(express.json({ limit: '2mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

app.use('/maps', express.static(path.join(repoRoot, 'maps')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(repoRoot, 'index.html'));
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_MODELS = new Set([
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-5"
]);

/**
 * POST /api/vtt
 * Body: your VTT state payload (tokens, grid, turn packet, etc.)
 * Returns: strict JSON that matches your VTT "Apply AI JSON" contract
 */
app.post('/api/vtt', async (req, res) => {
  const reqId = req.get('X-Client-Req-Id') || `req-${Date.now()}`;
  const t0 = Date.now();

  try {
    const turnPacket = req.body?.aiExport;
    if (!turnPacket) return res.status(400).json({ error: "Missing aiExport" });

    const tPrep = Date.now();

    console.log(`[vtt] ${reqId} start payloadBytes=${Buffer.byteLength(turnPacket, 'utf8')}`);

    const tOpen0 = Date.now();
    const requestedModel = req.body?.model || "gpt-4.1-mini";

    const model = ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : "gpt-4.1-mini";

    const response = await client.responses.create({
      model,
      input: turnPacket,
      // Strongly nudge it to output only JSON (your contract)
      text: {
        format: {
          type: "json_schema",
          name: "vtt_turn",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              moves: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    token: { type: "string" },
                    to: {
                      type: "array",
                      items: { type: "integer" },
                      minItems: 2,
                      maxItems: 2
                    }
                  },
                  required: ["token", "to"]
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
                    details: { type: "string" }
                  },
                  required: ["token", "type", "target", "details"]
                }
              },
              end_turn: { type: "boolean" }
            },
            required: ["moves", "actions", "end_turn"]
          }
        }
      }
    });
    const tOpen1 = Date.now();

    const usage = response.usage || {};

    const inputTokens = usage.input_tokens ?? null;
    const outputTokens = usage.output_tokens ?? null;
    const totalTokens = usage.total_tokens ?? null;

    console.log(
      `[vtt] ${reqId} tokens input=${inputTokens} output=${outputTokens} total=${totalTokens}`
    );

    const tParse0 = Date.now();
    const jsonText = response.output_text;
    const parsed = JSON.parse(jsonText);
    const tParse1 = Date.now();

    const t1 = Date.now();

    parsed._timing = {
      req_id: reqId,
      total_ms: t1 - t0,
      prep_ms: tPrep - t0,
      openai_ms: tOpen1 - tOpen0,
      parse_ms: tParse1 - tParse0
    };

    parsed._timing.model = model;

    console.log(
      `[vtt] ${reqId} done total=${t1 - t0}ms openai=${tOpen1 - tOpen0}ms parse=${tParse1 - tParse0}ms`
    );

    res.json(parsed);
  } catch (err) {
    console.error(`[vtt] ${reqId} error`, err);
    res.status(500).json({
      error: "Backend failed",
      details: err?.message ?? String(err),
      _timing: { req_id: reqId, total_ms: Date.now() - t0 }
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`VTT backend listening on http://localhost:${process.env.PORT || 3000}`);
});
