/* Shiny UI */
'use strict';

const KEY = 'shiny.magpie.v1';
let S = {sources: [], shinies: [], finals: [], posts: [], nav: 'hoard'};
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
try {   // one-time: untouched drafts made before the text/caption rewrite get the new, calmer wording
  S.finals = (S.finals || []).filter(f => (S.shinies || []).some(s => s.id === f.shinyId));   // learnings from shinies deleted earlier are dropped
  const m0 = insights(S.finals);
  (S.sources || []).forEach(x => { if (x.kind === 'file' && !x.cleaned) { x.topic = cleanTitle(x.topic || x.name); x.cleaned = 1; } });
  (S.shinies || []).forEach(s => {
    const x = S.sources.find(q => q.id === s.sourceId); if (!x || s.status !== 'draft' || s.ovV) return; s.ovV = 2;
    if (s.gen && s.caption === s.gen.caption) { const cp = writeCopy({topic: x.topic, platform: s.platform, tone: s.tone, seed: s.seed, segs: x.transcript, start: s.start, end: s.end}, m0); s.caption = s.gen.caption = cp.caption; s.tags = cp.tags; s.gen.tags = cp.tags; }
    if (s.overlays && s.ovMode === 'transcript') { const r = autoOverlays({segs: x.transcript, topic: x.topic, start: s.start, end: s.end, platform: s.platform, mem: m0}); s.overlays = r.overlays; s.ovMode = r.mode; }
  });
  (S.shinies || []).forEach(s => (s.overlays || []).forEach(o => { if (o.full === undefined && s.ovMode && o.from === 0 && o.to <= 6.01) { o.full = true; o.to = s.end - s.start; } }));   // auto text used to vanish after ~6s; now it runs the whole clip
  localStorage.setItem(KEY, JSON.stringify(S));
} catch (e) { console.warn('migration skipped', e); }
const blobs = {};                 // sourceId -> {url, media}; restored from IndexedDB on load
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Browser storage is full; remove an old source.'); } };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const mem = () => insights(S.finals);
const srcOf = id => S.sources.find(x => x.id === id);
const shinyOf = id => S.shinies.find(x => x.id === id);
const pill = p => `<span class="pill ${p}">${PLATFORMS[p].short}</span>`;
const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dstr(new Date());
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
const wait = ms => new Promise(r => setTimeout(r, ms));
let toastT;
function toast(m, act) {
  const t = $('#toast'); t.textContent = m;
  if (act) { const b = document.createElement('button'); b.textContent = act.label; b.onclick = () => { act.fn(); t.classList.remove('show'); }; t.append(b); }
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), act ? 8000 : 3400);
}

const MAGPIE = `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="ir" x1="0" x2="1"><stop offset="0" stop-color="#0f8b8d"/><stop offset="1" stop-color="#2b4c9b"/></linearGradient></defs>
<path class="tail" d="M40 62 L3 91 L14 97 L52 76Z" fill="url(#ir)"/><ellipse cx="62" cy="58" rx="30" ry="21" fill="#16181f" transform="rotate(-12 62 58)"/>
<ellipse cx="68" cy="67" rx="17" ry="11" fill="#fff" transform="rotate(-12 68 67)"/><path d="M38 52 Q58 34 84 52 Q62 68 38 52Z" fill="url(#ir)"/>
<circle cx="88" cy="40" r="15" fill="#16181f"/><g class="eye"><circle cx="93" cy="37" r="4" fill="#fff"/><circle cx="94" cy="37" r="1.9" fill="#16181f"/></g>
<path d="M101 38 L117 43 L101 48Z" fill="#2a2d45"/><path class="twinkle" d="M110 51 l6 6 -6 7 -6 -7z" fill="#f0b429" stroke="#b9810c" stroke-width="1.5"/>
<path d="M60 78 v14 M70 77 v15" stroke="#2a2d45" stroke-width="3" stroke-linecap="round"/></svg>`;
$('#logo').innerHTML = MAGPIE;
(() => { const em = ['✦', '✧', '✦', '✧', '✦']; $('#sparks').innerHTML = Array.from({length: 18}, (_, i) => `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;font-size:${12 + Math.random() * 20}px;--d:${5 + Math.random() * 6}s;--l:${-Math.random() * 8}s">${em[i % em.length]}</i>`).join(''); })();

