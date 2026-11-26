# MediaSave 4K

Paste a link from **Instagram, TikTok, Facebook, Behance, Pinterest, X (Twitter), YouTube, Reddit, Douyin, Vimeo, ArtStation, Flickr** and 1,000+ other sites. MediaSave saves the photo or video:

- in the **highest resolution the site has** (original-size photos, best video + best audio)
- **without watermarks**: on TikTok and Douyin it always picks the clean video stream, never the watermarked "download" version
- plus an optional **4K copy** (enlarged to 3840×2160)

You can run it **online** (no computer needed: open it in Safari and add it to your Home Screen) or on **your own computer** (best for Instagram, because home internet is rarely blocked).

---

## Option A: online, no computer needed (recommended for iPhone)

Put MediaSave on Render and you get your own web address like `https://mediasave-xxxx.onrender.com`. Open it in Safari on your iPhone and add it to your Home Screen. It then works anywhere, on Wi-Fi or mobile data, and **Save** puts photos and videos straight into Photos.

1. Create free accounts at **github.com** and **render.com** (you can sign up for Render with your GitHub account).
2. On GitHub, create a new **private** repository called `mediasave`. Click **uploading an existing file** and drag in **everything inside this folder** (`app.py`, `Dockerfile`, `render.yaml`, `templates`, `static`, …). Then click **Commit changes**.
3. Open this link, replacing `YOUR-NAME` with your GitHub username:
   `https://dashboard.render.com/blueprint/new?repo=https://github.com/YOUR-NAME/mediasave`
   Allow Render to access the repository if it asks.
4. Render asks for **MEDIASAVE_PIN**. Type a code you'll remember (8+ characters, for example `sunflower88`). Click **Apply** / **Deploy Blueprint**. The first build takes about 5 minutes.
5. On your iPhone, open the `https://….onrender.com` address in **Safari**, enter your PIN once, and follow the install guide: **⋯ → Share → Add to Home Screen → Add** (iOS 26), or **Share → Add to Home Screen → Add** (older iOS).

Good to know about the online version:
- **Free plan:** the server sleeps after about 15 minutes without use, so the first open after a break takes up to a minute. A paid Render plan stays awake and is faster.
- **Logins:** cloud servers get blocked more often than home internet. TikTok, Facebook (public), Behance and Pinterest usually work. Instagram and YouTube often ask for a login. To add one, export cookies from that site (a "cookies.txt" browser extension, ideally from a spare account) and add the file in Render: **your service → Environment → Secret Files → `cookies.txt`**.
- **4K copies:** 4K copies of photos work. 4K copies of videos are turned off on the free plan because they're too slow; on a paid plan, set `ALLOW_VIDEO_UPSCALE` to `1`.
- **Storage:** downloads are deleted from the server after 3 hours (`KEEP_HOURS`), so save what you want to your phone.
- **Updates:** when a site stops working, open Render → your service → **Manual Deploy → Deploy latest commit**. Each build installs the newest downloaders.

---

## Option B: run it on your own computer

### 1. Start it on your computer

1. Install **Python 3.10+** from https://www.python.org/downloads/ (on Windows, tick **"Add Python to PATH"**).
2. Start it:
   - **Windows:** double-click `run_windows.bat`
   - **Mac / Linux:** run `./run_mac_linux.sh`
3. The first start takes about a minute to set up. Then a window shows a **QR code** and a **PIN**.

> If Windows asks "Allow Python on private networks?", click **Allow**.

### 2. Install it on your iPhone (Home Screen app)

1. Put the iPhone on the **same Wi-Fi** as the computer.
2. Open the **Camera** and scan the QR code (shown in the window and on the MediaSave page on the computer). Safari opens MediaSave and shows an **install guide** with the right steps for your iPhone:
   - **iOS 26:** tap **⋯** next to the address bar → **Share** → scroll down → **Add to Home Screen** → leave **Open as Web App** on → **Add**
   - **iOS 18 and older:** tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**
3. Open **MediaSave** from your Home Screen. It runs full screen like a normal app, with its own icon and launch screen. It unlocks itself, so you don't need to type the PIN.

Good to know:
- If you opened the link inside Instagram, Zalo or another app's browser, the guide asks you to open it in **Safari** first (only Safari can add to the Home Screen).
- **Stable address:** if your iPhone can reach the computer by name (for example `my-pc.local`), MediaSave switches to that name automatically, so the icon keeps working even when the computer's Wi-Fi IP changes. If not, the icon uses the IP. If it ever stops opening, scan the QR code again, or reserve the computer's IP in your router.
- The computer must be **on, awake, and running MediaSave** for the app to work. If it isn't, the app shows *"Can't reach your computer"* with a **Retry** button.

