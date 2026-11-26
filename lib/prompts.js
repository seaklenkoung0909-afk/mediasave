// ─────────────────────────────────────────────────────────────
//  Prompt library: looks (presets), camera views, and the rules
//  that keep the AI faithful to the architect's design.
// ─────────────────────────────────────────────────────────────

// "Looks" — one-tap moods. Each one is written like an art-direction brief.
const PRESETS = {
  auto: {
    label: 'Auto (AI decides)',
    swatch: ['#7c3aed', '#ec4899'],
    brief: 'Choose the most flattering, realistic lighting and landscaping for this design and its likely context.',
  },
  tropical_dusk: {
    label: 'Tropical Blue Hour',
    swatch: ['#1e3a8a', '#f59e0b'],
    brief:
      'Blue-hour dusk, deep clear cobalt sky just after sunset. Warm 2700K interior lights glowing through every window and timber screen; ' +
      'soft uplights grazing walls and trees, small bollard path lights. Lush tropical landscaping: ferns, tree ferns, alocasia, philodendron, ' +
      'bird-of-paradise, fan palms, a slender feature tree, trailing plants spilling from planter boxes and balconies, mossy boulders on a manicured lawn. ' +
      'Dark stone paver driveway, faint ambient haze, calm and luxurious mood, Southeast-Asian modern tropical villa photography.',
  },
  golden_hour: {
    label: 'Golden Hour',
    swatch: ['#f59e0b', '#ef4444'],
    brief:
      'Late-afternoon golden hour, low warm sun raking across the facade creating long soft shadows and rich texture on materials, ' +
      'warm amber highlights, gentle sky gradient with a few soft clouds, mature trees and refined landscaping, inviting residential mood.',
  },
  daylight: {
    label: 'Clean Daylight',
    swatch: ['#38bdf8', '#e2e8f0'],
    brief:
      'Bright clear midday light under a soft blue sky with light high clouds, crisp neutral white balance, accurate material colours, ' +
      'clean sharp shadows, neat contemporary landscaping, editorial real-estate photography.',
  },
  after_rain: {
    label: 'After the Rain',
    swatch: ['#475569', '#94a3b8'],
    brief:
      'Overcast moody sky just after rain, soft diffuse light, wet glossy ground with mirror-like reflections of the building in puddles, ' +
      'damp darkened stone and timber, saturated green foliage with water droplets, light mist, cinematic and calm.',
  },
  night_luxury: {
    label: 'Night Luxury',
    swatch: ['#0f172a', '#fbbf24'],
    brief:
      'Night scene, deep navy sky with subtle stars, dramatic architectural lighting: warm interior glow, linear LED coves, wall washers, ' +
      'uplit trees and landscape, reflections on glass and paving, high-end luxury villa marketing image.',
  },
  editorial: {
    label: 'Magazine Minimal',
    swatch: ['#e7e5e4', '#a8a29e'],
    brief:
      'Architectural-magazine style (Dezeen / ArchDaily), soft overcast or early-morning light, restrained muted palette, ' +
      'minimal planting, perfect verticals, quiet and sculptural composition emphasising form and materials.',
  },
};

// Camera views generated from a finished render (keeps the same house).
const VIEWS = {
  aerial: {
    label: 'Aerial drone',
    shot: 'a drone aerial photograph from about 30–40 m high at a 45° downward angle from the front three-quarter, showing the full roofscape, roof terraces, the site, driveway, landscaping and surrounding trees and street',
  },
  topdown: {
    label: 'Top-down',
    shot: 'a high drone shot looking almost straight down (70–80°) at the roof and site, revealing roof terraces, planters, skylights and the garden layout',
  },
  eye_left: {
    label: '3/4 left',
    shot: 'an eye-level photograph (1.6 m camera height) from the front-left three-quarter angle, 24 mm lens, verticals corrected',
  },
  eye_right: {
    label: '3/4 right',
    shot: 'an eye-level photograph (1.6 m camera height) from the front-right three-quarter angle, 24 mm lens, verticals corrected',
  },
  entrance: {
    label: 'Entrance close-up',
    shot: 'a close-up photograph of the entrance / garage area at human eye level, showing door, cladding, ceiling and paving details',
  },
  facade_detail: {
    label: 'Facade detail',
    shot: 'a tight detail photograph (85 mm lens) of the most characterful facade element — window boxes, timber screens / louvres and wall texture',
  },
  landscape_detail: {
    label: 'Garden detail',
    shot: 'a low-angle detail photograph of the planting, planter boxes, boulders and their relationship to the facade, shallow depth of field',
  },
  grid9: {
    label: '3×3 contact sheet',
    grid: true,
    shot:
      'a single image laid out as a 3×3 grid (contact sheet) of nine separate photographs with thin white gutters, all of the SAME house at the SAME time of day: ' +
      '1) front elevation eye level, 2) aerial drone view from above, 3) three-quarter front view, ' +
      '4) garage / entrance close-up, 5) window detail, 6) facade materials and planting detail, ' +
      '7) cladding and screen texture macro, 8) garden / boulders and ferns detail, 9) upper volume and window detail',
  },
};

