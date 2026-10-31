"""Shiny local server: serves the site, fetches YouTube videos / podcast audio, and listens to them (speech to text).

Run:  python server.py   (then open http://localhost:5173)
Only use the link fetch on media you own or have rights to clip.

A "hunt" runs as a background job so the page can show real progress. The slow parts overlap: the small audio track is fetched and
read (human subtitles if the video has them, otherwise speech-to-text) while the bigger video is still downloading, so the wait is
roughly max(download, listening), not their sum.
"""
import base64, hmac, json, os, re, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, '.cache')
os.makedirs(CACHE, exist_ok=True)
lock = threading.Lock()
JOBS = {}


def fetch_youtube(url):
    import yt_dlp
    m = re.search(r'(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})', url)
    if not m:
        raise ValueError('That does not look like a YouTube link.')
    vid = m.group(1)
    import imageio_ffmpeg  # bundled ffmpeg, used to merge YouTube's separate video+audio streams
    opts = {'format': 'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b', 'merge_output_format': 'mp4',
            'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(), 'outtmpl': os.path.join(CACHE, '%(id)s.%(ext)s'),
            'quiet': True, 'noplaylist': True, 'max_filesize': 800 * 1024 * 1024}
    with lock:  # one download per video at a time
        with yt_dlp.YoutubeDL(opts) as y:
            info = y.extract_info(f'https://www.youtube.com/watch?v={vid}', download=True)
            path = y.prepare_filename(info)
    return {'file': '/media/' + os.path.basename(path), 'title': info.get('title', ''), 'duration': info.get('duration', 0)}


def fetch_audio(url):
    """Podcast links: a direct .mp3/.m4a/RSS-enclosure URL, SoundCloud, or any page yt-dlp can read. Saved as mp3."""
    import yt_dlp, imageio_ffmpeg
    if not re.match(r'https?://', url):
        raise ValueError('That does not look like a web link.')
    if 'spotify.com' in url:
        raise ValueError('Spotify podcasts are copy-protected and cannot be downloaded. Use the show\'s own site, its mp3 link, or upload the file.')
    opts = {'format': 'bestaudio/best', 'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(), 'restrictfilenames': True,
            'outtmpl': os.path.join(CACHE, '%(extractor)s-%(id).60B.%(ext)s'), 'quiet': True, 'noplaylist': True, 'max_filesize': 800 * 1024 * 1024,
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '96'}]}
    with lock:
        with yt_dlp.YoutubeDL(opts) as y:
            info = y.extract_info(url, download=True)
            path = os.path.splitext(y.prepare_filename(info))[0] + '.mp3'
    return {'file': '/media/' + os.path.basename(path), 'title': info.get('title', '') or '', 'duration': info.get('duration', 0)}


_models = {}
tlock = threading.Lock()


def get_model(name):
    """Load a speech model once. Tries the local copy first so there is no network check on every start."""
    from faster_whisper import WhisperModel
    if name not in _models:
        kw = dict(device='cpu', compute_type='int8', cpu_threads=os.cpu_count() or 4)
        try:
            _models[name] = WhisperModel(name, local_files_only=True, **kw)
        except Exception:
            _models[name] = WhisperModel(name, **kw)
    return _models[name]


def decode(path):
    """Mono 16 kHz float samples, decoded with the bundled ffmpeg (also avoids PyAV version clashes)."""
    import subprocess, numpy as np, imageio_ffmpeg
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def energy_of(a):
    """Loudness every 0.25 s, scaled to the loud end and lightly smoothed (the picker's fallback signal)."""
    import numpy as np
    W = 4000
    n = len(a) // W
    if n < 2:
        return []
    e = np.sqrt((a[:n * W].reshape(n, W) ** 2).mean(axis=1))
    ref = float(np.percentile(e, 95)) or 1.0
    k = np.convolve(np.minimum(1.0, e / ref), np.ones(3) / 3, mode='same')
    return [round(float(v), 3) for v in k]


