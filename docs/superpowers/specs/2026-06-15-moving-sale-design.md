# Moving Sale Site — Design Spec

**Date:** 2026-06-15
**Status:** Approved (design)

## Purpose

A personal, single-page catalog site to sell household goods before relocating
abroad. Modeled structurally on https://z-moving-sale.lovable.app/ (used only as
a layout/style template — none of its content or contacts). Buyers browse items
grouped by category and contact the seller via WhatsApp or email. The seller
manages listings through a browser-based admin UI that commits changes directly
to the repo.

## Hosting & Stack

- **Plain HTML/CSS/JS** — no framework, no build step.
- **GitHub Pages** serving from the `main` branch root of a **private** repo
  `moving-sale` under GitHub account `itaico82`.
- Project lives in its own folder `~/Development/moving-sale`, independent of any
  other repo.

## File Structure

```
moving-sale/
├── index.html        # public catalog
├── admin.html        # seller editor UI
├── css/styles.css    # shared minimalist/gallery styling
├── js/
│   ├── site.js       # render catalog from data, language toggle, contact buttons
│   ├── admin.js      # form editor + GitHub API commit + image compression
│   └── i18n.js       # UI strings (he/en)
├── data/items.json   # all content (config + categories + items)
├── images/           # committed photos
└── README.md
```

## Data Model — `data/items.json` (bilingual: he/en)

```jsonc
{
  "config": {
    "whatsapp": "+972...",            // E.164; powers wa.me links
    "email": "you@example.com",
    "location":  { "he": "הרצליה", "en": "Herzliya" },
    "moveDate":  { "he": "יוני 2026", "en": "June 2026" }
  },
  "categories": [
    { "id": "living-room", "name": { "he": "סלון", "en": "Living Room" }, "order": 1 }
  ],
  "items": [{
    "id": "abc123",                   // stable unique id (generated in admin)
    "category": "living-room",        // references categories[].id
    "title":       { "he": "...", "en": "..." },
    "brand": "Meridiani",             // optional
    "description": { "he": "...", "en": "..." },
    "price": 5300,                    // asking price (number)
    "originalPrice": 12000,           // optional; struck-through on card
    "currency": "₪",
    "dimensions": "220×95 cm",        // optional free text
    "photos": ["images/sofa-1.jpg"],  // repo-relative paths
    "sold": false,
    "order": 1
  }]
}
```

Bilingual fields are `{ he, en }` objects. Free-form/identical fields (brand,
dimensions, prices, photos) are single values.

## Public Site (`index.html`)

- Hero: headline + lifestyle image conveying the sale's purpose.
- Sticky header: language toggle (HE ⇄ EN) and anchor nav (top / items / contact).
- Items grouped by category in document order (`order`), responsive card grid.
- Card: photo gallery (multiple photos), title, brand, description, price with
  struck-through `originalPrice` when present, dimensions. **"Sold" overlay**
  when `sold: true`.
- Per-card and footer **WhatsApp** + **Email** buttons with pre-filled messages
  that reference the relevant item/category.
- Language: Hebrew → `dir="rtl"`; English → `dir="ltr"`. Choice persisted in
  `localStorage`; optional `?lang=` override.
- Graceful degradation: if `items.json` fails to load, show a friendly message.

## Admin (`admin.html`)

- Add / edit / delete items; mark sold; reorder; manage categories; edit
  `config` (whatsapp, email, location, moveDate).
- Photo handling: dropped/selected images are **resized & compressed
  client-side** (max ~1600px longest edge, JPEG ~0.8) before commit, to keep the
  repo lean and the public site fast.
- **Save flow** (GitHub Contents API, using a token entered once and stored only
  in the browser's `localStorage`):
  1. GET current `data/items.json` to obtain its `sha`.
  2. PUT each new image to `images/` (base64), collect repo paths.
  3. PUT updated `items.json` with the latest `sha`.
  4. GitHub Pages auto-redeploys (~1 min); admin shows "committed, live shortly".
- **Token guidance:** recommend a **fine-grained PAT scoped to only this repo**
  with `contents: read/write`.
- **Security note:** `admin.html` is publicly reachable on the Pages URL but is
  inert without a valid token — no secrets are baked into the deployed site.

## Error Handling

- Admin surfaces clear, specific errors for: missing/invalid/expired token,
  network failure, commit conflict (on 409/stale-sha, re-fetch latest `sha` and
  retry once), and oversized/failed image processing.
- Public site degrades gracefully on data-load failure.

## Testing

Personal one-off static site → **no automated test suite** (YAGNI). Verification
is manual in-browser:
1. Load catalog; toggle language (RTL/LTR both render correctly).
2. Add an item with photos via admin; confirm commit lands in the repo.
3. Confirm the live Pages site reflects the change after redeploy.
4. Confirm WhatsApp/email buttons open with correct pre-filled content.
5. Confirm "Sold" overlay renders when an item is marked sold.

## Deferred / Out of Scope

- No backend, database, or server-side code.
- No automated tests, no CI.
- Seller's real WhatsApp number and email are supplied later via the admin UI;
  `items.json` ships with one placeholder item so the site is demonstrable
  immediately.
```
