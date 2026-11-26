"""
MediaSave 4K — paste a link from Instagram, TikTok, Facebook, Behance, Pinterest,
X, YouTube and hundreds more sites; get the photo or video in the highest
resolution the site has, and without watermarks (the clean stream is always chosen).

* Photos: the original-size file (gallery-dl).  Videos: best video + best audio,
  never the watermarked version (yt-dlp).
* Optional: upscales every file to 4K (fits inside 3840 x 2160, keeping the
  aspect ratio) with Lanczos resampling + light sharpening.
* Runs on your computer; your phone uses it over Wi-Fi (scan the QR code),
  or from anywhere with  `python app.py --anywhere`  (secure HTTPS link).

Run:  python app.py
"""

from __future__ import annotations

import argparse
import hmac
import io
import ipaddress
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
import zipfile
from pathlib import Path
from urllib.parse import quote, urlparse, urlunparse

from flask import (Flask, Response, abort, jsonify, redirect, render_template,
                   request, send_file, send_from_directory)

# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #
BASE_DIR = Path(__file__).resolve().parent
# Online mode: running on a cloud host (Render sets RENDER=true) instead of your own computer
HOSTED = bool(os.environ.get("RENDER")) or os.environ.get("MEDIASAVE_HOSTED") == "1"
PUBLIC_URL = (os.environ.get("MEDIASAVE_PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
ALLOW_VIDEO_UPSCALE = os.environ.get("ALLOW_VIDEO_UPSCALE", "0" if HOSTED else "1") == "1"
KEEP_HOURS = float(os.environ.get("KEEP_HOURS", "3" if HOSTED else "0"))   # 0 = keep forever
DOWNLOAD_DIR = Path(os.environ.get("MEDIASAVE_DIR") or os.environ.get("INSTASAVE_DIR")
                    or ("/tmp/mediasave" if HOSTED else BASE_DIR / "downloads")).resolve()
CONFIG_FILE = BASE_DIR / "config.json"
COOKIES_FILE = BASE_DIR / "cookies.txt"
# Online: a cookies.txt added as a Render "Secret File" (read-only) is copied somewhere writable
for _src in (Path("/etc/secrets/cookies.txt"), BASE_DIR / "cookies.txt"):
    if HOSTED and _src.exists():
        try:
            COOKIES_FILE = Path("/tmp/mediasave_cookies.txt")
            COOKIES_FILE.write_bytes(_src.read_bytes())
        except Exception:
            COOKIES_FILE = _src
        break
HOST = os.environ.get("INSTASAVE_HOST", "0.0.0.0")     # 0.0.0.0 = reachable from your phone
PORT = int(os.environ.get("INSTASAVE_PORT", "5000"))

TARGET_LONG, TARGET_SHORT = 3840, 2160          # 4K UHD box
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
SKIP_EXT = {".part", ".json", ".txt", ".ytdl", ".tmp", ".zip"}
IMAGE_EXT |= {".gif", ".avif", ".bmp", ".tif", ".tiff"}

# Known sites → which downloader to try first.
#   "image": gallery-dl first (original-size photos, albums, carousels)
#   "video": yt-dlp first (best video + best audio)
#   "auto":  decided per link (see download_order)
PLATFORMS: list[tuple[str, str, str]] = [
    ("Instagram", r"(^|\.)(instagram\.com|instagr\.am)$", "auto"),
    ("TikTok", r"(^|\.)tiktokv?\.com$", "image"),        # gallery-dl: photo posts + clean videos
    ("Douyin", r"(^|\.)(douyin|iesdouyin)\.com$", "video"),
    ("Facebook", r"(^|\.)(facebook\.com|fb\.watch|fb\.com)$", "auto"),
    ("Threads", r"(^|\.)threads\.(net|com)$", "video"),
    ("Behance", r"(^|\.)behance\.net$", "image"),
    ("Pinterest", r"(^|\.)(pinterest\.[a-z.]+|pin\.it)$", "image"),
    ("X / Twitter", r"(^|\.)(x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com)$", "image"),
    ("YouTube", r"(^|\.)(youtube\.com|youtu\.be)$", "video"),
    ("Reddit", r"(^|\.)(reddit\.com|redd\.it)$", "image"),
    ("Tumblr", r"(^|\.)tumblr\.com$", "image"),
    ("Flickr", r"(^|\.)(flickr\.com|flic\.kr)$", "image"),
    ("DeviantArt", r"(^|\.)deviantart\.com$", "image"),
    ("ArtStation", r"(^|\.)artstation\.com$", "image"),
    ("Imgur", r"(^|\.)imgur\.com$", "image"),
    ("Dribbble", r"(^|\.)dribbble\.com$", "image"),
    ("Vimeo", r"(^|\.)vimeo\.com$", "video"),
    ("Dailymotion", r"(^|\.)(dailymotion\.com|dai\.ly)$", "video"),
    ("Bilibili", r"(^|\.)(bilibili\.com|b23\.tv)$", "video"),
    ("Twitch", r"(^|\.)twitch\.tv$", "video"),
]
SCHEME_URL_RE = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
BARE_URL_RE = re.compile(          # links pasted without https://
    r"(?<![\w/.:@-])(?:(?:www|m|vt|vm)\.)?(?:instagram\.com|tiktok\.com|facebook\.com|fb\.watch|"
    r"behance\.net|pinterest\.com|pin\.it|x\.com|twitter\.com|youtube\.com|youtu\.be|"
    r"threads\.net|threads\.com|douyin\.com)/[^\s\"'<>]+", re.IGNORECASE)

# Never pick a watermarked stream (TikTok/Douyin mark theirs "watermarked");
# otherwise: highest resolution, then the most compatible codec at that size.
VIDEO_FORMAT = ("bv*[format_note!*=watermark]+ba/b[format_note!*=watermark]/"
                "bv*+ba/b")
VIDEO_SORT = "res,vcodec:h264,fps,br"
MAX_ITEMS = 100           # safety cap when someone pastes a whole profile/playlist
BROWSERS = {"chrome", "firefox", "edge", "safari", "brave", "opera",
            "chromium", "vivaldi"}
DOWNLOAD_TIMEOUT = 15 * 60
ENCODE_TIMEOUT = 60 * 60
MAX_JOBS_KEPT = 60
COOKIE_NAME = "instasave_key"

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
app = Flask(__name__, static_folder="static", static_url_path="/static")
if HOSTED:   # trust the host's proxy for the real visitor IP and https
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
STATE = {"tunnel": None}          # public https URL when started with --anywhere


def load_config() -> tuple[str, str]:
    """6-digit PIN that phones need (your own computer never needs it) + a server id."""
    try:
        cfg = json.loads(CONFIG_FILE.read_text())
    except Exception:
        cfg = {}
    changed = False
    if not str(cfg.get("pin", "")).strip():
        cfg["pin"] = f"{secrets.randbelow(10**6):06d}"
        changed = True
    if not cfg.get("id"):
        cfg["id"] = secrets.token_hex(6)
        changed = True
    if changed:
        try:
            CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
        except Exception:
            pass
    pin = (os.environ.get("MEDIASAVE_PIN") or os.environ.get("INSTASAVE_PIN")
           or str(cfg["pin"]).strip()).strip()
    return pin, str(cfg["id"])


PIN, SERVER_ID = load_config()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def find_ffmpeg() -> str | None:
    """System ffmpeg if installed, otherwise the one bundled by imageio-ffmpeg."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


FFMPEG = find_ffmpeg()


def lan_ip() -> str:
    """This computer's address on the Wi-Fi network (no packets are sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def lan_url() -> str:
    return f"http://{lan_ip()}:{PORT}"


def stable_url() -> str | None:
    """http://your-computer-name.local:5000 — keeps working when the Wi-Fi IP changes."""
    name = socket.gethostname().split(".")[0]
    name = re.sub(r"[^A-Za-z0-9-]", "", name).strip("-").lower()
    return f"http://{name}.local:{PORT}" if name else None


def platform_of(url: str) -> tuple[str, str]:
    host = (urlparse(url).hostname or "").lower()
    for name, pattern, kind in PLATFORMS:
        if re.search(pattern, host):
            return name, kind
    return (host.removeprefix("www.") or "Link"), "unknown"


def clean_url(raw: str) -> str | None:
    raw = raw.rstrip(").,;!?]}»”’'\"")
    if not raw.lower().startswith("http"):
        raw = "https://" + raw
    try:
        p = urlparse(raw)
    except ValueError:
        return None
    name, _ = platform_of(raw)
    # Tracking junk (?igsh=, ?_t=…) is safe to drop on these; other sites need their query (?v=…)
    query = "" if name in ("Instagram", "TikTok", "Threads") else p.query
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path, "", query, ""))


