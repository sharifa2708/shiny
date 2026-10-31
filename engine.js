/* Shiny engine: platform lore, copy writer, clip finder, brand memory */
'use strict';

const PLATFORMS = {
  shorts:{name:'YouTube Shorts',short:'Shorts',ideal:45,target:[25,70],max:90,ratio:'9:16',cadence:3,tags:3,
    link:'https://studio.youtube.com/',
    lore:['Hook inside the first 1–3 seconds. Viewers swipe fast.','Loop it: end on a line that flows back into the opening.','Burn in captions; most Shorts are watched muted.','One idea per Short. Cut the preamble.','Title under ~60 characters, one or two relevant hashtags.']},
  reels:{name:'Instagram Reels',short:'Reels',ideal:40,target:[20,75],max:90,ratio:'9:16',cadence:3,tags:5,
    link:'https://www.instagram.com/',
    lore:['Sweet spot is 15–30s. Watch-through rate drives reach.','The first line of the caption shows before "…more", so make it the hook.','Saves and sends outweigh likes. Ask people to save or send it.','On-screen text in the first second beats a slow intro.','3–5 niche hashtags beat 30 generic ones.']},
  linkedin:{name:'LinkedIn',short:'LinkedIn',ideal:75,target:[45,120],max:150,ratio:'1:1 or 4:5',cadence:4,tags:3,
    link:'https://www.linkedin.com/feed/',
    lore:['Insight first, story second. Lead with the lesson.','Captions are mandatory; most feeds autoplay on mute.','The first 2 lines decide the "see more" click.','End with a real question; comments are weighted heavily.','Max 3 hashtags. Square or 4:5 video takes more feed space.']},
  x:{name:'X / Twitter',short:'X',ideal:45,target:[20,90],max:140,ratio:'16:9 or 1:1',cadence:2,tags:2,
    link:'https://x.com/compose/post',
    lore:['Short, punchy clips under 45s do best; native upload beats links.','Put the point in the first line. Keep the text under 240 characters.','Strong opinions travel; hedged ones sink.','1–2 hashtags at most, or none.','Reply to your own post with context or a link.']}
};
const TONES = {
  playful:{label:'Playful',emoji:['✨','🐦','👀','🔥','😅'],
    hooks:['Found a shiny in “{T}” ✨','Plot twist in “{T}” 👀','Wait for it… “{T}”','This bit of “{T}” made my day'],
    bodies:['Tiny clip, big shine.','This bit made me grin. Hope it does the same for you.','The good stuff starts right away.']},
  professional:{label:'Professional',emoji:['📈','💡'],
    hooks:['A clear idea from “{T}”','The part of “{T}” most people miss','One practical lesson from “{T}”','Worth a minute: “{T}”'],
    bodies:['Key takeaway in under a minute.','Here is the distilled version, with the context kept in.','Short, specific, and worth your time.']},
  bold:{label:'Bold',emoji:['🔥','⚡','🚀'],
    hooks:['The part of “{T}” nobody quotes.','This is the bit of “{T}” that matters.','“{T}”: the point, no fluff.','Skip to this part of “{T}”.'],
    bodies:['No fluff. Just the point.','Disagree? Good. Say why.','This is the part that matters.']},
  warm:{label:'Warm',emoji:['🌿','💛','☕'],
    hooks:['A little something from “{T}” 💛','If this has been on your mind: “{T}”','Sharing a moment from “{T}”','Something I keep coming back to, from “{T}”'],
    bodies:['Pull up a chair, this one is short.','Sharing it as I wish someone had shared it with me.','Take what helps, leave the rest.']},
  nerdy:{label:'Nerdy',emoji:['🤓','🧠','🔬'],
    hooks:['The rabbit hole inside “{T}” 🧠','“{T}”: the mechanism, in a clip','A tiny deep-dive from “{T}”','The part of “{T}” worth rewinding'],
    bodies:['Details in 30 seconds. Nuance in the comments.','The mechanism is the fun part.','Receipts included.']}
};
const CTAS = {
  shorts:['Subscribe for more.','Which part surprised you?','Watch it twice. It loops.'],
  reels:['Save this for later 📌','Send it to someone who needs it.','Follow for more clips like this.'],
  linkedin:['What would you add? I read every comment.','Have you seen this in your work?','Agree or disagree? Tell me below.'],
  x:['Thoughts?','Reply with your take.','RT if this landed.']
};
const STOP = new Set('the and for with that this from your you are was were have has had but not what when how why who about into over just like they them their then than also can will would could should our out one all any more most some such very been being its it\'s let\'s here there'.split(' '));

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const emojiCount = s => (s.match(/\p{Extended_Pictographic}/gu) || []).length;
const stripEmoji = s => s.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/ +/g, ' ').replace(/ +([.,!?])/g, '$1').trim();
function rng(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

/* ---------- copy writer ---------- */
function keywords(topic) {
  const seen = []; for (const w of (topic || '').toLowerCase().match(/[a-z0-9']+/g) || []) if (w.length > 3 && !STOP.has(w) && !seen.includes(w)) seen.push(w);
  return seen;
}
/* "How to Read Minds | Jon Smith | TED (Official Video) .mp4" -> "How to Read Minds" */
function cleanTitle(s) {
  let t = String(s || '').replace(/\.(mp4|mov|mkv|webm|mp3|m4a|wav)$/i, '').replace(/[_]+/g, ' ');
  t = t.replace(/[\[(]\s*(official|full|hd|4k|1080p|720p|lyrics?|audio|video|episode|ep\.?|live|shorts?)[^\])]*[\])]/gi, '');
  t = t.split(/\s[|•·]\s|\s[-–—]\s(?=.*(ted|youtube|podcast|official|channel))/i)[0];
  return t.replace(/\s+/g, ' ').replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim();
}
/* The few words that most set this clip apart from the rest of the talk (distinctive and repeated), or [] if nothing stands out. */
function clipFocus(segs, start, end, topic) {
  const inClip = (segs || []).filter(g => g.end > start && g.start < end); if (inClip.length < 2) return [];
  const toks = g => (g.text.toLowerCase().match(/[a-z']{4,}/g) || []).filter(w => !STOP.has(w) && !EXTRA_STOP.has(w)), all = {}, clip = {}; let total = 0;
  (segs || []).forEach(g => toks(g).forEach(w => { all[w] = (all[w] || 0) + 1; total++; })); inClip.forEach(g => toks(g).forEach(w => clip[w] = (clip[w] || 0) + 1));
  const inTitle = new Set(keywords(topic));
  return Object.keys(clip).filter(w => clip[w] >= 3 && clip[w] / all[w] >= .5 && !inTitle.has(w))
    .sort((a, b) => clip[b] * Math.log(1 + total / all[b]) - clip[a] * Math.log(1 + total / all[a])).slice(0, 3);
}
/* The clip's own best lines: complete, self-standing sentences that carry the talk's distinctive ideas. Used to say what the clip
   actually contains. Sentences that start mid-thought ("And so it…") or are mostly filler are skipped. Best first. */
const DANGLE = /^(and|but|so|because|which|that|this|it|they|he|she|these|those|then|also|or|yeah|okay|right|well|anyway|like|of course)\b/i;
function clipQuotes(segs, start, end, topic) {
  const inClip = (segs || []).filter(g => g.end > start && g.start < end); if (inClip.length < 2) return [];
  const toks = s => (s.toLowerCase().match(/[a-z']{4,}/g) || []).filter(w => !STOP.has(w) && !EXTRA_STOP.has(w)), all = {}, local = {}; let total = 0;
  (segs || []).forEach(g => toks(g.text).forEach(w => { all[w] = (all[w] || 0) + 1; total++; })); inClip.forEach(g => toks(g.text).forEach(w => local[w] = (local[w] || 0) + 1));
  const kw = new Set(keywords(topic)), out = [];
  for (const u of sentenceUnits(inClip)) {
    const t = u.text.replace(FILLER, '').replace(/["“”]/g, '').replace(/^((alright|okay|ok|so|now|well)[, ]+)+/i, '').replace(/\b([a-z']+)(,? \1\b)+/gi, '$1').replace(/\s+/g, ' ').trim(), ws = t.split(/\s+/);
    if (ws.length < 7 || ws.length > 26 || t.length > 150 || !/[.!?]$/.test(t) || DANGLE.test(t) || WEAK.test(t) || /\b(\w+) \1 \1\b/i.test(t) || u.start < start - 1) continue;
    const score = toks(t).reduce((a, w) => a + (local[w] || 0) * Math.log(1 + total / (all[w] || 1)) + (kw.has(w) ? 2 : 0), 0) / (ws.length + 4) + (CUES.some(c => c.test(t)) ? .3 : 0);
    out.push({text: cap1(t), at: Math.max(0, u.start - start), score});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}
/* Wording per tone for the "what's in it" and "why watch" lines. */
const TONE_COPY = {
  playful: {lead: ['Here\'s the bit that got me:', 'The line that made me stop:'], tease: ['Stick around until {at}. That\'s the good part.', 'Wait for {at}, that\'s where it clicks.'], covers: 'It\'s all about {a} and {b}.'},
  professional: {lead: ['The core idea:', 'The line worth keeping:'], tease: ['The key moment lands at {at}.', 'The turning point comes at {at}.'], covers: 'It covers {a} and {b}.'},
  bold: {lead: ['The line that matters:', 'Here\'s the point:'], tease: ['Don\'t leave before {at}.', 'Stay till {at}. It lands there.'], covers: 'No fluff: {a} and {b}.'},
  warm: {lead: ['In this clip you\'ll hear:', 'One line I keep coming back to:'], tease: ['Stay with it until {at}. It\'s worth it.', 'Watch to {at} if you can.'], covers: 'It\'s about {a} and {b}.'},
  nerdy: {lead: ['The key line:', 'The line that explains it:'], tease: ['The payoff is at {at}.', 'The mechanism clicks at {at}.'], covers: 'Topics: {a} and {b}.'}
};
function writeCopy({topic, platform, tone, seed, focus, segs, start, end}, mem) {
  const P = PLATFORMS[platform], T = TONES[tone] || TONES.warm, TC = TONE_COPY[tone] || TONE_COPY.warm, r = rng(seed + platform + tone);
  const kw = keywords(topic), t = (topic || 'this').trim().replace(/[.!?]+$/, '');
  const short = t.length > 48 ? t.slice(0, 47).replace(/\s+\S*$/, '') + '…' : t;
  const fill = s => s.replace('{t}', short.toLowerCase()).replace('{T}', short.charAt(0).toUpperCase() + short.slice(1));
  const hook = fill(pick(T.hooks, r)), body = pick(T.bodies, r), cta = pick(CTAS[platform], r);
  if (!focus && segs) focus = clipFocus(segs, start, end, topic);
  const Q = segs ? clipQuotes(segs, start, end, topic) : [], tight = mem && mem.capShort;
  let cap;
  if (!Q.length) {   // no transcript to draw on: say what we can from the title
    if (platform === 'linkedin') cap = `${hook}\n\n${body}\n\n${cta}`;
    else if (platform === 'reels') cap = `${hook}\n.\n${body} ${cta}`;
    else if (platform === 'x') cap = `${hook} ${cta}`.slice(0, 240);
    else cap = `${hook.slice(0, 60)}\n${body} ${cta}`;
  } else {
    const top2 = Q.slice(0, 2).sort((a, b) => a.at - b.at), mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const q = top2[0], late = top2[1] && top2[1].at >= 6 && top2[1].at > q.at + 3 ? top2[1] : null, lead = pick(TC.lead, r);   // show the set-up line, tease the later payoff without quoting it
    const tease = !tight && late ? pick(TC.tease, r).replace('{at}', mmss(late.at)) : '', covers = !tight && focus && focus.length >= 2 ? TC.covers.replace('{a}', focus[0]).replace('{b}', focus[1]) : '';
    if (platform === 'linkedin') {
      const chrono = Q.slice().sort((a, b) => a.at - b.at), list = chrono.length > 1 && !tight ? chrono.map(x => `→ ${x.text}`).join('\n') : `${lead} “${q.text}”`;
      cap = [hook, [chrono.length > 1 && !tight ? (covers || 'What you\'ll hear in this clip:') : '', list].filter(Boolean).join('\n'), chrono.length > 1 && !tight ? '' : tease, cta].filter(Boolean).join('\n\n');
    } else if (platform === 'reels') cap = [hook, '.', `${lead} “${q.text}”`, [covers, tease].filter(Boolean).join(' '), '.', cta].filter(x => x !== '').join('\n');
    else if (platform === 'x') {
      let words = q.text.split(' '), cut = false; const build = () => `${hook}\n\n“${words.join(' ')}${cut ? '…' : ''}”\n\n${cta}`;
      while (build().length > 270 && words.length > 6) { words.pop(); cut = true; } cap = build();
    } else cap = [hook.slice(0, 90), `${lead} “${q.text}”`, tease, cta].filter(Boolean).join('\n');
  }
  if (T.emoji.length && platform !== 'linkedin' && !cap.match(/\p{Extended_Pictographic}/u)) cap = cap.replace(/\n|$/, ' ' + pick(T.emoji, r) + '$&');
  const noEmoji = mem && mem.emojiAversion;
  if (noEmoji) cap = stripEmoji(cap);
  const base = {shorts:['Shorts', 'YouTubeShorts', 'ForYou'], reels:['Reels', 'InstagramReels', 'Explore', 'ContentCreator', 'Trending'], linkedin:['Leadership', 'Learning', 'Career'], x:['Thread', 'BuildInPublic']}[platform];
  const n = (mem && mem.tagCount != null) ? mem.tagCount : P.tags;
  const camel = w => '#' + w.charAt(0).toUpperCase() + w.slice(1).replace(/[^a-z0-9]/gi, '');
  const tags = [...(focus || []).slice(0, 2).map(camel), ...kw.slice(0, 2).map(camel), ...base.map(b => '#' + b)].filter((v, i, a) => a.indexOf(v) === i).slice(0, n);
  return {caption: cap, tags};
}

/* ---------- brand memory ---------- */
function insights(finals) {
  const out = {n: finals.length, durByPlat: {}, notes: []};
  if (!finals.length) return out;
  for (const p in PLATFORMS) { const d = finals.filter(f => f.platform === p).map(f => f.dur); if (d.length) out.durByPlat[p] = {med: median(d), n: d.length}; }
  const ends = finals.map(f => f.endShift), starts = finals.map(f => f.startShift);
  const cutEnd = finals.filter(f => f.endShift < -0.8).length;
  out.endTrim = ends.length >= 2 && mean(ends) < -0.8 ? Math.abs(mean(ends)) : 0;
  out.startShave = starts.length >= 2 && mean(starts) > 0.8 ? mean(starts) : 0;
  const tc = {}; finals.forEach(f => tc[f.tone] = (tc[f.tone] || 0) + 1);
  out.topTone = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
  out.swapRate = finals.filter(f => f.swapped).length / finals.length;
  const shortened = finals.filter(f => f.capAfter < f.capBefore * 0.8).length;
  const emojiDrop = finals.filter(f => f.emojiAfter < f.emojiBefore).length;
  out.emojiAversion = finals.length >= 2 && emojiDrop / finals.length >= 0.5;
  out.capShort = finals.length >= 2 && shortened / finals.length >= 0.5;   // you keep cutting my captions: write them tighter
  const ovs = finals.filter(f => f.ov), withOv = ovs.filter(f => f.ov.n > 0);
  out.ovAversion = ovs.length >= 2 && withOv.length / ovs.length <= .4;
  if (withOv.length >= 2) { const mode = k => { const c = {}; withOv.forEach(f => c[f.ov[k]] = (c[f.ov[k]] || 0) + 1); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }; out.ovPref = {font: mode('font'), color: mode('color'), size: Math.round(median(withOv.map(f => f.ov.size)))}; }
  const tagsAfter = finals.map(f => f.tagsAfter);
  out.tagCount = finals.length >= 2 ? Math.round(mean(tagsAfter)) : null;
  const L = out.notes;
  for (const p in out.durByPlat) { const d = out.durByPlat[p]; if (d.n >= 2) L.push(`On ${PLATFORMS[p].name} you keep clips around ${Math.round(d.med)}s (platform norm is ${PLATFORMS[p].target[0]}–${PLATFORMS[p].target[1]}s). I'll aim there.`); }
  if (out.endTrim) L.push(`You trim about ${out.endTrim.toFixed(1)}s off the end of my picks (${cutEnd} of ${finals.length} times), usually before the punchline lands. I now end my clips earlier.`);
  if (out.startShave) L.push(`You usually start ~${out.startShave.toFixed(1)}s later than I do. I'll skip the warm-up next time.`);
  if (out.topTone && finals.length >= 2) L.push(`Your go-to tone is ${TONES[out.topTone[0]].label.toLowerCase()} (${out.topTone[1]} of ${finals.length}). It's my default now.`);
  if (shortened >= 2) L.push(`You shorten my captions ${shortened} out of ${finals.length} times, so I'll write tighter.`);
  if (out.emojiAversion) L.push('You tend to remove emoji. I\'ll keep captions clean.');
  if (out.tagCount != null && finals.length >= 2) L.push(`You settle on about ${out.tagCount} hashtag${out.tagCount === 1 ? '' : 's'} per post.`);
  if (out.ovAversion) L.push('You usually remove the on-video text, so I\'ll stop adding it. You can always add some by hand.');
  else if (out.ovPref) L.push(`Your text style is ${out.ovPref.font}, ${out.ovPref.color}, around ${out.ovPref.size}px. I use that for new shinies.`);
  if (finals.length >= 3 && out.swapRate > .4) L.push('You often swap my pick for another shiny, so I\'ll offer more variety.');
  if (!L.length) L.push('Only one edit so far. Finalise a couple more clips and I\'ll start spotting your habits.');
  return out;
}

/* ---------- on-video text ---------- */
const FONTS = [['Nunito', 'Friendly'], ['Fraunces', 'Serif'], ['Anton', 'Poster'], ['Pacifico', 'Script'], ['Caveat', 'Handwritten'], ['Space Mono', 'Typewriter']];
const fontWeight = o => (o.font === 'Anton' || o.font === 'Pacifico') ? 400 : 800;
const FILLER = /\b(um+|uh+|you know|i mean|kind of|sort of)\b[,]?\s*/gi;
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
function headline(text, maxWords) {
  let t = text.replace(FILLER, '').replace(/^(and|so|but|alright|okay|well|now)[, ]+/i, '').replace(/[.!?…]+$/, '').trim();
  t = t.replace(/\b([a-z']+)([, ]+\1\b)+/gi, '$1');                       // "really, really, really" -> "really"
  const lead = t.match(/^.{8,}?\b(?:is that|is how|is why|means that|turns out)\s+(.+)$/i);   // drop "the cool thing about X is that"
  if (lead && lead[1].split(/\s+/).length >= 4) t = lead[1];
  let w = t.split(/\s+/);
  if (w.length > maxWords) { const cut = t.split(/,| and | but | because /)[0].trim(); w = cut.split(/\s+/).length >= 4 ? cut.split(/\s+/) : w; }
  if (w.length > maxWords) w = [...w.slice(0, maxWords), '…'];
  return cap1(w.join(' ').replace(/ …$/, '…'));
}
/* On-video text: a quiet label, not a quote. It names what the clip is about: the video's title, plus the clip's own key ideas
   when some stand out. Raw transcript sentences read as gibberish on screen, so they are never used. Falls back to the title alone. */
function autoOverlays({segs, topic, start, end, platform, mem}) {
  if (mem && mem.ovAversion) return {overlays: [], mode: 'off'};
  const len = end - start, pref = (mem && mem.ovPref) || {}, title = cleanTitle(topic), focus = clipFocus(segs, start, end, title);
  const ideas = focus.length >= 2 ? focus.slice(0, 2).map(cap1).join(' · ') : '', tw = title.split(/\s+/), shown = tw.length > 9 ? tw.slice(0, 8).join(' ') + '…' : title, text = [shown, ideas].filter(Boolean).join(' — ');
  if (!text) return {overlays: [], mode: 'off'};
  const label = [shown, ideas].filter(Boolean);
  return {overlays: [{id: uid(), font: pref.font || 'Nunito', color: pref.color || '#ffffff', size: pref.size || 34, pos: 'bottom', from: 0, to: len, full: true, text}], mode: label.length > 1 ? 'transcript' : 'topic'};
}

/* ---------- meaning-based clip finder (uses the transcript) ---------- */
const EXTRA_STOP = new Set('going really thing things people think know just like want would about there their because every other something actually little much even still never always right okay yeah well gonna kind sort said says saying get got make made anyway moving else while went started later first'.split(' '));
/* phrases that mark a payoff, a reveal, an explanation or a live demonstration */
const CUES = [
  /\bthe (secret|trick|key|reason|answer|truth|mechanism|big idea|point) (is|was|here)\b/i,
  /\bhere'?s (how|the|what|why)\b/i, /\blet me (show|explain|demonstrate|tell|prove)\b/i,
  /\bwhat (i|we) (do|did|found|discovered|learned|realized)\b/i, /\b(it )?turns out\b/i,
  /\b(in other words|in short|in essence|the takeaway|the lesson|the bottom line)\b/i,
  /\b(you'?re thinking|i'?m (getting|sensing|seeing)|am i right|that'?s (right|correct|exactly)|think of (a|an|the|someone)|raise your hand|pick a|tell me)\b/i,
  /\bthe (first|second|third|main|most important|biggest) (thing|step|rule|principle|part|mistake)\b/i,
  /\b(this works because|how does (this|it) work|why does this work|that'?s why|which is why)\b/i
];
const WEAK = /\b(thank you|thanks (so much|for)|welcome|my name is|i'?m going to (talk|tell you)|today i|before we (start|begin)|subscribe|sponsor|applause)\b/i;
function sentenceUnits(segs) {
  const out = []; let cur = null;
  for (const g of segs) {
    if (!cur) cur = {start: g.start, end: g.end, text: g.text}; else { cur.end = g.end; cur.text += ' ' + g.text; }
    if (/[.!?…]["')\]]?$/.test(g.text.trim()) || cur.end - cur.start > 14) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur); return out;
}
/* Why a clip was picked, in plain language, from what is actually true of it: what it says, where it sits, how it starts and
   ends, what kind of moment it is, how it is delivered and how it fits the platform. Different clips get different reasons. */
function cueKind(c) {
  c = (c || '').toLowerCase();
  if (/let me (show|demonstrate|prove)|pick a|think of|raise your hand|tell me|you'?re thinking|i'?m (getting|sensing|seeing)|am i right|that'?s (right|correct|exactly)/.test(c)) return 'demo';
  if (/secret|trick|key|reason|answer|truth|mechanism|big idea|point|turns out/.test(c)) return 'reveal';
  if (/what (i|we)/.test(c)) return 'method';
  if (/other words|in short|essence|takeaway|lesson|bottom line/.test(c)) return 'summary';
  if (/first|second|third|main|most important|biggest/.test(c)) return 'steps';
  if (/works because|how does|why does|that'?s why|which is why/.test(c)) return 'why';
  return 'how';
}
function explainPick({w, units, terms, quote, len, trimmed, P, platform, mem, duration, gm, rank, total, kw, isAlt, bestStart, CLOSE}) {
  const r = rng('why' + Math.round(w.a.start) + platform), one = a => a[Math.floor(r() * a.length)], mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const text = units.slice(w.i, w.j + 1).map(u => u.text).join(' '), words = text.split(/\s+/).length, pos = w.a.start / duration;
  const ratio = gm && w.en ? w.en * 1.5 : 1, fillers = (text.match(/\b(um+|uh+|you know|i mean)\b/gi) || []).length / Math.max(.5, len / 60), wps = words / Math.max(1, len);
  const prev = units[w.i - 1], next = units[w.j + 1], pauseBefore = prev ? w.a.start - prev.end : 0, pauseAfter = next ? next.start - w.b.end : 0, first = w.a.text.trim(), closes = CLOSE.test(units[w.j].text.trim());
  const where = pos < .08 ? 'the opening of the talk' : pos > .85 ? 'the closing stretch of the talk' : pos < .4 ? 'the first half of the talk' : pos < .65 ? 'the middle of the talk' : 'the later part of the talk';
  const list = terms.length ? terms.map(t => `“${t}”`).join(', ') : '', hits = Object.keys(w.tf).filter(t => kw.has(t)).slice(0, 2);
  const lead = quote ? one([`The heart of it is the line “${quote.text}”`, `It builds to “${quote.text}”`, `Its strongest line is “${quote.text}”`]) : list ? `This is where the talk dwells on ${list}` : `It is the most self-contained stretch of ${where}`;
  const items = [];   // [priority, sentence]
  const add = (p, s) => s && items.push([p + r() * .5, s]);
  items.push([9, quote ? lead : `${lead}.`]);
  if (w.cue) {
    const k = cueKind(w.cue);
    add(7, {demo: 'It is the hands-on moment, where the speaker works with the audience or demonstrates, which tends to hold attention best.', reveal: 'It holds the reveal: the point where the talk says how the thing actually works.',
      method: 'It shows what the speaker actually does rather than only describing it.', summary: 'It includes a summing-up line, so it makes sense without the rest of the talk.', steps: 'It lays out the parts one by one, which is easy to follow on its own.',
      why: 'It answers the "why does this work" question, so viewers get the explanation and not just the claim.', how: 'It has an explanation moment, where the speaker turns from setup to substance.'}[k]);
  }
  const spot = pos < .08 ? 'right at the start' : pos > .85 ? 'near the end' : pos < .4 ? 'in the first half' : pos < .65 ? 'around the middle' : 'in the later part';
  if (w.startB > .5) add(5, one([`The vocabulary changes sharply here${list ? ` (new terms: ${list})` : ''}, so a new idea starts right where the clip does, ${spot} of the talk.`, `This is where the talk turns to something new${list ? `: ${list}` : ''}, ${spot}, and the clip starts on that turn.`]));
  else if (pauseBefore >= 1) add(4, `It follows a ${pauseBefore.toFixed(1)}s pause, which is a natural place to start.`);
  else add(2, `It sits in ${where}.`);
  if (/\?\s*$/.test(first.split(/(?<=[.!?])\s+/)[0] || first) || /\?/.test(first.slice(0, 120))) add(6, 'It opens with a question, which makes a natural hook for the first seconds.');
  else if (/\d/.test(first.slice(0, 80))) add(4, 'It opens on a concrete number, which gives viewers something to hold onto straight away.');
  if (closes) add(5, 'It lands on a wrap-up line, so it ends on a conclusion and not mid-thought.');
  else if (w.endB > .5) add(4, one([`It ends just before the talk moves on to something else${pauseAfter >= 1 ? ` (the speaker pauses ${pauseAfter.toFixed(1)}s after)` : ''}.`, 'The idea is finished by the last line, and the next sentence starts a new topic.', 'It stops where the thought is complete, so nothing is left hanging.']));
  if (ratio >= 1.15) add(6, `The delivery is about ${Math.round((ratio - 1) * 100)}% more energetic than the rest of the talk, a sign the speaker is stressing it.`);
  if (wps >= 2.8) add(3, 'The pace is brisk, which suits a short-form feed.'); else if (wps > 0 && wps <= 2) add(3, 'The pace is unhurried, so the idea has room to land.');
  if (fillers <= 1) add(3, 'There is almost no filler (no "um"s or "you know"s), so it will read cleanly with captions.');
  if (hits.length) add(5, `It speaks directly to your topic (${hits.map(t => `“${t}”`).join(', ')}).`);
  const dm = mem && mem.durByPlat && mem.durByPlat[platform];
  add(6, dm && dm.n >= 2 && Math.abs(len - dm.med) <= 10 ? `At ${Math.round(len)}s it is close to the ${Math.round(dm.med)}s you usually keep for ${P.short}.`
    : len > P.target[1] ? `I let it run ${Math.round(len)}s, longer than usual, so the thought lands in full (${P.short} allows up to ${P.max}s).`
    : len < P.target[0] ? `At ${Math.round(len)}s it is short and punchy, and the thought is already complete.` : `${Math.round(len)}s sits inside the ${P.target[0]}–${P.target[1]}s sweet spot for ${P.short}.`);
  add(2, isAlt ? `It comes from a different part of the talk than my top pick (${mmss(bestStart)}), so you have a real alternative.` : `It ranked #${rank} of ${total.toLocaleString()} candidate moments I scored.`);
  if (trimmed > .4) add(6, `I ended it ${trimmed.toFixed(1)}s early, because that is how you usually cut.`);
  const head = items.shift(), chosenItems = items.sort((a, b) => b[0] - a[0]).slice(0, 4).map(x => x[1]);
  return [head[1], ...chosenItems].join(' ');
}
/* Finds COMPLETE THOUGHTS, not fixed-length slices. A thought begins where the vocabulary shifts to a new idea (or after a
   pause, or on an opener like "So how..." / "Let me show you") and ends where it wraps up (a topic shift follows, or the last
   sentence sounds like a conclusion). Every window from a minimum length up to the platform's maximum is scored on:
   how much it carries the talk's recurring ideas, payoff/explanation/demo cues, your topic, vocal energy, and above all how
   cleanly it starts and ends. So a 70-second explanation is taken whole rather than as a 25-second piece of it. */
function findByMeaning(segs, duration, platform, mem, topic, energy, step, count = 5) {
  const P = PLATFORMS[platform], units = sentenceUnits(segs), n = units.length; if (n < 3) return null;
  const dm = mem && mem.durByPlat && mem.durByPlat[platform], ideal = Math.min(dm && dm.n >= 2 ? dm.med : P.ideal, P.max);
  const maxLen = Math.min(P.max, duration), minLen = Math.min(maxLen, Math.max(12, ideal * .45));
  const toks = t => (t.toLowerCase().match(/[a-z']{3,}/g) || []).filter(w => !STOP.has(w) && !EXTRA_STOP.has(w));
  units.forEach(u => u.w = toks(u.text));
  const CH = 30, nCh = Math.max(1, Math.ceil(duration / CH)), chunk = Array.from({length: nCh}, () => new Set()), tfAll = {}, df = {};
  units.forEach(u => { const c = Math.min(nCh - 1, Math.floor(u.start / CH)); u.w.forEach(w => { chunk[c].add(w); tfAll[w] = (tfAll[w] || 0) + 1; }); });
  chunk.forEach(s => s.forEach(w => df[w] = (df[w] || 0) + 1));
  const idf = w => Math.log(1 + nCh / (df[w] || 1)), G = {};
  for (const w in tfAll) G[w] = (1 + Math.log(tfAll[w])) * idf(w) * (df[w] / nCh > .5 ? .3 : 1);   // sublinear tf; terms spread everywhere are filler
  const gNorm = Math.sqrt(Object.values(G).reduce((a, v) => a + v * v, 0)) || 1, kw = new Set(keywords(topic));
  const vec = (i, j) => { const tf = {}; for (let k = i; k <= j; k++) units[k].w.forEach(w => tf[w] = (tf[w] || 0) + 1); const v = {}; for (const w in tf) v[w] = (1 + Math.log(tf[w])) * idf(w); return {tf, v}; };
  const cosv = (a, b) => { let d = 0, na = 0, nb = 0; for (const w in a) { na += a[w] * a[w]; if (b[w]) d += a[w] * b[w]; } for (const w in b) nb += b[w] * b[w]; return na && nb ? d / Math.sqrt(na * nb) : -1; };

  /* B[g] = how strongly a new thought begins before sentence g (0..1): vocabulary shift + pause. B[n] = end of talk. */
  const K = 4, sims = []; for (let g = 1; g < n; g++) sims[g] = cosv(vec(Math.max(0, g - K), g - 1).v, vec(g, Math.min(n - 1, g + K - 1)).v);
  const valid = sims.filter(s => s != null && s >= 0), avg = mean(valid) || 1e-9, B = new Array(n + 1).fill(1);
  for (let g = 1; g < n; g++) { const shift = sims[g] < 0 ? .3 : Math.max(0, (avg - sims[g]) / avg), pause = Math.min(1, Math.max(0, units[g].start - units[g - 1].end) / 1.5); B[g] = Math.min(1, shift * .9 + pause * .4); }
  const OPEN = /^(so|now|let me|let's|here'?s|okay|imagine|picture|what (if|happens)|the (first|second|next|real|big|biggest))\b/i, CONT = /^(and|but|because|which|that|this|it|they|he|she|then|also|or|these|those)\b/i;
  const CLOSE = /(in other words|that'?s (why|how|what)|that is (why|how|what)|the (point|lesson|takeaway|answer|secret) is|and that'?s)[^.!?]*[.!?…]?["')\]]?$/i;

  const gm = energy && energy.length ? mean(energy) || 1 : 1, wins = [];
  /* how substantive each sentence is; a clip shouldn't open or close on filler */
  const rs = units.map((u, k) => { const v = vec(k, k).v; let d = 0, nv = 0; for (const w in v) { d += v[w] * (G[w] || 0); nv += v[w] * v[w]; } return nv ? d / (Math.sqrt(nv) * gNorm) : 0; });
  const rMax = Math.max(...rs) || 1, rEdge = k => CUES.some(c => c.test(units[k].text)) ? 1 : Math.min(1, rs[k] / rMax * 1.5);
  for (let i = 0; i < n; i++) {
    let j = i; while (j < n && units[j].end - units[i].start < minLen) j++;
    for (; j < n && units[j].end - units[i].start <= maxLen; j++) {
      const a = units[i], b = units[j], len = b.end - a.start, text = units.slice(i, j + 1).map(u => u.text).join(' '), {tf, v} = vec(i, j);
      let dot = 0; for (const w in v) dot += v[w] * (G[w] || 0);
      const cos = dot / ((Math.sqrt(Object.values(v).reduce((s, x) => s + x * x, 0)) || 1) * gNorm);
      const cues = CUES.map(c => text.match(c)).filter(Boolean), topicHits = Object.keys(tf).filter(w => kw.has(w)).length;
      let en = 0; if (energy && energy.length) { const e0 = Math.floor(a.start / step), e1 = Math.ceil(b.end / step); en = Math.min(1.5, mean(energy.slice(e0, e1)) / gm) / 1.5; }
      const startB = Math.min(1, Math.max(0, B[i] + (OPEN.test(a.text.trim()) ? .35 : 0) - (CONT.test(a.text.trim()) ? .3 : 0)));
      const endB = Math.min(1, B[j + 1] + (CLOSE.test(units[j].text.trim()) ? .35 : 0));
      const lenFit = .08 * Math.min(len / (ideal * .7), 1) - .06 * Math.max(0, (len - P.target[1]) / ((maxLen - P.target[1]) || 1));
      wins.push({i, j, a, b, len, tf, cos, cueN: cues.length, cue: cues[0] && cues[0][0], topicHits, en, startB, endB,
        pre: .22 * Math.min(cues.length, 3) / 3 + .13 * Math.min(topicHits, 3) / 3 + .08 * en + .3 * (startB + endB) / 2 + lenFit
          - .12 * (1 - rEdge(i)) - .12 * (1 - rEdge(j)) - (WEAK.test(text) ? .35 : 0) - (a.start < duration * .03 ? .1 : 0)});
    }
  }
  if (!wins.length) return null;
  const maxCos = Math.max(...wins.map(w => w.cos)) || 1; wins.forEach(w => w.score = .35 * (w.cos / maxCos) + w.pre);
  wins.sort((x, y) => y.score - x.score);
  const chosen = []; for (const w of wins) { if (chosen.length >= count) break; if (chosen.every(c => w.a.start >= c.b.end + 3 || w.b.end <= c.a.start - 3)) chosen.push(w); }
  const best = chosen[0].score;   // keep the top two, then only clips close to the best: no filler
  return chosen.filter((w, i) => i < 2 || w.score >= best * .65).map(w => {
    let start = Math.max(0, w.a.start - .15), end = Math.min(duration, w.b.end + .4), trimmed = 0;
    if (mem && mem.endTrim) { trimmed = Math.min(mem.endTrim, (end - start) * .15); end -= trimmed; }
    if (mem && mem.startShave) start = Math.min(end - 5, start + mem.startShave);
    const len = end - start, terms = Object.keys(w.tf).filter(t => t.length >= 4 && !t.includes("'") && tfAll[t] >= 2 && G[t] > 0 && df[t] / nCh <= .5).sort((x, y) => G[y] * (1 + Math.log(w.tf[y])) - G[x] * (1 + Math.log(w.tf[x]))).slice(0, 3);
    const rank = wins.indexOf(w) + 1, idx = chosen.indexOf(w);
    return {start, end, score: w.score, why: explainPick({w, units, terms, quote: clipQuotes(segs, w.a.start, w.b.end, topic)[0], len, trimmed, P, platform, mem, duration, gm, rank, total: wins.length, kw, isAlt: idx > 0, bestStart: chosen[0].a.start, CLOSE}), by: 'meaning'};
  });
}

/* ---------- clip finder ---------- */
async function analyzeFile(file, onStatus) {
  onStatus && onStatus('Listening to every second…');
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  let audio; try { audio = await ac.decodeAudioData(buf); } finally { ac.close(); }
  const ch = audio.getChannelData(0), W = Math.floor(audio.sampleRate * 0.25), n = Math.floor(ch.length / W), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i * W; j < (i + 1) * W; j += 3) { s += ch[j] * ch[j]; c++; } e[i] = Math.sqrt(s / c); }
  const sorted = [...e].sort((a, b) => a - b), ref = sorted[Math.floor(n * .95)] || 1;
  const norm = Array.from(e, v => Math.min(1, v / ref));
  const sm = norm.map((_, i) => mean(norm.slice(Math.max(0, i - 1), i + 2)));
  return {energy: sm, step: 0.25, duration: audio.duration};
}
function findCandidates(energy, step, duration, platform, mem, count = 5) {
  const P = PLATFORMS[platform];
  const dm = mem && mem.durByPlat && mem.durByPlat[platform];
  let want = dm && dm.n >= 2 ? dm.med : P.ideal;
  want = Math.min(want, duration);
  const L = Math.max(4, Math.round(want / step)), n = energy.length;
  if (n <= L + 4) return [{start: 0, end: duration, score: 1, why: `The whole source is only ${Math.round(duration)}s, so I took all of it.`}];
  const pre = [0]; energy.forEach(v => pre.push(pre[pre.length - 1] + v));
  const sum = (a, b) => pre[b] - pre[a], gmean = mean(energy);
  const scored = [];
  for (let i = 0; i + L <= n; i++) {
    const m = sum(i, i + L) / L, open = sum(i, i + 12) / 12, tail = sum(i + L - 8, i + L) / 8;
    let v = 0; for (let k = i; k < i + L; k++) v += (energy[k] - m) ** 2;
    scored.push({i, score: m + 0.5 * open + 0.15 * tail + 0.6 * Math.sqrt(v / L), m, open, tail});
  }
  scored.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const s of scored) { if (chosen.length >= count) break; if (chosen.every(c => Math.abs(c.i - s.i) > L * .6)) chosen.push(s); }
  return chosen.map(s => {
    let a = s.i, b = s.i + L;
    let best = a, bv = 9; for (let k = Math.max(0, a - 6); k <= Math.min(n - 1, a + 6); k++) if (energy[k] < bv) { bv = energy[k]; best = k; }
    a = Math.min(best + 1, n - 1);
    best = b - 1; bv = 9; for (let k = Math.max(a + 8, b - 12); k < Math.min(n, b + 4); k++) if (energy[k] < bv) { bv = energy[k]; best = k; }
    b = Math.min(n, best + 1);
    let trimmed = 0;
    if (mem && mem.endTrim) { trimmed = Math.min(mem.endTrim, (b - a) * step * 0.3); b -= Math.round(trimmed / step); }
    if (mem && mem.startShave) { a += Math.round(mem.startShave / step); }
    const len = (b - a) * step, why = [];
    const lively = Math.round((s.m / gmean - 1) * 100);
    if (lively > 5) why.push(`runs ${lively}% livelier than the average stretch of your recording`);
    if (s.open / s.m > 1.1) why.push('opens strong, so the hook lands in the first 3 seconds');
    if (energy[Math.max(a, b - 2)] < 0.35) why.push('ends on a natural pause instead of cutting you off mid-sentence');
    if (!why.length) why.push('steady delivery with few dead spots');
    why.push(`${Math.round(len)}s sits ${len >= P.target[0] && len <= P.target[1] ? 'inside' : 'near'} the ${P.short} sweet spot of ${P.target[0]}–${P.target[1]}s`);
    if (trimmed > .4) why.push(`ended ${trimmed.toFixed(1)}s early, because that's how you usually cut`);
    return {start: a * step, end: Math.min(duration, b * step), score: s.score, why: 'Picked because it ' + why.join('; ') + '.'};
  });
}
/* YouTube links: no audio access from a browser, so fall back to pacing heuristics. */
function heuristicCandidates(duration, platform, mem) {
  const P = PLATFORMS[platform], dm = mem && mem.durByPlat && mem.durByPlat[platform];
  const L = Math.min(duration, dm && dm.n >= 2 ? dm.med : P.ideal);
  return [[.06, 'a cold-open moment where speakers usually state their thesis'], [.28, 'the first deep-dive beat, after the intro settles'], [.5, 'the midpoint, where talks typically have their strongest example'], [.72, 'the late payoff, where the argument tends to land']].map(([f, why], i) => {
    const start = Math.max(0, Math.min(duration - L, duration * f));
    return {start, end: start + L, score: 1 - i * .1, why: `Guessed from pacing (YouTube links give me no audio to listen to): this is ${why}. Upload the file itself for loudness-based picks.`};
  });
}
