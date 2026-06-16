/* ============================================================
   Moving Sale — public catalog logic.
   Renders data/items.json into the C-Minimal layout, with a
   bilingual HE/EN toggle, live search, a persistent "My List"
   drawer, and a fictional "others viewing now" counter.
   ============================================================ */
(function () {
  "use strict";

  var CUR = "₪"; // ₪
  var app = document.getElementById("app");

  var state = {
    lang: "he",
    query: "",
    saved: [],
    listOpen: false,
    viewers: {},
  };
  var data = null;
  var timer = null;
  var heroTimer = null;
  var heroIndex = 0;

  /* ---------- icons ---------- */
  var ICON = {
    search:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3-3"></path></svg>',
    bookmark:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a1 1 0 0 1 1 1v18l-7-3.8L5 21V3a1 1 0 0 1 1-1z"></path></svg>',
    bookmarkSm:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a1 1 0 0 1 1 1v18l-7-3.8L5 21V3a1 1 0 0 1 1-1z"></path></svg>',
    close:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"></path></svg>',
    closeSm:
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"></path></svg>',
    image:
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"></rect><circle cx="8.5" cy="8.5" r="1.6"></circle><path d="M21 15l-5-5L5 21"></path></svg>',
  };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    return CUR + Number(n).toLocaleString("en-US");
  }
  // Initial "others viewing now" count: 0–9, with 0 twice as likely as any
  // single nonzero value (pool has two 0s), so several items start at 0.
  function seedViewer() {
    var pool = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // One ±1 fluctuation. A Metropolis step over the target weights
  // (w[0]=2, w[k]=1) keeps the long-run distribution at "0 twice as common
  // as any other value" instead of drifting toward uniform.
  function nextViewer(v) {
    var j = v + (Math.random() < 0.5 ? -1 : 1);
    if (j < 0 || j > 9) return v; // reflect at the bounds
    var wv = v === 0 ? 2 : 1;
    var wj = j === 0 ? 2 : 1;
    if (wj >= wv || Math.random() < wj / wv) return j;
    return v;
  }
  function readLang() {
    try {
      var l = localStorage.getItem("ms_lang");
      if (l === "he" || l === "en") return l;
    } catch (e) {}
    return "he";
  }
  function readSaved() {
    try {
      var s = JSON.parse(localStorage.getItem("ms_saved") || "[]");
      if (Array.isArray(s)) return s;
    } catch (e) {}
    return [];
  }
  function persistSaved() {
    try {
      localStorage.setItem("ms_saved", JSON.stringify(state.saved));
    } catch (e) {}
  }

  /* ---------- photo / placeholder ---------- */
  function photoHTML(photos, modifier, placeholderText) {
    var inner;
    if (photos && photos.length && photos[0]) {
      inner = '<img src="' + esc(photos[0]) + '" alt="" loading="lazy" />';
    } else {
      inner =
        '<div class="ms-photo-empty">' +
        ICON.image +
        "<span>" +
        esc(placeholderText) +
        "</span></div>";
    }
    return '<div class="ms-photo ' + modifier + '">' + inner + "</div>";
  }

  /* ---------- viewer counter ---------- */
  function seedViewers() {
    var v = {};
    data.items.forEach(function (it) {
      if (!it.sold) v[it.id] = seedViewer();
    });
    state.viewers = v;
  }
  // Each tick (a fresh random 10–20s) every available item fluctuates by ±1,
  // then we re-render so several items naturally drop to (and rise from) 0.
  function scheduleDrift() {
    timer = setTimeout(function () {
      data.items.forEach(function (it) {
        if (!it.sold) state.viewers[it.id] = nextViewer(state.viewers[it.id] || 0);
      });
      updateViewerChips();
      scheduleDrift();
    }, 10000 + Math.random() * 10000);
  }

  /* ---------- view-model ---------- */
  function buildVals() {
    var lang = state.lang;
    var he = lang === "he";
    var q = state.query.trim().toLowerCase();
    var t = window.MS_I18N[lang];
    var config = data.config;
    var loc = config.location[lang];
    var move = config.moveDate[lang];

    function fmtMsg(title) {
      return he
        ? 'היי, מתעניין/ת ב"' + title + '" מהמכירה — עדיין זמין?'
        : 'Hi, I\'m interested in "' + title + '" from your sale — is it still available?';
    }
    // Each category contributes searchable keywords (plus its own names), so a
    // query like "appliances" / "מקרר" surfaces every item in that category.
    var catKeywords = {};
    data.categories.forEach(function (c) {
      catKeywords[c.id] = (c.keywords || []).concat([c.name.he, c.name.en]).join(" ").toLowerCase();
    });
    function matches(it) {
      if (!q) return true;
      var hay = [it.title.he, it.title.en, it.desc.he, it.desc.en, it.brand || "", catKeywords[it.category] || ""]
        .join(" ")
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    }
    function view(it) {
      var saved = state.saved.indexOf(it.id) !== -1;
      var n = state.viewers[it.id] != null ? state.viewers[it.id] : 0;
      return {
        id: it.id,
        title: it.title[lang],
        desc: it.desc[lang],
        brand: it.brand || "",
        dimensions: it.dimensions || "",
        photos: it.photos || [],
        link: it.link || "",
        sold: it.sold,
        viewersEligible: !it.sold,
        viewersHidden: n === 0,
        viewersText: he ? "עוד " + n + " צופים בפריט כעת" : n + " others viewing now",
        priceText: it.price != null ? money(it.price) : t.askPrice,
        hasOrig: !!it.originalPrice,
        origText: it.originalPrice ? money(it.originalPrice) : "",
        waHref:
          "https://wa.me/" + config.whatsapp + "?text=" + encodeURIComponent(fmtMsg(it.title[lang])),
        mailHref: "mailto:" + config.email + "?subject=" + encodeURIComponent(it.title[lang]),
        saved: saved,
        saveLabel: saved ? t.saved : t.saveTo,
      };
    }

    var cats = data.categories
      .map(function (c, ci) {
        var list = data.items
          .filter(function (i) { return i.category === c.id && matches(i); })
          .map(view);
        return {
          name: c.name[lang],
          index: String(ci + 1).padStart(2, "0"),
          count: he ? list.length + " פריטים" : list.length + " items",
          items: list,
        };
      })
      .filter(function (c) { return c.items.length; });

    var total = cats.reduce(function (s, c) { return s + c.items.length; }, 0);
    var available = data.items.filter(function (i) { return !i.sold; }).length;

    var byId = {};
    data.items.forEach(function (i) { byId[i.id] = i; });
    var savedRaw = state.saved.map(function (id) { return byId[id]; }).filter(Boolean);
    var savedItems = savedRaw.map(function (it) {
      return {
        id: it.id,
        title: it.title[lang],
        brand: it.brand || "",
        priceText: it.price != null ? money(it.price) : t.askPrice,
      };
    });
    var savedTotal = savedRaw.reduce(function (s, i) { return s + (i.price || 0); }, 0);
    var savedTitles = savedRaw.map(function (i) { return i.title[lang]; });
    var waAllText = he
      ? "היי, מתעניין/ת בפריטים הבאים מהמכירה: " + savedTitles.join(", ")
      : "Hi, I'm interested in these items from your sale: " + savedTitles.join(", ");

    return {
      he: he,
      dir: he ? "rtl" : "ltr",
      langBtn: he ? "EN" : "עב",
      t: t,
      query: state.query,
      searching: q.length > 0,
      resultCountText: he
        ? total + ' תוצאות עבור "' + state.query.trim() + '"'
        : total + ' results for "' + state.query.trim() + '"',
      cats: cats,
      noResults: q.length > 0 && total === 0,
      kicker: loc + " · " + move,
      countLabel: he ? available + " פריטים זמינים" : available + " items available",
      contactBody: he
        ? "שלחו הודעה בוואטסאפ או במייל ונשמח לתאם צפייה ואיסוף. הפריטים נמכרים כפי שהם, באיסוף עצמי מ" + loc + "."
        : "Message us on WhatsApp or by email and we'll arrange a viewing and pickup. Items are sold as-is, local pickup in " + loc + ".",
      waHref:
        "https://wa.me/" + config.whatsapp + "?text=" +
        encodeURIComponent(he ? "היי, ראיתי את מכירת המעבר דירה שלכם" : "Hi, I saw your moving sale"),
      mailHref: "mailto:" + config.email,
      phoneLabel: config.phoneLabel || "",
      emailLabel: config.email,
      heroPhotos: config.heroPhotos && config.heroPhotos.length ? config.heroPhotos : (config.heroPhoto ? [config.heroPhoto] : []),
      flatWaHref: "https://wa.me/" + config.whatsapp + "?text=" +
        encodeURIComponent(he ? "היי, מעוניין/ת לשכור או לקנות את הדירה — אפשר פרטים?" : "Hi, I'm interested in renting or buying the flat — can you share details?"),
      flatMailHref: "mailto:" + config.email + "?subject=" +
        encodeURIComponent(he ? "הדירה — שכירות / קנייה" : "The flat — rent / buy"),
      listOpen: state.listOpen,
      savedCount: state.saved.length,
      savedItems: savedItems,
      hasSaved: savedItems.length > 0,
      savedTotalText: money(savedTotal),
      waAllHref: savedTitles.length
        ? "https://wa.me/" + config.whatsapp + "?text=" + encodeURIComponent(waAllText)
        : "https://wa.me/" + config.whatsapp,
      mailAllHref:
        "mailto:" + config.email +
        "?subject=" + encodeURIComponent(he ? "הרשימה שלי" : "My List") +
        "&body=" + encodeURIComponent(savedTitles.join("\n")),
    };
  }

  /* ---------- render fragments ---------- */
  function cardHTML(item, t) {
    var media =
      '<div class="ms-card-media ms-clickable" data-action="open-media" data-id="' + esc(item.id) + '">' +
      photoHTML(item.photos, "ms-photo--card", t.drop) +
      (item.sold
        ? '<div class="ms-sold"><span class="ms-sold-label">' + esc(t.sold) + "</span></div>"
        : "") +
      (item.viewersEligible
        ? '<div class="ms-viewers' + (item.viewersHidden ? " ms-viewers--hidden" : "") + '" data-viewers="' + esc(item.id) + '">' +
            '<span class="ms-viewers-dot"></span><span class="ms-viewers-label">' + esc(item.viewersText) + "</span></div>"
        : "") +
      '<button class="ms-save' + (item.saved ? " ms-save--active" : "") +
        '" data-action="toggle-save" data-id="' + esc(item.id) + '" title="' + esc(item.saveLabel) + '">' +
        ICON.bookmarkSm + "</button>" +
      "</div>";

    var body =
      '<div class="ms-card-body">' +
        '<div class="ms-card-titlerow">' +
          '<h3 class="ms-card-title">' + esc(item.title) + "</h3>" +
          (item.brand ? '<span class="ms-card-brand">' + esc(item.brand) + "</span>" : "") +
        "</div>" +
        (item.desc ? '<p class="ms-card-desc">' + esc(item.desc) + "</p>" : "") +
        (item.dimensions ? '<span class="ms-card-dims">' + esc(item.dimensions) + "</span>" : "") +
        '<div class="ms-card-pricerow">' +
          '<span class="ms-price">' + esc(item.priceText) + "</span>" +
          (item.hasOrig ? '<span class="ms-price-orig">' + esc(item.origText) + "</span>" : "") +
          '<span class="ms-card-contact">' +
            (item.link ? '<a class="ms-detail" href="' + esc(item.link) + '" target="_blank" rel="noopener">' + esc(t.details) + "</a>" : "") +
            '<a class="ms-wa" href="' + esc(item.waHref) + '" target="_blank" rel="noopener">' + esc(t.wa) + "</a>" +
            '<a class="ms-mail" href="' + esc(item.mailHref) + '">' + esc(t.mail) + "</a>" +
          "</span>" +
        "</div>" +
      "</div>";

    return '<article class="ms-card">' + media + body + "</article>";
  }

  function categoryHTML(cat, t) {
    var cards = cat.items
      .map(function (it) { return cardHTML(it, t); })
      .join("");
    return (
      '<section class="ms-cat">' +
        '<div class="ms-cat-head">' +
          '<span class="ms-cat-index">' + esc(cat.index) + "</span>" +
          '<h2 class="ms-cat-name">' + esc(cat.name) + "</h2>" +
          '<span class="ms-cat-count">' + esc(cat.count) + "</span>" +
        "</div>" +
        '<div class="ms-grid">' + cards + "</div>" +
      "</section>"
    );
  }

  function drawerHTML(v) {
    var t = v.t;
    var rows = v.savedItems
      .map(function (s) {
        return (
          '<div class="ms-saved-row">' +
            '<div class="ms-saved-info">' +
              '<span class="ms-saved-title">' + esc(s.title) + "</span>" +
              (s.brand ? '<span class="ms-saved-brand">' + esc(s.brand) + "</span>" : "") +
              '<span class="ms-saved-price">' + esc(s.priceText) + "</span>" +
            "</div>" +
            '<button class="ms-saved-remove" data-action="toggle-save" data-id="' + esc(s.id) +
              '" title="' + esc(t.remove) + '">' + ICON.closeSm + "</button>" +
          "</div>"
        );
      })
      .join("");

    var body = v.hasSaved
      ? rows
      : '<p class="ms-drawer-empty">' + esc(t.listEmpty) + "</p>";

    var foot = v.hasSaved
      ? '<div class="ms-drawer-foot">' +
          '<div class="ms-total-row">' +
            '<span class="ms-total-label">' + esc(t.total) + "</span>" +
            '<span class="ms-total-value">' + esc(v.savedTotalText) + "</span>" +
          "</div>" +
          '<a class="ms-send-wa" href="' + esc(v.waAllHref) + '" target="_blank" rel="noopener">' + esc(t.sendAllWa) + "</a>" +
          '<div class="ms-foot-actions">' +
            '<a class="ms-mail-all" href="' + esc(v.mailAllHref) + '">' + esc(t.mail) + "</a>" +
            '<button class="ms-clear" data-action="clear-list">' + esc(t.clear) + "</button>" +
          "</div>" +
        "</div>"
      : "";

    return (
      "<div>" +
        '<div class="ms-overlay" data-action="close-list"></div>' +
        '<aside class="ms-drawer">' +
          '<div class="ms-drawer-head">' +
            '<span class="ms-drawer-title">' + esc(t.listTitle) +
              ' <span>(' + v.savedCount + ")</span></span>" +
            '<button class="ms-drawer-close" data-action="close-list">' + ICON.close + "</button>" +
          "</div>" +
          '<div class="ms-drawer-body">' + body + "</div>" +
          foot +
        "</aside>" +
      "</div>"
    );
  }

  function heroSlideshow(v) {
    var t = v.t;
    var origins = ["center", "top left", "bottom right", "top right", "bottom left", "center top"];
    var inner;
    if (v.heroPhotos.length) {
      var active = heroIndex % v.heroPhotos.length;
      inner = v.heroPhotos.map(function (p, i) {
        return '<div class="ms-slide' + (i === active ? " active" : "") + '" data-hero-slide="' + i + '">' +
          '<img src="' + esc(p) + '" alt="" style="transform-origin:' + origins[i % origins.length] + ';" /></div>';
      }).join("");
    } else {
      inner = '<div class="ms-slide active"><div class="ms-hero-empty">' + ICON.image +
        "<span>" + esc(t.dropHero) + "</span></div></div>";
    }
    var cta =
      '<div class="ms-hero-cta">' +
        '<span class="ms-hero-cta-text">' + esc(t.flatCta) + "</span>" +
        '<span class="ms-hero-cta-actions">' +
          '<a class="ms-hero-cta-btn wa" href="' + esc(v.flatWaHref) + '" target="_blank" rel="noopener">' + esc(t.wa) + "</a>" +
          '<a class="ms-hero-cta-btn mail" href="' + esc(v.flatMailHref) + '">' + esc(t.mail) + "</a>" +
        "</span>" +
      "</div>";
    return '<section class="ms-hero-img"><div class="ms-hero-slideshow">' + inner + cta + "</div></section>";
  }

  function startHero() {
    clearTimeout(heroTimer);
    var photos = data.config.heroPhotos && data.config.heroPhotos.length
      ? data.config.heroPhotos
      : (data.config.heroPhoto ? [data.config.heroPhoto] : []);
    if (photos.length <= 1) return;
    (function tick() {
      heroTimer = setTimeout(function () {
        heroIndex = (heroIndex + 1) % photos.length;
        var slides = app.querySelectorAll("[data-hero-slide]");
        for (var i = 0; i < slides.length; i++) slides[i].classList.toggle("active", i === heroIndex);
        tick();
      }, 5200);
    })();
  }

  // Update viewer chips in place (no full re-render) so the hero slideshow and
  // search box are never reset by the every-10–20s viewer drift.
  function updateViewerChips() {
    var he = state.lang === "he";
    data.items.forEach(function (it) {
      if (it.sold) return;
      var el = app.querySelector('[data-viewers="' + it.id + '"]');
      if (!el) return;
      var n = state.viewers[it.id] || 0;
      if (n === 0) {
        el.classList.add("ms-viewers--hidden");
      } else {
        el.classList.remove("ms-viewers--hidden");
        var label = el.querySelector(".ms-viewers-label");
        if (label) label.textContent = he ? "עוד " + n + " צופים בפריט כעת" : n + " others viewing now";
      }
    });
  }

  function build(v) {
    var t = v.t;

    var header =
      '<header class="ms-header"><div class="ms-header-inner">' +
        '<span class="ms-brand">' + esc(t.brand) + "</span>" +
        '<div class="ms-search">' +
          '<span class="ms-search-icon">' + ICON.search + "</span>" +
          '<input class="ms-search-input" type="search" value="' + esc(v.query) +
            '" placeholder="' + esc(t.searchPh) + '" />' +
        "</div>" +
        '<nav class="ms-nav">' +
          '<a class="ms-nav-link" href="#c-items">' + esc(t.navItems) + "</a>" +
          '<button class="ms-list-btn" data-action="open-list">' + ICON.bookmark + esc(t.myList) +
            '<span class="ms-badge' + (v.savedCount > 0 ? " ms-badge--active" : "") + '">' + v.savedCount + "</span></button>" +
          '<button class="ms-lang-btn" data-action="toggle-lang">' + esc(v.langBtn) + "</button>" +
        "</nav>" +
      "</div></header>";

    var hero =
      '<section class="ms-hero">' +
        '<span class="ms-kicker">' + esc(v.kicker) + "</span>" +
        '<h1 class="ms-hero-title">' + esc(t.heroTitle) + "</h1>" +
        '<div class="ms-hero-meta">' +
          '<p class="ms-hero-sub">' + esc(t.heroSub) + "</p>" +
          '<div class="ms-hero-actions">' +
            '<span class="ms-count">' + esc(v.countLabel) + "</span>" +
            '<a class="ms-cta" href="#c-items">' + esc(t.heroCta) + "</a>" +
          "</div>" +
        "</div>" +
      "</section>" +
      heroSlideshow(v);

    var resultCount = v.searching
      ? '<div class="ms-result-count">' + esc(v.resultCountText) + "</div>"
      : "";

    var cats = v.cats.map(function (c) { return categoryHTML(c, t); }).join("");

    var noResults = v.noResults
      ? '<section class="ms-empty">' +
          '<p class="ms-empty-text">' + esc(t.noResults) + "</p>" +
          '<button class="ms-empty-clear" data-action="clear-search">' + esc(t.clearSearch) + "</button>" +
        "</section>"
      : "";

    var contact =
      '<section class="ms-contact" id="c-contact"><div class="ms-contact-inner">' +
        '<span class="ms-contact-kicker">' + esc(t.contactKicker) + "</span>" +
        '<div class="ms-contact-row">' +
          '<div class="ms-contact-copy">' +
            '<h2 class="ms-contact-title">' + esc(t.contactTitle) + "</h2>" +
            '<p class="ms-contact-body">' + esc(v.contactBody) + "</p>" +
          "</div>" +
          '<div class="ms-contact-actions">' +
            '<a class="ms-contact-wa" href="' + esc(v.waHref) + '" target="_blank" rel="noopener">' + esc(t.waLong) +
              "<span>" + esc(v.phoneLabel) + "</span></a>" +
            '<a class="ms-contact-mail" href="' + esc(v.mailHref) + '">' + esc(t.mailLong) +
              "<span>" + esc(v.emailLabel) + "</span></a>" +
          "</div>" +
        "</div>" +
        '<div class="ms-contact-footer">' + esc(t.footer) + "</div>" +
      "</div></section>";

    var drawer = v.listOpen ? drawerHTML(v) : "";

    return (
      header +
      hero +
      '<div id="c-items"></div>' +
      resultCount +
      cats +
      noResults +
      contact +
      drawer
    );
  }

  /* ---------- render ---------- */
  function render() {
    var v = buildVals();

    // Preserve search focus + caret across full re-render.
    var active = document.activeElement;
    var wasSearch = !!(active && active.classList && active.classList.contains("ms-search-input"));
    var caret = wasSearch ? active.selectionStart : null;

    document.documentElement.lang = state.lang;
    document.documentElement.dir = v.dir;
    app.innerHTML = build(v);

    if (wasSearch) {
      var inp = app.querySelector(".ms-search-input");
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(caret, caret); } catch (e) {}
      }
    }
    startHero();
  }

  function renderError() {
    var t = window.MS_I18N[readLang()];
    app.innerHTML =
      '<section class="ms-empty"><p class="ms-empty-text">' + esc(t.loadError) + "</p></section>";
  }

  /* ---------- lightbox ---------- */
  var lb = { photos: [], index: 0, el: null };
  function itemById(id) {
    for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return data.items[i];
    return null;
  }
  function lbRender() {
    lb.el.querySelector(".ms-lb-img").src = lb.photos[lb.index];
    var multi = lb.photos.length > 1;
    lb.el.querySelector(".prev").style.display = multi ? "" : "none";
    lb.el.querySelector(".next").style.display = multi ? "" : "none";
  }
  function lbStep(d) { lb.index = (lb.index + d + lb.photos.length) % lb.photos.length; lbRender(); }
  function closeLightbox() { if (lb.el) lb.el.classList.remove("open"); document.removeEventListener("keydown", lbKey); }
  function lbKey(e) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbStep(-1);
    else if (e.key === "ArrowRight") lbStep(1);
  }
  function openLightbox(photos, start) {
    if (!photos || !photos.length) return;
    lb.photos = photos;
    lb.index = start || 0;
    if (!lb.el) {
      lb.el = document.createElement("div");
      lb.el.className = "ms-lb";
      lb.el.innerHTML =
        '<button class="ms-lb-close" aria-label="close">&times;</button>' +
        '<button class="ms-lb-nav prev" aria-label="previous">&#8249;</button>' +
        '<img class="ms-lb-img" alt="" />' +
        '<button class="ms-lb-nav next" aria-label="next">&#8250;</button>';
      document.body.appendChild(lb.el);
      lb.el.addEventListener("click", function (e) {
        if (e.target === lb.el || e.target.classList.contains("ms-lb-close")) closeLightbox();
        else if (e.target.classList.contains("prev")) lbStep(-1);
        else if (e.target.classList.contains("next")) lbStep(1);
      });
    }
    lbRender();
    lb.el.classList.add("open");
    document.addEventListener("keydown", lbKey);
  }

  /* ---------- item detail modal ---------- */
  var modal = { el: null, photos: [], slideIndex: 0, slideTimer: null };
  function closeItemModal() {
    if (modal.slideTimer) { clearInterval(modal.slideTimer); modal.slideTimer = null; }
    if (modal.el) { modal.el.remove(); modal.el = null; }
    document.removeEventListener("keydown", modalKey);
  }
  function modalKey(e) { if (e.key === "Escape") closeItemModal(); }
  // Auto-advancing crossfade for the modal gallery (mirrors the hero slideshow).
  function modalSlideStart() {
    if (modal.slideTimer) { clearInterval(modal.slideTimer); modal.slideTimer = null; }
    modal.slideIndex = 0;
    if (!modal.el || modal.photos.length < 2) return;
    modal.slideTimer = setInterval(function () {
      if (!modal.el) { clearInterval(modal.slideTimer); return; }
      modal.slideIndex = (modal.slideIndex + 1) % modal.photos.length;
      var slides = modal.el.querySelectorAll(".ms-modal-slideshow .ms-slide");
      for (var i = 0; i < slides.length; i++) slides[i].classList.toggle("active", i === modal.slideIndex);
    }, 3800);
  }
  function catName(id, lang) {
    for (var i = 0; i < data.categories.length; i++) if (data.categories[i].id === id) return data.categories[i].name[lang];
    return "";
  }
  function openItemModal(id) {
    var it = itemById(id);
    if (!it) return;
    var lang = state.lang, he = lang === "he";
    var t = window.MS_I18N[lang];
    var config = data.config;
    var title = it.title[lang];
    var desc = it.desc[lang];
    var priceText = it.price != null ? money(it.price) : t.askPrice;
    var msg = he ? 'היי, מתעניין/ת ב"' + title + '" מהמכירה — עדיין זמין?' : 'Hi, I\'m interested in "' + title + '" from your sale — is it still available?';
    var waHref = "https://wa.me/" + config.whatsapp + "?text=" + encodeURIComponent(msg);
    var mailHref = "mailto:" + config.email + "?subject=" + encodeURIComponent(title);

    modal.photos = it.photos || [];
    modal.index = 0;

    var gallery;
    if (modal.photos.length) {
      var origins = ["center", "top left", "bottom right", "top right", "bottom left", "center top"];
      gallery = '<div class="ms-modal-slideshow" data-mlightbox title="' + esc(he ? "הגדלה" : "Enlarge") + '">' +
        modal.photos.map(function (p, i) {
          return '<div class="ms-slide' + (i === 0 ? " active" : "") + '"><img src="' + esc(p) +
            '" alt="" style="transform-origin:' + origins[i % origins.length] + ';" /></div>';
        }).join("") + "</div>";
    } else {
      gallery = '<div class="ms-modal-empty">' + ICON.image + "</div>";
    }
    if (it.sold) gallery += '<span class="ms-modal-sold">' + esc(t.sold) + "</span>";

    var body =
      '<div class="ms-modal-head">' +
        '<h3 class="ms-modal-title">' + esc(title) + "</h3>" +
        '<span class="ms-modal-cat">' + esc(catName(it.category, lang)) + "</span>" +
      "</div>" +
      (it.brand ? '<span class="ms-modal-brand">' + esc(it.brand) + "</span>" : "") +
      (desc ? '<p class="ms-modal-desc">' + esc(desc) + "</p>" : "") +
      (it.dimensions ? '<span class="ms-modal-dims">' + esc(it.dimensions) + "</span>" : "") +
      '<div class="ms-modal-price-row">' +
        '<span class="ms-modal-price">' + esc(priceText) + "</span>" +
        (it.originalPrice ? '<span class="ms-modal-orig">' + esc(money(it.originalPrice)) + "</span>" : "") +
      "</div>" +
      '<div class="ms-modal-actions">' +
        '<a class="wa" href="' + esc(waHref) + '" target="_blank" rel="noopener">' + esc(t.waLong) + "</a>" +
        '<a class="mail" href="' + esc(mailHref) + '">' + esc(t.mailLong) + "</a>" +
        (it.link ? '<a class="detail" href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(t.details) + "</a>" : "") +
      "</div>";

    closeItemModal();
    modal.el = document.createElement("div");
    modal.el.className = "ms-modal";
    modal.el.setAttribute("dir", he ? "rtl" : "ltr");
    modal.el.innerHTML =
      '<div class="ms-modal-card">' +
        '<button class="ms-modal-close" data-mclose aria-label="close">&times;</button>' +
        '<div class="ms-modal-gallery">' + gallery + "</div>" +
        '<div class="ms-modal-body">' + body + "</div>" +
      "</div>";
    document.body.appendChild(modal.el);
    modal.el.addEventListener("click", function (e) {
      if (e.target === modal.el || e.target.hasAttribute("data-mclose")) { closeItemModal(); return; }
      if (e.target.closest(".ms-modal-slideshow") && modal.photos.length) openLightbox(modal.photos, modal.slideIndex || 0);
    });
    document.addEventListener("keydown", modalKey);
    modalSlideStart();
  }

  /* ---------- events (delegated, attached once) ---------- */
  function onClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    switch (action) {
      case "toggle-lang":
        state.lang = state.lang === "he" ? "en" : "he";
        try { localStorage.setItem("ms_lang", state.lang); } catch (err) {}
        render();
        break;
      case "open-list":
        state.listOpen = true;
        render();
        break;
      case "close-list":
        state.listOpen = false;
        render();
        break;
      case "clear-list":
        state.saved = [];
        persistSaved();
        render();
        break;
      case "clear-search":
        state.query = "";
        render();
        break;
      case "toggle-save": {
        var id = el.getAttribute("data-id");
        var i = state.saved.indexOf(id);
        if (i === -1) state.saved.push(id);
        else state.saved.splice(i, 1);
        persistSaved();
        render();
        break;
      }
      case "open-media":
        openItemModal(el.getAttribute("data-id"));
        break;
    }
  }

  function onInput(e) {
    if (e.target.classList && e.target.classList.contains("ms-search-input")) {
      state.query = e.target.value;
      render();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape" && state.listOpen) {
      state.listOpen = false;
      render();
    }
  }

  /* ---------- boot ---------- */
  function init() {
    state.lang = readLang();
    state.saved = readSaved();
    seedViewers();
    app.addEventListener("click", onClick);
    app.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeydown);
    render();
    scheduleDrift();
  }

  fetch("data/items.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (d) {
      data = d;
      init();
    })
    .catch(function () {
      renderError();
    });
})();