def is_public_url(url: str) -> bool:
    """Any normal web link — but never this computer or devices on your home network."""
    try:
        p = urlparse(url)
    except ValueError:
        return False
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or not host or "." not in host:
        return False
    if host == "localhost" or host.endswith((".local", ".localhost", ".lan", ".home", ".internal")):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


def extract_urls(text: str) -> list[str]:
    """Pull links out of anything — a bare link or a whole shared message."""
    text = text or ""
    found = [m.group(0) for m in SCHEME_URL_RE.finditer(text)]
    rest = SCHEME_URL_RE.sub(" ", text)
    found += [m.group(0) for m in BARE_URL_RE.finditer(rest)]
    out = []
    for raw in found:
        u = clean_url(raw)
        if u and is_public_url(u) and urlparse(u).path.strip("/") + urlparse(u).query and u not in out:
            out.append(u)
    return out


def resolve_share_link(url: str) -> str:
    """Facebook 'share' / fb.watch links are redirects — follow them to the real post."""
    p = urlparse(url)
    host = (p.hostname or "").lower()
    if not (host.endswith("fb.watch") or (host.endswith("facebook.com") and p.path.startswith("/share"))):
        return url
    import urllib.request
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            final = r.geturl()
    except Exception:
        return url
    if "login" in final or "checkpoint" in final or final.rstrip("/") == url.rstrip("/"):
        return url
    return clean_url(final) or url


