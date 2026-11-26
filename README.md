# Archviz Studio — Sketch in, photograph out

A web app that turns architectural sketches, SketchUp/Revit screenshots, clay models and floor plans into hyper-realistic architectural photographs. It keeps your exact design and camera angle.

## How it works

```
 your sketch + "biệt thự nhiệt đới lúc hoàng hôn, nhiều cây"
        │
        ▼
  ① AI ART DIRECTOR (Gemini 3 Flash, vision)
     reads the drawing like an architect → floors, massing, material zones
     turns your casual words (any language) into a precise photo brief
        │
        ▼
  ② RENDERER (Nano Banana Pro = gemini-3-pro-image)
     brief + a GEOMETRY LOCK that is always added on the server
     + up to 5 style references → photoreal image, up to 4K
```

| Mode | What it does |
|---|---|
| **Exterior / Interior** | Sketch or 3D screenshot → photo. One-tap looks: *Tropical Blue Hour*, Golden Hour, After the Rain, Night Luxury… |
| **Floor plan** | 2D plan → furnished 3D cut-away |
| **Refine** | Type changes in plain words, e.g. "make it night", "thêm cây ở ban công", "change wall to brick". The AI rewrites what you typed into a precise edit instruction. |
| **Views** | From a finished render: aerial drone, top-down, 3/4 left/right, entrance, facade, garden close-ups, or a **3×3 contact sheet**. Every shot shows the same house. |

Other features: before/after slider, zoom, download, variations (1–4), voice input, paste from clipboard, history saved in your browser, and an editable AI brief.

## Run it on your computer (5 minutes)

1. Install **Node.js 18+** from https://nodejs.org
2. Get a Gemini API key at https://aistudio.google.com/apikey. Turn on billing, because the image models are paid.
3. In this folder:
   ```bash
   cp .env.example .env        # then paste your key after GEMINI_API_KEY=
   npm install
   npm start
   ```
4. Open http://localhost:3000. Without a key, the app runs in **DEMO MODE**: the full interface works, but no images are generated.

## Put it online

**Render.com (easiest):** push this folder to a GitHub repo → on Render choose *New → Blueprint* → pick the repo. `render.yaml` is included. Enter `GEMINI_API_KEY` and an `APP_PASSWORD` when it asks.

Always set `APP_PASSWORD` on a public site. Without one, anyone who finds the URL can spend your API credits.

## Tips for the best results

- **Strict fidelity** (the default) keeps every window and volume exactly as you drew it. Use **Creative** only for early concepts.
- Clean SketchUp screenshots with material colours give the most accurate renders.
- Use **Pro** quality at 2K for final images and **Fast** for quick tests.
- Add 1–3 photos you love as **style references**. The app copies their mood and lighting, never their architecture.
- Typical flow: render → pick the best → **More views** (aerial + 3×3) → **Refine** small details.

## Customise

- Looks, camera views and the realism rules are in `lib/prompts.js`. Plain text, easy to edit.
- The AI art director's instructions are in `lib/brain.js`.
- The name and colours are in `public/index.html` and `public/app.css` (`--v` / `--p`).