const MODE_INTRO = {
  exterior:
    'Convert IMAGE 1 (an architectural sketch, line drawing, clay/SketchUp model or rough render of a building exterior) into a single photorealistic architectural photograph.',
  interior:
    'Convert IMAGE 1 (an interior sketch, line drawing, 3D model screenshot or rough render) into a single photorealistic interior design photograph.',
  floorplan:
    'Convert IMAGE 1 (a 2D floor plan) into a photorealistic 3D cut-away floor plan seen from a high three-quarter (isometric-like) angle: walls extruded to about 2.8 m with clean cut tops, every room furnished according to its labelled or implied function, realistic flooring materials, soft daylight and gentle shadows.',
};

const FIDELITY = {
  strict:
    'GEOMETRY LOCK — HIGHEST PRIORITY. Treat IMAGE 1 as an exact blueprint. Keep 100% identical: building massing, every volume and cantilever, proportions, number of floors, roof lines, every window/door/opening position, size and mullion pattern, balcony and planter positions, material zones, and the exact camera position, lens, perspective, horizon and framing. Do NOT add, remove, move, resize, simplify or "improve" any architectural element. Do not crop, rotate or mirror.',
  balanced:
    'GEOMETRY: Keep the building massing, proportions, floors, openings, material zones and the camera angle of IMAGE 1. Small refinements of detailing are allowed, but no new volumes or floors and no changed window positions.',
  creative:
    'GEOMETRY: Keep the overall concept, massing and camera angle of IMAGE 1, but you may enrich detailing, materials and context creatively.',
};

const REALISM =
  'PHOTOGRAPHY & REALISM: Shot on a full-frame camera with a tilt-shift lens, perfectly vertical lines, natural dynamic range, physically accurate materials with real micro-texture (render with subtle trowel marks, stone with natural variation, timber with grain), correct scale cues, natural imperfections, believable vegetation with varied species and depth. It must look like a real photograph by a professional architectural photographer — not CGI, not a 3D render, not a painting. No text, no labels, no watermark, no borders' ;

function referenceNote(refCount, startIndex = 2) {
  if (!refCount) return '';
  const last = startIndex + refCount - 1;
  const which = refCount === 1 ? `IMAGE ${startIndex}` : `IMAGES ${startIndex}–${last}`;
  return `\nREFERENCES: ${which} are mood/style references. Borrow ONLY their lighting, colour grading, atmosphere, vegetation and material quality. Never copy their architecture, layout or camera angle.`;
}

function optionsToText(o = {}) {
  const parts = [];
  if (o.buildingType && o.buildingType !== 'auto') parts.push(`Building type: ${o.buildingType}.`);
  if (o.style && o.style !== 'auto') parts.push(`Architectural style: ${o.style}.`);
  if (o.environment && o.environment !== 'auto') parts.push(`Context: ${o.environment}.`);
  if (o.lighting && o.lighting !== 'auto') parts.push(`Lighting / time: ${o.lighting}.`);
  if (o.weather && o.weather !== 'auto') parts.push(`Weather: ${o.weather}.`);
  if (o.people === 'yes') parts.push('Include a few naturally placed people for scale.');
  if (o.people === 'no') parts.push('No people.');
  if (o.cars === 'yes') parts.push('Include one tasteful modern car where a garage or driveway exists.');
  if (o.cars === 'no') parts.push('No vehicles.');
  return parts.join(' ');
}

/** Final prompt for the image model. The geometry lock is always appended server-side. */
function buildRenderPrompt({ mode = 'exterior', brief, fidelity = 'strict', refCount = 0 }) {
  return [
    MODE_INTRO[mode] || MODE_INTRO.exterior,
    '',
    FIDELITY[fidelity] || FIDELITY.strict,
    '',
    'SCENE & ART DIRECTION:',
    brief.trim(),
    referenceNote(refCount),
    '',
    REALISM + (mode === 'floorplan' ? ' (room labels from the plan may be omitted).' : '.'),
  ].join('\n');
}

function buildViewPrompt({ viewKey, extra = '' }) {
  const v = VIEWS[viewKey] || VIEWS.aerial;
  return [
    'IMAGE 1 is a finished photograph of a building. Create ' + v.shot + '.',
    '',
    'CONSISTENCY — HIGHEST PRIORITY: It must be the exact same building: identical architecture, massing, window positions, materials, colours, landscaping, vehicles, time of day, lighting and colour grade as IMAGE 1. Logically infer the parts not visible in IMAGE 1 so they match its design language. Do not redesign anything.',
    extra ? '\nADDITIONAL DIRECTION: ' + extra : '',
    '',
    REALISM + (v.grid ? ' (the thin white grid gutters are allowed).' : '.'),
  ].join('\n');
}

function buildEditPrompt({ instruction, refCount = 0 }) {
  return [
    'Edit IMAGE 1, a photorealistic architectural image.',
    'CHANGE ONLY THIS: ' + instruction.trim(),
    '',
    'Keep everything else pixel-faithful: same building, same camera, same framing, same materials and same lighting unless the instruction changes them. The result must remain a believable professional photograph.',
    referenceNote(refCount),
  ].join('\n');
}

/** Rule-based brief used when the AI brain is unavailable (or in demo mode). */
function fallbackBrief({ request = '', presetId = 'auto', options = {} }) {
  const preset = PRESETS[presetId] || PRESETS.auto;
  return [request && `Client request: ${request}.`, preset.brief, optionsToText(options)].filter(Boolean).join(' ');
}

module.exports = {
  PRESETS, VIEWS, FIDELITY,
  buildRenderPrompt, buildViewPrompt, buildEditPrompt, fallbackBrief, optionsToText,
};
