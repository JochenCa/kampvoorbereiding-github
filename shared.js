/**
 * Gedeelde logica voor kampvoorbereiding.html en archief.html:
 * API-laag (Google Apps Script), datum-normalisatie, checklist-sjabloon,
 * render-helpers voor een kamp-kaart, en concept-opslag voor het nieuw-kamp-formulier.
 *
 * Laad dit bestand VOOR de pagina-specifieke <script> in elke HTML-pagina:
 *   <script src="shared.js"></script>
 */
var KV = (function () {
  "use strict";

  /* ============ CONFIGURATIE ============
     Vul hieronder de Web-app-URL in die je krijgt na het deployen van
     apps-script.gs (zie README.md). Alle pagina's gebruiken deze ene
     instelling. Op de publiek gehoste (GitHub Pages) versie staat dit veld
     bewust LEEG — daar vult elke begeleider de link eenmalig zelf in via het
     invoervak dat dan verschijnt; die wordt lokaal in de browser onthouden
     (localStorage), nooit in de broncode. */
  var CONFIG = {
    API_URL: "",
    POLL_MS: 10000
  };
  /* ======================================= */

  var API_URL_KEY = "kampvoorbereiding:api-url:v1";
  try {
    var storedApiUrl = localStorage.getItem(API_URL_KEY);
    if (storedApiUrl) CONFIG.API_URL = storedApiUrl;
  } catch (e) { /* geen localStorage: blijft bij de waarde hierboven */ }

  function saveApiUrl(url) {
    try { localStorage.setItem(API_URL_KEY, url); } catch (e) { /* negeren */ }
  }

  var DEFAULT_CHECKLIST = [
    { phase: "Aanvraag & basis", steps: [
      "Aanvraag bergkamp bij de klimzaal",
      "Bestemming/land bepalen",
      "Data vastleggen (vertrek-/terugkeerdatum)",
      "Begeleidersteam + rollen bevestigen",
      "Buskalender doorgeven aan klimzaal"
    ]},
    { phase: "Route & verblijf", steps: [
      "Routes en hutten bepalen (routedatabank raadplegen)",
      "Reservering hutten in orde",
      "Reservering camping (basiskamp) in orde",
      "Prospectie plannen (indien nieuwe bestemming)"
    ]},
    { phase: "Erkenning & kampadministratie", steps: [
      "Technische fiche opstellen/actualiseren",
      "Toelatingssjabloon buitenland actualiseren (namen begeleiders)",
      "Verzekering nakijken (niet-Bleau-leden)"
    ]},
    { phase: "Werving & inschrijvingen", steps: [
      "Infomoment plannen",
      "Inschrijvingsmodule openzetten",
      "Inschrijvingen opvolgen (aantal deelnemers)"
    ]},
    { phase: "Deelnemers- & vrijwilligersadministratie", steps: [
      "Medische fiches verzamelen + doorsturen naar hoofdvrijwilliger",
      "Toelatingsformulieren naar ouders + legalisatie opvolgen",
      "Vrijwilligerscontracten opmaken en versturen",
      "Tentverdeling maken"
    ]},
    { phase: "Logistiek & materiaal", steps: [
      "Boodschappenlijst eerste dagen",
      "Paklijst materiaal klimzaal controleren (container)",
      "Busjes reserveren bij de klimzaal"
    ]},
    { phase: "Planning & veiligheid", steps: [
      "Planning/draaiboek invullen",
      "Noodprotocol + achterwachtpersoon vastleggen",
      "Noodnummer pechbijstand auto's",
      "Noodnummer ter plekke (lokale hulpdiensten)",
      "Noodnummer klimzaal"
    ]},
    { phase: "Vlak voor vertrek", steps: [
      "Alle medische fiches binnen en gecontroleerd",
      "Alle toelatingsformulieren gelegaliseerd binnen",
      "Materiaal/busje opgehaald (checklist afgetekend met klimzaal)"
    ]},
    { phase: "Na het kamp", steps: [
      "Evaluatie met de begeleiders",
      "Routedatabank aanvullen met ervaringen",
      "Financieel overzicht afronden"
    ]}
  ];

  var TYPE_LABELS = { "-18": "-18-kamp", "+18": "+18-kamp", "winter": "Winterkamp" };
  var EXPENSE_CATEGORIES = ["Boodschappen", "Restaurant", "Vervoer", "Verblijf", "Materiaal", "Andere"];
  var BASE_BEGELEIDERS = ["Jochen", "Jordy", "Wout"];
  var SETUP_NEEDED = !CONFIG.API_URL || CONFIG.API_URL.indexOf("PASTE_") === 0;
  var DRAFT_KEY = "kampvoorbereiding:new-camp-draft:v1";

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cssEscape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** Haalt een schoon jjjj-mm-dd-stuk uit eender welke waarde die de API teruggeeft
   *  (soms komt dat als volle ISO-tijdstempel terug als Sheets de cel toch als
   *  datum interpreteerde) — een <input type="date"> aanvaardt alleen jjjj-mm-dd. */
  function normalizeDateStr(v) {
    if (!v) return "";
    var s = String(v);
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function daysUntil(dateStr) {
    var clean = normalizeDateStr(dateStr);
    if (!clean) return null;
    var target = new Date(clean + "T00:00:00");
    var now = new Date(todayStr() + "T00:00:00");
    return Math.round((target - now) / 86400000);
  }

  function boolish(v) { return v === true || v === "TRUE" || v === "true"; }

  function formatEUR(n) {
    var v = Number(n) || 0;
    return "€ " + v.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function stepStatusClass(step) {
    if (step.done) return "";
    var d = daysUntil(step.targetDate);
    if (d === null) return "";
    if (d < 0) return "is-bad";
    if (d <= 14) return "is-warn";
    return "";
  }

  /** Basisnamen + alle namen die ooit als "begeleiders" (kommagescheiden) bij
   *  een kamp werden ingevuld, gededupliceerd en gesorteerd — zo duiken
   *  eigen namen automatisch op als suggestie bij het "Wie?"-veld van de
   *  takenlijst, niet enkel de drie vaste namen. */
  function begeleiderOptions(camps) {
    var set = {};
    BASE_BEGELEIDERS.forEach(function (n) { set[n] = true; });
    (camps || []).forEach(function (c) {
      String(c.guides || "").split(",").forEach(function (n) {
        n = n.trim();
        if (n) set[n] = true;
      });
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  /** Toont een invoervak om de Web-app-URL eenmalig in te vullen (nodig op de
   *  publiek gehoste versie, waar `CONFIG.API_URL` bewust leeg start). Na
   *  opslaan herlaadt de pagina zichzelf, waarna de opgeslagen link normaal
   *  wordt opgepikt bovenaan dit bestand. */
  function renderSetupBanner(slotId) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML =
      '<div class="banner bad">' +
        '<div style="margin-bottom:10px">Deze pagina is nog niet gekoppeld aan de gedeelde Google Sheet. Plak hieronder de Web-app-link (zie README.md bij de eenmalige opzet) — dit hoeft maar één keer per toestel/browser.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input type="text" id="kv-setup-url" placeholder="https://script.google.com/macros/s/.../exec" style="flex:1;min-width:240px;padding:8px 10px;border-radius:5px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font-family:var(--font-mono);font-size:12.5px;">' +
          '<button type="button" class="btn primary" id="kv-setup-save">Opslaan</button>' +
        '</div>' +
      '</div>';
    document.getElementById("kv-setup-save").addEventListener("click", function () {
      var val = document.getElementById("kv-setup-url").value.trim();
      if (!val) return;
      saveApiUrl(val);
      location.reload();
    });
  }

  /** Vult het gedeelde <datalist id="begeleiders-list"> in de pagina met de
   *  actuele lijst van begeleidersnamen. Roep dit aan telkens `camps` ververst. */
  function renderBegeleiderDatalist(camps) {
    var dl = document.getElementById("begeleiders-list");
    if (!dl) return;
    dl.innerHTML = begeleiderOptions(camps).map(function (n) {
      return '<option value="' + escapeHtml(n) + '">';
    }).join("");
  }

  function typeLabel(camp) {
    return camp.type === "custom" ? (camp.customLabel || "Eigen type") : (TYPE_LABELS[camp.type] || camp.type);
  }

  function stepsForCamp(steps, campId) {
    return steps.filter(function (s) { return s.campId === campId; });
  }

  function buildDefaultSteps() {
    var flat = [], order = 0;
    DEFAULT_CHECKLIST.forEach(function (group) {
      group.steps.forEach(function (title) { flat.push({ phase: group.phase, title: title, order: order++ }); });
    });
    return flat;
  }

  /* ---------------- API laag (Google Apps Script) ---------------- */

  function apiGet() {
    return fetch(CONFIG.API_URL, { method: "GET" }).then(function (r) { return r.json(); });
  }
  function apiPost(action, payload) {
    return fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload })
    }).then(function (r) { return r.json(); }).then(function (json) {
      if (!json.ok) throw new Error(json.error || "onbekende fout van de API");
      return json.result;
    });
  }

  /** Haalt camps+steps op en normaliseert types/datums, zodat de rest van de
   *  pagina nooit met rauwe Sheet-eigenaardigheden (booleans als tekst, datums
   *  als tijdstempel) moet rekening houden. */
  function fetchAll() {
    return apiGet().then(function (data) {
      if (!data.ok) throw new Error(data.error || "onbekende fout");
      var camps = (data.camps || []).map(function (c) {
        return Object.assign({}, c, {
          // "-18"/"+18" zien er als getal uit voor Sheets, dat zet zulke
          // waarden soms om (bv. -18 zonder aanhalingstekens) — hier altijd
          // terug naar tekst, ook voor rijen die al eerder verkeerd werden
          // weggeschreven (geen Sheet-herstel nodig).
          type: c.type == null ? "" : String(c.type),
          archived: boolish(c.archived),
          startDate: normalizeDateStr(c.startDate)
        });
      });
      var steps = (data.steps || []).map(function (s) {
        return Object.assign({}, s, {
          done: boolish(s.done),
          order: Number(s.order),
          targetDate: normalizeDateStr(s.targetDate)
        });
      });
      var income = (data.income || []).map(function (i) {
        return Object.assign({}, i, {
          amount: Number(i.amount) || 0,
          date: normalizeDateStr(i.date)
        });
      });
      var expenses = (data.expenses || []).map(function (x) {
        return Object.assign({}, x, {
          amount: Number(x.amount) || 0,
          date: normalizeDateStr(x.date)
        });
      });
      return { camps: camps, steps: steps, income: income, expenses: expenses };
    });
  }

  /* ---------------- Render ---------------- */

  function renderCampCard(camp, campSteps, expanded) {
    campSteps = campSteps.slice().sort(function (a, b) { return a.order - b.order; });
    var doneCount = campSteps.filter(function (s) { return s.done; }).length;
    var total = campSteps.length;
    var pct = total ? Math.round(100 * doneCount / total) : 0;

    var countdownHtml = "";
    if (camp.startDate) {
      var d = daysUntil(camp.startDate);
      var cls = d < 0 ? "bad" : (d <= 21 ? "warn" : "");
      var text = d < 0 ? "gestart" : (d === 0 ? "vandaag" : "over " + d + " dagen");
      var range = camp.startDate + (camp.endDate ? " \u2192 " + camp.endDate : "");
      countdownHtml = '<span class="countdown ' + cls + '">vertrek ' + escapeHtml(range) + ' \u00b7 ' + text + '</span>';
    }
    var adminBits = [];
    if (camp.camping) adminBits.push('<span>Camping: ' + escapeHtml(camp.camping) + '</span>');
    if (camp.guides) adminBits.push('<span>Begeleiders: ' + escapeHtml(camp.guides) + '</span>');
    if (camp.transport) adminBits.push('<span>Vervoer: ' + escapeHtml(camp.transport) + '</span>');

    var byPhase = {}, phaseOrder = [];
    campSteps.forEach(function (s) {
      if (!byPhase[s.phase]) { byPhase[s.phase] = []; phaseOrder.push(s.phase); }
      byPhase[s.phase].push(s);
    });

    var bodyHtml = phaseOrder.map(function (phase) {
      var list = byPhase[phase];
      var phaseDone = list.filter(function (s) { return s.done; }).length;
      return '<section class="phase">' +
        '<h4>' + escapeHtml(phase) + ' <span class="phase-count">' + phaseDone + '/' + list.length + '</span></h4>' +
        '<ul class="steps">' + list.map(renderStepRow).join("") + '</ul>' +
      '</section>';
    }).join("");

    return '<article class="camp' + (camp.archived ? " is-archived" : "") + '" data-camp-id="' + camp.id + '">' +
      '<button type="button" class="camp-head" data-toggle="' + camp.id + '">' +
        '<div>' +
          '<div class="camp-title-row"><h3>' + escapeHtml(camp.name) + '</h3><span class="pill">' + escapeHtml(typeLabel(camp)) + '</span></div>' +
          '<div class="camp-sub">' + (camp.destination ? '<span>' + escapeHtml(camp.destination) + '</span>' : "") + countdownHtml + adminBits.join("") + '</div>' +
        '</div>' +
        '<div class="progress-wrap"><div class="bar"><div class="fill" style="width:' + pct + '%"></div></div><span class="progress-label">' + doneCount + '/' + total + '</span></div>' +
        '<span class="chevron">' + (expanded ? "\u25be" : "\u25b8") + '</span>' +
      '</button>' +
      (expanded ? '<div class="camp-body">' +
        (camp.notes ? '<div class="camp-notes"><h4>Notities</h4><p>' + escapeHtml(camp.notes).replace(/\n/g, "<br>") + '</p></div>' : '') +
        bodyHtml +
        '<div class="camp-actions">' +
          '<button type="button" class="btn small danger" data-delete="' + camp.id + '" data-delete-name="' + escapeHtml(camp.name) + '">Verwijderen</button>' +
          '<div class="camp-actions-right">' +
            '<a class="btn small" href="fiche.html?id=' + encodeURIComponent(camp.id) + '" target="_blank" rel="noopener">Fiche afdrukken</a>' +
            '<button type="button" class="btn small" data-edit="' + camp.id + '">Bewerken</button>' +
            '<button type="button" class="btn small" data-archive-toggle="' + camp.id + '" data-archive-value="' + (camp.archived ? "false" : "true") + '">' + (camp.archived ? "Terug naar actief" : "Archiveren") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' : '') +
    '</article>';
  }

  function renderStepRow(step) {
    var extra = stepStatusClass(step);
    var cls = "step" + (step.done ? " is-done" : "") + (extra ? " " + extra : "");
    return '<li class="' + cls + '" data-step-id="' + step.id + '">' +
      '<input type="checkbox" data-step-done="' + step.id + '"' + (step.done ? " checked" : "") + '>' +
      '<span class="step-title">' + escapeHtml(step.title) + '</span>' +
      '<input type="date" class="step-date" data-step-date="' + step.id + '" value="' + escapeHtml(step.targetDate || "") + '">' +
      '<input type="text" class="step-owner" list="begeleiders-list" placeholder="Wie?" data-step-owner="' + step.id + '" value="' + escapeHtml(step.owner || "") + '">' +
    '</li>';
  }

  /** Koppelt de events (afvinken, datum, wie, archiveren, in-/uitklappen) van
   *  één kamp-kaart die al in de DOM staat. `handlers` mag callbacks bevatten:
   *  onToggleExpand(campId), onArchiveToggle(campId, newValue), en na elke
   *  wijziging wordt onSaved() opgeroepen zodat de pagina kan verversen. */
  function bindCampCard(root, camp, handlers) {
    var card = root.querySelector('.camp[data-camp-id="' + cssEscape(camp.id) + '"]');
    if (!card) return;
    var head = card.querySelector('[data-toggle]');
    if (head && handlers.onToggleExpand) head.addEventListener("click", function () { handlers.onToggleExpand(camp.id); });
    var archBtn = card.querySelector('[data-archive-toggle]');
    if (archBtn && handlers.onArchiveToggle) archBtn.addEventListener("click", function () {
      handlers.onArchiveToggle(camp.id, archBtn.getAttribute("data-archive-value") === "true");
    });
    var delBtn = card.querySelector('[data-delete]');
    if (delBtn && handlers.onDelete) delBtn.addEventListener("click", function () {
      handlers.onDelete(camp.id, delBtn.getAttribute("data-delete-name") || camp.name);
    });
    var editBtn = card.querySelector('[data-edit]');
    if (editBtn && handlers.onEdit) editBtn.addEventListener("click", function () { handlers.onEdit(camp); });
    card.querySelectorAll('[data-step-done]').forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-step-done");
        apiPost("updateStep", { id: id, fields: { done: cb.checked } }).then(handlers.onSaved).catch(handlers.onError);
      });
    });
    card.querySelectorAll('[data-step-date]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-step-date");
        apiPost("updateStep", { id: id, fields: { targetDate: inp.value || "" } }).then(handlers.onSaved).catch(handlers.onError);
      });
    });
    card.querySelectorAll('[data-step-owner]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-step-owner");
        apiPost("updateStep", { id: id, fields: { owner: inp.value.trim() } }).then(handlers.onSaved).catch(handlers.onError);
      });
    });
  }

  /* ---------------- Concept-opslag (nieuw-kamp-formulier) ---------------- */
  /* Lokaal in de browser (niet gedeeld) — beschermt enkel tegen per ongeluk
     sluiten/herladen terwijl je een nieuw kamp aan het invullen bent. */

  function saveDraft(draft) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* geen localStorage: geen probleem, gewoon geen herstel */ }
  }
  function loadDraft() {
    try {
      var s = localStorage.getItem(DRAFT_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* negeren */ }
  }
  function draftIsEmpty(d) {
    return !d || (!d.name && !d.customLabel && !d.destination && !d.startDate && !d.endDate && !d.transport && !d.guides && !d.camping && !d.notes);
  }

  /* ---------------- Kasticket-foto: client-side verkleinen ---------------- */
  /* Voorkomt trage uploads (vooral vanaf een gsm-camera): schaalt terug naar
   *  max. 1400px langste zijde en herencodeert als JPEG. Geeft de kale
   *  base64-string terug (zonder de data:...;base64, voorloop). */
  function compressImageFile(file, maxDim, quality) {
    maxDim = maxDim || 1400; quality = quality || 0.75;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Kon het bestand niet lezen.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("Kon de afbeelding niet openen.")); };
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  return {
    CONFIG: CONFIG, SETUP_NEEDED: SETUP_NEEDED, DEFAULT_CHECKLIST: DEFAULT_CHECKLIST, TYPE_LABELS: TYPE_LABELS,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES, BASE_BEGELEIDERS: BASE_BEGELEIDERS,
    escapeHtml: escapeHtml, cssEscape: cssEscape, todayStr: todayStr, daysUntil: daysUntil,
    normalizeDateStr: normalizeDateStr, boolish: boolish, formatEUR: formatEUR, stepStatusClass: stepStatusClass,
    typeLabel: typeLabel, stepsForCamp: stepsForCamp, buildDefaultSteps: buildDefaultSteps,
    begeleiderOptions: begeleiderOptions, renderBegeleiderDatalist: renderBegeleiderDatalist,
    saveApiUrl: saveApiUrl, renderSetupBanner: renderSetupBanner,
    apiGet: apiGet, apiPost: apiPost, fetchAll: fetchAll,
    renderCampCard: renderCampCard, renderStepRow: renderStepRow, bindCampCard: bindCampCard,
    saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft, draftIsEmpty: draftIsEmpty,
    compressImageFile: compressImageFile
  };
})();
