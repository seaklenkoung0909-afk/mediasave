/* Archviz Studio — front end */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ── state ──────────────────────────────────────────────────
  const S = {
    mode: 'exterior',
    source: null,          // data URL of the input for the current mode
    sourceDims: null,      // {w,h}
    refs: [],
    preset: 'tropical_dusk',
    fidelity: 'strict',
    views: new Set(['aerial', 'grid9']),
    results: [],           // {id, src, before, mode, prompt, createdAt}
    current: -1,
    lastBrief: null,
    busy: false,
    config: null,
  };

  const MODE_UI = {
    exterior: { upload: 'Upload your sketch', hint: 'Sketch · SketchUp · Revit · clay model · line drawing', req: 'Tell the AI what you want', go: 'Render',
      ph: 'e.g. Tropical villa at dusk, lots of plants, warm lights inside, car in the garage — any language is fine (Tiếng Việt OK)',
      ideas: ['Lush tropical garden', 'Warm lights inside', 'Car in the garage', 'Wet ground reflections', 'Big trees framing the shot', 'People for scale', 'Swimming pool in front', 'Forest hillside behind'] },
    interior: { upload: 'Upload your interior sketch', hint: 'Sketch · 3D screenshot · line drawing', req: 'Describe the space', go: 'Render',
      ph: 'e.g. Cozy living room, warm evening light, oak floor, linen sofa, big plants',
      ideas: ['Warm cozy evening', 'Morning sunlight streaming in', 'Japandi oak & linen', 'Indochine style', 'Marble & brass luxury', 'Lots of indoor plants', 'Ocean view outside'] },
    floorplan: { upload: 'Upload a 2D floor plan', hint: 'CAD export · scan · hand-drawn plan', req: 'Describe the furnishing', go: 'Render 3D plan',
      ph: 'e.g. Modern apartment, warm wood floors, light grey sofa, Japandi style',
      ideas: ['Modern minimal furniture', 'Warm wood floors', 'Japandi style', 'Luxury hotel feel', 'Bright daylight'] },
    refine: { upload: 'Image to refine', hint: 'Pick a render, or upload any image', req: 'What should change?', go: 'Apply change',
      ph: 'e.g. Make it night · Add rain · Change the wall to exposed brick · Thêm cây ở ban công',
      ideas: ['Make it night', 'Add rain & reflections', 'More plants on balconies', 'Change wall to exposed brick', 'Remove the car', 'Add a swimming pool in front', 'Make the sky more dramatic'] },
    views: { upload: 'Finished render', hint: 'The AI keeps the same house from every angle', req: 'Which shots?', go: 'Generate views',
      ph: 'Optional extra direction, e.g. keep the car, show the rooftop garden',
      ideas: [] },
  };

  // ── helpers ────────────────────────────────────────────────
  const toast = (msg, ms = 2600) => {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  };
  const showError = (msg) => { const e = $('#errorBox'); e.textContent = msg; e.hidden = !msg; };

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `Server error (${r.status})` }));
    if (!r.ok || j.error) throw new Error(j.error || `Server error (${r.status})`);
    return j;
  }

  /** Load an image file → downscaled JPEG data URL (keeps uploads fast). */
  function fileToDataURL(file, max = 2048) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ data: c.toDataURL('image/jpeg', 0.92), w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }
  const dimsOf = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; });

  const RATIOS = ['1:1', '4:3', '3:2', '16:9', '21:9', '3:4', '2:3', '4:5', '9:16', '5:4'];
  function nearestRatio(d) {
    if (!d) return undefined;
    const r = d.w / d.h; let best = '1:1', diff = 9;
    for (const k of RATIOS) { const [a, b] = k.split(':').map(Number); const x = Math.abs(Math.log(r / (a / b))); if (x < diff) { diff = x; best = k; } }
    return best;
  }
  const chosenRatio = () => ($('#ratio').value === 'match' ? nearestRatio(S.sourceDims) : $('#ratio').value);

  function collectOptions() {
    const o = {}; $$('[data-opt]').forEach((el) => (o[el.dataset.opt] = el.value)); return o;
  }

  // ── IndexedDB history ──────────────────────────────────────
  const DB = (() => {
    let dbp;
    const open = () => (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('archviz-studio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('renders', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('renders', mode); const out = fn(t.objectStore('renders')); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
    return {
      put: (item) => tx('readwrite', (s) => s.put(item)).catch(() => toast('Could not save to history (storage full?)')),
      all: () => tx('readonly', (s) => s.getAll()),
      del: (id) => tx('readwrite', (s) => s.delete(id)),
      clear: () => tx('readwrite', (s) => s.clear()),
    };
  })();

  // ── mode switching ─────────────────────────────────────────
  function setMode(mode) {
    S.mode = mode;
    $$('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const ui = MODE_UI[mode];
    $('#uploadTitle').textContent = ui.upload; $('#uploadHint').textContent = ui.hint;
    $('#requestTitle').textContent = ui.req; $('#request').placeholder = ui.ph; $('#goLabel').textContent = ui.go;
    const isRender = ['exterior', 'interior', 'floorplan'].includes(mode);
    $('#lookCard').hidden = !isRender || mode === 'floorplan';
    $('#fidelityField').hidden = !isRender; $('#optionGrid').hidden = !isRender || mode === 'floorplan';
    $('#refsField').hidden = mode === 'views';
    $('#sampleBtn').hidden = !isRender || mode !== 'exterior';
    $('#viewChips').hidden = mode !== 'views'; $('#ideaChips').hidden = mode === 'views';
    renderIdeaChips();
  }

  function renderIdeaChips() {
    const box = $('#ideaChips'); box.innerHTML = '';
    MODE_UI[S.mode].ideas.forEach((txt) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = '+ ' + txt;
      b.onclick = () => {
        const ta = $('#request');
        if (S.mode === 'refine') ta.value = txt;
        else ta.value = ta.value.trim() ? ta.value.trim().replace(/[.,;]?$/, ', ') + txt.toLowerCase() : txt;
        ta.focus();
      };
      box.appendChild(b);
    });
  }

  function renderViewChips() {
    const box = $('#viewChips'); box.innerHTML = '';
    (S.config?.views || []).forEach((v) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (S.views.has(v.id) ? ' on' : ''); b.textContent = v.label;
      b.onclick = () => { S.views.has(v.id) ? S.views.delete(v.id) : S.views.add(v.id); b.classList.toggle('on'); };
      box.appendChild(b);
    });
  }

  function renderPresets() {
    const box = $('#presets'); box.innerHTML = '';
    (S.config?.presets || []).forEach((p) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'preset' + (p.id === S.preset ? ' active' : '');
      b.style.background = `linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})`;
      b.innerHTML = `<span>${p.label}</span>`;
      b.onclick = () => { S.preset = p.id; $$('.preset').forEach((x) => x.classList.remove('active')); b.classList.add('active'); };
      box.appendChild(b);
    });
  }

  // ── source upload ──────────────────────────────────────────
  async function setSource(data, dims) {
    S.source = data; S.sourceDims = dims || (await dimsOf(data));
    const img = $('#sourcePreview'); img.src = data; img.hidden = false;
    $('.drop-empty').hidden = true; $('#clearSource').hidden = false;
    // Show the input on stage so the user sees what will be rendered
    if (S.current < 0) showOnStage(data, null);
  }
  function clearSource() {
    S.source = null; S.sourceDims = null;
    $('#sourcePreview').hidden = true; $('.drop-empty').hidden = false; $('#clearSource').hidden = true; $('#fileInput').value = '';
  }
  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return toast('Please choose an image file.');
    try { const r = await fileToDataURL(file); setSource(r.data, { w: r.w, h: r.h }); }
    catch (e) { toast(e.message); }
  }

  const drop = $('#drop');
  $('#fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
  $('#clearSource').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); clearSource(); });
  window.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { handleFile(f); toast('Image pasted'); }
  });
  $('#sampleBtn').addEventListener('click', async () => {
    const blob = await (await fetch('samples/sketch-villa.jpg')).blob();
    await handleFile(new File([blob], 'sample.jpg', { type: blob.type }));
    if (!$('#request').value) $('#request').value = 'Luxury tropical villa at blue hour, lush ferns and boulders in the front garden, warm lights inside, a car in the garage';
    S.preset = 'tropical_dusk'; renderPresets();
  });

  // reference images
  $('#refInput').addEventListener('change', async (e) => {
    for (const f of [...e.target.files]) {
      if (S.refs.length >= 5) { toast('Max 5 reference images'); break; }
      try { S.refs.push((await fileToDataURL(f, 1280)).data); } catch (_) {}
    }
    e.target.value = ''; renderRefs();
  });
  function renderRefs() {
    $$('#refs .ref').forEach((n) => n.remove());
    const add = $('.ref-add');
    S.refs.forEach((src, i) => {
      const d = document.createElement('div'); d.className = 'ref';
      d.innerHTML = `<img src="${src}" alt=""><button type="button" title="Remove">×</button>`;
      d.querySelector('button').onclick = () => { S.refs.splice(i, 1); renderRefs(); };
      add.before(d);
    });
    add.hidden = S.refs.length >= 5;
  }

  // ── voice input ────────────────────────────────────────────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const mic = $('#micBtn'); mic.hidden = false;
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = false;
      rec.onresult = (e) => { const t = e.results[0][0].transcript; const ta = $('#request'); ta.value = (ta.value ? ta.value + ' ' : '') + t; };
      rec.onend = () => { mic.classList.remove('on'); rec = null; };
      rec.onerror = () => toast('Voice input unavailable');
      mic.classList.add('on'); rec.start();
    };
  }

  // ── stage / viewer ─────────────────────────────────────────
  let comparePos = 50;
  function showOnStage(after, before) {
    $('#emptyState').hidden = true; $('#compare').hidden = false;
    $('#afterImg').src = after;
    const hasBefore = !!before && $('#compareBtn').classList.contains('active');
    $('#compare').classList.toggle('single', !hasBefore);
    if (before) $('#beforeImg').src = before;
    setCompare(comparePos);
  }
  function setCompare(p) {
    comparePos = Math.max(0, Math.min(100, p));
    $('#beforeWrap').style.clipPath = `inset(0 ${100 - comparePos}% 0 0)`;
    $('#handle').style.left = comparePos + '%';
  }
  (() => {
    const handle = $('#handle'), box = $('#compare');
    let drag = false;
    const move = (x) => { const r = box.getBoundingClientRect(); setCompare(((x - r.left) / r.width) * 100); };
    handle.addEventListener('pointerdown', (e) => { drag = true; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', (e) => drag && move(e.clientX));
    handle.addEventListener('pointerup', () => (drag = false));
    box.addEventListener('click', (e) => { if (!box.classList.contains('single') && e.target !== handle) move(e.clientX); });
  })();

  function renderThumbs() {
    const box = $('#thumbs'); box.innerHTML = '';
    S.results.forEach((r, i) => {
      const b = document.createElement('button'); b.className = 'thumb' + (i === S.current ? ' active' : '');
      b.innerHTML = `<img src="${r.src}" alt="">`; b.onclick = () => select(i);
      box.appendChild(b);
    });
    $('#stageActions').hidden = S.current < 0;
  }
  function select(i) {
    S.current = i; const r = S.results[i];
    showOnStage(r.src, r.before); renderThumbs();
  }
  function addResults(images, before, meta) {
    const start = S.results.length;
    images.forEach((src) => {
      const item = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), src, before, createdAt: Date.now(), ...meta };
      S.results.push(item); DB.put(item);
    });
    select(start);
    if (window.innerWidth <= 1080) $('#stage').scrollIntoView({ behavior: 'smooth' });
  }

  $('#compareBtn').onclick = () => { $('#compareBtn').classList.toggle('active'); if (S.current >= 0) select(S.current); };
  $('#downloadBtn').onclick = () => {
    const r = S.results[S.current]; if (!r) return;
    const a = document.createElement('a'); a.href = r.src;
    a.download = `archviz-${r.mode}-${new Date(r.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${r.src.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`;
    a.click();
  };
  $('#zoomBtn').onclick = () => { const r = S.results[S.current]; if (!r) return; $('#lightImg').src = r.src; $('#lightbox').hidden = false; };
  $('#lightImg').onclick = () => $('#lightbox').classList.toggle('zoomed');
  $('#closeLight').onclick = () => { $('#lightbox').hidden = true; $('#lightbox').classList.remove('zoomed'); };
  const useCurrentAs = async (mode) => {
    const r = S.results[S.current]; if (!r) return;
    setMode(mode); await setSource(r.src); $('#request').value = '';
    $('#panel').scrollIntoView({ behavior: 'smooth' }); toast(mode === 'refine' ? 'Now describe what to change' : 'Pick the shots you want');
  };
  $('#toRefineBtn').onclick = () => useCurrentAs('refine');
  $('#toViewsBtn').onclick = () => useCurrentAs('views');

  // ── loading overlay ────────────────────────────────────────
  let timer;
  function loading(on, text) {
    S.busy = on; $('#goBtn').disabled = on; $('#rerenderBtn').disabled = on;
    $('#loading').hidden = !on;
    if (on) {
      $('#emptyState').hidden = true;
      if (text) $('#loadingText').textContent = text;
      const t0 = Date.now(); clearInterval(timer);
      timer = setInterval(() => { $('#loadingTime').textContent = Math.round((Date.now() - t0) / 1000) + 's'; }, 500);
    } else clearInterval(timer);
  }
  const phase = (t) => ($('#loadingText').textContent = t);

  // ── AI card ────────────────────────────────────────────────
  function showBrief(b) {
    S.lastBrief = b;
    $('#aiCard').hidden = false;
    $('#aiUnderstood').textContent = b.understood || '';
    $('#aiMaterials').innerHTML = (b.materials || []).slice(0, 8).map((m) => `<span><b>${esc(m.element)}:</b> ${esc(m.material)}</span>`).join('');
    $('#briefText').value = b.brief || '';
    const sug = $('#aiSuggest'); sug.innerHTML = '';
    (b.suggestions || []).forEach((s) => {
      const c = document.createElement('button'); c.className = 'chip'; c.textContent = s;
      c.onclick = () => {
        if (S.current >= 0) { useCurrentAs('refine').then(() => ($('#request').value = s)); }
        else { $('#request').value = s; }
      };
      sug.appendChild(c);
    });
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── main actions ───────────────────────────────────────────
  const common = () => ({ quality: $('#quality').value, size: $('#size').value, count: +$('#count').value });

  async function doRender(briefOverride) {
    const brief = briefOverride ?? S.lastBrief?.brief;
    const d = await api('/api/render', {
      image: S.source, refs: S.refs, mode: S.mode, brief, fidelity: S.fidelity,
      aspectRatio: chosenRatio(), request: $('#request').value, presetId: S.preset, options: collectOptions(), ...common(),
    });
    addResults(d.images, S.source, { mode: S.mode, prompt: d.prompt });
    if (d.demo) toast('Demo mode: add your GEMINI_API_KEY to get real renders', 4000);
  }

  async function go() {
    if (S.busy) return;
    showError('');
    if (!S.source) { toast('Upload an image first'); $('#drop').classList.add('over'); setTimeout(() => $('#drop').classList.remove('over'), 900); return; }
    const request = $('#request').value.trim();
    try {
      if (['exterior', 'interior', 'floorplan'].includes(S.mode)) {
        loading(true, 'Reading your design…');
        const b = await api('/api/brief', { image: S.source, request, mode: S.mode, presetId: S.preset, options: collectOptions() });
        showBrief(b);
        if ($('#reviewFirst').checked) {
          $('#briefDetails').open = true; loading(false); toast('Review the brief, then press "Render with this brief"'); return;
        }
        phase($('#quality').value === 'pro' ? 'Rendering light & materials… (≈20–60s)' : 'Rendering…');
        await doRender();
      } else if (S.mode === 'refine') {
        if (!request) { toast('Describe what should change'); $('#request').focus(); return; }
        loading(true, 'Understanding your change…');
        setTimeout(() => S.busy && phase('Editing the image…'), 3500);
        const d = await api('/api/edit', { image: S.source, request, refs: S.refs, ...common() });
        if (d.understood) showBrief({ understood: d.understood, brief: d.prompt, materials: [], suggestions: [] });
        addResults(d.images, S.source, { mode: 'refine', prompt: d.prompt });
      } else if (S.mode === 'views') {
        const views = [...S.views];
        if (!views.length) { toast('Pick at least one shot'); return; }
        loading(true, `Generating ${views.length} view${views.length > 1 ? 's' : ''}…`);
        let done = 0; const errors = [];
        const base = S.source;
        await Promise.all(views.map(async (view) => {
          try {
            const d = await api('/api/view', { image: base, view, extra: request, quality: $('#quality').value, size: $('#size').value, aspectRatio: chosenRatio() });
            addResults(d.images, base, { mode: 'view:' + view, prompt: d.prompt });
          } catch (e) { errors.push(e.message); }
          phase(`Generated ${++done} of ${views.length}…`);
        }));
        if (errors.length) showError(errors[0]);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      loading(false);
    }
  }
  $('#goBtn').addEventListener('click', go);
  $('#request').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); });
  $('#rerenderBtn').addEventListener('click', async () => {
    if (S.busy) return;
    if (!S.source) return toast('Upload an image first');
    if (!['exterior', 'interior', 'floorplan'].includes(S.mode)) setMode('exterior');
    showError('');
    try { loading(true, 'Rendering with your brief…'); await doRender($('#briefText').value); }
    catch (e) { showError(e.message); } finally { loading(false); }
  });

  // ── tabs & segmented controls ──────────────────────────────
  $$('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $$('#fidelity button').forEach((b) => (b.onclick = () => { S.fidelity = b.dataset.v; $$('#fidelity button').forEach((x) => x.classList.toggle('active', x === b)); }));

  // ── history drawer ─────────────────────────────────────────
  async function openHistory() {
    $('#drawer').hidden = false;
    const grid = $('#historyGrid'); grid.innerHTML = '';
    const items = ((await DB.all()) || []).sort((a, b) => b.createdAt - a.createdAt);
    if (!items.length) { grid.innerHTML = '<div class="history-empty">No renders yet.</div>'; return; }
    items.forEach((it) => {
      const d = document.createElement('div'); d.className = 'h-item';
      d.innerHTML = `<img src="${it.src}" loading="lazy" alt=""><span>${esc(String(it.mode).replace('view:', ''))}</span><button title="Delete">×</button>`;
      d.onclick = () => {
        let i = S.results.findIndex((r) => r.id === it.id);
        if (i < 0) { S.results.push(it); i = S.results.length - 1; }
        select(i); $('#drawer').hidden = true;
      };
      d.querySelector('button').onclick = async (e) => { e.stopPropagation(); await DB.del(it.id); d.remove(); };
      grid.appendChild(d);
    });
  }
  $('#historyBtn').onclick = openHistory;
  $('#closeDrawer').onclick = () => ($('#drawer').hidden = true);
  $('#drawer').onclick = (e) => { if (e.target.id === 'drawer') $('#drawer').hidden = true; };
  $('#clearHistory').onclick = async () => { if (confirm('Delete all saved renders?')) { await DB.clear(); openHistory(); } };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#drawer').hidden = true; $('#closeLight').click(); } });

  // ── boot ───────────────────────────────────────────────────
  (async () => {
    try { S.config = await (await fetch('/api/config')).json(); } catch (_) { S.config = { presets: [], views: [] }; }
    $('#demoBadge').hidden = !S.config.demo;
    renderPresets(); renderViewChips(); setMode('exterior');
  })();
})();