### Save straight to Photos (one-time, about 1 minute, recommended)

iPhone Home Screen web apps can't download files by themselves. Without the Shortcut:
- **Photos:** tap **Save** → the photo opens full screen → press and hold → **Save to Photos**.
- **Videos:** save them with the Shortcut below, or use MediaSave in Safari instead of the Home Screen app.

**With the "MediaSave Save" Shortcut**, **Save** puts photos *and* videos straight into Photos, and **Save all** saves a whole carousel at once:

1. Open the **Shortcuts** app → **+** → name it exactly **MediaSave Save**.
2. Add **Split Text**: text = **Shortcut Input**, split by **New Lines**.
3. Add **Repeat with Each**.
4. Inside the repeat, add **Get Contents of URL** (Repeat Item).
5. Inside the repeat, add **Save to Photo Album** → Recents. Tap **Done**.
6. In MediaSave: **Settings → Install guide → "I've added it, turn on one-tap saving"** (or turn on **One-tap Save to Photos** in Settings). The first run asks for **local network** and **Photos** access. Tap **Allow**.

### Android

Scan the QR code, then in Chrome tap **⋮ → Add to Home screen**. Downloads go to your **Downloads** folder and show up in Gallery / Google Photos.

### 3. Download

In Instagram, TikTok, Facebook, Behance or any app, tap **Share → Copy link**. Then open MediaSave, tap the box and choose **Paste**. The download starts on its own. Tap **Save original** (the highest resolution) or **Save 4K**, or **Save all** for carousels and albums.

You can paste the whole share message (for example *"Check this out! https://vt.tiktok.com/…"*). MediaSave finds the link inside it.

**One tap from the Share menu:**
- **iPhone:** follow *Share straight from Instagram, TikTok, Facebook…* in the app (an Apple Shortcut with 5 steps). Then use **Share → MediaSave** from any app.
- **Android:** start with `start_anywhere_windows.bat` / `start_anywhere_mac_linux.sh`, open the https link on the phone in Chrome, and tap **Install**. MediaSave then appears in every app's **Share** menu.

A copy of everything also stays on the computer, in `downloads/`.

## What "highest resolution" means per site

| Site | What you get |
|---|---|
| Instagram | Up to 1080 px photos / 1080p video (Instagram's own maximum) |
| TikTok, Douyin | Best clean (no watermark) video, usually 1080p. TikTok photo posts come as full-size images |
| Facebook | HD video. Photos at the largest size available (many need a login) |
| Behance, Pinterest, X, Flickr, ArtStation | The original uploaded image size, often much bigger than 1080 |
| YouTube, Vimeo | Up to 4K/8K when the video has it |

If a site only offers a watermarked version of a video, MediaSave tells you on the result card.

The **4K copy** enlarges anything smaller to fit 3840×2160 with sharpening. It's sized for 4K screens and editors, but it can't add detail the site never stored. Files that are already 4K or bigger are left as they are. Turn it off with the **Make 4K copy** chip for faster downloads.

## Use it away from home

Start with **`start_anywhere_…`**. A second QR code with a secure **https://….trycloudflare.com** link appears, and it works on mobile data. The PIN protects it. The link changes on each restart, and the computer must stay on.

## Troubleshooting

- **"This site asked for a login"** (common for Facebook, private Instagram, some Pinterest boards): log in to that site in Chrome/Edge/Firefox **on the computer**. Then on the phone go to **Settings → Login** and pick that browser. If that fails, export cookies with a "cookies.txt" browser extension and save the file as `cookies.txt` next to `app.py`.
- **A site stopped working:** go to **Settings → Update downloaders**, then restart MediaSave on the computer. Sites change often, and updates usually fix it quickly.
- **"Can't reach your computer":** check that the MediaSave window is still open, the phone is on the same Wi-Fi, and Python is allowed through the firewall.
- **Profile or playlist links:** MediaSave saves at most 100 items per link.
- **Change the PIN:** delete `config.json` and restart.

Optional environment variables: `INSTASAVE_DIR`, `INSTASAVE_PORT`, `INSTASAVE_PIN`, `INSTASAVE_HOST=127.0.0.1` (no phone access), `INSTASAVE_NO_BROWSER=1`.

---

Only download content you own or have permission to use. Saving other people's photos and videos may break the site's terms and copyright law, and the creator's credit should stay with their work.
