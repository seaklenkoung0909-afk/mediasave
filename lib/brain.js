// ─────────────────────────────────────────────────────────────
//  The "brain": a vision LLM acting as a senior archviz art
//  director. It looks at the sketch, reads the user's casual
//  request (any language) and writes a precise render brief.
// ─────────────────────────────────────────────────────────────
const { Type } = require('@google/genai');
const { PRESETS, optionsToText, fallbackBrief } = require('./prompts');

const SYSTEM = `You are a senior architectural-visualisation art director with 20 years of experience producing hyper-realistic marketing photography for architects (think Tropical Modern villas in Vietnam, Indonesia, Thailand, and contemporary work worldwide).

Your job: look carefully at the user's input image and understand their (often short, casual, possibly Vietnamese or other language) request, then write the perfect art-direction brief for an image model that turns the input into a real-looking photograph.

How to think:
1. Read the drawing like an architect: input type (hand sketch, line drawing, SketchUp/clay model, rough render, photo, floor plan), number of floors, massing and volumes, cantilevers, openings, roof type, and which surface is which material (white areas usually = smooth white render/stucco; brick hatching = stone or brick; vertical lines = timber battens/louvres; blue/cyan = glass).
2. Respect the drawing's material zoning exactly. Name every material concretely (e.g. "dark charcoal split-face stone cladding", "vertical teak battens 40 mm", "smooth off-white lime render", "bronze-framed floor-to-ceiling glazing").
3. Translate vague wishes into concrete photographic direction: "make it nice" → choose lighting, season, landscaping, camera and mood that best sell this design. "nhiều cây" → specify species and placement. "sang trọng" → luxury lighting and materials.
4. If the user asks for something that conflicts with the drawing's geometry, keep the geometry and apply their wish to materials, lighting, landscape or mood instead — and say so briefly.
5. Never invent new floors, volumes or windows. Describe landscaping, sky, vehicles, people and atmosphere around the building.
6. Never mention the original sketch lines, "the drawing", or "the image" inside the brief — write it as a description of the real scene.

Write "understood" and "suggestions" in the SAME language the user wrote in (default English if they wrote nothing). Write "brief" in English (the image model works best in English).`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    understood: { type: Type.STRING, description: "1–2 friendly sentences confirming what you understood and what you'll do, in the user's language." },
    inputType: { type: Type.STRING },
    building: { type: Type.STRING, description: 'Short architectural reading: type, floors, key massing features.' },
    materials: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { element: { type: Type.STRING }, material: { type: Type.STRING } }, required: ['element', 'material'] },
    },
    brief: { type: Type.STRING, description: 'Complete English art-direction brief (120–220 words): materials per element, landscape, sky/lighting/time, atmosphere, vehicles/people, camera feel.' },
    suggestedAspectRatio: { type: Type.STRING, description: 'One of 1:1, 4:3, 3:2, 16:9, 3:4, 2:3, 9:16, 4:5 that best matches the input framing.' },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3 short follow-up ideas, in the user language (e.g. a different time of day, an aerial view).' },
  },
  required: ['understood', 'brief', 'materials', 'suggestions'],
};

const EDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    understood: { type: Type.STRING, description: "One sentence in the user's language confirming the change." },
    instruction: { type: Type.STRING, description: 'Precise English edit instruction for an image-editing model: what to change, where, and how it should look. Concrete and visual.' },
  },
  required: ['understood', 'instruction'],
};

function toPart(dataUrl) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw new Error('Invalid image data');
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (m) return JSON.parse(m[0]);
  throw new Error('AI returned an unreadable answer');
}

async function analyze(ai, model, { image, request = '', mode = 'exterior', presetId = 'auto', options = {} }) {
  const preset = PRESETS[presetId] || PRESETS.auto;
  const userText = [
    `MODE: ${mode} render.`,
    `USER REQUEST: ${request.trim() || '(none — use your best professional judgement)'}`,
    `CHOSEN LOOK: ${preset.label} — ${preset.brief}`,
    optionsToText(options) && `FIXED OPTIONS (must respect): ${optionsToText(options)}`,
    'Merge the look and the request; where they conflict, the user request wins.',
  ].filter(Boolean).join('\n');

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [toPart(image), { text: userText }] }],
    config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.6 },
  });
  return parseJson(res.text);
}

async function interpretEdit(ai, model, { image, request }) {
  const res = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [toPart(image), { text: `The user wants to change this architectural image. Their words: "${request}". Turn this into one precise, visual edit instruction. Keep the change minimal and targeted.` }],
    }],
    config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseSchema: EDIT_SCHEMA, temperature: 0.4 },
  });
  return parseJson(res.text);
}

/** Demo / fallback version used when no API key is present. */
function analyzeOffline(args) {
  return {
    understood: 'Demo mode: no AI key configured, so I built the brief from your chosen look and options.',
    inputType: 'unknown', building: '', materials: [],
    brief: fallbackBrief(args),
    suggestedAspectRatio: '',
    suggestions: ['Try the Tropical Blue Hour look', 'Generate an aerial view', 'Add rain reflections'],
    offline: true,
  };
}

module.exports = { analyze, interpretEdit, analyzeOffline, toPart };
