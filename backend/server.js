import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());              // dev only; lock down origins in production
app.use(express.json({ limit: '2mb' }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/vtt
 * Body: your VTT state payload (tokens, grid, turn packet, etc.)
 * Returns: strict JSON that matches your VTT "Apply AI JSON" contract
 */
app.post('/api/vtt', async (req, res) => {
  try {
    const vttState = req.body;

    // Your UI already builds this turn packet string:
    const turnPacket = vttState?.aiExport;
    if (!turnPacket) {
      return res.status(400).json({ error: 'Missing aiExport turn packet in request body.' });
    }

    // Call OpenAI Responses API (recommended)
    const response = await client.responses.create({
      model: 'gpt-5', // choose the model you have access to
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

    // The SDK returns structured output in response.output_text (stringified JSON)
    // Parse and send to the browser as JSON
    const jsonText = response.output_text;
    const parsed = JSON.parse(jsonText);

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Backend failed calling OpenAI or parsing the response.',
      details: err?.message ?? String(err)
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`VTT backend listening on http://localhost:${process.env.PORT || 3000}`);
});