function confetti(n = 26, x = innerWidth / 2, y = innerHeight / 3, spread = 700) {
  const em = ['✨', '💎', '🪙', '⭐', '🌈', '💛', '🪶'];
  for (let i = 0; i < n; i++) { const s = document.createElement('span'); s.className = 'cf'; s.textContent = em[i % em.length];
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.random() - .5) * spread}px;--dy:${-80 - Math.random() * spread * .45}px;--rot:${Math.random() * 720 - 360}deg;font-size:${14 + Math.random() * 16}px`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 1600); }
}

/* ---------- file persistence (IndexedDB) so clips survive a reload ---------- */
const idb = new Promise(res => { try { const r = indexedDB.open('shiny', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } });
const idbDo = async (mode, fn) => { const db = await idb; if (!db) return; return new Promise(res => { const rq = fn(db.transaction('files', mode).objectStore('files')); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }); };
const idbPut = (k, v) => idbDo('readwrite', st => st.put(v, k)), idbGet = k => idbDo('readonly', st => st.get(k)), idbDel = k => idbDo('readwrite', st => st.delete(k));

/* ---------- thumbnails ---------- */
function onceEv(el, ev, ms = 6000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); el.addEventListener(ev, () => { clearTimeout(t); res(); }, {once: true}); }); }
async function makeThumb(src, t) {
  const b = blobs[src.id]; if (!b) return null;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  try {
    if (b.media === 'audio') {   // colourful waveform art
      c.width = 540; c.height = 675; x.scale(1.5, 1.5); const g = x.createLinearGradient(0, 0, 360, 450); const h = Math.floor(t * 7) % 360;
      g.addColorStop(0, `hsl(${h},85%,62%)`); g.addColorStop(1, `hsl(${(h + 70) % 360},85%,55%)`); x.fillStyle = g; x.fillRect(0, 0, 360, 450);
      const e = src.energy || [], i0 = Math.floor(t / (src.step || .25)); x.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 28; i++) { const v = e[i0 + i * 3] ?? .3, hh = 20 + v * 220; x.beginPath(); x.roundRect(14 + i * 12.2, 225 - hh / 2, 7, hh, 4); x.fill(); }
      return c.toDataURL('image/jpeg', .75);
    }
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = b.url; await onceEv(v, 'loadeddata');
    if (v.videoWidth) { src.vw = v.videoWidth; src.vh = v.videoHeight; } const k = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight, 1)); c.width = Math.round(v.videoWidth * k) || 800; c.height = Math.round(v.videoHeight * k) || 450;   // big enough to stay sharp on tall tiles and retina screens
    let best = null, bestSd = -1;   // try a few moments and keep the most varied frame, so a blank white/black frame is never the thumbnail
    for (const dt of [1, 4, 9, 15]) {
      v.currentTime = Math.min(Math.max(0, t + dt), Math.max(0, (v.duration || 1) - .1)); await onceEv(v, 'seeked'); await wait(60);
      x.drawImage(v, 0, 0, c.width, c.height); const px = x.getImageData(0, 0, c.width, c.height).data; let n = 0, sum = 0, sq = 0;
      for (let i = 0; i < px.length; i += 64) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; n++; sum += l; sq += l * l; }
      const sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)); if (sd > bestSd) { bestSd = sd; best = c.toDataURL('image/jpeg', .8); } if (sd > 22) break;
    }
    v.removeAttribute('src'); v.load();
    return best;
  } catch (e) { return null; }
}
const refreshThumb = async s => { const t = await makeThumb(srcOf(s.sourceId), s.start); if (t) { s.thumb = t; s.thumbV = 3; save(); } };

/* ---------- nest nudges (gentle, nest wall only) ---------- */
function nudges() {
  const used = new Set([...S.shinies.map(s => s.platform), ...S.posts.map(p => p.platform)]), t = today(), out = [];
  for (const p of used) {
    const posted = S.posts.filter(x => x.platform === p && x.status === 'posted' && x.date <= t).map(x => x.date).sort();
    const upcoming = S.posts.some(x => x.platform === p && x.status === 'planned' && x.date >= t && daysBetween(t, x.date) <= PLATFORMS[p].cadence);
    const last = posted[posted.length - 1], gap = last ? daysBetween(last, t) : null, cad = PLATFORMS[p].cadence;
    if (upcoming || !S.shinies.some(s => s.platform === p && s.status !== 'draft')) continue;
    if (gap == null) out.push({p, msg: `${PLATFORMS[p].name} hasn't heard from you yet, and you've got finished shinies waiting 💎`});
    else if (gap > cad) out.push({p, msg: `${PLATFORMS[p].name} has been quiet for ${gap} days. Your audience misses you 🐦`});
  }
  return out;
}
const nudgeHTML = () => nudges().map(n => `<div class="sticker">${esc(n.msg)} <button class="btn sm" data-act="plan" data-p="${n.p}">Line one up</button></div>`).join('');

/* ---------- routing ---------- */
const NAV = [['hoard', '💎 Shinies'], ['nest', '🪺 Nest Wall'], ['sky', '🌤️ The Sky']];
let showForm = false, filt = 'all';   // platform filter
function go(v) { if (v === 'perch') { v = 'hoard'; showForm = true; } if (!NAV.some(n => n[0] === v)) v = 'hoard'; S.nav = v; save(); stopPlay(); render(); window.scrollTo(0, 0); }
function render() {
  if (!NAV.some(n => n[0] === S.nav)) S.nav = 'hoard';
  $('#nav').innerHTML = NAV.map(([k, l]) => `<button data-go="${k}" class="${S.nav === k ? 'on' : ''}">${l}</button>`).join('');
  $('#view').innerHTML = ({hoard: hoardView, nest: nestView, sky: skyView}[S.nav])();
  if ($('#drop')) bindPerch();
}

/* ---------- home: hunt form + gallery ---------- */
const form = {tone: 'warm', platforms: new Set(['shorts', 'reels', 'linkedin']), topic: '', yt: '', pod: '', wantText: true, file: null, busy: false};
function huntForm() {
  const m = mem();
  return `<div class="hunt"><div class="card"><div class="grid g2"><div>
    <h2>Bring me something 🪺</h2>
    <label class="drop" id="drop"><input type="file" id="file" accept="video/*,audio/*,.mp3,.mp4,.m4a,.wav" hidden>
      <div class="nest">🪺</div><br><b id="dropLabel">${form.file ? esc(form.file.name) : 'Drop an MP4 or podcast MP3 here'}</b><div class="muted small">${form.file ? (form.file.size / 1048576).toFixed(1) + ' MB. Click to swap.' : 'or click to browse. It stays on your machine.'}</div></label>
    <label class="f" for="yt">…or a YouTube link</label>
    <input type="url" id="yt" placeholder="https://youtube.com/watch?v=…" value="${esc(form.yt)}">
    <label class="f" for="pod">…or a podcast link <span class="muted">(episode page, SoundCloud, or a direct .mp3)</span></label>
    <input type="url" id="pod" placeholder="https://example.com/episode.mp3" value="${esc(form.pod)}">
    <div class="small muted" style="margin-top:4px">Links are downloaded to your machine so I can listen and cut real clips. Only use media you own or may clip. Spotify episodes are copy-protected, so use the show's own page or mp3 link instead. Needs <code>python server.py</code> running.</div>
  </div><div>
    <label class="f" for="topic" style="margin-top:0">What's it about? <span class="muted">(I use this to write the copy)</span></label>
    <textarea id="topic" placeholder="e.g. why most founders over-hire early">${esc(form.topic)}</textarea>
    <label class="f">Where should the shinies go?</label>
    <div class="chips" id="plats">${Object.entries(PLATFORMS).map(([k, p]) => `<label class="chip ${form.platforms.has(k) ? 'on' : ''}"><input type="checkbox" value="${k}" ${form.platforms.has(k) ? 'checked' : ''}>${p.name}</label>`).join('')}</div>
    <label class="f">Tone of voice${m.topTone && m.n >= 2 ? ` <span class="muted">(your notebook says ${TONES[m.topTone[0]].label.toLowerCase()})</span>` : ''}</label>
    <div class="chips" id="tones">${Object.entries(TONES).map(([k, t]) => `<span class="chip ${form.tone === k ? 'on' : ''}" data-tone="${k}">${t.label}</span>`).join('')}</div>
    <label class="chip ${form.wantText ? 'on' : ''}" style="margin-top:14px"><input type="checkbox" id="wantText" ${form.wantText ? 'checked' : ''}>✍️ Write summary text on the videos</label>
    <div style="margin-top:14px"><button class="btn big" id="send" ${form.busy ? 'disabled' : ''}>Send the magpie ✨</button></div>
    <div id="status" class="small muted" style="margin-top:8px"></div>
  </div></div></div></div>`;
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const latestSrc = () => S.sources.slice().sort((x, y) => (y.added || 0) - (x.added || 0))[0];
const isNew = s => { const l = latestSrc(); return S.sources.length > 1 && !!l && s.sourceId === l.id; };   // picked by the most recent hunt
function hoardView() {
  const empty = !S.sources.length, tiles = S.shinies.slice().sort((a, b) => (srcOf(b.sourceId)?.added || 0) - (srcOf(a.sourceId)?.added || 0) || a.candIdx - b.candIdx).filter(s => filt === 'all' || s.platform === filt);
  const hero = empty ? `<section class="hero"><div><h1>Hi, I'm <span class="rainbow">Shiny</span>.<br>I collect the good bits.</h1>
    <p class="muted" style="font-size:1.15rem;max-width:520px">Give me a long video or podcast. I'll cut a shiny clip for every platform, write the caption, and tell you why I picked it.</p></div>${MAGPIE.replace('<svg ', '<svg class="big" ')}</section>`
    : `<div class="row head"><h1 style="margin:0"><span class="rainbow">Your hoard</span></h1><span class="muted">${S.shinies.length} shinies from ${S.sources.length} source${S.sources.length > 1 ? 's' : ''}</span><span class="sp"></span>${showForm ? '' : '<button class="btn big" data-act="newhunt">🪺 New hunt</button>'}</div>`;
  const filters = empty ? '' : `<div class="chips filters">${[['all', 'All ✨'], ...Object.entries(PLATFORMS).map(([k, p]) => [k, p.short])].map(([k, l]) => `<span class="chip ${filt === k ? 'on' : ''}" data-filt="${k}">${l}</span>`).join('')}<span class="sp"></span>${S.shinies.some(s => s.status === 'draft') ? '<button class="btn ghost sm" data-act="cleardrafts">🧹 Clear drafts</button>' : ''}</div>`;
  const nNew = tiles.filter(isNew).length, hasNew = nNew > 0 && nNew < tiles.length;
  const ls = latestSrc(), fresh = tiles.filter(isNew), rest = tiles.filter(s => !isNew(s));
  let ti = 0, body;
  if (hasNew) {   // the newest hunt stands apart; everything older stays together in one grid
    body = `<section class="stage-sec new"><h2>✨ Latest hunt <em>${fresh.length}</em></h2><p class="muted small">Just brought back by the magpie from “${esc(ls.topic || ls.name || 'your source')}”, ${ago(ls.added)}.</p><div class="masonry">${fresh.map(s => tile(s, ti++)).join('')}</div></section>
      <section class="stage-sec"><h2>Earlier <em>${rest.length}</em></h2><div class="masonry">${rest.map(s => tile(s, ti++)).join('')}</div></section>`;
  } else body = `<div class="masonry">${tiles.map((s, i) => tile(s, i)).join('')}</div>`;
  return `${hero}${empty || showForm ? huntForm() : ''}${filters}${body}`;
}
function tile(s, i) {
  const src = srcOf(s.sourceId); if (!src) return '';
  const thumb = s.thumb || (src.kind === 'yt' ? `https://i.ytimg.com/vi/${src.ytId}/hqdefault.jpg` : '');
  const media = blobs[src.id] ? blobs[src.id].media : src.media; probeDims(src); ensureThumb(s);
  const native = media === 'video' && frameOf(s, src) === 'native';
  return `<article class="tile ${s.platform}${isNew(s) ? ' is-new' : ''}" style="--i:${Math.min(i, 14)}">
    <div class="thumb ${media}${native ? ' native' : ''}" ${native ? `style="--ar:${srcAr(src)}"` : ''} data-act="play" data-id="${s.id}">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : '<div class="art"></div>'}<div class="shade"></div>${(s.overlays || []).filter(o => o.from <= .5).map(ovHTML).join('')}<button class="xbtn" data-act="discard" data-id="${s.id}" title="Discard this shiny">✕</button>
      <span class="pf">${pill(s.platform)}</span>${s.status !== 'draft' ? `<span class="gem">${s.status === 'posted' ? '🏆' : '💎'}</span>` : ''}
      <div class="play">▶</div><div class="eq"><i></i><i></i><i></i><i></i><i></i></div><span class="dur">${Math.round(s.end - s.start)}s</span>${native ? '<span class="shape">Landscape, uncropped</span>' : ''}</div>
    <div class="body">${isNew(s) ? '<span class="sbadge new">✨ Latest hunt</span> ' : ''}<p class="cap">${esc(s.caption)}</p><p class="tags">${esc(s.tags.join(' '))}</p><p class="from">From “${esc(src.topic || src.name || 'a source')}” · ${ago(src.added)}</p>
      <details><summary>Why I picked it</summary><p>${esc(s.why)}</p></details>
      <div class="row"><button class="btn sm" data-act="edit" data-id="${s.id}">✏️ Polish</button>${s.status !== 'draft' ? `<button class="btn ghost sm" data-act="sched" data-id="${s.id}">📅</button>` : ''}<span class="sp"></span><span class="small muted">${fmt(s.start)}</span></div></div></article>`;
}

/* inline playback: hover = silent loop, click = with sound */
let playing = null;
function stopPlay() { if (playing) { clearInterval(playing.t); playing.el.pause(); playing.el.remove(); playing.box.classList.remove('live'); playing = null; } }
function playTile(box, sound) {
  const s = shinyOf(box.dataset.id), b = s && blobs[s.sourceId]; if (!b) return false;
  stopPlay(); const el = document.createElement(b.media === 'video' ? 'video' : 'audio'); el.src = b.url; el.muted = !sound; el.playsInline = true;
  if (b.media === 'video') box.insertBefore(el, box.querySelector('.shade'));
  box.classList.add('live'); playing = {el, box, t: null};
  el.addEventListener('loadedmetadata', () => { el.currentTime = s.start; el.play().catch(() => {}); }, {once: true});
  playing.t = setInterval(() => { if (el.currentTime >= s.end || el.ended) { if (sound) stopPlay(); else { el.currentTime = s.start; el.play().catch(() => {}); } } }, 120);
  return true;
}
document.addEventListener('mouseover', e => { const t = e.target.closest('.thumb'); if (t && (!playing || playing.box !== t) && !(playing && playing.sound)) { if (playTile(t, false) && playing) playing.sound = false; } });
document.addEventListener('mouseout', e => { const t = e.target.closest('.thumb'); if (t && playing && playing.box === t && !playing.sound && !t.contains(e.relatedTarget)) stopPlay(); });