def download_order(url: str) -> str:
    """'image' → gallery-dl first, 'video' → yt-dlp first."""
    name, kind = platform_of(url)
    path = urlparse(url).path.lower()
    if kind in ("image", "video"):
        return kind
    if name == "Instagram":
        return "video" if any(s in path for s in ("/reel/", "/reels/", "/tv/")) else "image"
    if name == "Facebook":
        photo = any(s in path for s in ("/photo", "photo.php", "/photos", "/media/set"))
        return "image" if photo else "video"
    if path.endswith(tuple(IMAGE_EXT)):
        return "image"
    return "video"                 # unknown sites: yt-dlp knows ~1,800 of them


def target_size(w: int, h: int) -> tuple[int, int] | None:
    """Largest size (even numbers) that fits a 4K box in the same orientation."""
    if not w or not h:
        return None
    scale = min(TARGET_LONG / max(w, h), TARGET_SHORT / min(w, h))
    if scale <= 1.01:                      # already 4K-sized
        return None
    return int(round(w * scale / 2) * 2), int(round(h * scale / 2) * 2)


def image_size(path: Path) -> tuple[int, int] | None:
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def video_size(path: Path) -> tuple[int, int] | None:
    if not FFMPEG:
        return None
    proc = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)],
                          capture_output=True, text=True, errors="replace")
    for line in proc.stderr.splitlines():
        if "Video:" in line:
            m = re.search(r",\s*(\d{2,5})x(\d{2,5})", line)
            if m:
                return int(m.group(1)), int(m.group(2))
    return None


