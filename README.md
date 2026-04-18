# SLIMERS — band website

Single-page, static, built for GitHub Pages. Monolithic HTML + vanilla CSS + vanilla JS. No build step.

---

## Deploy on GitHub Pages

1. Push this folder to a GitHub repo (e.g. `slimers-website`).
2. Repo Settings → Pages → Source: **Deploy from a branch**, branch: `main`, folder: `/ (root)`.
3. Save. A minute later your site is live at `https://<username>.github.io/<repo-name>/`.

### Custom domain

1. Buy a domain (Namecheap, Porkbun, Cloudflare, etc.).
2. At your domain registrar, add these DNS records pointing to GitHub Pages:
   - For apex/root domain (`slimersband.com`): four A records pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - For `www`: a CNAME to `<username>.github.io`.
3. Rename `CNAME.example` to `CNAME` and put your domain on the first line (no `http://`, no trailing slash):
   ```
   slimersband.com
   ```
4. Commit, push, wait ~10 min for DNS + GitHub Pages to settle.
5. In repo Settings → Pages, check **"Enforce HTTPS"** once it's available.

Until you set up a custom domain, the default URL just works out of the box.

---

## What to replace before launch (the `TODO` list)

### 1. Formspree endpoints — contact & newsletter forms

The site uses [Formspree](https://formspree.io/) (free tier: 50 submissions/month).

1. Sign up at formspree.io with `slimersmusic@gmail.com`.
2. Create **two forms**: one called "Goo News" and one called "Contact".
3. Each will give you a URL like `https://formspree.io/f/abcd1234`.
4. Open `app.js` and replace the two endpoints near the top:
   ```js
   const CONFIG = {
     FORMSPREE_NEWSLETTER: 'https://formspree.io/f/YOUR_NEWSLETTER_ID',
     FORMSPREE_CONTACT:    'https://formspree.io/f/YOUR_CONTACT_ID',
     SHOWS_CSV_URL: '...'
   };
   ```

**Collecting emails:** Formspree stores all submissions in its dashboard. Export CSV any time and import into Mailchimp/Buttondown/etc. for actual newsletter sending.

**Spam:** The forms have invisible **honeypot** fields (named `slime_trap`). Bots fill them, real users don't. Server-side filtering is still worth turning on in Formspree's settings.

### 2. Upcoming Slime — Google Sheet

1. Create a Google Sheet with this **exact** header row (case-insensitive, but the column names must match):
   ```
   date | venue | city | ticket_url | notes
   ```
   - `date` must be in `YYYY-MM-DD` format (e.g. `2026-05-15`).
   - `ticket_url` and `notes` can be blank.
2. See `data/shows-example.csv` for a working example.
3. Sheet menu: **File → Share → Publish to web → Link → Comma-separated values (.csv)** → Publish.
4. Copy the long CSV URL it gives you.
5. In `app.js`, replace `CONFIG.SHOWS_CSV_URL`:
   ```js
   SHOWS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv',
   ```
6. Done. Whenever you edit the sheet, the site updates on next page-load. Past shows are auto-hidden.

Until you do this, the site shows a friendly "no upcoming shows" card — no errors.

### 3. Album MP3s

Drop the 12 MP3 files in `/audio/` using the filenames listed in `/audio/README.md`. Player auto-discovers them.

Until you do, the player shows "audio file not found" for each track but the rest of the site works perfectly.

### 4. Gallery photos

Open `app.js`, find `GALLERY_ITEMS`, and replace the placeholder entries with real photos:
```js
const GALLERY_ITEMS = [
  { caption: 'Fest 22', src: 'img/fest22.webp', sticker: 'LIVE!' },
  ...
];
```
Put the actual image files in `/img/`. WebP or AVIF preferred for file size; JPG is fine. Square-ish photos look best in the polaroid layout.

### 5. Recognition clippings

In `app.js`, edit `CLIPPINGS` with real press quotes, notable shows, etc.

### 6. Open Graph image for link previews

`img/og.svg` is a starter. Convert to `og.jpg` at 1200×630 (Figma, Photoshop, or any image tool — many online SVG-to-JPG converters will do it). Drop `og.jpg` in `/img/`.

### 7. Email list — exporting from Formspree

Goo News is collected in Formspree. To actually *send* a newsletter:
1. Formspree → your Goo News form → Export CSV.
2. Import to Mailchimp / Buttondown / ConvertKit / whatever.
3. Send.

---

## File structure

```
/index.html            — the whole site markup
/styles.css            — all styling
/app.js                — drawer, player, forms, shows, gallery, reduce-motion
/game.js               — Proton Panic mini-game
/audio/                — album MP3s (band drops these in)
/img/                  — photos, favicon, OG image
/data/shows-example.csv— template for Google Sheet
/CNAME.example         — rename to CNAME when you add a custom domain
/robots.txt
/README.md             — this file
```

---

## Features

- **Single-page scroll** with sticky side-drawer nav (hamburger).
- **Floating "BUST GHOSTS" proton-pack launcher** in the corner — scrolls to the game.
- **Hero** with animated slime drip, 3D dropped letters, chorus callouts.
- **Custom music player** — album-playthrough style, lazy-loads MP3s on play only.
- **Upcoming Slime** pulls live from a Google Sheet CSV.
- **Polaroid-scatter gallery** with masking tape, punk stickers, lightbox + swipe.
- **Newspaper-clipping recognition** section with torn-paper effects.
- **Goo News** email signup with honeypot spam protection.
- **Contact form** with `slimersmusic@gmail.com` visible + dedicated booking CTA in the drawer that pre-fills the message as `[BOOKING INQUIRY]`.
- **Proton Panic mini-game**: 3 levels + Slimer boss, WASD + space, mobile d-pad, procedural chiptune (Web Audio API), chorus flashes on pickups and boss defeat, high score in localStorage.
- **Reduce-motion toggle** in the drawer (persists via localStorage).
- **Responsive** — phones, tablets, desktop.
- **Accessible** — keyboard navigation, ARIA roles, visible focus rings, proper form labels, lightbox focus trap, reduced-motion support.
- **No tracking, no analytics, no third-party scripts** other than Google Fonts.
- **Honeypot-only** spam protection (no CAPTCHA friction).

---

## Browser support

Modern evergreen browsers only: latest two versions of Chrome, Firefox, Safari, Edge. iOS Safari 14+ and Chrome Android 90+. No IE, no legacy polyfills.

---

## Fan-site disclaimer

The site uses Ghostbusters imagery / the character "Slimer" under a fan-site fair-use posture. A disclaimer appears in the footer. If you ever receive a takedown notice, the imagery can be swapped for the "stylized, inspired-by-not-literal" version without touching the layout.

---

## Credits

Site built for SLIMERS — J-Slime (drums/vox) and T-Slime (bass/vox/toy piano/sax).

Partying with Slimer forever.
