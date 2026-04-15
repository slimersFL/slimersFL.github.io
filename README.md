# SLIMERS 👻

**Goo-Punk for Yolk Folk** — Official website for Slimers, the Ghostbusters-themed punk duo from Lake Worth, FL.

🎸 [slimersmusic.bandcamp.com](https://slimersmusic.bandcamp.com)  
📸 [@slimersband](https://www.instagram.com/slimersband/) on Instagram

---

## Deploying to GitHub Pages

### Option 1 — Fastest (GitHub UI only, no Git needed)

1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **+** → **New repository**
3. Name it exactly: `slimersband.github.io` *(replace `slimersband` with your GitHub username)*
4. Set it to **Public**, leave everything else default, click **Create repository**
5. Click **uploading an existing file** (or drag-and-drop)
6. Upload `index.html` and `README.md`
7. Click **Commit changes**
8. Your site will be live at `https://slimersband.github.io` within ~60 seconds ✅

> **Note:** The repo name *must* match your GitHub username + `.github.io` for the root URL to work. E.g. if your username is `jslime`, name it `jslime.github.io`.

---

### Option 2 — Using Git on your computer

```bash
# 1. Create the repo on github.com first (see step 1-4 above), then:

git init
git add index.html README.md
git commit -m "Initial Slimers site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git
git push -u origin main
```

Site goes live at `https://YOUR_USERNAME.github.io` within ~60 seconds.

---

### Option 3 — Existing repo (not a `*.github.io` repo)

If you want to use a repo with a different name (e.g. `slimers-site`):

1. Push `index.html` to the repo
2. Go to **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose **main** branch, **/ (root)** folder → click **Save**
5. Site will be at `https://YOUR_USERNAME.github.io/slimers-site/`

---

## Updating the site

Just edit `index.html` and push/upload again. GitHub Pages auto-deploys on every push to `main`.

To update via GitHub UI:
1. Click on `index.html` in your repo
2. Click the ✏️ pencil (Edit) icon
3. Make changes → **Commit changes**

---

## Customizing

All content is in a single `index.html` file. Key things to update:

| What | Where in the file |
|---|---|
| Band description | `<!-- ABOUT -->` section |
| Tracklist | `<!-- MUSIC -->` section, `.tracklist` ul |
| Show dates | `<!-- SHOWS -->` section |
| Instagram link | Search `@slimersband` — update all `href` attributes |
| Bandcamp link | Search `slimersmusic.bandcamp.com` |
| OG URL for sharing | `<meta property="og:url">` in `<head>` |

---

## What's included

- Full band website with About, Music, Shows, Live Experience, Gallery, Footer
- Embedded **Goo-Punk Hunter** 8-bit platformer game
- Fully responsive (mobile-friendly)
- Zero dependencies — no frameworks, no build tools, no npm
- All fonts loaded from Google Fonts CDN (works on GitHub Pages)

---

*2 Dudes · 1 Mission · 0 Brains*