def media_kind(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return None


# --------------------------------------------------------------------------- #
# Phone access: PIN check (your own computer is always allowed)
# --------------------------------------------------------------------------- #
FAILS: dict[str, list[float]] = {}          # ip -> [count, locked_until]
PUBLIC_PATHS = ("/static/", "/manifest.webmanifest", "/sw.js", "/login", "/favicon.ico",
                "/api/ping")


def is_local_request() -> bool:
    if request.headers.get("Cf-Connecting-Ip") or request.headers.get("X-Forwarded-For"):
        return False                        # came in through the internet tunnel
    return request.remote_addr in ("127.0.0.1", "::1")


def client_ip() -> str:
    return request.headers.get("Cf-Connecting-Ip") or request.remote_addr or "?"


def pin_ok(value: str | None) -> bool:
    return bool(value) and hmac.compare_digest(str(value).strip(), PIN)


@app.before_request
def require_pin():
    if is_local_request() or request.path.startswith(PUBLIC_PATHS):
        return None
    if pin_ok(request.cookies.get(COOKIE_NAME)) or pin_ok(request.headers.get("X-Key")):
        return None
    key = request.args.get("key")
    if key is not None and pin_ok(key) and request.path.startswith(("/files/", "/api/")):
        return None                         # e.g. the iPhone "MediaSave Save" Shortcut
    if key is not None:
        if pin_ok(key):                     # QR code / Shortcut link: remember this phone
            args = {k: v for k, v in request.args.items() if k != "key"}
            target = request.path + ("?" + "&".join(f"{k}={quote(v, safe='')}"
                                                    for k, v in args.items()) if args else "")
            resp = redirect(target)
            set_key_cookie(resp)
            return resp
        note_fail()
    if request.path.startswith("/api/") or request.path.startswith("/files/"):
        return jsonify({"error": "PIN required"}), 401
    nxt = request.full_path if request.query_string else request.path
    return render_template("login.html", next=nxt, error=None, numeric=PIN.isdigit(), hosted=HOSTED)


def set_key_cookie(resp):
    resp.set_cookie(COOKIE_NAME, PIN, max_age=400 * 24 * 3600, httponly=True,
                    samesite="Lax", secure=request.is_secure or bool(
                        request.headers.get("Cf-Connecting-Ip")))


GLOBAL_FAILS: list[float] = []


def note_fail():
    rec = FAILS.setdefault(client_ip(), [0, 0.0])
    rec[0] += 1
    if rec[0] >= 8:
        rec[1] = time.time() + 600
    now = time.time()                       # many wrong PINs from many places: pause all logins
    GLOBAL_FAILS[:] = [t for t in GLOBAL_FAILS if now - t < 600] + [now]


def logins_paused() -> bool:
    return len([t for t in GLOBAL_FAILS if time.time() - t < 600]) >= 60


@app.post("/login")
def login():
    rec = FAILS.get(client_ip(), [0, 0.0])
    nxt = request.form.get("next") or "/"
    if not nxt.startswith("/") or nxt.startswith("//"):
        nxt = "/"
    if rec[1] > time.time() or logins_paused():
        return render_template("login.html", next=nxt, numeric=PIN.isdigit(), hosted=HOSTED,
                               error="Too many wrong tries. Wait 10 minutes."), 429
    if pin_ok(request.form.get("pin")):
        FAILS.pop(client_ip(), None)
        resp = redirect(nxt)
        set_key_cookie(resp)
        return resp
    note_fail()
    return render_template("login.html", next=nxt, numeric=PIN.isdigit(), hosted=HOSTED,
                           error="Wrong PIN." if HOSTED else
                           "Wrong PIN — check the app window on your computer."), 401


# --------------------------------------------------------------------------- #
# Upscaling
# --------------------------------------------------------------------------- #
def upscale_image(src: Path, size: tuple[int, int]) -> Path:
    from PIL import Image, ImageFilter
    dst = src.with_name(f"{src.stem}_4K{src.suffix}")
    with Image.open(src) as im:
        icc = im.info.get("icc_profile")
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        big = im.resize(size, Image.Resampling.LANCZOS)
        big = big.filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
        kwargs = {"icc_profile": icc} if icc else {}
        ext = src.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            big.convert("RGB").save(dst, "JPEG", quality=95, subsampling=0, **kwargs)
        elif ext == ".webp":
            big.save(dst, "WEBP", quality=95, method=6, **kwargs)
        else:
            big.save(dst, "PNG", optimize=True, **kwargs)
    return dst


def upscale_video(src: Path, size: tuple[int, int], best: bool) -> Path:
    if not FFMPEG:
        raise RuntimeError("ffmpeg not found — run: pip install imageio-ffmpeg")
    dst = src.with_name(f"{src.stem}_4K.mp4")
    w, h = size
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
        "-map", "0:v:0", "-map", "0:a?",
        "-vf", f"scale={w}:{h}:flags=lanczos,unsharp=5:5:0.5:5:5:0.0",
        "-c:v", "libx264", "-preset", "slow" if best else "veryfast",
        "-crf", "17" if best else "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dst),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          errors="replace", timeout=ENCODE_TIMEOUT)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip()[-600:] or "ffmpeg failed")
    return dst


# --------------------------------------------------------------------------- #
# Jobs
# --------------------------------------------------------------------------- #
class Job:
    def __init__(self, url: str, upscale: bool, best: bool, browser: str | None):
        self.id = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
        self.url, self.upscale, self.best, self.browser = url, upscale, best, browser
        self.status = "queued"          # queued | downloading | upscaling | done | error
        self.error: str | None = None
        self.log: list[str] = []
        self.files: list[dict] = []
        self.dir = DOWNLOAD_DIR / self.id
        self.created = time.time()
        self.platform = platform_of(url)[0]
        self.watermark = False

    def say(self, msg: str) -> None:
        self.log.append(f"{time.strftime('%H:%M:%S')}  {msg}")

    def to_dict(self) -> dict:
        return {"id": self.id, "url": self.url, "status": self.status,
                "error": self.error, "log": self.log[-40:], "files": self.files,
                "upscale": self.upscale, "created": self.created,
                "platform": self.platform, "watermark": self.watermark}


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.Lock()
WORK_LOCK = threading.Semaphore(2)      # at most 2 jobs at once


def auth_args(browser: str | None) -> list[str]:
    if browser and not HOSTED:          # online there is no browser to borrow a login from
        return ["--cookies-from-browser", browser]
    if COOKIES_FILE.exists():
        return ["--cookies", str(COOKIES_FILE)]
    return []


def run_tool(cmd: list[str]) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              errors="replace", timeout=DOWNLOAD_TIMEOUT)
    except subprocess.TimeoutExpired:
        return 1, "timed out"
    return proc.returncode, (proc.stdout + "\n" + proc.stderr).strip()