def transcribe_array(a, progress=None):
    """Local speech-to-text (faster-whisper). English model by default; set SHINY_WHISPER=base for other languages.
    Very long audio uses the smaller, faster model unless SHINY_WHISPER says otherwise."""
    total = max(1.0, len(a) / 16000.0)
    name = os.environ.get('SHINY_WHISPER') or ('base.en' if total <= 2700 else 'tiny.en')
    with tlock:
        model = get_model(name)
        segs, _ = model.transcribe(a, vad_filter=True, beam_size=1, condition_on_previous_text=False)
        out = []
        for s in segs:
            if s.text.strip():
                out.append({'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip()})
            if progress:
                progress(min(1.0, s.end / total))
        return out


def transcribe(path):
    return transcribe_array(decode(path))


def captions_from(info):
    """A video's own human-written English subtitles, if it has them: instant and more accurate than listening. Else None."""
    import urllib.request
    subs = info.get('subtitles') or {}
    for lang in sorted(k for k in subs if k.lower().startswith('en')):
        fm = {f.get('ext'): f.get('url') for f in subs[lang] if f.get('url')}
        if 'json3' not in fm:
            continue
        try:
            data = json.loads(urllib.request.urlopen(fm['json3'], timeout=20).read().decode('utf-8'))
        except Exception:
            continue
        out = []
        for ev in data.get('events', []):
            if not ev.get('segs'):
                continue
            t = ''.join(g.get('utf8', '') for g in ev['segs']).replace('\n', ' ')
            t = re.sub(r'\[[^\]]*\]|\([^)]*\)|[♪♫]', ' ', t)
            t = re.sub(r'^\s*>>\s*', '', re.sub(r'\s+', ' ', t)).strip()
            if t:
                st = ev.get('tStartMs', 0) / 1000.0
                out.append({'start': round(st, 2), 'end': round(st + ev.get('dDurationMs', 0) / 1000.0, 2), 'text': t})
        if len(out) >= 3:
            return out
    return None


def run_hunt(jid, url, kind):
    j = JOBS[jid]
    st = {'vid': 0.0, 'trn': 0.0}
    seen = {}

    def push(text=None):
        if kind == 'video':
            j['pct'] = round(min(96, 6 + 30 * st['vid'] + 60 * st['trn']), 1)
        else:
            j['pct'] = round(min(96, 6 + 90 * st['trn']), 1)
        if text:
            j['text'] = text
        elif st['trn'] < .12 and kind == 'video':
            j['text'] = 'Fetching the video (%d%%)...' % int(st['vid'] * 100)

    def hook(d):   # download progress, summed over the streams yt-dlp is fetching
        if d.get('status') == 'downloading':
            seen[d.get('filename')] = (d.get('downloaded_bytes') or 0, d.get('total_bytes') or d.get('total_bytes_estimate') or 0)
            got, tot = sum(v[0] for v in seen.values()), sum(v[1] for v in seen.values())
            if tot:
                f = min(.99, got / tot)
                if kind == 'video':
                    st['vid'] = max(st['vid'], f)
                    push()
                else:
                    st['trn'] = max(st['trn'], .08 * f)   # a podcast is only audio: its download is the first slice of the work
                    push('Fetching the podcast (%d%%)...' % int(f * 100))

    try:
        import yt_dlp, imageio_ffmpeg
        base = {'quiet': True, 'noplaylist': True, 'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(), 'restrictfilenames': True, 'max_filesize': 800 * 1024 * 1024}
        j.update(stage='looking', pct=2, text='Finding the video...')
        title = ''
        if kind == 'video':
            m = re.search(r'(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})', url)
            if not m:
                raise ValueError('That does not look like a YouTube link.')
            page, vid = f'https://www.youtube.com/watch?v={m.group(1)}', 'Youtube-' + m.group(1)
        else:
            if not re.match(r'https?://', url):
                raise ValueError('That does not look like a web link.')
            if 'spotify.com' in url:
                raise ValueError('Spotify podcasts are copy-protected and cannot be downloaded. Use the show\'s own site, its mp3 link, or upload the file.')
            page = url
            with yt_dlp.YoutubeDL(base) as y:
                info = y.extract_info(page, download=False)
            vid, title = re.sub(r'[^\w.-]', '_', f"{info.get('extractor_key', 'x')}-{info['id']}")[:70], info.get('title', '') or ''
            j.update(title=title, pct=6, text='Found it. Sending the magpie to fetch it...')
        cj = os.path.join(CACHE, vid + '.hunt.json')
        media = os.path.join(CACHE, vid + ('.mp4' if kind == 'video' else '.mp3'))
        if os.path.exists(cj) and os.path.exists(media):   # seen before: nothing to redo
            r = json.load(open(cj, encoding='utf-8'))
            r['file'] = '/media/' + os.path.basename(media)
            j.update(stage='done', pct=100, result=r)
            return
        box = {}

        def get_video():
            try:
                with yt_dlp.YoutubeDL(dict(base, format='bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b', merge_output_format='mp4',
                                           outtmpl=os.path.join(CACHE, vid + '.%(ext)s'), progress_hooks=[hook])) as y:
                    y.extract_info(page, download=True)
                st['vid'] = 1.0
            except Exception as e:
                box['verr'] = e
            push()

        def get_audio_and_listen():
            try:
                if kind == 'video':   # a small audio-only file is enough to listen to, and arrives long before the video
                    with yt_dlp.YoutubeDL(dict(base, format='bestaudio[ext=m4a]/bestaudio', outtmpl=os.path.join(CACHE, vid + '.a.%(ext)s'))) as y:
                        ai = y.extract_info(page, download=True)
                        apath = y.prepare_filename(ai)
                    box['title'] = ai.get('title', '') or ''
                    j['title'] = box['title']
                else:
                    with yt_dlp.YoutubeDL(dict(base, format='bestaudio/best', outtmpl=os.path.join(CACHE, vid + '.%(ext)s'), progress_hooks=[hook],
                                               postprocessors=[{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '96'}])) as y:
                        ai = y.extract_info(page, download=True)
                    apath = media
                    st['vid'] = 1.0
                st['trn'] = .08
                push('Listening to the words...')
                a = decode(apath)
                box['dur'] = len(a) / 16000.0
                box['energy'] = energy_of(a)
                st['trn'] = .12
                caps = captions_from(ai)   # human-written subtitles beat listening: instant and accurate
                if caps:
                    box['segs'] = caps
                    push('Reading the subtitles...')
                else:
                    push('Listening to the words...')
                    try:
                        box['segs'] = transcribe_array(a, lambda f: (st.__setitem__('trn', .12 + .88 * f), push('Listening to the words (%d%%)...' % int(f * 100))))
                    except ImportError:
                        box['segs'], box['terr'] = [], 'Transcription needs: python -m pip install faster-whisper'
                st['trn'] = 1.0
            except Exception as e:
                box['aerr'] = e
            push()

        ts = [threading.Thread(target=get_audio_and_listen)]
        if kind == 'video':
            ts.append(threading.Thread(target=get_video))
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        if box.get('verr'):
            raise box['verr']
        if box.get('aerr'):
            raise box['aerr']
        if not os.path.exists(media):
            raise RuntimeError('The download finished but the file is missing.')
        title = title or box.get('title', '')
        r = {'duration': box.get('dur') or 0, 'energy': box.get('energy', []), 'step': 0.25, 'transcript': box.get('segs', []), 'title': title}
        if box.get('terr'):
            r['transcriptError'] = box['terr']
        json.dump(r, open(cj, 'w', encoding='utf-8'))
        r['file'] = '/media/' + os.path.basename(media)
        j.update(stage='done', pct=100, text='Back with treasure!', result=r)
    except Exception as e:
        j.update(stage='error', error=re.sub(r'\x1b\[[0-9;]*m', '', str(e))[:300])


def start_hunt(url, kind):
    now = time.time()
    for k in [k for k, v in JOBS.items() if now - v['t'] > 3600]:
        JOBS.pop(k, None)
    jid = os.urandom(6).hex()
    JOBS[jid] = {'t': now, 'stage': 'looking', 'pct': 0, 'text': 'Warming up...'}
    threading.Thread(target=run_hunt, args=(jid, url, kind), daemon=True).start()
    return jid


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def authed(self):
        """If SHINY_PASSWORD is set (do this on a public host), the whole site asks for it. The username can be anything."""
        pw = os.environ.get('SHINY_PASSWORD')
        if not pw:
            return True
        try:
            got = base64.b64decode(self.headers.get('Authorization', 'Basic ')[6:]).decode('utf-8', 'ignore').split(':', 1)[1]
        except Exception:
            got = ''
        if hmac.compare_digest(got, pw):
            return True
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Shiny"')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return False

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')   # always re-check files, so an update shows up on a normal reload
        super().end_headers()

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.authed():
            return
        if urlparse(self.path).path != '/api/transcribe':
            return self.send_error(404)
        tmp = os.path.join(CACHE, 'upload-' + os.urandom(4).hex())
        try:
            n = int(self.headers.get('Content-Length', 0))
            with open(tmp, 'wb') as f:
                while n > 0:
                    chunk = self.rfile.read(min(n, 1 << 20))
                    if not chunk:
                        break
                    f.write(chunk)
                    n -= len(chunk)
            self.reply(200, {'segments': transcribe(tmp)})
        except ImportError:
            self.reply(501, {'error': 'Transcription needs: python -m pip install faster-whisper'})
        except Exception as e:
            self.reply(500, {'error': str(e)[:300]})
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    def do_GET(self):
        if not self.authed():
            return
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == '/api/hunt':
            kind = 'audio' if q.get('kind', [''])[0] == 'audio' else 'video'
            self.reply(200, {'job': start_hunt(q.get('url', [''])[0], kind)})
        elif u.path == '/api/job':
            j = JOBS.get(q.get('id', [''])[0])
            if not j:
                return self.reply(404, {'error': 'unknown job'})
            self.reply(200, {k: v for k, v in j.items() if k != 't'})
        elif u.path in ('/api/yt', '/api/podcast'):
            try:
                url = q.get('url', [''])[0]
                out = fetch_youtube(url) if u.path == '/api/yt' else fetch_audio(url)
                code = 200
            except Exception as e:
                out, code = {'error': re.sub(r'\x1b\[[0-9;]*m', '', str(e))[:300]}, 400
            self.reply(code, out)
        elif u.path.startswith('/media/'):
            self.path = '/.cache/' + os.path.basename(u.path)
            super().do_GET()
        elif u.path.startswith('/.cache') or u.path.endswith('.py'):
            self.send_error(404)
        else:
            super().do_GET()


if __name__ == '__main__':
    # Hosts like Railway set PORT and need the server reachable from outside; on your own computer it stays private to you.
    port = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 5173))
    host = '0.0.0.0' if os.environ.get('PORT') else '127.0.0.1'
    print(f'Shiny on http://localhost:{port}' + (' (public host mode)' if host == '0.0.0.0' else ''))

    def warm():   # load the speech model now, so the first hunt does not pay for it
        try:
            get_model(os.environ.get('SHINY_WHISPER') or 'base.en')
        except Exception:
            pass
    threading.Thread(target=warm, daemon=True).start()
    ThreadingHTTPServer((host, port), H).serve_forever()