function bindPerch() {
  const dz = $('#drop'), fi = $('#file');
  const setFile = f => { if (!f) return; form.file = f; form.yt = form.pod = ''; $('#yt').value = $('#pod').value = ''; if (!form.topic) { form.topic = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); $('#topic').value = form.topic; } $('#dropLabel').textContent = f.name; };
  fi.onchange = () => setFile(fi.files[0]);
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
  $('#yt').oninput = e => { form.yt = e.target.value; if (form.yt) { form.file = null; form.pod = ''; $('#pod').value = ''; } };
  $('#pod').oninput = e => { form.pod = e.target.value; if (form.pod) { form.file = null; form.yt = ''; $('#yt').value = ''; } };
  $('#topic').oninput = e => form.topic = e.target.value;
  $('#plats').onchange = e => { e.target.checked ? form.platforms.add(e.target.value) : form.platforms.delete(e.target.value); e.target.parentNode.classList.toggle('on', e.target.checked); };
  $('#tones').onclick = e => { const t = e.target.closest('[data-tone]'); if (!t) return; form.tone = t.dataset.tone; document.querySelectorAll('#tones .chip').forEach(c => c.classList.toggle('on', c === t)); };
  $('#wantText').onchange = e => { form.wantText = e.target.checked; e.target.parentNode.classList.toggle('on', e.target.checked); };
  $('#send').onclick = send;
}
const ytId = u => (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1];
let ytApi;
function loadYT() { return ytApi ||= new Promise((res, rej) => { if (window.YT && YT.Player) return res(); window.onYouTubeIframeAPIReady = res; const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => rej(new Error('Could not reach YouTube. Check your connection.')); document.head.appendChild(s); }); }
async function ytDuration(id) {
  await loadYT(); const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;width:200px;height:120px'; document.body.appendChild(box);
  return new Promise((res, rej) => {
    const to = setTimeout(() => { box.remove(); rej(new Error('YouTube did not answer. Is the video public and embeddable?')); }, 12000);
    new YT.Player(box, {videoId: id, events: {onReady: e => { const t = setInterval(() => { const d = e.target.getDuration(); if (d > 0) { clearInterval(t); clearTimeout(to); e.target.destroy(); box.remove(); res(d); } }, 300); }, onError: e => { clearTimeout(to); box.remove(); const c = e.data, why = {2: 'the link looks invalid', 5: 'the player hit an HTML5 error', 100: 'the video was removed or is private', 101: 'the owner disabled embedding', 150: 'the owner disabled embedding'}[c] || 'embedding is blocked'; rej(new Error(`YouTube wouldn't let me read this video (error ${c}: ${why}). Type its length in the box and send again.`)); }}});
  });
}
async function huntRemote(kind, url, setP) {   // start a background job on the helper and follow its real progress
  const r = await fetch('/api/hunt?url=' + encodeURIComponent(url) + '&kind=' + kind), j0 = await r.json(); if (!r.ok) throw new Error(j0.error || 'could not start');
  for (;;) {
    await wait(700); const j = await (await fetch('/api/job?id=' + j0.job)).json();
    if (j.stage === 'error') throw new Error(j.error || 'download failed');
    setP(j.text || 'Fetching…', Math.min(70, (j.pct || 0) * .7));
    if (j.stage === 'done') return j.result;
  }
}
/* ---------- the hunt: the magpie flies off to find shinies (replaces a progress bar) ---------- */
const FLYER = `<svg viewBox="0 0 140 100" aria-hidden="true"><defs><linearGradient id="fw" x1="0" x2="1"><stop offset="0" stop-color="#0f8b8d"/><stop offset="1" stop-color="#2b4c9b"/></linearGradient></defs>
<path class="w2" d="M62 46 Q46 6 14 10 Q36 30 62 50Z" fill="#14707a" opacity=".75"/><path d="M40 62 L4 86 L14 94 L52 74Z" fill="url(#fw)"/>
<ellipse cx="68" cy="58" rx="30" ry="19" fill="#16181f" transform="rotate(-8 68 58)"/><ellipse cx="74" cy="66" rx="17" ry="10" fill="#fff" transform="rotate(-8 74 66)"/>
<circle cx="98" cy="46" r="14" fill="#16181f"/><circle cx="103" cy="43" r="3.8" fill="#fff"/><circle cx="104" cy="43" r="1.8" fill="#16181f"/><path d="M110 44 L128 49 L110 53Z" fill="#2a2d45"/>
<path class="w1" d="M66 48 Q50 2 10 6 Q34 30 66 54Z" fill="url(#fw)"/></svg>`;
const FLIGHT_LINES = [[0, 'The magpie stretches her wings…'], [12, 'Off she flies, over the hills of the internet…'], [30, 'Perching to listen to every second…'], [40, 'Whispering with the words, hunting for the crux…'], [55, 'Sniffing out the glittery bits…'], [72, 'Ooh, a shiny! Polishing it up…'], [96, 'Home to the nest with treasure!']];
const FLIGHT_GEMS = [['💎', 14, 62], ['🪙', 30, 30], ['🔮', 46, 68], ['⭐', 62, 26], ['💍', 78, 60]];
const flight = (() => {
  let el, AC, timer, trail, last = 0, muted = false; try { muted = localStorage.getItem('shiny.mute') === '1'; } catch (e) {}
  const note = (t, f1, f2, dur, type = 'sine', vol = .07) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur * .6); o.frequency.exponentialRampToValueAtTime(f1 * 1.05, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + .03); };
  const sound = kind => {   // tiny synthesised chirps and chimes, no audio files
    if (!AC || muted) return; if (AC.state === 'suspended') AC.resume(); const t = AC.currentTime;
    if (kind === 'chirp') { const n = 2 + Math.floor(Math.random() * 3), b = 2300 + Math.random() * 700; for (let i = 0; i < n; i++) note(t + i * .12, b, b + 900 + Math.random() * 700, .09); }
    else if (kind === 'gem') [880, 1175, 1568].forEach((f, i) => note(t + i * .07, f, f * 1.02, .35, 'triangle', .05));
    else if (kind === 'done') [1000, 1250, 1500, 2000].forEach((f, i) => note(t + i * .1, f, f * 1.3, .18, 'sine', .07));
  };
  const lineFor = p => FLIGHT_LINES.filter(([at]) => p >= at).pop()[1];
  return {
    start() {
      this.end(true); last = 0; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
      el = document.createElement('div'); el.className = 'flight'; el.setAttribute('role', 'status');
      el.innerHTML = `<div class="fscene"><div class="sky">${Array.from({length: 14}, (_, i) => `<i class="st" style="left:${(i * 37 + 9) % 96}%;top:${(i * 23 + 5) % 48}%;animation-delay:${-i * .37}s"></i>`).join('')}<i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i></div>
        <svg class="hills" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 V34 Q50 8 110 30 T230 26 T340 30 T400 22 V60Z" fill="#0b5f61" opacity=".85"/><path d="M0 60 V44 Q70 24 150 42 T300 40 T400 36 V60Z" fill="#073e44"/></svg>
        ${FLIGHT_GEMS.map(([g, x, y]) => `<i class="fg" data-at="${x}" style="left:${x}%;top:${y}%">${g}</i>`).join('')}
        <div class="fnest">🪺</div><div class="fbird" style="left:4%"><div class="fbob">${FLYER}</div></div></div>
        <div class="fline"></div><div class="fsub"></div><button class="fmute" type="button" title="Chirping on/off" aria-label="Toggle chirping">${muted ? '🔇' : '🔊'}</button>`;
      document.body.appendChild(el); el.querySelector('.fmute').onclick = e => { muted = !muted; e.currentTarget.textContent = muted ? '🔇' : '🔊'; try { localStorage.setItem('shiny.mute', muted ? '1' : '0'); } catch (x) {} if (!muted) sound('chirp'); };
      this.update('', 0); sound('chirp');
      let tick = 0; timer = setInterval(() => {   // sparkle trail behind the bird, and a chirp every few seconds
        const b = el.querySelector('.fbird'), sc = el.querySelector('.fscene'); if (!b) return; const r = b.getBoundingClientRect(), s = sc.getBoundingClientRect();
        const i = document.createElement('i'); i.className = 'tr'; i.textContent = ['✦', '✧', '·', '✨'][tick % 4]; i.style.left = (r.left - s.left + 6) + 'px'; i.style.top = (r.top - s.top + r.height * (.45 + Math.random() * .25)) + 'px'; sc.appendChild(i); setTimeout(() => i.remove(), 1400);
        if (++tick % 22 === 0) sound('chirp');
      }, 120);
    },
    update(text, p) {
      if (!el) return; p = Math.max(p, last); last = p; el.querySelector('.fbird').style.left = (4 + Math.min(p, 100) * .74) + '%'; el.querySelector('.fline').textContent = lineFor(p); el.querySelector('.fsub').textContent = text || '';
      el.querySelectorAll('.fg:not(.got)').forEach(g => { if (p >= +g.dataset.at) { g.classList.add('got'); sound('gem'); } });
    },
    async finish() { if (!el) return; el.classList.add('home'); el.querySelector('.fbird').style.left = '80%'; el.querySelector('.fline').textContent = lineFor(100); sound('done'); await wait(1100); this.end(); },
    end(quick) { clearInterval(timer); if (el) { const x = el; el = null; if (quick) x.remove(); else { x.classList.add('bye'); setTimeout(() => x.remove(), 450); } } }
  };
})();
async function send() {
  const status = $('#status'), setP = (t, p) => { status.textContent = t; flight.update(t, p); };
  if (!form.platforms.size) return toast('Pick at least one platform.');
  const id = ytId(form.yt || ''), pod = /^https?:\/\//i.test((form.pod || '').trim()) ? form.pod.trim() : '';
  if (!form.file && !id && !pod) return toast(form.yt ? 'That doesn\'t look like a YouTube link.' : form.pod ? 'That doesn\'t look like a web link.' : 'Give me a file or a link first.');
  form.busy = true; $('#send').disabled = true; flight.start();
  try {
    const m = mem(), src = {id: uid(), added: Date.now(), topic: form.topic.trim(), cands: {}};
    let file = form.file;
    let remote = null;
    if (!file && (pod || id)) {   // a link: the local helper fetches it, listens to it and reports real progress
      setP(pod ? 'Sending the magpie to the podcast…' : 'Sending the magpie to YouTube…', 2);
      try {
        remote = await huntRemote(pod ? 'audio' : 'video', pod || form.yt, setP);
        file = new File([await (await fetch(remote.file)).blob()], (remote.title || (pod ? 'Podcast' : 'YouTube ' + id)).replace(/[\\/:*?"<>|]/g, '') + (pod ? '.mp3' : '.mp4'), {type: pod ? 'audio/mpeg' : 'video/mp4'});
        if (!src.topic) src.topic = remote.title || '';
      } catch (e) {
        if (pod) throw new Error('I couldn\'t fetch that podcast: ' + String(e.message).slice(0, 160) + (/fetch|NetworkError/i.test(e.message) ? ' Is python server.py running?' : ''));
        console.warn('YouTube fetch unavailable:', e.message); toast('Couldn\'t download it (' + e.message.slice(0, 80) + '). Using pacing-based picks.');
      }
    }
    if (file) {
      Object.assign(src, {name: file.name, kind: 'file', media: file.type.startsWith('audio') || /\.(mp3|m4a|wav)$/i.test(file.name) ? 'audio' : 'video'});
      if (remote) {   // the helper already listened: durations, loudness and words came with the file
        Object.assign(src, {duration: remote.duration, energy: remote.energy, step: remote.step, transcript: remote.transcript});
        if (remote.transcriptError) src.transcriptError = remote.transcriptError;
        blobs[src.id] = {url: URL.createObjectURL(file), media: src.media}; idbPut(src.id, file);
      } else {
      setP('Listening to every second…', 30);
      const a = await analyzeFile(file, t => setP(t, 30));
      Object.assign(src, {duration: a.duration, energy: a.energy, step: a.step});
      blobs[src.id] = {url: URL.createObjectURL(file), media: src.media}; idbPut(src.id, file);
      {   // the transcript drives both the picks (what matters) and the on-video text
        setP(`Listening to the words to find what matters (about ${Math.max(1, Math.round(src.duration / 60 / 5))} min)…`, 38);
        try { const r = await fetch('/api/transcribe', {method: 'POST', body: file}), j = await r.json(); if (!r.ok) throw new Error(j.error); src.transcript = j.segments; }
        catch (e) { console.warn(e); src.transcriptError = String(e.message).slice(0, 90); }
      }
      }
    } else {
      setP('Asking YouTube how long it is…', 20);
      Object.assign(src, {name: 'YouTube ' + id, kind: 'yt', ytId: id, media: 'video', duration: await ytDuration(id)});
    }
    src.topic = cleanTitle(src.topic || src.name);
    let i = 0;
    for (const p of form.platforms) {
      setP(`Picking shinies for ${PLATFORMS[p].name}…`, 72 + 8 * (i++ / form.platforms.size));
      src.cands[p] = src.kind === 'file' ? ((src.transcript || []).length >= 3 && findByMeaning(src.transcript, src.duration, p, m, src.topic, src.energy, src.step)) || findCandidates(src.energy, src.step, src.duration, p, m) : heuristicCandidates(src.duration, p, m);
      src.cands[p].slice(0, 3).forEach((c, ci) => makeShiny(src, p, ci, m));
    }
    S.sources.unshift(src); const mine = S.shinies.filter(s => s.sourceId === src.id);
    for (let k = 0; k < mine.length; k++) { setP('Polishing thumbnails…', 82 + 17 * k / mine.length); mine[k].thumb = await makeThumb(src, mine[k].start); mine[k].thumbV = 3; }
    save(); setP('Done!', 100); await flight.finish();
    form.file = null; form.yt = ''; form.pod = ''; form.topic = ''; form.busy = false; showForm = false; go('hoard'); confetti();
    const loud = src.kind === 'file' && !mine.some(s => (src.cands[s.platform][s.candIdx] || {}).by === 'meaning');
    toast(loud ? `I couldn't read the words (${src.transcriptError || 'too little speech'}), so these are picked by loudness and may miss the point. Run python server.py and retry.` : `Found ${mine.length} shinies ✨ Hover a tile to peek, click to play.`);
  } catch (e) {
    console.error(e); form.busy = false; $('#send').disabled = false; flight.end(true);
    status.textContent = e.name === 'EncodingError' || /decode/i.test(e.message) ? 'I couldn\'t decode that file\'s audio. Try an MP4 (H.264/AAC) or MP3.' : 'Oops: ' + e.message;
  }
}
function makeShiny(src, platform, ci, m) {
  const c = src.cands[platform][ci], tone = form.tone, seed = src.id + ci;
  const cp = writeCopy({topic: src.topic, platform, tone, seed, segs: src.transcript, start: c.start, end: c.end}, m);
  const ov = form.wantText && src.kind === 'file' && src.media === 'video' ? autoOverlays({segs: src.transcript, topic: src.topic, start: c.start, end: c.end, platform, mem: m}) : null;
  S.shinies.push({id: uid(), sourceId: src.id, platform, candIdx: ci, overlays: ov && ov.overlays, ovMode: ov && ov.mode, ovV: 2, start: c.start, end: c.end, base: {start: c.start, end: c.end}, caption: cp.caption, tags: cp.tags, tone, gen: {caption: cp.caption, tags: cp.tags, tone}, swaps: 0, why: c.why, status: 'draft', seed});
}

/* ---------- framing: crop only when little of the picture is lost, otherwise keep the original shape ---------- */
const RATIO = {shorts: 9 / 16, reels: 9 / 16, linkedin: 1, x: 16 / 9};
const srcAr = src => src && src.vw && src.vh ? src.vw / src.vh : 0;
function frameOf(s, src) {
  if (s.frame) return s.frame; const a = srcAr(src), r = RATIO[s.platform];
  return !a || Math.min(a / r, r / a) >= .7 ? 'crop' : 'native';   // keep >=70% of the picture or leave it uncropped
}
const frameAr = (s, src) => frameOf(s, src) === 'native' ? srcAr(src) : RATIO[s.platform];
async function probeDims(src) {
  if (src.probing || src.vw || src.media !== 'video' || !blobs[src.id]) return; src.probing = true;
  try { const v = document.createElement('video'); v.preload = 'metadata'; v.src = blobs[src.id].url; await onceEv(v, 'loadedmetadata'); src.vw = v.videoWidth; src.vh = v.videoHeight; save(); render(); } catch (e) { /* leave cropped */ }
}

/* ---------- text overlays & discard ---------- */
const syncFull = s => (s.overlays || []).forEach(o => { if (o.full) { o.from = 0; o.to = s.end - s.start; } });   // text meant for the whole clip follows trims
const ovHTML = o => `<div class="ov ${o.pos}" style="--sz:calc(${o.size} / 720 * 100cqw);color:${esc(o.color)};font-family:'${esc(o.font)}',sans-serif;font-weight:${fontWeight(o)}">${esc(o.text)}</div>`;
const ovNote = (s, src) => !s.overlays ? '' : s.ovMode === 'transcript' ? 'Title plus the main ideas in this clip. Edit or remove it.' : s.ovMode === 'topic' ? 'Uses the video title. Edit or remove it.' : 'Your text.';
function layersHTML(s) {
  const L = s.overlays || []; if (!L.length) return '<p class="small muted">No text on this clip. Add some, or leave it clean.</p>';
  return L.map(o => `<div class="layer" data-oid="${o.id}"><input type="text" data-k="text" value="${esc(o.text)}" aria-label="Text">
    <div class="row small"><label>Colour <input type="color" data-k="color" value="${esc(o.color)}"></label>
    <label>Font <select data-k="font">${FONTS.map(([f, n]) => `<option value="${f}" ${o.font === f ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Size <input type="range" data-k="size" min="20" max="120" value="${o.size}"> <b>${o.size}</b></label>
    <label>Position <select data-k="pos">${['top', 'middle', 'bottom'].map(p => `<option ${o.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <label>Shows <input type="number" data-k="from" step="0.5" min="0" value="${+o.from.toFixed(1)}" style="width:90px"> to <input type="number" data-k="to" step="0.5" min="0" value="${+o.to.toFixed(1)}" style="width:90px"> s</label>
    <button class="btn ghost sm" data-x="rmtext" data-oid="${o.id}">🗑 Remove</button></div></div>`).join('');
}
function textPanel() {
  const {s, src} = ed;
  if (src.media !== 'video' || src.kind !== 'file') return `<div class="textpanel small muted">${src.media === 'audio' ? 'Text on video applies to video clips.' : 'Text on video needs the downloaded file, which isn\'t available for this link.'}</div>`;
  return `<div class="textpanel"><div class="row"><h3 style="margin:0">Text on the video ✍️</h3><span class="sp"></span><button class="btn ghost sm" data-x="addtext">+ Add text</button><button class="btn ghost sm" data-x="resum">↻ Re-write from this clip</button></div><p class="small muted" id="ovnote">${esc(ovNote(s, src))}</p><div id="layers">${layersHTML(s)}</div></div>`;
}
function drawOverlays(cx, ow, oh, t, list) {   // must match the .ov CSS so the preview is what you download
  const k = ow / 720; cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.lineJoin = 'round';
  for (const o of list) {
    if (!o.text || t < o.from || t > o.to) continue; const px = o.size * k; cx.font = `${fontWeight(o)} ${px}px "${o.font}"`;
    const lines = [], maxW = ow * .88; let cur = '';
    for (const w of o.text.split(/\s+/)) { const tl = cur ? cur + ' ' + w : w; if (cx.measureText(tl).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tl; } if (cur) lines.push(cur);
    const lh = px * 1.15, h = lines.length * lh, y0 = o.pos === 'top' ? oh * .10 : o.pos === 'middle' ? (oh - h) / 2 : oh * .88 - h;
    lines.forEach((ln, i) => { const y = y0 + i * lh; cx.lineWidth = px / 6; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.strokeText(ln, ow / 2, y); cx.fillStyle = o.color; cx.fillText(ln, ow / 2, y); });
  }
}
function discardShiny(id) {
  const i = S.shinies.findIndex(x => x.id === id); if (i < 0) return; const [s] = S.shinies.splice(i, 1), learned = S.finals.filter(f => f.shinyId === id);
  S.finals = S.finals.filter(f => f.shinyId !== id);   // what the notebook learned from this clip goes with it
  stopPlay(); save(); render();
  toast('Shiny discarded', {label: 'Undo', fn: () => { S.shinies.splice(Math.min(i, S.shinies.length), 0, s); S.finals.push(...learned); save(); render(); }});
}
function clearDrafts() {
  const drafts = S.shinies.filter(s => s.status === 'draft'); if (!drafts.length) return;
  if (!confirm(`Discard ${drafts.length} unfinalised shinies? (Finalised ones stay.)`)) return;
  const before = S.shinies.slice(), beforeFinals = S.finals.slice(); S.shinies = S.shinies.filter(s => s.status !== 'draft'); S.finals = S.finals.filter(f => S.shinies.some(s => s.id === f.shinyId)); stopPlay(); save(); render();
  toast(`Discarded ${drafts.length} drafts`, {label: 'Undo', fn: () => { S.shinies = before; S.finals = beforeFinals; save(); render(); }});
}

/* ---------- editor ---------- */
let ed = null;
function openEditor(id) {
  stopPlay(); const s = shinyOf(id); if (!s) return; ed = {s, src: srcOf(s.sourceId)};
  const d = $('#dlg'); d.innerHTML = editorHTML(); if (!d.open) d.showModal(); bindEditor();
}
function stageHTML() {
  const {s, src} = ed, b = blobs[src.id];
  if (src.kind === 'yt') return `<div class="stage"><iframe id="pv" height="320" src="https://www.youtube.com/embed/${src.ytId}?start=${Math.floor(s.start)}&end=${Math.ceil(s.end)}&rel=0" allowfullscreen></iframe></div>`;
  if (!b) return `<div class="stage" style="padding:40px;color:#fff;text-align:center">The source file isn't available any more. Re-attach it from the tile menu.</div>`;
  const ar = frameAr(s, src) || RATIO[s.platform];   // preview matches the download
  return b.media === 'video' ? `<div class="stage"><div class="frame" style="--ar:${ar}"><video id="pv" src="${b.url}" controls playsinline></video><div id="ovl"></div></div></div>` : `<div class="stage"><audio id="pv" src="${b.url}" controls></audio></div>`;
}
function frameNote(s, src) {
  if (frameOf(s, src) === 'crop') return srcAr(src) && Math.abs(srcAr(src) / RATIO[s.platform] - 1) > .05 ? 'Cropped to the centre of the picture. Use "Original shape" if something important is at the edges.' : '';
  return s.platform === 'reels' || s.platform === 'shorts' ? `Kept in its original shape so nothing is lost. ${s.platform === 'reels' ? 'Post it as an Instagram video post (it also works as a Reel, with bars above and below).' : 'Upload it as a normal YouTube video, or as a Short with bars above and below.'}` : 'Kept in its original shape so nothing is lost.';
}
function editorHTML() {
  const {s, src} = ed, P = PLATFORMS[s.platform], cands = src.cands[s.platform] || [];
  return `<div class="dlg"><div class="row"><h2 style="margin:0">Polish this shiny ✨</h2>${pill(s.platform)}<span class="sp"></span><button class="btn ghost sm" data-x="close">Close</button></div>
  ${stageHTML()}
  ${src.energy ? '<canvas class="wave" id="wave" width="1600" height="168"></canvas>' : ''}
  <div class="row small" style="margin-top:6px"><span id="range"></span><span class="sp"></span><span>Aim for ${P.target[0]}–${P.target[1]}s on ${P.short}. <b id="len" class="len"></b></span></div>
  <label class="f">Start <span id="sv" class="muted"></span></label><input type="range" id="st" min="0" max="${src.duration}" step="0.1" value="${s.start}">
  <label class="f">End <span id="ev" class="muted"></span></label><input type="range" id="en" min="0" max="${src.duration}" step="0.1" value="${s.end}">
  ${src.media === 'video' && src.kind === 'file' ? `<label class="f">Framing</label><select id="frm"><option value="native" ${frameOf(s, src) === 'native' ? 'selected' : ''}>Original shape, nothing cut off${srcAr(src) ? ` (${srcAr(src) > 1.05 ? 'landscape' : srcAr(src) < .95 ? 'portrait' : 'square'})` : ''}</option><option value="crop" ${frameOf(s, src) === 'crop' ? 'selected' : ''}>Crop to ${P.ratio.split(' ')[0]} (fills the ${P.short} frame)</option></select><p class="small muted" id="frmnote">${frameNote(s, src)}</p>` : ''}
  <div class="row" style="margin-top:8px"><button class="btn ghost sm" data-x="play">▶ Play clip</button><button class="btn ghost sm" data-x="reset">Back to magpie's pick</button></div>
  <label class="f">Other shinies I found for ${P.short}</label>
  <div class="chips">${cands.map((c, i) => `<span class="chip ${i === s.candIdx ? 'on' : ''}" data-x="cand" data-i="${i}">${fmt(c.start)}–${fmt(c.end)}</span>`).join('')}</div>
  <div class="why" style="margin-top:10px" id="why"><b>Why:</b> ${esc(s.why)}</div>
  ${textPanel()}
  <div class="grid g2"><div><label class="f">Caption</label><textarea id="cap">${esc(s.caption)}</textarea><div class="small muted"><span id="cc"></span></div></div>
  <div><label class="f">Tone</label><select id="tone">${Object.entries(TONES).map(([k, t]) => `<option value="${k}" ${s.tone === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
  <button class="btn ghost sm" data-x="rewrite" style="margin-top:8px">↻ Rewrite in this tone</button>
  <label class="f">Hashtags</label><input type="text" id="tags" value="${esc(s.tags.join(' '))}"></div></div>
  <div class="row" style="margin-top:18px"><button class="btn" data-x="final">Finalise ✨</button><button class="btn ghost" data-x="draft">Save draft</button><button class="btn ghost" data-x="discard">🗑 Discard</button><span class="sp"></span>
   <button class="btn ghost sm" data-x="dl" ${src.kind === 'yt' ? 'disabled title="Needs the downloaded file"' : ''}>⬇ Download clip</button>
   <button class="btn ghost sm" data-x="copy">Copy caption</button><button class="btn ghost sm" data-x="open">Open ${P.short} ↗</button></div>
  <p class="small muted" id="note">${src.kind === 'yt' ? 'This link couldn\'t be downloaded, so I can only preview it. If the preview says "unavailable", the owner blocked embedding.' : `Download records in real time as WebM${frameOf(s, src) === 'native' ? ', in the original shape' : P.ratio === '9:16' ? ', cropped to vertical 9:16' : s.platform === 'linkedin' ? ', cropped to square' : ''}.`}</p></div>`;
}
function bindEditor() {
  const d = $('#dlg'), {s, src} = ed, P = PLATFORMS[s.platform], pv = () => $('#pv');
  const draw = () => {
    const c = $('#wave'); if (!c) return; const x = c.getContext('2d'), W = c.width, H = c.height, e = src.energy, n = e.length; x.clearRect(0, 0, W, H);
    const t2x = t => t / src.duration * W; x.fillStyle = 'rgba(255,95,168,.2)'; x.fillRect(t2x(s.start), 0, t2x(s.end) - t2x(s.start), H);
    const bw = W / Math.min(n, 400), per = n / Math.min(n, 400);
    for (let i = 0; i < Math.min(n, 400); i++) { let v = 0; for (let k = 0; k < per; k++) v = Math.max(v, e[Math.floor(i * per + k)] || 0); const h = Math.max(2, v * H * .9), t = i * per * src.step; x.fillStyle = t >= s.start && t <= s.end ? '#e9a820' : '#d9d2c0'; x.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 1), h); }
  };
  const upd = () => {
    if (s.end < s.start + .5) s.end = Math.min(src.duration, s.start + .5);
    const len = s.end - s.start; $('#sv').textContent = fmt(s.start); $('#ev').textContent = fmt(s.end); $('#range').textContent = `${fmt(s.start)} → ${fmt(s.end)}`;
    const L = $('#len'), ok = len >= P.target[0] && len <= P.target[1]; L.className = 'len ' + (ok ? 'ok' : 'warn'); L.textContent = `${len.toFixed(1)}s` + (ok ? ' ✓' : len > P.max ? ' (over limit)' : len > P.target[1] ? ' (a bit long)' : ' (a bit short)');
    $('#cc').textContent = `${s.caption.length} characters`; draw();
  };
  const set = (k, v) => { s[k] = v; $('#st').value = s.start; $('#en').value = s.end; upd(); syncFull(s); if (typeof drawLayers === 'function' && !document.activeElement?.closest('#layers')) drawLayers(); };
  upd();
  $('#st').oninput = e => set('start', Math.min(+e.target.value, s.end - .5));
  $('#en').oninput = e => set('end', Math.max(+e.target.value, s.start + .5));
  if ($('#frm')) $('#frm').onchange = e => { s.frame = e.target.value; const f = $('.stage .frame'); if (f) f.style.setProperty('--ar', frameAr(s, src)); $('#frmnote').textContent = frameNote(s, src); };
  const ytRefresh = () => { if (src.kind === 'yt') pv().src = `https://www.youtube.com/embed/${src.ytId}?start=${Math.floor(s.start)}&end=${Math.ceil(s.end)}&rel=0&autoplay=1`; };
  $('#st').onchange = $('#en').onchange = ytRefresh;
  $('#cap').oninput = e => { s.caption = e.target.value; upd(); };
  $('#tags').oninput = e => s.tags = e.target.value.split(/\s+/).filter(Boolean);
  $('#tone').onchange = e => { s.tone = e.target.value; rewrite(); };
  function rewrite() { s.seed += 'x'; const cp = writeCopy({topic: src.topic, platform: s.platform, tone: s.tone, seed: s.seed, segs: src.transcript, start: s.start, end: s.end}, mem()); s.caption = cp.caption; s.tags = cp.tags; s.gen = {caption: cp.caption, tags: cp.tags, tone: s.tone}; $('#cap').value = s.caption; $('#tags').value = s.tags.join(' '); upd(); }
  const renderOvl = () => {   // while playing show only what's on screen now; when paused show every layer so it can be edited
    const f = $('#ovl'), v = pv(); if (!f || !v) return; const t = v.currentTime - s.start, live = !v.paused && t >= 0;
    f.innerHTML = (s.overlays || []).filter(o => !live || (t >= o.from && t <= o.to)).map(ovHTML).join('');
  };
  const drawLayers = () => { if ($('#layers')) $('#layers').innerHTML = layersHTML(s); renderOvl(); };
  if (pv() && src.media === 'video') ['timeupdate', 'play', 'pause', 'seeked', 'loadedmetadata'].forEach(ev => pv().addEventListener(ev, renderOvl));
  renderOvl();
  if ($('#layers')) $('#layers').oninput = e => {
    const k = e.target.dataset.k, row = e.target.closest('.layer'); if (!k || !row) return;
    const o = s.overlays.find(x => x.id === row.dataset.oid); o[k] = ['size', 'from', 'to'].includes(k) ? +e.target.value : e.target.value;
    if (k === 'from' || k === 'to') o.full = false;   // a hand-set time window no longer follows the clip's length
    if (k === 'size') row.querySelector('b').textContent = o.size; renderOvl();
  };
  let stopper;
  const closeEd = async () => { d.close(); save(); render(); await refreshThumb(s); render(); };
  d.onclick = async e => {
    const x = e.target.closest('[data-x]'); if (!x) return; const a = x.dataset.x;
    if (a === 'close') closeEd();
    else if (a === 'play') {
      if (src.kind === 'yt') return ytRefresh(); const m = pv(); if (!m) return; m.currentTime = s.start; m.play(); clearInterval(stopper);
      stopper = setInterval(() => { if (m.currentTime >= s.end || m.paused) { m.pause(); clearInterval(stopper); } }, 80);
    } else if (a === 'reset') { set('start', s.base.start); set('end', s.base.end); ytRefresh(); }
    else if (a === 'rewrite') rewrite();
    else if (a === 'cand') { const i = +x.dataset.i, c = src.cands[s.platform][i]; if (i === s.candIdx) return; s.candIdx = i; s.swaps++; s.base = {start: c.start, end: c.end}; s.why = c.why; s.start = c.start; s.end = c.end; syncFull(s); save(); openEditor(s.id); }
    else if (a === 'addtext') { const f = (s.overlays || [])[0]; (s.overlays ||= []).push({id: uid(), text: 'Your text', font: f?.font || 'Nunito', color: f?.color || '#ffffff', size: f?.size || 48, pos: 'middle', from: 0, to: s.end - s.start, full: true}); drawLayers(); }
    else if (a === 'rmtext') { s.overlays = s.overlays.filter(o => o.id !== x.dataset.oid); drawLayers(); }
    else if (a === 'resum') { const r = autoOverlays({segs: src.transcript, topic: src.topic, start: s.start, end: s.end, platform: s.platform, mem: {...mem(), ovAversion: false}}); s.overlays = r.overlays; s.ovMode = r.mode; drawLayers(); $('#ovnote').textContent = ovNote(s, src); }
    else if (a === 'discard') { d.close(); discardShiny(s.id); }
    else if (a === 'draft') { save(); toast('Draft saved'); }
    else if (a === 'final') { finalize(s); confetti(); closeEd(); }
    else if (a === 'copy') navigator.clipboard.writeText(s.caption + '\n\n' + s.tags.join(' ')).then(() => toast('Caption copied 📋'), () => toast('Copy blocked by the browser'));
    else if (a === 'open') { navigator.clipboard.writeText(s.caption + '\n\n' + s.tags.join(' ')).catch(() => {}); window.open(openUrl(s), '_blank', 'noopener'); toast('Caption copied. Upload your downloaded clip there.'); }
    else if (a === 'dl') downloadClip(x);
  };
  d.addEventListener('close', () => { clearInterval(stopper); if (pv() && pv().pause) pv().pause(); }, {once: true});
}
function openUrl(s) {
  return s.platform === 'x' ? `https://x.com/intent/post?text=${encodeURIComponent(s.caption + ' ' + s.tags.join(' '))}` : s.platform === 'linkedin' ? `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(s.caption + '\n\n' + s.tags.join(' '))}` : PLATFORMS[s.platform].link;
}
function finalize(s) {
  const g = s.gen, rec = {id: uid(), shinyId: s.id, platform: s.platform, dur: s.end - s.start, startShift: s.start - s.base.start, endShift: s.end - s.base.end, swapped: s.swaps > 0,
    ov: s.overlays ? (s.overlays.length ? {n: s.overlays.length, font: s.overlays[0].font, color: s.overlays[0].color, size: s.overlays[0].size} : {n: 0}) : undefined,
    tone: s.tone, toneChanged: s.tone !== g.tone, capBefore: g.caption.length, capAfter: s.caption.length, emojiBefore: emojiCount(g.caption), emojiAfter: emojiCount(s.caption), tagsBefore: g.tags.length, tagsAfter: s.tags.length, ts: Date.now()};
  S.finals = S.finals.filter(f => f.shinyId !== s.id); S.finals.push(rec); if (s.status === 'draft') s.status = 'final'; save();
  const notes = [];
  if (rec.endShift < -.8) notes.push(`trimmed ${Math.abs(rec.endShift).toFixed(1)}s off the end`);
  if (rec.startShift > .8) notes.push(`started ${rec.startShift.toFixed(1)}s later`);
  if (rec.swapped) notes.push('swapped to another shiny');
  if (rec.capAfter < rec.capBefore * .8) notes.push('tightened the caption');
  toast(notes.length ? `Noted in my notebook: you ${notes.join(', ')} 📓` : 'Finalised 💎 Nothing to learn this time, I nailed it.');
}
async function downloadClip(btn) {
  const {s, src} = ed, b = blobs[src.id]; if (!b) return toast('The source file isn\'t available.');
  if (!window.MediaRecorder) return toast('This browser can\'t record clips. Try Chrome or Edge.');
  const old = btn.textContent; btn.disabled = true; let draw;
  try {
    const el = document.createElement(b.media === 'video' ? 'video' : 'audio'); el.src = b.url; el.playsInline = true; el.preload = 'auto';
    await onceEv(el, 'loadedmetadata'); el.currentTime = s.start; await onceEv(el, 'seeked');
    if (!el.captureStream) throw new Error('captureStream unsupported');
    if (!src.vw && b.media === 'video') { src.vw = el.videoWidth; src.vh = el.videoHeight; }
    const native = b.media === 'video' && frameOf(s, src) === 'native', ratio = native ? el.videoWidth / el.videoHeight : RATIO[s.platform];
    await Promise.all((s.overlays || []).map(o => document.fonts.load(`${fontWeight(o)} 40px "${o.font}"`)));
    await el.play(); let stream = el.captureStream();
    if (b.media === 'video' && ratio) {   // crop to the platform's frame
      const vw = el.videoWidth, vh = el.videoHeight, ow = native ? Math.min(1280, vw) & ~1 : ratio > 1 ? 1280 : 720, oh = Math.round(ow / ratio) & ~1, cv = document.createElement('canvas'), cx = cv.getContext('2d'); cv.width = ow; cv.height = oh;
      let sw, sh; if (vw / vh > ratio) { sh = vh; sw = vh * ratio; } else { sw = vw; sh = vw / ratio; }
      const sx = (vw - sw) / 2, sy = (vh - sh) / 2; draw = setInterval(() => { cx.drawImage(el, sx, sy, sw, sh, 0, 0, ow, oh); drawOverlays(cx, ow, oh, el.currentTime - s.start, s.overlays || []); }, 33);
      const cs = cv.captureStream(30); stream.getAudioTracks().forEach(t => cs.addTrack(t)); stream = cs;
    }
    const mimes = b.media === 'video' ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm'];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m)), rec = new MediaRecorder(stream, {mimeType: mime}), chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r); rec.start();
    await new Promise(r => { const t = setInterval(() => { const left = s.end - el.currentTime; btn.textContent = `Recording… ${Math.max(0, Math.ceil(left))}s`; if (left <= 0 || el.ended) { clearInterval(t); r(); } }, 100); });
    el.pause(); rec.stop(); await done; clearInterval(draw);
    const url = URL.createObjectURL(new Blob(chunks, {type: mime.split(';')[0]})), a = document.createElement('a');
    a.href = url; a.download = `shiny-${s.platform}-${fmt(s.start).replace(':', 'm')}.webm`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Clip downloaded ⬇'); confetti(14, innerWidth / 2, innerHeight / 2, 400);
  } catch (e) { console.error(e); clearInterval(draw); toast('Couldn\'t record this clip: ' + e.message); }
  btn.disabled = false; btn.textContent = old;
}

/* ---------- notebook (header button) ---------- */
function notebookView() {
  const m = mem(), f = S.finals.slice().reverse().slice(0, 8);
  return `<h1 style="font-size:2.2rem"><span class="rainbow">Brand memory notebook</span> 📓</h1><p class="muted">Every time you finalise a clip, I compare it with what I suggested and write down what you changed. These notes steer my next picks and captions.</p>
  <div class="grid g3" style="margin:16px 0"><div class="card"><div class="stat">${m.n}</div>clips finalised</div>
  <div class="card"><div class="stat">${m.topTone ? TONES[m.topTone[0]].label : '–'}</div>favourite tone</div>
  <div class="card"><div class="stat" style="font-size:1.2rem">${Object.keys(m.durByPlat).length ? Object.entries(m.durByPlat).map(([p, d]) => PLATFORMS[p].short + ' ' + Math.round(d.med) + 's').join(' · ') : '–'}</div>typical lengths</div></div>
  ${m.notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}
  ${f.length ? `<h2 style="margin-top:24px">Recent edits</h2><div class="card" style="overflow:auto"><table><tr><th>Platform</th><th>Length</th><th>Start Δ</th><th>End Δ</th><th>Caption Δ</th><th>Tone</th><th>Swapped</th></tr>${f.map(r => `<tr><td>${pill(r.platform)}</td><td>${r.dur.toFixed(1)}s</td><td>${r.startShift.toFixed(1)}s</td><td>${r.endShift.toFixed(1)}s</td><td>${r.capAfter - r.capBefore} chars</td><td>${esc(TONES[r.tone]?.label)}</td><td>${r.swapped ? 'yes' : '–'}</td></tr>`).join('')}</table></div>
  <p><button class="btn ghost sm" data-act="forget">Wipe my notebook</button></p>` : ''}`;
}
function openNotebook() { const d = $('#dlg'); d.onclick = null; d.innerHTML = `<div class="dlg">${notebookView()}<p><button class="btn" id="nbx">Close</button></p></div>`; if (!d.open) d.showModal(); $('#nbx').onclick = () => d.close(); }

/* ---------- nest wall ---------- */
/* The magpie dresses for the platform: beach holiday for Reels, hoodie for Shorts, blazer for LinkedIn, tee and cap for X. Flat fills only, so it is safe to repeat on a page. */
const MP = {
  tail: '<path d="M40 62 L3 91 L14 97 L52 76Z" fill="#14707a"/>',
  body: '<ellipse cx="62" cy="58" rx="30" ry="21" fill="#16181f" transform="rotate(-12 62 58)"/><ellipse cx="68" cy="67" rx="17" ry="11" fill="#fff" transform="rotate(-12 68 67)"/><path d="M38 52 Q58 34 84 52 Q62 68 38 52Z" fill="#1d6f9b"/>',
  torso: c => `<path d="M36 52 Q60 36 88 52 L88 68 Q62 82 38 68Z" fill="${c}"/>`,
  head: '<circle cx="88" cy="40" r="15" fill="#16181f"/><circle cx="93" cy="37" r="4" fill="#fff"/><circle cx="94" cy="37" r="1.9" fill="#16181f"/><path d="M101 38 L117 43 L101 48Z" fill="#2a2d45"/>',
  legs: '<path d="M60 78 v14 M70 77 v15" stroke="#2a2d45" stroke-width="3" stroke-linecap="round"/>'
};
const OUTFIT = {
  reels: MP.tail + MP.body + '<path d="M52 63 Q68 77 86 63 L88 70 Q68 84 50 72Z" fill="#ff7a59"/><circle cx="62" cy="71" r="2" fill="#fff"/><circle cx="72" cy="73" r="2" fill="#fff"/>' + MP.head
    + '<rect x="84" y="32" width="19" height="10" rx="4.5" fill="#f0a21f" stroke="#0e0f14" stroke-width="2"/><path d="M88 35 l4 0" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="88" cy="27" rx="21" ry="5" fill="#e9c46a"/><path d="M77 27 Q88 8 99 27Z" fill="#f4d58d"/><path d="M78 24 h20" stroke="#d4503f" stroke-width="3"/>' + MP.legs,
  linkedin: MP.tail + MP.body + MP.torso('#3d5a9e') + '<path d="M38 52 Q58 40 76 54 Q58 66 38 56Z" fill="#5173bb"/><path d="M79 52 L92 57 L84 74Z" fill="#fff"/><path d="M84 58 l5 1.5 -2.5 12 -4 -4z" fill="#d4503f"/><path d="M79 52 L77 66 L84 74" stroke="#22335c" stroke-width="2" fill="none"/>' + MP.head + MP.legs,
  shorts: MP.tail + MP.body + MP.torso('#0f8b8d') + '<path d="M38 52 Q58 40 76 54 Q58 66 38 56Z" fill="#14a3a5"/><path d="M58 64 h22 l-3 10 h-16z" fill="#0b6e70"/><circle cx="88" cy="40" r="19" fill="#0f8b8d"/>' + MP.head + '<path d="M85 56 v10 M90 56 v9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' + MP.legs,
  x: MP.tail + MP.body + MP.torso('#f0b429') + '<path d="M38 52 Q58 40 76 54 Q58 66 38 56Z" fill="#f7c64a"/><path d="M52 58 l22 6" stroke="#b9810c" stroke-width="1.5"/>' + MP.head + '<path d="M74 31 Q88 12 103 30Z" fill="#d4503f"/><path d="M96 29 h18 l-1 4 h-17z" fill="#a73a2c"/>' + MP.legs
};
const dressed = p => `<svg class="mp" viewBox="0 0 120 100" aria-hidden="true">${OUTFIT[p] || OUTFIT.reels}</svg>`;
const thumbing = new Set();
function ensureThumb(s) {   // a shiny can lack a thumbnail (e.g. made before thumbnails existed); draw one from its source once
  if (s.thumbV >= 3 || thumbing.has(s.id) || !blobs[s.sourceId]) return; thumbing.add(s.id);
  ensureThumb.q = (ensureThumb.q || Promise.resolve()).then(() => refreshThumb(s)).then(() => { clearTimeout(ensureThumb.t); ensureThumb.t = setTimeout(() => { if (S.nav === 'nest' || S.nav === 'hoard') render(); }, 400); });
}
const latestShiny = platform => S.shinies.filter(s => s.platform === platform).sort((a, b) => (srcOf(b.sourceId)?.added || 0) - (srcOf(a.sourceId)?.added || 0))[0];
function postChip(p) {
  const own = p.shinyId && shinyOf(p.shinyId), s = own || latestShiny(p.platform), src = s && srcOf(s.sourceId);   // an unlinked post borrows the newest clip for its platform
  if (s) ensureThumb(s);
  const img = s && (s.thumb || (src && src.kind === 'yt' ? `https://i.ytimg.com/vi/${src.ytId}/hqdefault.jpg` : ''));
  return `<span class="ev ${p.platform} ${p.status}" data-act="editpost" data-id="${p.id}" title="${esc(p.title)} · ${PLATFORMS[p.platform].short}${p.status === 'posted' ? ' · posted' : ' · planned'}${own || !s ? '' : ' · thumbnail is your latest ' + PLATFORMS[p.platform].short + ' clip, open the post to link a clip'}" aria-label="${esc(p.title)}">
    <span class="th none"><b>▶</b></span>${img ? `<img class="im" src="${esc(img)}" alt="" onerror="this.remove()">` : ''}<span class="tt">${esc((src && src.topic) || p.title)}</span>${p.status === 'posted' ? '<i class="ok">✓</i>' : ''}${dressed(p.platform)}</span>`;
}
let calM = new Date(); calM.setDate(1);
const nf = {plat: new Set(Object.keys(PLATFORMS)), status: 'all'};   // Nest Wall filters: which platforms and which status to show
function legendHTML() {
  const mine = S.posts.filter(p => p.date.slice(0, 7) === dstr(calM).slice(0, 7)), cnt = k => mine.filter(p => p.platform === k).length;
  return `<div class="legend"><div class="chips">${Object.entries(PLATFORMS).map(([k, p]) => `<button class="chip lg ${nf.plat.has(k) ? 'on' : 'off'}" data-nf="${k}" title="${nf.plat.has(k) ? 'Hide' : 'Show'} ${p.name}">${dressed(k)}<span>${p.short}</span><em>${cnt(k)}</em></button>`).join('')}</div>
  <div class="chips">${[['all', 'All'], ['posted', '✓ Posted'], ['planned', 'Lined up']].map(([k, l]) => `<button class="chip ${nf.status === k ? 'on' : ''}" data-ns="${k}">${l}</button>`).join('')}${nf.plat.size < 4 || nf.status !== 'all' ? '<button class="btn ghost sm" data-nf="all">Show everything</button>' : ''}</div></div>`;
}
function nestView() {
  const y = calM.getFullYear(), mo = calM.getMonth(), first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate(), t = today(), cells = [];
  for (let i = 0; i < first; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(dstr(new Date(y, mo, d)));
  return `<div class="row"><h1 style="margin:0"><span class="rainbow">The Nest Wall</span></h1><span class="sp"></span><button class="btn ghost sm" data-act="prev">←</button><b>${calM.toLocaleString('default', {month: 'long', year: 'numeric'})}</b><button class="btn ghost sm" data-act="next">→</button><button class="btn sm" data-act="plan">+ Add a post</button></div>
  <p class="muted">Everything you've posted or have lined up. Tap a day to add one.</p>${nudgeHTML()}${legendHTML()}
  <div class="cal" style="margin-top:12px">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="dow">${d}</div>`).join('')}${cells.map(c => c ? `<div class="day ${c === t ? 'today' : ''}" data-act="plan" data-date="${c}"><div class="n">${+c.slice(8)}</div>${S.posts.filter(p => p.date === c && nf.plat.has(p.platform) && (nf.status === 'all' || p.status === nf.status)).map(postChip).join('')}</div>` : '<div></div>').join('')}</div>`;
}
function openSched(o = {}) {
  const post = o.postId && S.posts.find(p => p.id === o.postId), finals = S.shinies.slice().sort((a, b) => (a.status === 'draft') - (b.status === 'draft'));
  const cur = post || {platform: o.platform || 'reels', date: o.date || today(), status: 'planned', title: '', shinyId: o.shinyId || ''};
  if (!post && !o.shinyId && !o.platform) { const l = latestShiny(cur.platform); if (l) cur.shinyId = l.id; }
  if (!post && cur.shinyId) { const s = shinyOf(cur.shinyId); cur.platform = s.platform; cur.title = s.caption.split('\n')[0].slice(0, 40); }
  const d = $('#dlg'); d.onclick = null; d.innerHTML = `<div class="dlg"><h2>${post ? 'Edit' : 'Add'} a post</h2>
  <label class="f">Clip for this post (shows as its thumbnail)</label><select id="sh"><option value="">Something else</option>${finals.map(s => `<option value="${s.id}" ${s.id === cur.shinyId ? 'selected' : ''}>${PLATFORMS[s.platform].short}${s.status === 'draft' ? ' (draft)' : ''}: ${esc(s.caption.split('\n')[0].slice(0, 40))}</option>`).join('')}</select>
  <label class="f">Platform</label><select id="pf">${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}" ${cur.platform === k ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
  <label class="f">Title</label><input type="text" id="ti" value="${esc(cur.title)}" placeholder="Short label">
  <label class="f">Date</label><input type="date" id="dt" value="${cur.date}">
  <label class="f">Status</label><select id="ss"><option value="planned" ${cur.status === 'planned' ? 'selected' : ''}>Lined up</option><option value="posted" ${cur.status === 'posted' ? 'selected' : ''}>Posted</option></select>
  <div class="row" style="margin-top:18px"><button class="btn" id="ok">Save</button><button class="btn ghost" id="no">Cancel</button><span class="sp"></span>${post ? '<button class="btn ghost" id="rm">Delete</button>' : ''}</div></div>`;
  d.showModal();
  $('#sh').onchange = e => { const s = shinyOf(e.target.value); if (s) { $('#pf').value = s.platform; $('#ti').value = s.caption.split('\n')[0].slice(0, 40); } };
  $('#no').onclick = () => d.close();
  if (post) $('#rm').onclick = () => { S.posts = S.posts.filter(p => p !== post); save(); d.close(); render(); };
  $('#ok').onclick = () => {
    const sid = $('#sh').value, s = shinyOf(sid), rec = post || {id: uid(), metrics: null};
    Object.assign(rec, {shinyId: sid, platform: $('#pf').value, title: $('#ti').value || 'Post', date: $('#dt').value || today(), status: $('#ss').value, dur: s ? s.end - s.start : rec.dur || null});
    if (!post) S.posts.push(rec); if (s && rec.status === 'posted') s.status = 'posted'; save(); d.close(); render();
    if (rec.status === 'posted') { confetti(); toast('On the wall! Add the numbers in The Sky later.'); } else toast('Lined up 🪺');
  };
}

/* ---------- sky (analytics) ---------- */
const METRICS = ['views', 'likes', 'comments', 'shares', 'reach'];
function skyView() {
  const posted = S.posts.filter(p => p.status === 'posted').sort((a, b) => b.date.localeCompare(a.date));
  if (!posted.length) return `<div class="empty"><div style="font-size:3.5rem;animation:bob 3s infinite">🌤️</div><h2>Nothing in the sky yet</h2><p>Mark a post as posted on the Nest Wall, then log its numbers here. Or load sample data to look around.</p><button class="btn big" data-act="sample">Load sample data</button> <button class="btn ghost" data-go="nest">Open Nest Wall</button></div>`;
  const tot = {}, er = p => p.metrics && p.metrics.views ? (p.metrics.likes + p.metrics.comments + p.metrics.shares) / p.metrics.views : 0;
  const withM = posted.filter(p => p.metrics), maxV = Math.max(1, ...withM.map(p => p.metrics.views));
  for (const p of withM) { const t = tot[p.platform] ||= {views: 0, likes: 0, comments: 0, shares: 0, reach: 0, n: 0}; METRICS.forEach(k => t[k] += p.metrics[k] || 0); t.n++; }
  const buckets = {}; withM.filter(p => p.dur).forEach(p => { const b = p.dur < 20 ? 'under 20s' : p.dur < 35 ? '20–35s' : p.dur < 60 ? '35–60s' : 'over 60s'; (buckets[b] ||= []).push(er(p)); });
  const bb = Object.entries(buckets).filter(([, v]) => v.length >= 2).sort((a, b) => mean(b[1]) - mean(a[1]))[0];
  return `<div class="row"><h1 style="margin:0"><span class="rainbow">The Sky</span></h1><span class="sp"></span><button class="btn ghost sm" data-act="sample">Add sample data</button><button class="btn ghost sm" data-act="clearsample">Clear samples</button></div>
  <p class="muted">Type in each post's numbers from the platform's own analytics. Shiny can't read them for you (see the note below).</p>
  <div class="grid g3" style="margin:14px 0">${Object.entries(tot).map(([p, t]) => `<div class="card">${pill(p)} <span class="muted small">${t.n} post${t.n > 1 ? 's' : ''}</span><div class="stat">${t.views.toLocaleString()}</div>views · ${t.likes.toLocaleString()} likes · ${t.comments.toLocaleString()} comments · ${t.shares.toLocaleString()} shares · ${t.reach.toLocaleString()} reach</div>`).join('')}</div>
  ${bb ? `<div class="bubble" style="margin-bottom:14px">🐦 Your <b>${bb[0]}</b> clips have the best engagement rate (${(mean(bb[1]) * 100).toFixed(1)}%). I'll keep that in mind.</div>` : ''}
  <div class="card" style="overflow:auto"><table><tr><th>Post</th><th>Date</th>${METRICS.map(k => `<th>${k}</th>`).join('')}<th>Eng.</th><th>Views</th></tr>
  ${posted.map(p => `<tr><td>${pill(p.platform)} ${esc(p.title)}${p.sample ? ' <span class="badge">sample</span>' : ''}${p.dur ? ` <span class="muted small">${Math.round(p.dur)}s</span>` : ''}</td><td>${p.date}</td>${METRICS.map(k => `<td><input type="number" min="0" data-m="${k}" data-id="${p.id}" value="${p.metrics ? p.metrics[k] : ''}"></td>`).join('')}<td>${p.metrics ? (er(p) * 100).toFixed(1) + '%' : '–'}</td><td style="min-width:90px"><div class="bar" style="width:${p.metrics ? p.metrics.views / maxV * 100 : 0}%"></div></td></tr>`).join('')}</table></div>
  <p class="small muted">Why manual? Reading stats and posting directly needs each platform's OAuth app review (Instagram Graph API, YouTube Data API, LinkedIn Marketing API, X API), which needs approved developer accounts. For now: download the clip, copy the caption, open the platform.</p>`;
}
function addSample() {
  const rnd = (a, b) => Math.floor(a + Math.random() * (b - a)), plats = ['shorts', 'reels', 'linkedin', 'x', 'reels', 'linkedin', 'shorts'], titles = ['Hiring too early', 'The 3 a.m. idea', 'Why we pivoted', 'Cold email teardown', 'Pricing myths', 'Founder burnout', 'Shipping fast'];
  plats.forEach((p, i) => { const dur = rnd(14, 70), v = rnd(800, 24000) * (dur < 35 ? 1.4 : 1); S.posts.push({id: uid(), shinyId: '', platform: p, title: titles[i], date: dstr(new Date(Date.now() - (i * 3 + 2) * 864e5)), status: 'posted', dur, sample: true, metrics: {views: Math.round(v), likes: Math.round(v * rnd(3, 9) / 100), comments: Math.round(v * rnd(1, 15) / 1000), shares: Math.round(v * rnd(5, 40) / 1000), reach: Math.round(v * 1.3)}}); });
  save(); render();
}

/* ---------- global events ---------- */
document.addEventListener('click', e => {
  const f = e.target.closest('[data-filt]'); if (f) { filt = f.dataset.filt; stopPlay(); return render(); }
  const nfb = e.target.closest('[data-nf]'); if (nfb) { const k = nfb.dataset.nf; if (k === 'all') { Object.keys(PLATFORMS).forEach(x => nf.plat.add(x)); nf.status = 'all'; } else if (nf.plat.size === 4) { nf.plat = new Set([k]); } else if (nf.plat.has(k)) { nf.plat.delete(k); if (!nf.plat.size) Object.keys(PLATFORMS).forEach(x => nf.plat.add(x)); } else nf.plat.add(k); return render(); }
  const nsb = e.target.closest('[data-ns]'); if (nsb) { nf.status = nsb.dataset.ns; return render(); }
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  const a = e.target.closest('[data-act]'); if (!a) { if (e.target.closest('.btn')) confetti(5, e.clientX, e.clientY, 160); return; }
  const act = a.dataset.act; e.stopPropagation();
  if (e.target.closest('.btn') && act !== 'play') confetti(5, e.clientX, e.clientY, 160);
  if (act === 'play') { const box = a; if (playing && playing.box === box && playing.sound) return stopPlay(); if (playTile(box, true)) playing.sound = true; else { toast('The source file isn\'t available. Opening the editor.'); openEditor(box.dataset.id); } }
  else if (act === 'newhunt') { showForm = true; render(); $('.hunt')?.scrollIntoView({behavior: 'smooth', block: 'center'}); }
  else if (act === 'notebook') openNotebook();
  else if (act === 'discard') discardShiny(a.dataset.id);
  else if (act === 'cleardrafts') clearDrafts();
  else if (act === 'edit') openEditor(a.dataset.id);
  else if (act === 'sched') openSched({shinyId: a.dataset.id});
  else if (act === 'plan') { const sh = S.shinies.find(s => s.status !== 'draft' && (!a.dataset.p || s.platform === a.dataset.p)); openSched({date: a.dataset.date, platform: a.dataset.p, shinyId: !a.dataset.date && sh ? sh.id : ''}); }
  else if (act === 'editpost') openSched({postId: a.dataset.id});
  else if (act === 'prev') { calM.setMonth(calM.getMonth() - 1); render(); }
  else if (act === 'next') { calM.setMonth(calM.getMonth() + 1); render(); }
  else if (act === 'sample') addSample();
  else if (act === 'clearsample') { S.posts = S.posts.filter(p => !p.sample); save(); render(); }
  else if (act === 'forget') { if (confirm('Wipe all brand memory?')) { S.finals = []; save(); openNotebook(); } }
}, true);
document.addEventListener('change', e => {
  if (e.target.dataset.m) { const p = S.posts.find(x => x.id === e.target.dataset.id); p.metrics ||= {views: 0, likes: 0, comments: 0, shares: 0, reach: 0}; p.metrics[e.target.dataset.m] = Math.max(0, +e.target.value || 0); save(); render(); }
});
render();
/* bring saved files back after a reload, then fill any missing thumbnails */
(async () => {
  for (const src of S.sources.slice()) if (!S.shinies.some(s => s.sourceId === src.id)) { S.sources = S.sources.filter(x => x !== src); idbDel(src.id); save(); }   // free space from fully discarded sources
  for (const src of S.sources) if (src.kind === 'file' && !blobs[src.id]) { const f = await idbGet(src.id); if (f) blobs[src.id] = {url: URL.createObjectURL(f), media: src.media}; }
  let changed = false; for (const s of S.shinies) if (!s.thumb && blobs[s.sourceId]) { s.thumb = await makeThumb(srcOf(s.sourceId), s.start); changed = true; }
  if (changed) save(); if (S.sources.length) render();
})();