def with_gallery_dl(job: Job) -> tuple[int, str]:
    job.say("Trying gallery-dl (original-size photos, albums, posts)…")
    ytdl_opts = {"format": VIDEO_FORMAT, "format_sort": VIDEO_SORT.split(",")}
    if FFMPEG:   # lets it merge the best video + best audio streams
        ytdl_opts["ffmpeg_location"] = FFMPEG
    cmd = [sys.executable, "-m", "gallery_dl", "-D", str(job.dir),
           "--no-mtime", "--range", f"1-{MAX_ITEMS}", *auth_args(job.browser),
           "-o", "downloader.ytdl.raw-options=" + json.dumps(ytdl_opts),
           "-o", "extractor.tiktok.audio=false",        # skip the music-only file
           job.url]
    return run_tool(cmd)


def with_yt_dlp(job: Job) -> tuple[int, str]:
    job.say("Trying yt-dlp (highest-resolution video, no watermark)…")
    cmd = [sys.executable, "-m", "yt_dlp",
           "-f", VIDEO_FORMAT, "-S", VIDEO_SORT,
           "--merge-output-format", "mp4", "--no-mtime", "--no-playlist",
           "--playlist-items", f"1:{MAX_ITEMS}",
           "-o", str(job.dir / "%(title).60B_%(id)s_%(autonumber)02d.%(ext)s"),
           "--restrict-filenames",
           "--no-simulate", "--print", "after_move:@@FORMAT %(format_note)s",
           *auth_args(job.browser)]
    if FFMPEG:
        cmd += ["--ffmpeg-location", FFMPEG]
    cmd.append(job.url)
    code, out = run_tool(cmd)
    if any(l.startswith("@@FORMAT") and "watermark" in l.lower() for l in out.splitlines()):
        job.watermark = True
        job.say("Note: this site only offered a watermarked version of this video.")
    return code, out


def collect(job: Job) -> list[Path]:
    if not job.dir.exists():
        return []
    out = []
    for p in sorted(job.dir.rglob("*")):
        if p.is_file() and p.suffix.lower() not in SKIP_EXT and media_kind(p) \
                and not p.stem.endswith("_4K"):
            out.append(p)
    return out


def file_entry(path: Path, kind: str, upscaled: bool) -> dict:
    size = image_size(path) if kind == "image" else video_size(path)
    rel = path.relative_to(DOWNLOAD_DIR).as_posix()
    return {"name": path.name, "url": f"/files/{rel}", "kind": kind,
            "width": size[0] if size else None, "height": size[1] if size else None,
            "bytes": path.stat().st_size, "upscaled": upscaled,
            "source": source_name(path) if upscaled else path.name}


