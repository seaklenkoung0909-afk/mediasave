require('dotenv').config();
const path = require('path');
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const brain = require('./lib/brain');
const P = require('./lib/prompts');

const PORT = process.env.PORT || 3000;
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODELS = {
  brain: process.env.BRAIN_MODEL || 'gemini-3-flash-preview',
  pro: process.env.PRO_IMAGE_MODEL || 'gemini-3-pro-image',       // Nano Banana Pro — best fidelity
  fast: process.env.FAST_IMAGE_MODEL || 'gemini-3.1-flash-image', // Nano Banana 2 — faster, cheaper
};
const DEMO = !KEY;
const ai = DEMO ? null : new GoogleGenAI({ apiKey: KEY });
const RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const SIZES = new Set(['1K', '2K', '4K']);

const app = express();
app.use(express.json({ limit: '60mb' }));

// Optional password so strangers can't spend your API credits once deployed.
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const [, b64] = (req.headers.authorization || '').split(' ');
    const pass = b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
    if (pass === process.env.APP_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Archviz Studio"').status(401).send('Password required');
  });
}
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function friendlyError(e) {
  const msg = String(e?.message || e);
  if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) return 'The AI key was rejected. Check GEMINI_API_KEY in your .env file.';
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg)) return 'AI usage limit reached. Wait a minute or check billing on your Google AI Studio account.';
  if (/SAFETY|blocked|PROHIBITED/i.test(msg)) return 'The AI declined this image or request (safety filter). Try rephrasing.';
  if (/not found|404/i.test(msg)) return 'AI model not found. Check the model names in your .env file.';
  return msg.length > 220 ? msg.slice(0, 220) + '…' : msg;
}

async function generateImage({ quality = 'pro', parts, aspectRatio, size }) {
  const model = quality === 'fast' ? MODELS.fast : MODELS.pro;
  const imageConfig = {};
  if (RATIOS.has(aspectRatio)) imageConfig.aspectRatio = aspectRatio;
  if (SIZES.has(size)) imageConfig.imageSize = size;

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
      });
      const out = (res.candidates?.[0]?.content?.parts || []).filter((p) => p.inlineData && !p.thought);
      const img = out[out.length - 1];
      if (!img) {
        const reason = res.candidates?.[0]?.finishReason || res.promptFeedback?.blockReason || 'no image returned';
        throw new Error(`The AI did not return an image (${reason}).`);
      }
      return `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`;
    } catch (e) {
      lastErr = e;
      if (!/500|503|UNAVAILABLE|INTERNAL|overloaded/i.test(String(e?.message))) break;
      await sleep(1500);
    }
  }
  throw lastErr;
}

async function many(count, fn) {
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 4);
  const results = await Promise.allSettled(Array.from({ length: n }, () => fn()));
  const images = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!images.length) throw results[0].reason;
  return images;
}

const imgParts = (main, refs = []) => [brain.toPart(main), ...refs.slice(0, 5).map(brain.toPart)];

// ── API ──────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    demo: DEMO,
    models: MODELS,
    presets: Object.entries(P.PRESETS).map(([id, p]) => ({ id, label: p.label, swatch: p.swatch })),
    views: Object.entries(P.VIEWS).map(([id, v]) => ({ id, label: v.label })),
  });
});

// Step 1 — the AI reads the sketch + request and writes the brief
app.post('/api/brief', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Upload an image first.' });
    if (DEMO) return res.json(brain.analyzeOffline(req.body));
    try {
      res.json(await brain.analyze(ai, MODELS.brain, req.body));
    } catch (e) {
      console.warn('[brief] brain failed, using fallback:', e.message);
      res.json({ ...brain.analyzeOffline(req.body), understood: 'I built the brief from your settings (the AI analyst was unavailable).' });
    }
  } catch (e) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

// Step 2 — render
app.post('/api/render', async (req, res) => {
  try {
    const { image, refs = [], mode = 'exterior', brief = '', fidelity = 'strict', aspectRatio, size, quality, count } = req.body;
    if (!image) return res.status(400).json({ error: 'Upload an image first.' });
    const prompt = P.buildRenderPrompt({ mode, brief: brief || P.fallbackBrief(req.body), fidelity, refCount: refs.length });
    if (DEMO) { await sleep(900); return res.json({ images: [image], prompt, demo: true }); }
    const images = await many(count, () => generateImage({ quality, size, aspectRatio, parts: [{ text: prompt }, ...imgParts(image, refs)] }));
    res.json({ images, prompt });
  } catch (e) {
    console.error('[render]', e);
    res.status(500).json({ error: friendlyError(e) });
  }
});

// Refine — natural-language edits ("add rain", "thêm cây", "make the wall brick")
app.post('/api/edit', async (req, res) => {
  try {
    const { image, request = '', refs = [], quality, size, count } = req.body;
    if (!image || !request.trim()) return res.status(400).json({ error: 'Choose an image and describe the change.' });
    let understood = '', instruction = request;
    if (!DEMO) {
      try { ({ understood, instruction } = await brain.interpretEdit(ai, MODELS.brain, { image, request })); }
      catch (e) { console.warn('[edit] interpret failed:', e.message); }
    }
    const prompt = P.buildEditPrompt({ instruction, refCount: refs.length });
    if (DEMO) { await sleep(700); return res.json({ images: [image], prompt, understood: 'Demo mode — add an API key to really edit.', demo: true }); }
    const images = await many(count, () => generateImage({ quality, size, parts: [{ text: prompt }, ...imgParts(image, refs)] }));
    res.json({ images, prompt, understood });
  } catch (e) {
    console.error('[edit]', e);
    res.status(500).json({ error: friendlyError(e) });
  }
});

// Camera views — aerial, close-ups, 3×3 contact sheet … of the SAME building
app.post('/api/view', async (req, res) => {
  try {
    const { image, view = 'aerial', extra = '', quality, size, aspectRatio } = req.body;
    if (!image) return res.status(400).json({ error: 'Choose a finished render first.' });
    const prompt = P.buildViewPrompt({ viewKey: view, extra });
    const ratio = view === 'grid9' ? '1:1' : aspectRatio;
    if (DEMO) { await sleep(700); return res.json({ images: [image], prompt, demo: true }); }
    const img = await generateImage({ quality, size, aspectRatio: ratio, parts: [{ text: prompt }, brain.toPart(image)] });
    res.json({ images: [img], prompt });
  } catch (e) {
    console.error('[view]', e);
    res.status(500).json({ error: friendlyError(e) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Archviz Studio running →  http://localhost:${PORT}`);
  console.log(DEMO ? '  ⚠  DEMO MODE: set GEMINI_API_KEY in .env to render for real.\n' : `  Models: ${JSON.stringify(MODELS)}\n`);
});
