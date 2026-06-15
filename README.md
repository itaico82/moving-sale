# Moving Sale

A single-page catalog for selling household goods before relocating abroad.
Hebrew-first (RTL) with a Hebrew⇄English toggle, built as plain HTML/CSS/JS and
hosted on GitHub Pages — no build step.

Design recreated from a Claude Design prototype (the "C-Minimal" direction).

## Features

- **Bilingual** HE (RTL) / EN (LTR), with the language choice remembered.
- **Live search** across titles, descriptions, and brands in both languages.
- **My List** — bookmark items into a slide-over drawer; saved selections
  persist in the browser and can be sent in one go via WhatsApp or email.
- **"Others viewing now"** counter — a light, fictional touch on available items.
- Per-card WhatsApp/Email links plus a strong single contact section.
- "Sold" overlay for items marked sold.
- Photo placeholders until real photos are added.

## Editing content

All content lives in **`data/items.json`** — config (WhatsApp number, email,
location, move date), categories, and items. Edit it, commit, and the live site
updates. Bilingual fields use `{ "he": "...", "en": "..." }`.

To add photos: drop image files into `images/` and reference them in an item's
`photos` array, e.g. `"photos": ["images/sofa-1.jpg"]`. The first photo is shown
on the card; until one is added, a placeholder is displayed.

### Admin editor (`admin.html`)

Open `admin.html` (e.g. `https://itaico82.github.io/moving-sale/admin.html`) to
edit everything through a form: config, categories, and items (add/edit/delete,
mark sold/reserved, reorder, prices, photos). Photos are compressed in-browser
before upload.

**Saving** commits `data/items.json` (and any new images) straight to the repo
via the GitHub Contents API. You paste a **fine-grained Personal Access Token**
once — scoped to *only* this repo, `Contents: Read & write` — and it's stored
only in your browser's `localStorage` (never in the deployed site). The page is
publicly reachable but inert without your token. The live site updates ~1 min
after a save.

## Local preview

It's a static site; serve the folder over HTTP (so `fetch` can load the JSON):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Project layout

```
index.html         public catalog
css/styles.css     styling
js/site.js         render + search + My List + viewer counter
js/i18n.js         HE/EN UI strings
data/items.json    all content
images/            photos (referenced from items.json)
```