def source_name(upscaled: Path) -> str:
    """photo_4K.jpg → photo.jpg (4K videos are always .mp4, so look for the real original)."""
    stem = upscaled.stem.removesuffix("_4K")
    for cand in sorted(upscaled.parent.glob(glob_escape(stem) + ".*")):
        if media_kind(cand) and not cand.stem.endswith("_4K"):
            return cand.name
    return stem + upscaled.suffix


def glob_escape(text: str) -> str:
    return re.sub(r"([\[\]*?])", r"[\1]", text)


def friendly_error(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ("login", "401", "403", "rate-limit", "rate limit",
                            "checkpoint", "redirect", "cookies")):
        return ("This site asked for a login. In Settings → Login, pick the browser on your "
                "computer where you're logged in to this site, then try again.")
    if "unsupported url" in t or "no suitable extractor" in t:
        return "This website isn't supported, or there's no photo/video at this link."
    if "404" in t or "not found" in t or "unavailable" in t:
        return "Post not found — it may be private, deleted or the link is wrong."
    return "Download failed. Tap 'Update downloaders' in Settings and try again."


def process(job: Job) -> None:
    with WORK_LOCK:
        try:
            job.status = "downloading"
            job.dir.mkdir(parents=True, exist_ok=True)
            resolved = resolve_share_link(job.url)
            if resolved != job.url:
                job.say(f"Share link → {resolved}")
                job.url = resolved
            order = ([with_yt_dlp, with_gallery_dl] if download_order(job.url) == "video"
                     else [with_gallery_dl, with_yt_dlp])
            last = ""
            for tool in order:
                code, out = tool(job)
                last = out
                if collect(job):
                    break
                tail = out.splitlines()[-1][:160] if out else f"exit {code}"
                job.say(f"…no files ({tail})")
            originals = collect(job)
            if not originals:
                raise RuntimeError(friendly_error(last))
            job.say(f"Downloaded {len(originals)} file(s).")
            for p in originals:
                job.files.append(file_entry(p, media_kind(p), False))

            if job.upscale:
                job.status = "upscaling"
                for p in originals:
                    kind = media_kind(p)
                    size = image_size(p) if kind == "image" else video_size(p)
                    tgt = target_size(*size) if size else None
                    if kind == "video" and not ALLOW_VIDEO_UPSCALE:
                        job.say(f"{p.name}: 4K video copies are off on this server "
                                "(small cloud servers are too slow for it).")
                        continue
                    if p.suffix.lower() == ".gif":
                        job.say(f"{p.name}: animated GIF kept as is.")
                        continue
                    if not tgt:
                        job.say(f"{p.name}: already 4K-size or unreadable, skipped.")
                        continue
                    job.say(f"Upscaling {p.name}  {size[0]}x{size[1]} → {tgt[0]}x{tgt[1]}…")
                    try:
                        dst = (upscale_image(p, tgt) if kind == "image"
                               else upscale_video(p, tgt, job.best))
                        job.files.append(file_entry(dst, kind, True))
                    except Exception as e:      # keep going with other files
                        job.say(f"Upscale failed for {p.name}: {e}")
            job.status = "done"
            job.say("Finished.")
        except Exception as e:
            job.status = "error"
            job.error = str(e)
            job.say(f"Error: {e}")


def start_jobs(urls: list[str], upscale: bool, best: bool, browser: str | None) -> list[dict]:
    created = []
    for u in urls:
        job = Job(u, upscale, best, browser)
        with JOBS_LOCK:
            JOBS[job.id] = job
            for old in sorted(JOBS.values(), key=lambda j: j.created)[:-MAX_JOBS_KEPT]:
                JOBS.pop(old.id, None)      # forget very old jobs (files stay on disk)
        threading.Thread(target=process, args=(job,), daemon=True).start()
        created.append(job.to_dict())
    return created


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    # Phones get a manifest whose start address carries the PIN, so the
    # Home Screen app unlocks itself on first launch (it has its own cookie jar).
    return render_template("index.html", manifest_key="" if is_local_request() else PIN)


@app.get("/share")
def share_target():
    """Android 'Share → MediaSave' lands here (installed app, HTTPS only)."""
    text = " ".join(request.args.get(k, "") for k in ("url", "text", "title"))
    urls = extract_urls(text)
    return redirect("/?url=" + quote(urls[0], safe="") if urls else "/")


