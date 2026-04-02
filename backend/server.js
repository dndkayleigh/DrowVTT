import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { vttResponseSchema } from './vtt-response-schema.js';
import { resolveAiTurnRequest } from '../data/ai-turn-strategy-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function buildCorsOriginChecker(allowedOrigins = '') {
  const configured = String(allowedOrigins || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    const allowlist = new Set(configured);
    return (origin, callback) => {
      if (!origin || allowlist.has(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    };
  }

  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  return (origin, callback) => {
    if (!origin || localhostPattern.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  };
}

export function createVttServerApp(options = {}) {
  const app = express();
  const client = options.client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const exposeErrorDetails = options.exposeErrorDetails ?? (process.env.VTT_EXPOSE_ERROR_DETAILS === '1');
  const corsOrigin = options.corsOrigin || buildCorsOriginChecker(process.env.VTT_ALLOWED_ORIGINS);

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/maps', express.static(path.join(repoRoot, 'maps')));
  app.use('/data', express.static(path.join(repoRoot, 'data')));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(repoRoot, 'index.html'));
  });

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
      if (typeof turnPacket !== 'string' || !turnPacket.trim()) {
        return res.status(400).json({ error: 'aiExport must be a non-empty string.' });
      }

      const tPrep = Date.now();

      console.log(`[vtt] ${reqId} start payloadBytes=${Buffer.byteLength(turnPacket, 'utf8')}`);

      const tOpen0 = Date.now();
      const requestConfig = resolveAiTurnRequest({
        strategy: req.body?.strategy,
        model: req.body?.model
      });
      const model = requestConfig.model;

      const response = await client.responses.create({
        model,
        input: turnPacket,
        text: {
          format: {
            type: 'json_schema',
            name: 'vtt_turn',
            schema: vttResponseSchema
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
        parse_ms: tParse1 - tParse0,
        strategy: requestConfig.strategyId,
        packet_variant: requestConfig.packetVariant
      };

      parsed._timing.model = model;

      console.log(
        `[vtt] ${reqId} done total=${t1 - t0}ms openai=${tOpen1 - tOpen0}ms parse=${tParse1 - tParse0}ms`
      );

      res.json(parsed);
    } catch (err) {
      console.error(`[vtt] ${reqId} error`, err);
      const payload = {
        error: 'Backend failed',
        _timing: { req_id: reqId, total_ms: Date.now() - t0 }
      };
      if (exposeErrorDetails) payload.details = err?.message ?? String(err);
      res.status(500).json(payload);
    }
  });

  return app;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const app = createVttServerApp();
  app.listen(process.env.PORT || 3000, () => {
    console.log(`VTT backend listening on http://localhost:${process.env.PORT || 3000}`);
  });
}
