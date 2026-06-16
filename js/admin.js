/* ============================================================
   Moving Sale — admin editor.
   Edits data/items.json (config + categories + items) and commits
   it — plus any newly added photos — to the GitHub repo via the
   Contents API, using a personal access token kept only in this
   browser's localStorage. No backend.
   ============================================================ */
(function () {
  "use strict";

  var GH = { owner: "itaico82", repo: "moving-sale", branch: "main", path: "data/items.json" };
  var API = "https://api.github.com/repos/" + GH.owner + "/" + GH.repo + "/contents/";

  var model = null; // { config, categories, items }
  var sha = null; // sha of data/items.json on the repo (for safe overwrite)
  var token = "";

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- utf8-safe base64 ---------- */
  function bytesToB64(bytes) {
    var bin = "", chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64encodeUtf8(str) { return bytesToB64(new TextEncoder().encode(str)); }
  function b64decodeUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- status ---------- */
  function status(msg, kind) {
    var el = $("status");
    el.textContent = msg || "";
    el.className = "adm-status" + (kind ? " " + kind : "");
  }

  /* ---------- GitHub API ---------- */
  function ghHeaders(withAuth) {
    var h = { Accept: "application/vnd.github+json" };
    if (withAuth && token) h.Authorization = "Bearer " + token;
    return h;
  }

  function ghGetFile(path) {
    return fetch(API + path + "?ref=" + GH.branch, { headers: ghHeaders(true), cache: "no-store" })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("GET " + path + " → " + r.status);
        return r.json();
      });
  }

  function ghPutFile(path, contentB64, message, existingSha) {
    var body = { message: message, content: contentB64, branch: GH.branch };
    if (existingSha) body.sha = existingSha;
    return fetch(API + path, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(true)),
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var msg = (j && j.message) || ("PUT " + path + " → " + r.status);
          var err = new Error(msg);
          err.statusCode = r.status;
          throw err;
        }
        return j;
      });
    });
  }

  /* ---------- load ---------- */
  function load() {
    status("טוען…", "busy");
    return ghGetFile(GH.path)
      .then(function (res) {
        if (res && res.content) {
          model = JSON.parse(b64decodeUtf8(res.content));
          sha = res.sha;
          status("נטען מ-GitHub", "ok");
        } else {
          throw new Error("not-on-repo");
        }
      })
      .catch(function () {
        // Repo/file not reachable yet — fall back to the local file for editing.
        sha = null;
        return fetch("data/items.json", { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            model = d;
            status("נטען מקובץ מקומי (טרם פורסם / אין חיבור)", "busy");
          });
      })
      .then(function () {
        normalize();
        renderAll();
      })
      .catch(function (e) {
        status("טעינה נכשלה: " + e.message, "err");
      });
  }

  function normalize() {
    model.config = model.config || {};
    model.categories = model.categories || [];
    model.items = model.items || [];
    var c = model.config;
    if (!Array.isArray(c.heroPhotos)) c.heroPhotos = c.heroPhoto ? [c.heroPhoto] : [];
    delete c.heroPhoto; // migrated to heroPhotos[]
    c._newHeroPhotos = c._newHeroPhotos || []; // pending hero uploads: { dataUrl, filename }
    model.categories.forEach(function (cat) {
      cat.name = cat.name || { he: "", en: "" };
      if (!Array.isArray(cat.keywords)) cat.keywords = [];
    });
    model.items.forEach(function (it) {
      it.title = it.title || { he: "", en: "" };
      it.desc = it.desc || { he: "", en: "" };
      it.photos = it.photos || [];
      it._newPhotos = it._newPhotos || []; // pending uploads: { dataUrl, filename }
    });
  }

  /* ---------- helpers for nested set ---------- */
  function setPath(obj, path, value) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  /* ---------- render ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderAll() {
    renderConfig();
    renderCategories();
    renderItems();
  }

  function renderConfig() {
    var c = model.config;
    var existing = (c.heroPhotos || []).map(function (p, i) {
      return '<div class="photo"><img src="' + esc(resolvePhoto(p)) + '" alt="" />' +
        '<button data-act="hero-del" data-pi="' + i + '" title="הסר">×</button></div>';
    }).join("");
    var pending = (c._newHeroPhotos || []).map(function (np, ni) {
      return '<div class="photo pending"><img src="' + esc(np.dataUrl) + '" alt="" />' +
        '<button data-act="hero-newdel" data-ni="' + ni + '" title="הסר">×</button></div>';
    }).join("");

    $("config").innerHTML =
      '<div class="adm-grid">' +
        field("config", "whatsapp", "וואטסאפ (ספרות בלבד, פורמט בינ״ל)", c.whatsapp) +
        field("config", "phoneLabel", "תצוגת מספר טלפון", c.phoneLabel) +
        field("config", "email", "אימייל", c.email) +
        field("config", "location.he", "מיקום (עברית)", c.location && c.location.he) +
        field("config", "location.en", "מיקום (אנגלית)", c.location && c.location.en) +
        field("config", "moveDate.he", "תאריך מעבר (עברית)", c.moveDate && c.moveDate.he) +
        field("config", "moveDate.en", "תאריך מעבר (אנגלית)", c.moveDate && c.moveDate.en) +
      "</div>" +
      '<div class="field" style="margin-top:14px;"><label>תמונות אווירה (סליידשואו בראש העמוד)</label>' +
        '<div class="photos">' + existing + pending +
          '<label class="add-photo" style="cursor:pointer;border:1px dashed var(--line);padding:10px 12px;color:var(--accent);">+ הוסף תמונות אווירה' +
          '<input type="file" accept="image/*" multiple data-act="add-hero-photo" style="display:none;" /></label>' +
        "</div></div>";
  }

  function field(kind, path, label, value, extra) {
    return (
      '<div class="field"><label>' + esc(label) + "</label>" +
      '<input type="text" data-kind="' + kind + '" data-field="' + path + '" ' +
      (extra || "") + ' value="' + esc(value == null ? "" : value) + '" /></div>'
    );
  }

  function renderCategories() {
    var html = model.categories.map(function (c, i) {
      return (
        '<div style="border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:14px;">' +
          '<div class="adm-row" data-cat-row="' + i + '">' +
            '<div style="flex:1;min-width:140px;"><label>מזהה (id)</label>' +
              '<input type="text" data-kind="cat" data-i="' + i + '" data-field="id" value="' + esc(c.id) + '" /></div>' +
            '<div style="flex:1;min-width:140px;"><label>שם (עברית)</label>' +
              '<input type="text" data-kind="cat" data-i="' + i + '" data-field="name.he" value="' + esc(c.name.he) + '" /></div>' +
            '<div style="flex:1;min-width:140px;"><label>שם (אנגלית)</label>' +
              '<input type="text" data-kind="cat" data-i="' + i + '" data-field="name.en" value="' + esc(c.name.en) + '" /></div>' +
            '<button class="ghost" data-act="cat-up" data-i="' + i + '" title="למעלה">↑</button>' +
            '<button class="ghost" data-act="cat-down" data-i="' + i + '" title="למטה">↓</button>' +
            '<button class="danger" data-act="cat-del" data-i="' + i + '">מחק</button>' +
          "</div>" +
          '<div class="field" style="margin:8px 0 0;"><label>מילות חיפוש (מופרדות בפסיק — לחיפוש לפי קטגוריה)</label>' +
            '<input type="text" data-kind="cat-keywords" data-i="' + i + '" value="' + esc((c.keywords || []).join(", ")) + '" /></div>' +
        "</div>"
      );
    }).join("");
    $("categories").innerHTML = html || '<p style="color:#999;">אין קטגוריות.</p>';
  }

  function catOptions(selected) {
    return model.categories.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === selected ? " selected" : "") + ">" + esc(c.name.he || c.id) + "</option>";
    }).join("");
  }

  function renderItems() {
    $("item-count").textContent = "(" + model.items.length + ")";
    $("items").innerHTML = model.items.map(function (it, i) {
      var photos = (it.photos || []).map(function (p, pi) {
        return '<div class="photo"><img src="' + esc(resolvePhoto(p)) + '" alt="" />' +
          '<button data-act="photo-del" data-i="' + i + '" data-pi="' + pi + '" title="הסר">×</button></div>';
      }).join("");
      var pending = (it._newPhotos || []).map(function (np, ni) {
        return '<div class="photo pending"><img src="' + esc(np.dataUrl) + '" alt="" />' +
          '<button data-act="newphoto-del" data-i="' + i + '" data-ni="' + ni + '" title="הסר">×</button></div>';
      }).join("");

      return (
        '<div class="adm-item' + (it.sold ? " sold" : "") + '">' +
          '<div class="adm-item-head">' +
            '<span class="adm-item-num">#' + (i + 1) + "</span>" +
            '<span class="adm-item-name">' + esc(it.title.he || it.title.en || it.id) + "</span>" +
            '<span class="adm-spacer"></span>' +
            '<button class="ghost" data-act="item-up" data-i="' + i + '" title="למעלה">↑</button>' +
            '<button class="ghost" data-act="item-down" data-i="' + i + '" title="למטה">↓</button>' +
            '<button class="danger" data-act="item-del" data-i="' + i + '">מחק</button>' +
          "</div>" +
          '<div class="adm-grid">' +
            '<div class="field"><label>כותרת (עברית)</label><input type="text" data-kind="item" data-i="' + i + '" data-field="title.he" value="' + esc(it.title.he) + '" /></div>' +
            '<div class="field"><label>כותרת (אנגלית)</label><input type="text" data-kind="item" data-i="' + i + '" data-field="title.en" value="' + esc(it.title.en) + '" /></div>' +
          "</div>" +
          '<div class="adm-grid">' +
            '<div class="field"><label>תיאור (עברית)</label><textarea data-kind="item" data-i="' + i + '" data-field="desc.he">' + esc(it.desc.he) + "</textarea></div>" +
            '<div class="field"><label>תיאור (אנגלית)</label><textarea data-kind="item" data-i="' + i + '" data-field="desc.en">' + esc(it.desc.en) + "</textarea></div>" +
          "</div>" +
          '<div class="adm-grid-3">' +
            '<div class="field"><label>קטגוריה</label><select data-kind="item-cat" data-i="' + i + '">' + catOptions(it.category) + "</select></div>" +
            '<div class="field"><label>מותג (אופציונלי)</label><input type="text" data-kind="item" data-i="' + i + '" data-field="brand" value="' + esc(it.brand == null ? "" : it.brand) + '" /></div>' +
            '<div class="field"><label>מידות (אופציונלי)</label><input type="text" data-kind="item" data-i="' + i + '" data-field="dimensions" value="' + esc(it.dimensions == null ? "" : it.dimensions) + '" /></div>' +
          "</div>" +
          '<div class="adm-grid-3">' +
            '<div class="field"><label>מחיר מבוקש (ריק = מחיר בפנייה)</label><input type="number" data-kind="item-num" data-i="' + i + '" data-field="price" value="' + (it.price == null ? "" : it.price) + '" /></div>' +
            '<div class="field"><label>מחיר מקורי (אופציונלי)</label><input type="number" data-kind="item-num" data-i="' + i + '" data-field="originalPrice" value="' + (it.originalPrice == null ? "" : it.originalPrice) + '" /></div>' +
            '<div class="field" style="display:flex;align-items:flex-end;"><label class="chk"><input type="checkbox" data-kind="item-sold" data-i="' + i + '"' + (it.sold ? " checked" : "") + " /> נמכר / שמור</label></div>" +
          "</div>" +
          '<div class="field"><label>קישור לפריט (אופציונלי — נפתח בלחיצה על התמונה)</label>' +
            '<input type="text" data-kind="item" data-i="' + i + '" data-field="link" value="' + esc(it.link == null ? "" : it.link) + '" placeholder="https://" /></div>' +
          '<div class="field"><label>תמונות</label>' +
            '<div class="photos">' + photos + pending +
              '<label class="add-photo" style="cursor:pointer;border:1px dashed var(--line);padding:10px 12px;color:var(--accent);">+ הוסף תמונות' +
              '<input type="file" accept="image/*" multiple data-act="add-photo" data-i="' + i + '" style="display:none;" /></label>' +
            "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("") || '<p style="color:#999;">אין פריטים. לחצו על "פריט חדש".</p>';
  }

  // For previews, resolve repo-relative paths against raw.githubusercontent.com
  // so a just-committed image shows immediately (the Pages CDN lags ~1 min after
  // each commit). The public catalog keeps the relative path, which is correct there.
  function resolvePhoto(p) {
    if (/^https?:\/\//.test(p)) return p;
    return "https://raw.githubusercontent.com/" + GH.owner + "/" + GH.repo + "/" + GH.branch + "/" + p;
  }

  /* ---------- image compression ---------- */
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var img = new Image(); img.onload = function () { res(img); }; img.onerror = rej; img.src = fr.result; };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  function compressImage(file, max, quality) {
    max = max || 1600; quality = quality || 0.8;
    return loadImage(file).then(function (img) {
      var w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
      else if (h >= w && h > max) { w = Math.round((w * max) / h); h = max; }
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", quality);
    });
  }

  /* ---------- mutations ---------- */
  function newId() {
    return "item-" + Math.random().toString(36).slice(2, 8) + Math.abs(new Date().getTime() % 100000);
  }
  function move(arr, i, dir) {
    var j = i + dir;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }

  function onClick(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var i = btn.hasAttribute("data-i") ? parseInt(btn.getAttribute("data-i"), 10) : null;

    if (act === "cat-up") { move(model.categories, i, -1); renderCategories(); renderItems(); }
    else if (act === "cat-down") { move(model.categories, i, 1); renderCategories(); renderItems(); }
    else if (act === "cat-del") { model.categories.splice(i, 1); renderCategories(); renderItems(); }
    else if (act === "item-up") { move(model.items, i, -1); renderItems(); }
    else if (act === "item-down") { move(model.items, i, 1); renderItems(); }
    else if (act === "item-del") {
      if (confirm("למחוק את הפריט?")) { model.items.splice(i, 1); renderItems(); }
    }
    else if (act === "photo-del") {
      var pi = parseInt(btn.getAttribute("data-pi"), 10);
      model.items[i].photos.splice(pi, 1); renderItems();
    }
    else if (act === "newphoto-del") {
      var ni = parseInt(btn.getAttribute("data-ni"), 10);
      model.items[i]._newPhotos.splice(ni, 1); renderItems();
    }
    else if (act === "hero-del") {
      model.config.heroPhotos.splice(parseInt(btn.getAttribute("data-pi"), 10), 1); renderConfig();
    }
    else if (act === "hero-newdel") {
      model.config._newHeroPhotos.splice(parseInt(btn.getAttribute("data-ni"), 10), 1); renderConfig();
    }
  }

  function onChange(e) {
    var t = e.target;
    var kind = t.getAttribute("data-kind");
    var act = t.getAttribute("data-act");

    if (act === "add-photo") {
      var i = parseInt(t.getAttribute("data-i"), 10);
      var files = Array.prototype.slice.call(t.files);
      if (!files.length) return;
      status("מכווץ תמונות…", "busy");
      Promise.all(files.map(function (f, idx) {
        return compressImage(f).then(function (dataUrl) {
          return { dataUrl: dataUrl, filename: model.items[i].id + "-" + new Date().getTime() + "-" + idx + ".jpg" };
        });
      })).then(function (out) {
        model.items[i]._newPhotos.push.apply(model.items[i]._newPhotos, out);
        status("", "");
        renderItems();
      }).catch(function (err) { status("עיבוד תמונה נכשל: " + err.message, "err"); });
      return;
    }

    if (act === "add-hero-photo") {
      var hfiles = Array.prototype.slice.call(t.files);
      if (!hfiles.length) return;
      status("מכווץ תמונות…", "busy");
      Promise.all(hfiles.map(function (f, idx) {
        return compressImage(f).then(function (dataUrl) {
          return { dataUrl: dataUrl, filename: "hero-" + new Date().getTime() + "-" + idx + ".jpg" };
        });
      })).then(function (out) {
        model.config._newHeroPhotos.push.apply(model.config._newHeroPhotos, out);
        status("", "");
        renderConfig();
      }).catch(function (err) { status("עיבוד תמונה נכשל: " + err.message, "err"); });
      return;
    }

    if (kind === "item-cat") {
      model.items[parseInt(t.getAttribute("data-i"), 10)].category = t.value;
    } else if (kind === "item-sold") {
      model.items[parseInt(t.getAttribute("data-i"), 10)].sold = t.checked;
      renderItems();
    }
  }

  function onInput(e) {
    var t = e.target;
    var kind = t.getAttribute("data-kind");
    if (!kind) return;
    var field = t.getAttribute("data-field");

    if (kind === "config") {
      setPath(model.config, field, t.value);
    } else if (kind === "cat") {
      setPath(model.categories[parseInt(t.getAttribute("data-i"), 10)], field, t.value);
    } else if (kind === "cat-keywords") {
      model.categories[parseInt(t.getAttribute("data-i"), 10)].keywords =
        t.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    } else if (kind === "item") {
      var it = model.items[parseInt(t.getAttribute("data-i"), 10)];
      var val = t.value;
      if ((field === "brand" || field === "dimensions" || field === "link") && val === "") val = null;
      setPath(it, field, val);
    } else if (kind === "item-num") {
      var item = model.items[parseInt(t.getAttribute("data-i"), 10)];
      item[field] = t.value === "" ? null : Number(t.value);
    }
  }

  /* ---------- save ---------- */
  function cleanModel() {
    var cfg = {};
    Object.keys(model.config).forEach(function (k) { if (k !== "_newHeroPhotos") cfg[k] = model.config[k]; });
    return {
      config: cfg,
      categories: model.categories,
      items: model.items.map(function (it) {
        var copy = {};
        Object.keys(it).forEach(function (k) { if (k !== "_newPhotos") copy[k] = it[k]; });
        return copy;
      }),
    };
  }

  function save() {
    if (!token) { status("חסר טוקן GitHub", "err"); $("token").focus(); return; }
    $("save").disabled = true;
    status("שומר…", "busy");

    // 1) refresh sha, 2) upload pending photos, 3) commit items.json
    ghGetFile(GH.path)
      .then(function (res) {
        if (res) sha = res.sha; // adopt latest to avoid 409
        // upload pending images sequentially (hero photos first, then item photos)
        var uploads = [];
        (model.config._newHeroPhotos || []).forEach(function (np) { uploads.push({ target: "hero", np: np }); });
        model.items.forEach(function (it) {
          (it._newPhotos || []).forEach(function (np) { uploads.push({ it: it, np: np }); });
        });
        return uploads.reduce(function (chain, u) {
          return chain.then(function () {
            var path = "images/" + u.np.filename;
            var b64 = u.np.dataUrl.split(",")[1];
            status("מעלה תמונה " + u.np.filename + "…", "busy");
            return ghPutFile(path, b64, "admin: add image " + u.np.filename).then(function () {
              if (u.target === "hero") model.config.heroPhotos.push(path);
              else u.it.photos.push(path);
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        // clear pending now that they're committed + referenced
        model.config._newHeroPhotos = [];
        model.items.forEach(function (it) { it._newPhotos = []; });
        var json = JSON.stringify(cleanModel(), null, 2) + "\n";
        status("שומר את הקטלוג…", "busy");
        return ghPutFile(GH.path, b64encodeUtf8(json), "admin: update catalog", sha);
      })
      .then(function (res) {
        sha = res.content.sha;
        status("נשמר ✓ האתר יתעדכן תוך כדקה", "ok");
        renderItems();
      })
      .catch(function (err) {
        var msg = err.message || "שגיאה";
        if (err.statusCode === 401) msg = "טוקן לא תקין (401)";
        else if (err.statusCode === 404) msg = "הריפו לא נמצא — צריך לפרסם קודם (deploy.sh)";
        else if (err.statusCode === 409) msg = "התנגשות גרסאות — לחצו 'טען מחדש' ונסו שוב";
        status("שמירה נכשלה: " + msg, "err");
      })
      .then(function () { $("save").disabled = false; });
  }

  /* ---------- boot ---------- */
  function init() {
    token = localStorage.getItem("ms_gh_token") || "";
    $("token").value = token;
    $("save-token").addEventListener("click", function () {
      token = $("token").value.trim();
      try { localStorage.setItem("ms_gh_token", token); } catch (e) {}
      status(token ? "הטוקן נשמר בדפדפן" : "הטוקן נמחק", "ok");
    });
    $("reload").addEventListener("click", load);
    $("save").addEventListener("click", save);
    $("add-cat").addEventListener("click", function () {
      model.categories.push({ id: "category-" + (model.categories.length + 1), name: { he: "", en: "" } });
      renderCategories(); renderItems();
    });
    $("add-item").addEventListener("click", function () {
      var firstCat = model.categories[0] ? model.categories[0].id : "";
      model.items.push({
        id: newId(), category: firstCat, brand: null, price: null, originalPrice: null,
        dimensions: null, link: null, sold: false, photos: [], _newPhotos: [],
        title: { he: "", en: "" }, desc: { he: "", en: "" },
      });
      renderItems();
      window.scrollTo(0, document.body.scrollHeight);
    });

    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);

    load();
  }

  init();
})();