@app.get("/api/ping")
def ping():
    """Lets the phone check that the computer (and the stable address) is reachable."""
    resp = jsonify({"ok": True, "id": SERVER_ID})
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/manifest.webmanifest")
def manifest():
    start = "/?app=1"
    if pin_ok(request.args.get("k")):
        start = f"/?key={PIN}&app=1"
    data = {
        "id": "/",
        "name": "MediaSave 4K", "short_name": "MediaSave",
        "description": "Save photos and videos from Instagram, TikTok, Facebook, Behance and more "
                       "in the highest resolution, without watermarks.",
        "start_url": start, "scope": "/", "display": "standalone",
        "background_color": "#0e0f13", "theme_color": "#0e0f13",
        "icons": [
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/static/icon-maskable-512.png", "sizes": "512x512",
             "type": "image/png", "purpose": "maskable"},
        ],
        "share_target": {"action": "/share", "method": "GET",
                         "params": {"title": "title", "text": "text", "url": "url"}},
    }
    return Response(json.dumps(data), mimetype="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return send_from_directory(app.static_folder, "sw.js", mimetype="text/javascript",
                               max_age=0)


@app.get("/api/info")
def info():
    def ver(mod):
        try:
            m = __import__(mod)
            return getattr(getattr(m, "version", m), "__version__", "installed")
        except Exception:
            return None
    local = is_local_request()
    base = PUBLIC_URL or STATE["tunnel"] or lan_url()
    data = {"ffmpeg": bool(FFMPEG), "gallery_dl": ver("gallery_dl"),
            "yt_dlp": ver("yt_dlp"), "cookies_file": COOKIES_FILE.exists(),
            "is_local": local, "lan_url": lan_url(), "tunnel_url": STATE["tunnel"],
            "pin": PIN,
            "shortcut_url": f"{base}/?key={PIN}&url=",
            "stable_url": None if HOSTED else stable_url(), "server_id": SERVER_ID,
            "hosted": HOSTED, "public_url": PUBLIC_URL or None,
            "video_upscale": ALLOW_VIDEO_UPSCALE}
    if local:
        data["folder"] = str(DOWNLOAD_DIR)
    return jsonify(data)


@app.get("/api/qr.svg")
def qr_svg():
    """QR code for the phone link (scanned from the computer screen)."""
    import qrcode
    import qrcode.image.svg
    target = request.args.get("u", "")[:500]
    if not target:
        abort(400)
    img = qrcode.make(target, image_factory=qrcode.image.svg.SvgPathImage, box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), mimetype="image/svg+xml")


@app.get("/api/jobs")
def list_jobs():
    with JOBS_LOCK:
        jobs = sorted(JOBS.values(), key=lambda j: j.created, reverse=True)[:20]
    return jsonify({"jobs": [j.to_dict() for j in jobs]})


@app.post("/api/jobs")
def create_jobs():
    data = request.get_json(silent=True) or {}
    urls = extract_urls(str(data.get("urls", "")))
    if not urls:
        return jsonify({"error": "No link found. In the app (Instagram, TikTok, Facebook…) tap "
                                 "Share → Copy link, then paste it here."}), 400
    browser = (data.get("browser") or "").lower() or None
    if browser and browser not in BROWSERS:
        return jsonify({"error": "Unknown browser."}), 400
    return jsonify({"jobs": start_jobs(urls, bool(data.get("upscale")),
                                       bool(data.get("best")), browser)})


@app.get("/api/jobs/<job_id>")
def get_job(job_id):
    job = JOBS.get(job_id)
    if not job:
        abort(404)
    return jsonify(job.to_dict())


@app.get("/api/jobs/<job_id>/zip")
def job_zip(job_id):
    """All files of one link in a single download (handy for carousels)."""
    job = JOBS.get(job_id)
    if not job or not job.files:
        abort(404)
    which = request.args.get("which", "best")        # best | original | all
    by_source: dict[str, dict] = {}
    for f in job.files:
        if which == "all":
            by_source[f["name"]] = f
        elif which == "original" and not f["upscaled"]:
            by_source[f["source"]] = f
        elif which == "best" and (f["upscaled"] or f["source"] not in by_source):
            by_source[f["source"]] = f
    zpath = job.dir / f"instasave_{job.id}_{which}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_STORED) as z:
        for f in by_source.values():
            z.write(DOWNLOAD_DIR / f["url"].removeprefix("/files/"), f["name"])
    return send_file(zpath, as_attachment=True, download_name=zpath.name)


@app.get("/files/<path:rel>")
def files(rel):
    as_attachment = request.args.get("dl") == "1"
    return send_from_directory(DOWNLOAD_DIR, rel, as_attachment=as_attachment)


@app.post("/api/open-folder")
def open_folder():
    if not is_local_request():
        return jsonify({"error": "Only available on the computer."}), 403
    target = str(DOWNLOAD_DIR)
    try:
        if sys.platform.startswith("win"):
            os.startfile(target)                         # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target])
        else:
            subprocess.Popen(["xdg-open", target])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True})


@app.post("/api/update")
def update_tools():
    """Websites change often — newer downloader versions usually fix breakage."""
    proc = subprocess.run([sys.executable, "-m", "pip", "install", "-U", "--quiet",
                           "yt-dlp", "gallery-dl"],
                          capture_output=True, text=True, errors="replace")
    ok = proc.returncode == 0
    return jsonify({"ok": ok, "message": "Updated — restart the app on your computer to use the new versions."
                    if ok else proc.stderr[-400:]}), (200 if ok else 500)


# --------------------------------------------------------------------------- #
# Start-up
# --------------------------------------------------------------------------- #
def print_qr(text: str) -> None:
    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(text)
        qr.print_ascii(invert=True)
    except Exception:
        pass


def start_tunnel() -> None:
    """Free Cloudflare quick tunnel → secure https link that works on mobile data."""
    try:
        from pycloudflared import try_cloudflare
        print("  Opening a secure internet link (first time downloads cloudflared)…")
        url = try_cloudflare(port=PORT, verbose=False).tunnel
        STATE["tunnel"] = url
        print(f"\n  Phone link from ANYWHERE (https):  {url}/?key={PIN}&install=1\n")
        print_qr(f"{url}/?key={PIN}&install=1")
    except Exception as e:
        print(f"  Could not open the internet link ({e}). Wi-Fi access still works.")


def cleanup_loop() -> None:
    """Online servers have little disk: forget downloads after KEEP_HOURS."""
    while KEEP_HOURS > 0:
        cutoff = time.time() - KEEP_HOURS * 3600
        with JOBS_LOCK:
            for jid, job in list(JOBS.items()):
                if job.created < cutoff and job.status in ("done", "error"):
                    JOBS.pop(jid, None)
        for d in DOWNLOAD_DIR.iterdir() if DOWNLOAD_DIR.exists() else []:
            try:
                if d.is_dir() and d.stat().st_mtime < cutoff and d.name not in JOBS:
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
        time.sleep(600)


if KEEP_HOURS > 0:
    threading.Thread(target=cleanup_loop, daemon=True).start()


def main() -> None:
    parser = argparse.ArgumentParser(description="MediaSave 4K")
    parser.add_argument("--anywhere", action="store_true",
                        help="also create a secure https link so your phone works "
                             "away from home (enables Share-to-app on Android)")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    try:
        sys.stdout.reconfigure(errors="replace")      # odd consoles: never crash on symbols
    except Exception:
        pass

    phone = f"{lan_url()}/?key={PIN}&install=1"
    print("\n  MediaSave 4K is running")
    print(f"  On this computer:   http://127.0.0.1:{PORT}")
    print(f"  On your phone:      {lan_url()}   (same Wi-Fi, PIN {PIN})")
    if stable_url():
        print(f"  Stable address:     {stable_url()}   (used for the Home Screen app when your phone supports it)")
    print("  Or scan this with your phone camera:\n")
    print_qr(phone)
    print(f"  Files are saved in: {DOWNLOAD_DIR}\n")

    if args.anywhere or os.environ.get("INSTASAVE_TUNNEL") == "1":
        threading.Thread(target=start_tunnel, daemon=True).start()
    if not args.no_browser and os.environ.get("INSTASAVE_NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    app.run(host=HOST, port=PORT, debug=False, threaded=True)


if __name__ == "__main__":
    main()
