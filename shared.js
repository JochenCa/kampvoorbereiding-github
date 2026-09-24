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
     De Web-app-URL staat hier vast ingevuld, óók in de publieke GitHub-versie.
     Die link alleen geeft geen toegang: de backend weigert elke aanvraag
     zonder de juiste toegangscode. Het voordeel is dat niemand die lange URL
     nog moet overtypen, en dat één aangepaste regel hier volstaat wanneer er
     een nieuwe Apps Script-deployment komt — iedereen zit dan meteen goed.

     De TOEGANGSCODE staat bewust NIET in de publieke versie. Die vult elke
     begeleider eenmalig zelf in; de browser onthoudt ze daarna. */
  var CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbyrdNbFXNBlH5iUPu4cdve8fboTRLVTuqOi0DTL5DLNQOJIZKI7PXG0ycDdEU50QYCS/exec",
    ACCESS_KEY: "",
    POLL_MS: 10000
  };
  /* ======================================= */

  // Enkel de toegangscode wordt lokaal bewaard. De link komt altijd uit de
  // broncode hierboven — bewust, want anders zou een begeleider met een oude
  // opgeslagen link ongemerkt op een verouderde deployment blijven werken.
  // Dat is precies wat er eerder is misgelopen.
  var ACCESS_KEY_KEY = "kampvoorbereiding:access-key:v1";
  var OUD_API_URL_KEY = "kampvoorbereiding:api-url:v1";
  try {
    var storedAccessKey = localStorage.getItem(ACCESS_KEY_KEY);
    if (storedAccessKey) CONFIG.ACCESS_KEY = storedAccessKey;
    // Restant uit de vorige werkwijze opruimen, zodat er geen verouderde
    // link blijft rondslingeren in de browser.
    localStorage.removeItem(OUD_API_URL_KEY);
  } catch (e) { /* geen localStorage: blijft bij de waarde hierboven */ }

  function saveAccessKey(key) {
    try { localStorage.setItem(ACCESS_KEY_KEY, key); } catch (e) { /* negeren */ }
  }

  /** Controleert een ingevulde link + code zonder ze op te slaan, en meldt drie
   *  dingen: of de link bereikbaar is, of de code aanvaard wordt, en — even
   *  belangrijk — of diezelfde link gegevens vrijgeeft ZONDER code. Dat laatste
   *  wijst op een oude, onbeveiligde deployment die nog niet gearchiveerd is. */
  function testConnection(url, key) {
    var out = document.getElementById("kv-cfg-result");
    function report(text, kind) {
      out.hidden = false;
      out.className = "kv-test-result" + (kind ? " " + kind : "");
      out.textContent = text;
    }
    if (!url || !key) { report("Vul eerst de link en de toegangscode in.", "bad"); return; }

    report("Bezig met testen…", "");
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    fetchJsonWithRetry_(url + sep + "key=" + encodeURIComponent(key), { method: "GET" }).then(function (data) {
      if (!data.ok) {
        report("De link werkt, maar de toegangscode wordt geweigerd: " + (data.error || "onbekende reden"), "bad");
        return null;
      }
      return fetch(url, { method: "GET" }).then(function (r) { return r.text(); }).then(function (text) {
        var openZonderCode = false;
        try { openZonderCode = JSON.parse(text).ok === true; } catch (e) { /* geen JSON = geen toegang */ }
        var aantal = (data.camps || []).length;
        if (openZonderCode) {
          report("Verbinding werkt (" + aantal + " kampen), maar LET OP: deze link geeft ook zonder toegangscode gegevens vrij. Dat is een oude, onbeveiligde deployment — archiveer ze in Apps Script.", "warn");
        } else {
          report("Verbinding werkt: " + aantal + " kampen gevonden, en de link is correct beveiligd.", "good");
        }
      });
    }).catch(function (err) {
      report("Geen verbinding met deze link (" + (err && err.message ? err.message : "onbekende fout") + "). Klopt de link, en eindigt hij op /exec?", "bad");
    });
  }

  /** Dialoogvenster om de Web-app-link en de toegangscode in te stellen, of ze
   *  later te wijzigen (bv. wanneer er een nieuwe Apps Script-deployment is en
   *  de link verandert). Staat bewust los van #banner-slot: dat vak wordt bij
   *  elke verversing overschreven, waardoor je formulier zou verdwijnen. */
  function openConnectionDialog() {
    if (document.querySelector(".kv-modal-back")) return;
    var back = document.createElement("div");
    back.className = "kv-modal-back";
    back.innerHTML =
      '<div class="kv-modal" role="dialog" aria-modal="true">' +
        '<h3>Verbinding met de gedeelde Sheet</h3>' +
        '<p>Vul hier de toegangscode in die je van een medebegeleider krijgt. Ze wordt enkel in deze browser bewaard, nooit ergens verstuurd of gepubliceerd.</p>' +
        '<label>Web-app-link</label>' +
        '<input id="kv-cfg-url" type="text" value="' + escapeHtml(CONFIG.API_URL) + '" readonly title="Deze link staat vast in de site en hoeft niet ingevuld te worden.">' +
        '<p class="kv-modal-hint">Deze link zit in de site zelf. Klopt hij niet meer, dan is er een nieuwe Apps Script-deployment en moet de site bijgewerkt worden — niet jouw browser.</p>' +
        '<label for="kv-cfg-key">Toegangscode</label>' +
        '<input id="kv-cfg-key" type="text" value="' + escapeHtml(CONFIG.ACCESS_KEY) + '" placeholder="toegangscode">' +
        '<div class="kv-test-result" id="kv-cfg-result" hidden></div>' +
        '<div class="kv-modal-actions">' +
          '<button type="button" class="btn" id="kv-cfg-cancel">Annuleren</button>' +
          '<button type="button" class="btn" id="kv-cfg-test">Verbinding testen</button>' +
          '<button type="button" class="btn primary" id="kv-cfg-save">Opslaan</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);

    function close() { back.parentNode.removeChild(back); }
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.getElementById("kv-cfg-cancel").addEventListener("click", close);
    document.getElementById("kv-cfg-test").addEventListener("click", function () {
      testConnection(
        document.getElementById("kv-cfg-url").value.trim(),
        document.getElementById("kv-cfg-key").value.trim()
      );
    });
    document.getElementById("kv-cfg-save").addEventListener("click", function () {
      var key = document.getElementById("kv-cfg-key").value.trim();
      if (!key) { alert("Vul de toegangscode in."); return; }
      saveAccessKey(key);
      location.reload();
    });
  }

  /* De standaardchecklist. Per stap staat er een termijn bij:
   *    voor: 210  ->  210 dagen VÓÓR de vertrekdatum
   *    na:    14  ->   14 dagen NÁ de terugkeerdatum
   *
   * Vul je bij een kamp een vertrekdatum in, dan krijgt elke stap meteen een
   * streefdatum. Zonder die termijnen blijft een vers kamp stil: het paneel
   * "Dringende stappen" en de herinneringsmails kijken allebei naar de
   * streefdatum, en die was vroeger altijd leeg.
   *
   * De termijnen zijn geijkt op een zomerkamp in juli/augustus, waarbij de
   * voorbereiding in het najaar ervoor start en de inschrijvingen rond
   * nieuwjaar opengaan. Elke datum blijft achteraf aanpasbaar per kamp; hier
   * wijzigen verandert enkel wat een NIEUW kamp meekrijgt. */
  var DEFAULT_CHECKLIST = [
    { phase: "Aanvraag & basis", steps: [
      { t: "Aanvraag bergkamp bij de klimzaal", voor: 300 },
      { t: "Bestemming/land bepalen", voor: 280 },
      { t: "Data vastleggen (vertrek-/terugkeerdatum)", voor: 270 },
      { t: "Begeleidersteam + rollen bevestigen", voor: 260 },
      // Fundament.md stelt 1 februari voor als deadline; dat is ± 180 dagen
      // voor een vertrek eind juli.
      { t: "Buskalender doorgeven aan klimzaal", voor: 180 }
    ]},
    { phase: "Route & verblijf", steps: [
      { t: "Routes en hutten bepalen (routedatabank raadplegen)", voor: 240 },
      // Te laat boeken is een van de pijnpunten uit Fundament.md: vandaar ruim.
      { t: "Reservering hutten in orde", voor: 210 },
      { t: "Reservering camping (basiskamp) in orde", voor: 200 },
      { t: "Prospectie plannen (indien nieuwe bestemming)", voor: 150 }
    ]},
    { phase: "Erkenning & kampadministratie", steps: [
      // Moet klaar zijn vóór het infomoment: ouders krijgen ze daar te zien.
      { t: "Technische fiche opstellen/actualiseren", voor: 220 },
      { t: "Toelatingssjabloon buitenland actualiseren (namen begeleiders)", voor: 120 },
      { t: "Verzekering nakijken (niet-Bleau-leden)", voor: 90 }
    ]},
    { phase: "Werving & inschrijvingen", steps: [
      { t: "Infomoment plannen", voor: 215 },
      // De aankondiging van 2026 zette de inschrijvingen open op 1 januari.
      { t: "Inschrijvingsmodule openzetten", voor: 200 },
      { t: "Inschrijvingen opvolgen (aantal deelnemers)", voor: 120 }
    ]},
    { phase: "Deelnemers- & vrijwilligersadministratie", steps: [
      { t: "Medische fiches verzamelen + doorsturen naar hoofdvrijwilliger", voor: 60 },
      // Ouders moeten hiermee fysiek naar het gemeentehuis: ruim op tijd sturen.
      { t: "Toelatingsformulieren naar ouders + legalisatie opvolgen", voor: 90 },
      { t: "Vrijwilligerscontracten opmaken en versturen", voor: 60 },
      { t: "Tentverdeling maken", voor: 21 }
    ]},
    { phase: "Logistiek & materiaal", steps: [
      { t: "Boodschappenlijst eerste dagen", voor: 14 },
      // Bewust ruim vóór de vertrekochtend, precies de aanbeveling uit Fundament.md.
      { t: "Paklijst materiaal klimzaal controleren (container)", voor: 21 },
      { t: "Busjes reserveren bij de klimzaal", voor: 45 }
    ]},
    { phase: "Planning & veiligheid", steps: [
      { t: "Planning/draaiboek invullen", voor: 30 },
      { t: "Noodprotocol + achterwachtpersoon vastleggen", voor: 30 },
      { t: "Noodnummer pechbijstand auto's", voor: 14 },
      { t: "Noodnummer ter plekke (lokale hulpdiensten)", voor: 14 },
      { t: "Noodnummer klimzaal", voor: 14 }
    ]},
    { phase: "Vlak voor vertrek", steps: [
      { t: "Alle medische fiches binnen en gecontroleerd", voor: 7 },
      { t: "Alle toelatingsformulieren gelegaliseerd binnen", voor: 7 },
      { t: "Materiaal/busje opgehaald (checklist afgetekend met klimzaal)", voor: 1 }
    ]},
    { phase: "Na het kamp", steps: [
      { t: "Evaluatie met de begeleiders", na: 14 },
      { t: "Routedatabank aanvullen met ervaringen", na: 21 },
      { t: "Financieel overzicht afronden", na: 30 }
    ]}
  ];

  /* Versiegeschiedenis van de tool zelf — nieuwste bovenaan. Vul hier een
     nieuwe regel bij zodra er iets wijzigt, en pas VERSION mee aan. */
  var VERSION = "2.3";
  var CHANGELOG = [
    { version: "2.3", date: "2026-09-24", changes: [
      "Nieuwe knop \"Noodkaart\" op elke kampkaart: één A4 met noodnummers van het land, verblijfplaatsen, gsm's van de begeleiders, klimzaal en verzekering",
      "Per kamp een lijst verblijfplaatsen (hutten, camping), die ook in de terugblik terugkomt",
      "Nieuwe knop \"Terugblik\": route per dag, hutten, groep en werkpunten na het kamp, met export naar de routedatabank",
      "Wie een kamp archiveert zonder terugblik, krijgt de vraag om die meteen in te vullen",
      "Bij dupliceren gaan het contact van de klimzaal en de verzekering mee naar het nieuwe kamp"
    ]},
    { version: "2.2", date: "2026-09-20", changes: [
      "Een nieuw kamp krijgt meteen een volledige planning: elke stap krijgt een streefdatum, gerekend vanaf de vertrekdatum",
      "Knop \"Datums invullen\" voor bestaande kampen, die enkel de lege datums aanvult",
      "Daardoor werken het paneel met dringende stappen en de herinneringsmails nu vanzelf"
    ]},
    { version: "2.1", date: "2026-09-20", changes: [
      "Knop \"Routedatabank\" op elke kampkaart, die de gedeelde map in Drive opent",
      "De voorstellingspagina heeft nu een fotogedeelte en een afdrukbare versie"
    ]},
    { version: "2.0", date: "2026-09-20", changes: [
      "Je kan nu zelf een stap toevoegen aan een kamp, per fase, en een stap weer verwijderen",
      "Knop \"Dupliceren\": maak een nieuw kamp op basis van een bestaand of gearchiveerd kamp, mét dezelfde stappenlijst",
      "De pagina's vragen zoekmachines om de site niet op te nemen; ze blijft enkel bereikbaar via de link"
    ]},
    { version: "1.9", date: "2026-09-20", changes: [
      "Bij \"Wie?\" op een taak verschijnen nu enkel de begeleiders van dát kamp, niet langer een vaste namenlijst",
      "Wie niet meer meegaat, verdwijnt dus vanzelf uit de suggesties"
    ]},
    { version: "1.8", date: "2026-09-17", changes: [
      "Je hoeft enkel nog de toegangscode in te vullen — de link naar de gedeelde Sheet zit nu in de site zelf",
      "Bij een nieuwe deployment hoeft niemand meer iets aan te passen in zijn browser",
      "Een oude, opgeslagen link in je browser wordt automatisch opgeruimd"
    ]},
    { version: "1.7", date: "2026-09-14", changes: [
      "Knop \"Verbinding testen\": controleert of de link werkt, of de code klopt, en waarschuwt als een link ook zonder code gegevens vrijgeeft",
      "\"Verbinding wijzigen\" staat nu bovenaan het versiepaneel in plaats van onderaan"
    ]},
    { version: "1.6", date: "2026-09-14", changes: [
      "Verbinding (link + toegangscode) is nu achteraf te wijzigen, via het versienummer linksboven",
      "Bedragen mogen met een komma ingetypt worden (250,50)",
      "Datums worden getoond als 01/08/2027 in plaats van 2027-08-01",
      "Wijzigen, afvinken en verwijderen worden stil opnieuw geprobeerd als de verbinding even hapert"
    ]},
    { version: "1.5", date: "2026-09-14", changes: [
      "Werkt nu echt op een smartphone: de pagina past zich aan de schermbreedte aan",
      "Grotere vinkjes en knoppen om met de vinger te bedienen",
      "Invoervelden zoomen niet meer ongewild in op iPhone",
      "Financieel overzicht: kampnaam blijft staan bij zijwaarts scrollen"
    ]},
    { version: "1.4", date: "2026-09-14", changes: [
      "Tegels om tussen de pagina's te navigeren, op elke pagina",
      "Paneel met dringende stappen over alle actieve kampen heen",
      "Nieuwe pagina: financieel overzicht per editie",
      "Budget-knop op de kampkaart springt naar dat ene kamp",
      "Klimzaal: datum aanvraag ingediend en datum akkoord",
      "Begeleiders met e-mailadres, en een automatische herinnering 3 dagen na een gemiste streefdatum"
    ]},
    { version: "1.3", date: "2026-09-14", changes: [
      "Site live op GitHub Pages, te delen met de andere begeleiders",
      "Toegangscode: zonder die code geeft de backend geen gegevens vrij",
      "Sneller en stabieler verbinden (cache + automatisch opnieuw proberen)"
    ]},
    { version: "1.2", date: "2026-09-14", changes: [
      "Camping en notities per kamp",
      "Afdrukbare fiche per kamp"
    ]},
    { version: "1.1", date: "2026-09-12", changes: [
      "Budget per kamp: inkomsten, uitgaven en kasticketfoto's"
    ]},
    { version: "1.0", date: "2026-09-11", changes: [
      "Eerste versie: kampen aanmaken, checklist van 9 fases, archief"
    ]}
  ];

  /** Zet het versienummer linksboven in de .eyebrow van de pagina; klikken
   *  opent de geschiedenis. Wordt automatisch opgeroepen door
   *  createPageRuntime, zodat elke pagina dit zonder eigen code krijgt. */
  function renderVersionBadge() {
    var eyebrow = document.querySelector(".eyebrow");
    if (!eyebrow || eyebrow.querySelector(".version-wrap")) return;
    var wrap = document.createElement("span");
    wrap.className = "version-wrap";
    wrap.innerHTML =
      '<button type="button" class="version-badge" aria-expanded="false" title="Versiegeschiedenis">v' + VERSION + '</button>' +
      '<div class="version-panel" hidden>' +
        '<div class="version-head"><button type="button" class="version-link" id="kv-open-cfg">Verbinding wijzigen…</button></div>' +
        CHANGELOG.map(function (e) {
          return '<div class="version-entry">' +
            '<h4>v' + escapeHtml(e.version) + ' <span>' + escapeHtml(e.date) + '</span></h4>' +
            '<ul>' + e.changes.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join("") + '</ul>' +
          '</div>';
        }).join("") +
      '</div>';
    eyebrow.appendChild(wrap);

    wrap.querySelector("#kv-open-cfg").addEventListener("click", openConnectionDialog);
    var btn = wrap.querySelector(".version-badge");
    var panel = wrap.querySelector(".version-panel");
    btn.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      btn.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    });
  }

  var TYPE_LABELS = { "-18": "-18-kamp", "+18": "+18-kamp", "winter": "Winterkamp" };
  var EXPENSE_CATEGORIES = ["Boodschappen", "Restaurant", "Vervoer", "Verblijf", "Materiaal", "Andere"];

  /* De gedeelde map in Drive waar de routedatabank staat. Voorlopig wijst elk
     kamp naar de hoofdmap: de submappen per land hebben hun eigen Drive-link
     en die kennen we nog niet. Zet zo'n link hieronder bij het juiste land en
     de knop springt er meteen rechtstreeks naartoe — er hoeft verder niets te
     veranderen. Je vindt hem via rechtermuisknop op de map -> Link kopieren. */
  var ROUTEDATABANK_MAP = "https://drive.google.com/drive/folders/1zXCf4p8mV78XDBiR2hVZTLlzB-pAEpsx";
  var ROUTEDATABANK_LANDEN = {
    frankrijk: "", duitsland: "", italie: "", oostenrijk: "", slovenie: "", spanje: ""
  };
  var LANDLABELS = {
    frankrijk: "Frankrijk", duitsland: "Duitsland", italie: "Italië",
    oostenrijk: "Oostenrijk", slovenie: "Slovenië", spanje: "Spanje"
  };
  var SETUP_NEEDED = !CONFIG.API_URL || !CONFIG.ACCESS_KEY || CONFIG.API_URL.indexOf("PASTE_") === 0;
  var DRAFT_KEY = "kampvoorbereiding:new-camp-draft:v1";

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cssEscape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  /** Klein-letters zonder accenten, zodat "Italië" en "Italie" allebei herkend
   *  worden in een vrij ingetypte bestemming. */
  function zonderAccenten(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/[àáâãä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
      .replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u").replace(/ç/g, "c");
  }

  /** Zoekt het land in de vrij ingetypte bestemming van een kamp.
   *  Geeft null wanneer er geen land in staat (bv. enkel een streeknaam). */
  function landVanBestemming(destination) {
    var tekst = zonderAccenten(destination);
    for (var sleutel in ROUTEDATABANK_LANDEN) {
      if (Object.prototype.hasOwnProperty.call(ROUTEDATABANK_LANDEN, sleutel) &&
          tekst.indexOf(sleutel) !== -1) return sleutel;
    }
    return null;
  }

  /** De link achter de knop "Routedatabank" op een kampkaart, plus de tekst die
   *  als tooltip verschijnt. Zolang er geen link per land ingevuld is, gaat de
   *  knop naar de hoofdmap en zegt de tooltip welke submap je zoekt. */
  function routedatabankKnop(camp) {
    var land = landVanBestemming(camp && camp.destination);
    var directeLink = land ? ROUTEDATABANK_LANDEN[land] : "";
    if (directeLink) {
      return { href: directeLink, titel: "Opent de routedatabank voor " + LANDLABELS[land] };
    }
    return {
      href: ROUTEDATABANK_MAP,
      titel: land
        ? "Opent de gedeelde map — zoek daarin Routedatabank, landen, " + LANDLABELS[land]
        : "Opent de gedeelde map met de routedatabank. Zet het land bij de bestemming om rechtstreeks bij het juiste land uit te komen."
    };
  }

  /* ---------------- Noodkaart: vaste noodnummers per land ----------------
     Enkel de ALGEMENE nummers, die voor het hele land gelden. Lokale nummers
     (bergredding van de vallei, ziekenhuis) vul je per kamp in op de noodkaart.

     Deze lijst moet één keer door een begeleider nagekeken worden, bv. tegen
     het reisadvies van FOD Buitenlandse Zaken (diplomatie.belgium.be) of de
     bron die per land vermeld staat. Vul daarna NOODNUMMERS_NAGEKEKEN in: tot
     dan toont de noodkaart dat de nummers nog niet gecontroleerd zijn. Een fout
     nummer op een noodkaart is erger dan geen nummer. */
  var NOODNUMMERS_NAGEKEKEN = { datum: "2026-09-24", door: "" }; // bij een volgende controle: datum aanpassen, naam mag erbij
  var NOODNUMMERS = {
    frankrijk: { label: "Frankrijk", bron: "service-public.fr", nummers: [
      { nr: "112", wat: "Europees noodnummer, ook voor bergredding (PGHM / CRS)" },
      { nr: "15", wat: "SAMU, medische spoed" }
    ]},
    italie: { label: "Italië", bron: "cnsas.it (Soccorso Alpino)", nummers: [
      { nr: "112", wat: "Europees noodnummer" },
      { nr: "118", wat: "Medische spoed en bergredding (CNSAS)" }
    ]},
    oostenrijk: { label: "Oostenrijk", bron: "bergrettung.at", nummers: [
      { nr: "112", wat: "Europees noodnummer" },
      { nr: "140", wat: "Alpiene noodoproep, bergredding" },
      { nr: "144", wat: "Ambulance" }
    ]},
    duitsland: { label: "Duitsland", bron: "bergwacht.de", nummers: [
      { nr: "112", wat: "Europees noodnummer, ook voor ambulance en Bergwacht" },
      { nr: "110", wat: "Politie" }
    ]},
    slovenie: { label: "Slovenië", bron: "grzs.si (Gorska reševalna zveza)", nummers: [
      { nr: "112", wat: "Europees noodnummer, ook voor bergredding" },
      { nr: "113", wat: "Politie" }
    ]},
    spanje: { label: "Spanje", bron: "guardiacivil.es", nummers: [
      { nr: "112", wat: "Europees noodnummer, ook voor bergredding" },
      { nr: "062", wat: "Guardia Civil (bergredding GREIM)" }
    ]},
    zwitserland: { label: "Zwitserland", bron: "rega.ch", nummers: [
      { nr: "112", wat: "Europees noodnummer, wordt doorgeschakeld" },
      { nr: "144", wat: "Ambulance en bergredding" },
      { nr: "1414", wat: "Rega, luchtredding" }
    ]}
  };

  /** Zoekt het land voor de noodkaart in de vrij ingetypte bestemming. Kent
   *  ook Zwitserland, dat (nog) geen map heeft in de routedatabank. */
  function landVoorNoodkaart(destination) {
    var tekst = zonderAccenten(destination);
    for (var sleutel in NOODNUMMERS) {
      if (Object.prototype.hasOwnProperty.call(NOODNUMMERS, sleutel) &&
          tekst.indexOf(sleutel) !== -1) return sleutel;
    }
    return "";
  }

  /* ---------------- Verblijfplaatsen, noodkaart en terugblik ----------------
     Drie kolommen in de Sheet die elk één JSON-tekst bevatten. Onderstaande
     functies zetten die om naar een object met álle velden aanwezig, zodat een
     pagina nooit hoeft na te gaan of iets bestaat. Een lege of beschadigde cel
     geeft gewoon de lege vorm terug. */
  var API_VERSIE_NODIG = 3; // zie API_VERSION in apps-script.gs

  function leesJson(v) {
    if (v && typeof v === "object") return v;
    if (!v) return null;
    try { return JSON.parse(String(v)); } catch (e) { return null; }
  }
  function tekst(v) { return v == null ? "" : String(v); }

  var VERBLIJF_TYPES = { hut: "Hut", camping: "Camping", andere: "Andere" };

  function normVerblijf(s) {
    s = s || {};
    return {
      naam: tekst(s.naam), type: VERBLIJF_TYPES[s.type] ? s.type : "hut",
      datum: normalizeDateStr(s.datum), nachten: Math.max(1, parseInt(s.nachten, 10) || 1),
      telefoon: tekst(s.telefoon), coords: tekst(s.coords)
    };
  }
  function normVerblijven(v) {
    var lijst = leesJson(v);
    return Array.isArray(lijst) ? lijst.map(normVerblijf) : [];
  }

  function normContact(c) { c = c || {}; return { naam: tekst(c.naam), telefoon: tekst(c.telefoon) }; }

  function normNoodinfo(v) {
    var e = leesJson(v) || {};
    var gsms = {};
    if (e.gsms && typeof e.gsms === "object") {
      Object.keys(e.gsms).forEach(function (k) { gsms[k] = tekst(e.gsms[k]); });
    }
    var zh = e.ziekenhuis || {}, vz = e.verzekering || {};
    return {
      land: NOODNUMMERS[e.land] ? e.land : "",
      bergredding: normContact(e.bergredding),
      ziekenhuis: { naam: tekst(zh.naam), telefoon: tekst(zh.telefoon), adres: tekst(zh.adres) },
      gsms: gsms,
      achterwacht: normContact(e.achterwacht),
      klimzaal: normContact(e.klimzaal),
      verzekering: { naam: tekst(vz.naam), polis: tekst(vz.polis), telefoon: tekst(vz.telefoon) },
      medischeFiches: tekst(e.medischeFiches)
    };
  }

  /** Wat een gedupliceerd kamp meekrijgt van de noodkaart: enkel wat van jaar
   *  tot jaar hetzelfde blijft. Nummers ter plaatse, gsm's en de plaats van de
   *  medische fiches horen bij dat ene kamp. */
  function noodinfoVoorDuplicaat(bron) {
    var n = normNoodinfo(bron);
    var leeg = normNoodinfo(null);
    leeg.klimzaal = n.klimzaal;
    leeg.verzekering = n.verzekering;
    return leeg;
  }

  var GESCHIKT_VOOR = { "-18": "-18-kamp", "+18": "+18-kamp", "winter": "Winterkamp" };
  var TERUGKEREN = { ja: "Ja", twijfel: "Misschien", nee: "Nee" };

  function normDag(d) {
    d = d || {};
    return { van: tekst(d.van), naar: tekst(d.naar), km: tekst(d.km), stijgen: tekst(d.stijgen),
             dalen: tekst(d.dalen), uren: tekst(d.uren), afwijking: tekst(d.afwijking) };
  }
  function normPlek(p) {
    p = p || {};
    return { naam: tekst(p.naam), type: VERBLIJF_TYPES[p.type] ? p.type : "hut", contact: tekst(p.contact),
             ervaring: tekst(p.ervaring), terug: TERUGKEREN[p.terug] ? p.terug : "" };
  }

  /** Geeft null zolang er nooit een terugblik opgeslagen werd. */
  function normTerugblik(v) {
    var r = leesJson(v);
    if (!r || typeof r !== "object") return null;
    var g = r.groep || {}, w = r.werkpunten || {};
    return {
      bijgewerkt: normalizeDateStr(r.bijgewerkt), door: tekst(r.door),
      dagen: Array.isArray(r.dagen) ? r.dagen.map(normDag) : [],
      plekken: Array.isArray(r.plekken) ? r.plekken.map(normPlek) : [],
      groep: {
        deelnemers: tekst(g.deelnemers), begeleiders: tekst(g.begeleiders), niveau: tekst(g.niveau),
        geschiktVoor: Array.isArray(g.geschiktVoor) ? g.geschiktVoor.filter(function (x) { return GESCHIKT_VOOR[x]; }) : []
      },
      werkpunten: { goed: tekst(w.goed), beter: tekst(w.beter), logistiek: tekst(w.logistiek), tips: tekst(w.tips) }
    };
  }

  function heeftTerugblik(camp) { return !!(camp && camp.review && camp.review.bijgewerkt); }

  /** Een eerste terugblik, vooraf ingevuld met wat er al bekend is: de
   *  verblijfplaatsen, en bij een huttentocht de dagen die daartussen liggen
   *  (dag 1 naar de eerste hut, dan van hut naar hut, de laatste dag terug). */
  function nieuweTerugblik(camp) {
    var verblijven = (camp && camp.stays) || [];
    var hutten = verblijven.filter(function (s) { return s.type === "hut" && s.naam; })
      .slice().sort(function (a, b) { return (a.datum || "9999") < (b.datum || "9999") ? -1 : 1; });
    var dagen = hutten.length
      ? hutten.map(function (h, i) { return normDag({ van: i ? hutten[i - 1].naam : "", naar: h.naam }); })
          .concat([normDag({ van: hutten[hutten.length - 1].naam })])
      : [normDag()];
    var aantalBegeleiders = guideNames(camp && camp.guides).length;
    return {
      bijgewerkt: "", door: "",
      dagen: dagen,
      plekken: verblijven.filter(function (s) { return s.naam; }).map(function (s) {
        return normPlek({ naam: s.naam, type: s.type, contact: s.telefoon });
      }),
      groep: { deelnemers: "", begeleiders: aantalBegeleiders ? String(aantalBegeleiders) : "", niveau: "", geschiktVoor: camp && GESCHIKT_VOOR[camp.type] ? [camp.type] : [] },
      werkpunten: { goed: "", beter: "", logistiek: "", tips: "" }
    };
  }

  /** Verblijfplaatsen die later bij het kamp kwamen dan de terugblik, komen er
   *  alsnog bij — zonder iets te wissen wat al ingevuld was. */
  function vulPlekkenAan(review, verblijven) {
    var bekend = {};
    review.plekken.forEach(function (p) { bekend[p.naam.trim().toLowerCase()] = true; });
    (verblijven || []).forEach(function (s) {
      var sleutel = s.naam.trim().toLowerCase();
      if (!sleutel || bekend[sleutel]) return;
      review.plekken.push(normPlek({ naam: s.naam, type: s.type, contact: s.telefoon }));
      bekend[sleutel] = true;
    });
    return review;
  }

  /* ---------------- Export naar de routedatabank ---------------- */

  var NOG_AAN_TE_VULLEN = "*(nog aan te vullen)*";

  /** Maakt een bestandsnaam zoals die in de routedatabank: 2026-nevache.md.
   *  De landnaam valt weg, want het bestand staat al in de map van dat land. */
  function databankBestandsnaam(camp) {
    var jaar = (normalizeDateStr(camp.startDate) || todayStr()).slice(0, 4);
    var bron = zonderAccenten(camp.destination || camp.name || "kamp");
    Object.keys(NOODNUMMERS).forEach(function (land) { bron = bron.split(land).join(" "); });
    var slug = bron.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
    if (!slug) slug = zonderAccenten(camp.name || "kamp").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kamp";
    return jaar + "-" + slug + ".md";
  }

  /** De terugblik als Markdown, in dezelfde opbouw als de bestaande fiches in
   *  de routedatabank (zie landen/frankrijk/2026-nevache-claree.md). Lege
   *  velden worden "(nog aan te vullen)", zoals elders in de databank. */
  function terugblikNaarMarkdown(camp, review) {
    var r = review || nieuweTerugblik(camp);
    function of(v) { v = tekst(v).trim(); return v || NOG_AAN_TE_VULLEN; }
    function cel(v) { return tekst(v).trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " "); }
    function blok(v) { v = tekst(v).trim(); return v ? v : NOG_AAN_TE_VULLEN; }

    var jaar = (normalizeDateStr(camp.startDate) || "").slice(0, 4);
    var land = NOODNUMMERS[(camp.emergency && camp.emergency.land) || landVoorNoodkaart(camp.destination)];
    var periode = camp.startDate ? formatDateNL(camp.startDate) + (camp.endDate ? " t.e.m. " + formatDateNL(camp.endDate) : "") : "";
    var geschikt = r.groep.geschiktVoor.map(function (k) { return GESCHIKT_VOOR[k]; }).join(", ");
    var groep = [];
    if (tekst(r.groep.deelnemers).trim()) groep.push(r.groep.deelnemers.trim() + " deelnemers");
    if (tekst(r.groep.begeleiders).trim()) groep.push(r.groep.begeleiders.trim() + " begeleiders");

    var uit = [];
    uit.push("# " + (camp.destination || camp.name) + (jaar ? " (" + jaar + ")" : ""));
    uit.push("");
    // "Frankrijk — Névache" bevat het land al; enkel toevoegen als het ontbreekt.
    var landErvoor = land && zonderAccenten(camp.destination).indexOf(zonderAccenten(land.label)) === -1 ? land.label + " — " : "";
    uit.push("- **Land/regio:** " + landErvoor + of(camp.destination));
    uit.push("- **Laatst gebruikt (jaar):** " + (jaar || NOG_AAN_TE_VULLEN) + (periode ? " — " + periode : ""));
    uit.push("- **Kamp:** " + camp.name + " (" + typeLabel(camp) + ")");
    uit.push("- **Geschikt voor:** " + of(geschikt));
    uit.push("- **Groep:** " + of(groep.join(", ")));
    uit.push("");
    uit.push("Bron: terugblik in de kampvoorbereiding" +
      (r.door ? ", ingevuld door " + r.door : "") +
      (r.bijgewerkt ? ", bijgewerkt op " + formatDateNL(r.bijgewerkt) : "") + ".");
    uit.push("");

    uit.push("## Niveau van de groep");
    uit.push("");
    uit.push(blok(r.groep.niveau));
    uit.push("");

    var dagen = r.dagen.filter(function (d) {
      return d.van || d.naar || d.km || d.stijgen || d.dalen || d.uren || d.afwijking;
    });
    uit.push("## Overzicht van de dagen");
    uit.push("");
    if (!dagen.length) {
      uit.push(NOG_AAN_TE_VULLEN);
    } else {
      uit.push("| Dag | Van → naar | Afstand | Hoogteverschil | Stapuren |");
      uit.push("|---|---|---|---|---|");
      dagen.forEach(function (d, i) {
        var hoogte = (d.stijgen || d.dalen)
          ? "+" + cel(d.stijgen || "?").replace(/^\+/, "") + " / -" + cel(d.dalen || "?").replace(/^-/, "") + " m"
          : "";
        uit.push("| " + (i + 1) + " | " + (cel(d.van) || "?") + " → " + (d.naar ? "**" + cel(d.naar) + "**" : "?") +
          " | " + (d.km ? cel(d.km) + " km" : "") + " | " + hoogte + " | " + (d.uren ? "± " + cel(d.uren) + " u" : "") + " |");
      });
      var afwijkingen = [];
      dagen.forEach(function (d, i) { if (d.afwijking.trim()) afwijkingen.push("- **Dag " + (i + 1) + ":** " + d.afwijking.trim().replace(/\n/g, " ")); });
      if (afwijkingen.length) {
        uit.push("");
        uit.push("Afwijkingen van de planning:");
        uit.push("");
        uit = uit.concat(afwijkingen);
      }
    }
    uit.push("");

    var verblijven = camp.stays || [];
    function verblijfVan(naam) {
      var sleutel = naam.trim().toLowerCase();
      return verblijven.filter(function (s) { return s.naam.trim().toLowerCase() === sleutel; })[0] || null;
    }
    var plekken = r.plekken.filter(function (p) { return p.naam.trim(); });
    uit.push("## Verblijfplaatsen");
    uit.push("");
    if (!plekken.length) {
      uit.push(NOG_AAN_TE_VULLEN);
      uit.push("");
    }
    plekken.forEach(function (p) {
      var s = verblijfVan(p.naam);
      uit.push("### " + p.naam.trim() + " (" + VERBLIJF_TYPES[p.type].toLowerCase() + ")");
      uit.push("");
      if (s && s.datum) uit.push("- **Nacht(en):** vanaf " + formatDateNL(s.datum) + ", " + s.nachten + (s.nachten === 1 ? " nacht" : " nachten"));
      uit.push("- **Boekingscontact:** " + of(p.contact));
      if (s && s.telefoon && s.telefoon !== p.contact) uit.push("- **Telefoon:** " + s.telefoon);
      if (s && s.coords) uit.push("- **Coördinaten:** " + s.coords);
      uit.push("- **Zouden we terugkeren?** " + (TERUGKEREN[p.terug] || NOG_AAN_TE_VULLEN));
      uit.push("");
      uit.push("**Ervaring / aandachtspunten**");
      uit.push("");
      uit.push(blok(p.ervaring));
      uit.push("");
    });

    uit.push("## Werkpunten & logistiek");
    uit.push("");
    [["Wat ging goed", r.werkpunten.goed], ["Wat kan beter", r.werkpunten.beter],
     ["Bus, container en klimzaal", r.werkpunten.logistiek], ["Tips voor de volgende keer", r.werkpunten.tips]
    ].forEach(function (paar) {
      uit.push("### " + paar[0]);
      uit.push("");
      uit.push(blok(paar[1]));
      uit.push("");
    });

    return uit.join("\n").replace(/\n+$/, "") + "\n";
  }

  /** Laat de browser een tekstbestand downloaden. */
  function downloadTekst(bestandsnaam, inhoud, mime) {
    var blob = new Blob([inhoud], { type: (mime || "text/markdown") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = bestandsnaam;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

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

  /** Toont een jjjj-mm-dd-datum als dd/mm/jjjj. Enkel voor weergave — opgeslagen
   *  blijft het jjjj-mm-dd, want daarop wordt gesorteerd en vergeleken. */
  function formatDateNL(v) {
    var s = normalizeDateStr(v);
    if (!s) return "";
    var p = s.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
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

  /** Begeleiders staan in één veld als "Naam <e-mail>, Naam2 <e-mail2>" —
   *  leesbaar in de Sheet zelf, en een naam zonder e-mailadres (zoals in de
   *  oudere kampen, die enkel "Jochen, Wout" bevatten) blijft gewoon geldig. */
  function parseGuides(guidesStr) {
    return String(guidesStr || "").split(",").map(function (part) {
      var m = part.match(/^\s*(.*?)\s*<([^>]*)>\s*$/);
      if (m) return { name: m[1].trim(), email: m[2].trim() };
      return { name: part.trim(), email: "" };
    }).filter(function (g) { return g.name || g.email; });
  }

  function formatGuides(list) {
    return (list || []).filter(function (g) { return (g.name || "").trim(); })
      .map(function (g) {
        var name = g.name.trim();
        var email = (g.email || "").trim();
        return email ? name + " <" + email + ">" : name;
      }).join(", ");
  }

  function guideNames(guidesStr) {
    return parseGuides(guidesStr).map(function (g) { return g.name; }).filter(Boolean);
  }

  /** De namen die als suggestie verschijnen bij het "Wie?"-veld van een taak:
   *  enkel de begeleiders van dát kamp. Bewust geen vaste lijst en geen namen
   *  uit andere kampen — anders blijven mensen die al jaren niet meer meegaan
   *  eeuwig opduiken, en krijg je bij elk kamp suggesties van wie er niet bij is. */
  function begeleiderOptions(camp) {
    return guideNames(camp && camp.guides).sort(function (a, b) { return a.localeCompare(b); });
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
        '<div style="margin-bottom:10px">Deze pagina is nog niet gekoppeld aan de gedeelde Google Sheet. Je hebt daarvoor enkel de <strong>toegangscode</strong> nodig — vraag die na bij een medebegeleider. Dit hoeft maar één keer per toestel/browser.</div>' +
        '<button type="button" class="btn primary" id="kv-setup-open">Toegangscode invullen…</button>' +
      '</div>';
    document.getElementById("kv-setup-open").addEventListener("click", openConnectionDialog);
  }

  /** Werkt de verbindingsindicator (#conn-dot/#conn-text) en #banner-slot bij.
   *  `state` is "setup", "connecting", "error" of "ok". */
  function renderConnStatus(state, errorMsg) {
    var dot = document.getElementById("conn-dot");
    var text = document.getElementById("conn-text");
    var slot = document.getElementById("banner-slot");
    if (!dot || !text || !slot) return;
    if (state === "setup") {
      dot.className = "dot bad"; text.textContent = "Nog niet ingesteld";
      renderSetupBanner("banner-slot");
    } else if (state === "connecting") {
      dot.className = "dot"; text.textContent = "Verbinden…"; slot.innerHTML = "";
    } else if (state === "error") {
      dot.className = "dot bad"; text.textContent = "Kan niet verbinden";
      slot.innerHTML = '<div class="banner bad">Kon de gedeelde Sheet niet bereiken (' + escapeHtml(errorMsg) + '). Controleer je internetverbinding en of de Web-app-link nog klopt. De pagina blijft het opnieuw proberen.</div>';
    } else {
      dot.className = "dot ok"; text.textContent = "Verbonden — ververst elke " + Math.round(CONFIG.POLL_MS / 1000) + "s"; slot.innerHTML = "";
    }
  }

  /** Gedeelde motor achter elke pagina: ophalen, verbindingsstatus tonen,
   *  periodiek verversen, en verversen pauzeren zolang iemand in een invoerveld
   *  bezig is (anders verdwijnt wat je aan het typen bent onder je vingers).
   *  Elke pagina geeft enkel mee wat ze zelf met de data doet:
   *    onData(data) — data bewaren in de eigen variabelen
   *    render()     — de eigen pagina-onderdelen tekenen
   *  Terug krijg je { start, refresh, render, state }. */
  function createPageRuntime(opts) {
    var connState = "connecting", lastError = "", pollTimer = null;
    var suspended = false, pending = false;

    renderVersionBadge();

    function renderAll() {
      if (suspended) { pending = true; return; }
      renderConnStatus(SETUP_NEEDED ? "setup" : connState, lastError);
      opts.render();
    }

    function refresh() {
      if (SETUP_NEEDED) { renderAll(); return Promise.resolve(); }
      return fetchAll().then(function (data) {
        connState = "ok"; lastError = "";
        opts.onData(data);
        renderAll();
      }).catch(function (err) {
        connState = "error"; lastError = err && err.message ? err.message : String(err);
        renderAll();
      });
    }

    function start() {
      renderAll();
      if (SETUP_NEEDED) return;
      refresh().then(function () {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(function () { if (suspended) pending = true; else refresh(); }, CONFIG.POLL_MS);
      });
    }

    document.addEventListener("focusin", function (e) {
      if (e.target.matches && e.target.matches("input, select, textarea")) suspended = true;
    });
    document.addEventListener("focusout", function (e) {
      if (e.target.matches && e.target.matches("input, select, textarea")) {
        suspended = false;
        if (pending) { pending = false; refresh(); }
      }
    });
    var refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { refresh(); });

    return {
      start: start,
      refresh: refresh,
      render: renderAll,
      state: function () { return connState; }
    };
  }

  function typeLabel(camp) {
    return camp.type === "custom" ? (camp.customLabel || "Eigen type") : (TYPE_LABELS[camp.type] || camp.type);
  }

  function stepsForCamp(steps, campId) {
    return steps.filter(function (s) { return s.campId === campId; });
  }

  /** Telt dagen op bij een jjjj-mm-dd-datum en geeft weer jjjj-mm-dd terug.
   *  Rekent in UTC, zodat een zomeruur-overgang geen dag verschuift. */
  function shiftDate(dateStr, days) {
    var clean = normalizeDateStr(dateStr);
    if (!clean) return "";
    var p = clean.split("-");
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    d.setUTCDate(d.getUTCDate() + days);
    return d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0");
  }

  /** De streefdatum van één standaardstap voor een concreet kamp.
   *  "voor" rekent terug vanaf de vertrekdatum, "na" telt verder vanaf de
   *  terugkeerdatum (of vanaf het vertrek als die niet ingevuld is).
   *  Zonder vertrekdatum blijft de streefdatum leeg — zoals vroeger. */
  function defaultStepDate(step, camp) {
    if (!camp || !camp.startDate) return "";
    if (typeof step.voor === "number") return shiftDate(camp.startDate, -step.voor);
    if (typeof step.na === "number") return shiftDate(camp.endDate || camp.startDate, step.na);
    return "";
  }

  /** De standaardchecklist, klaar om te versturen. Geef `camp` mee en elke stap
   *  krijgt meteen een streefdatum; laat je hem weg, dan blijven die leeg. */
  function buildDefaultSteps(camp) {
    var flat = [], order = 0;
    DEFAULT_CHECKLIST.forEach(function (group) {
      group.steps.forEach(function (step) {
        flat.push({
          phase: group.phase,
          title: step.t,
          order: order++,
          targetDate: defaultStepDate(step, camp)
        });
      });
    });
    return flat;
  }

  /** Zoekt voor een BESTAAND kamp welke stappen nog geen streefdatum hebben en
   *  wél in de standaardchecklist voorkomen, en berekent die datum alsnog.
   *  Bestaande datums worden nooit overschreven — wie zelf iets invulde, houdt
   *  dat. Geeft een lijst {id, targetDate} terug, leeg als er niets te doen is. */
  function missingStepDates(camp, campSteps) {
    if (!camp || !camp.startDate) return [];
    var uit = [];
    (campSteps || []).forEach(function (s) {
      if (s.targetDate) return;                     // al ingevuld: afblijven
      var datum = targetDateForTitle(s.title, camp); // "" bij een zelf toegevoegde stap
      if (datum) uit.push({ id: s.id, targetDate: datum });
    });
    return uit;
  }

  /* Titel -> standaardstap, één keer opgebouwd. Wordt gebruikt om een datum te
     vinden voor een stap die al bestaat (bij "Datums invullen" en bij het
     dupliceren van een kamp). */
  var STAP_PER_TITEL = (function () {
    var m = {};
    DEFAULT_CHECKLIST.forEach(function (group) {
      group.steps.forEach(function (step) { m[step.t] = step; });
    });
    return m;
  })();

  /** De streefdatum die bij deze staptitel hoort voor dit kamp, of "" wanneer
   *  de titel niet in de standaardchecklist staat of het kamp geen vertrekdatum
   *  heeft. */
  function targetDateForTitle(title, camp) {
    var sjabloon = STAP_PER_TITEL[title];
    return sjabloon ? defaultStepDate(sjabloon, camp) : "";
  }

  /* ---------------- API laag (Google Apps Script) ---------------- */

  /** Apps Script's /exec-link geeft af en toe kortstondig een HTML-pagina
   *  terug in plaats van JSON (een gekende eigenaardigheid van het redirect-
   *  mechanisme achter elke Apps Script-webapp, geen fout in deze code) —
   *  bij een lees-aanvraag is opnieuw proberen altijd veilig (in tegenstelling
   *  tot een schrijf-aanvraag), dus vang dit hier op vóór de gebruiker een
   *  foutmelding te zien krijgt. */
  function fetchJsonWithRetry_(url, opts, attempt) {
    attempt = attempt || 1;
    return fetch(url, opts).then(function (r) { return r.text(); }).then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        if (attempt < 3) {
          return new Promise(function (resolve) { setTimeout(resolve, attempt * 400); })
            .then(function () { return fetchJsonWithRetry_(url, opts, attempt + 1); });
        }
        throw new Error("Kreeg geen geldig antwoord van de API na " + attempt + " pogingen.");
      }
    });
  }

  function apiGet() {
    var sep = CONFIG.API_URL.indexOf("?") === -1 ? "?" : "&";
    return fetchJsonWithRetry_(CONFIG.API_URL + sep + "key=" + encodeURIComponent(CONFIG.ACCESS_KEY), { method: "GET" });
  }
  // Acties die je veilig opnieuw mag proberen na de HTML-hapering hierboven:
  // ze zetten een bekende waarde of verwijderen iets, dus twee keer uitvoeren
  // geeft hetzelfde resultaat. Bij toevoegen mag dat NIET — een herhaling zou
  // een tweede kamp of een dubbele uitgave kunnen aanmaken.
  var REPEATABLE_ACTIONS = ["updateCamp", "updateStep", "updateIncome", "updateExpense", "deleteCamp", "deleteIncome", "deleteExpense"];

  function apiPost(action, payload) {
    var opts = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload, key: CONFIG.ACCESS_KEY })
    };
    var request = REPEATABLE_ACTIONS.indexOf(action) !== -1
      ? fetchJsonWithRetry_(CONFIG.API_URL, opts)
      : fetch(CONFIG.API_URL, opts).then(function (r) { return r.json(); });
    return request.then(function (json) {
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
          startDate: normalizeDateStr(c.startDate),
          requestDate: normalizeDateStr(c.requestDate),
          approvalDate: normalizeDateStr(c.approvalDate),
          stays: normVerblijven(c.stays),
          emergency: normNoodinfo(c.emergency),
          review: normTerugblik(c.review)
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
      // Een oudere Apps Script-versie stuurt geen apiVersion mee.
      var apiVersion = Number(data.apiVersion) || 1;
      return { camps: camps, steps: steps, income: income, expenses: expenses,
               apiVersion: apiVersion, apiUpToDate: apiVersion >= API_VERSIE_NODIG };
    });
  }

  /* ---------------- Render ---------------- */

  /** `opts` bepaalt welke knoppen verschijnen:
   *    stepsEditable  — "+ stap" per fase en een kruisje per stap
   *    duplicable     — knop "Dupliceren" tussen de kampacties
   *  Beide staan standaard uit, zodat een pagina die ze niet afhandelt
   *  ook geen knoppen toont die niets doen. */
  function renderCampCard(camp, campSteps, expanded, opts) {
    opts = opts || {};
    campSteps = campSteps.slice().sort(function (a, b) { return a.order - b.order; });
    var doneCount = campSteps.filter(function (s) { return s.done; }).length;
    var total = campSteps.length;
    var pct = total ? Math.round(100 * doneCount / total) : 0;

    var countdownHtml = "";
    if (camp.startDate) {
      var d = daysUntil(camp.startDate);
      var cls = d < 0 ? "bad" : (d <= 21 ? "warn" : "");
      var text = d < 0 ? "gestart" : (d === 0 ? "vandaag" : "over " + d + " dagen");
      var range = formatDateNL(camp.startDate) + (camp.endDate ? " \u2192 " + formatDateNL(camp.endDate) : "");
      countdownHtml = '<span class="countdown ' + cls + '">vertrek ' + escapeHtml(range) + ' \u00b7 ' + text + '</span>';
    }
    var adminBits = [];
    if (camp.camping) adminBits.push('<span>Camping: ' + escapeHtml(camp.camping) + '</span>');
    if (camp.guides) adminBits.push('<span>Begeleiders: ' + escapeHtml(guideNames(camp.guides).join(", ")) + '</span>');
    if (camp.transport) adminBits.push('<span>Vervoer: ' + escapeHtml(camp.transport) + '</span>');
    if (camp.requestDate) adminBits.push('<span>Aanvraag ingediend: ' + escapeHtml(formatDateNL(camp.requestDate)) + '</span>');
    if (camp.approvalDate) adminBits.push('<span>Akkoord klimzaal: ' + escapeHtml(formatDateNL(camp.approvalDate)) + '</span>');

    var byPhase = {}, phaseOrder = [];
    campSteps.forEach(function (s) {
      if (!byPhase[s.phase]) { byPhase[s.phase] = []; phaseOrder.push(s.phase); }
      byPhase[s.phase].push(s);
    });

    var ontbrekendeDatums = missingStepDates(camp, campSteps);

    // Eén suggestielijst per kamp, gevuld met de begeleiders van dat kamp.
    var campGuides = begeleiderOptions(camp);
    var datalistId = campGuides.length ? "begeleiders-" + camp.id : "";
    var datalistHtml = datalistId
      ? '<datalist id="' + escapeHtml(datalistId) + '">' + campGuides.map(function (naam) {
          return '<option value="' + escapeHtml(naam) + '">';
        }).join("") + '</datalist>'
      : '';

    var bodyHtml = phaseOrder.map(function (phase) {
      var list = byPhase[phase];
      var phaseDone = list.filter(function (s) { return s.done; }).length;
      return '<section class="phase">' +
        '<h4>' + escapeHtml(phase) + ' <span class="phase-count">' + phaseDone + '/' + list.length + '</span></h4>' +
        '<ul class="steps">' + list.map(function (s) { return renderStepRow(s, datalistId, opts.stepsEditable); }).join("") + '</ul>' +
        (opts.stepsEditable
          ? '<button type="button" class="add-step" data-add-step="' + escapeHtml(phase) + '">+ stap toevoegen</button>'
          : '') +
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
      (expanded ? '<div class="camp-body">' + datalistHtml +
        (camp.notes ? '<div class="camp-notes"><h4>Notities</h4><p>' + escapeHtml(camp.notes).replace(/\n/g, "<br>") + '</p></div>' : '') +
        bodyHtml +
        '<div class="camp-actions">' +
          '<button type="button" class="btn small danger" data-delete="' + camp.id + '" data-delete-name="' + escapeHtml(camp.name) + '">Verwijderen</button>' +
          '<div class="camp-actions-right">' +
            '<a class="btn small" href="budget.html?id=' + encodeURIComponent(camp.id) + '">Budget</a>' +
            (function () {
              var rd = routedatabankKnop(camp);
              return '<a class="btn small" href="' + escapeHtml(rd.href) + '" target="_blank" rel="noopener"' +
                ' title="' + escapeHtml(rd.titel) + '">Routedatabank</a>';
            })() +
            '<a class="btn small" href="fiche.html?id=' + encodeURIComponent(camp.id) + '" target="_blank" rel="noopener">Fiche afdrukken</a>' +
            '<a class="btn small" href="noodkaart.html?id=' + encodeURIComponent(camp.id) + '"' +
              ' title="Verblijfplaatsen en noodnummers invullen, en de noodkaart afdrukken">Noodkaart</a>' +
            '<a class="btn small" href="terugblik.html?id=' + encodeURIComponent(camp.id) + '"' +
              (heeftTerugblik(camp)
                ? ' title="Terugblik bijgewerkt op ' + escapeHtml(formatDateNL(camp.review.bijgewerkt)) + '">Terugblik ✓</a>'
                : ' title="Na het kamp: route, hutten, groep en werkpunten invullen">Terugblik</a>') +
            '<button type="button" class="btn small" data-edit="' + camp.id + '">Bewerken</button>' +
            (opts.duplicable ? '<button type="button" class="btn small" data-duplicate="' + camp.id + '">Dupliceren</button>' : '') +
            // Verschijnt enkel wanneer er ook effectief iets in te vullen valt.
            (opts.stepsEditable && ontbrekendeDatums.length
              ? '<button type="button" class="btn small" data-fill-dates="' + camp.id +
                '" title="Zet een streefdatum op de ' + ontbrekendeDatums.length +
                ' stappen die er nog geen hebben, gerekend vanaf de vertrekdatum. Bestaande datums blijven ongemoeid.">Datums invullen (' +
                ontbrekendeDatums.length + ')</button>'
              : '') +
            '<button type="button" class="btn small" data-archive-toggle="' + camp.id + '" data-archive-value="' + (camp.archived ? "false" : "true") + '">' + (camp.archived ? "Terug naar actief" : "Archiveren") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' : '') +
    '</article>';
  }

  /** `datalistId` is leeg wanneer het kamp nog geen begeleiders heeft; dan
   *  blijft het veld een gewoon tekstvak zonder suggesties. */
  function renderStepRow(step, datalistId, deletable) {
    var extra = stepStatusClass(step);
    var cls = "step" + (step.done ? " is-done" : "") + (extra ? " " + extra : "");
    return '<li class="' + cls + '" data-step-id="' + step.id + '">' +
      '<input type="checkbox" data-step-done="' + step.id + '"' + (step.done ? " checked" : "") + '>' +
      '<span class="step-title">' + escapeHtml(step.title) + '</span>' +
      '<input type="date" class="step-date" data-step-date="' + step.id + '" value="' + escapeHtml(step.targetDate || "") + '">' +
      '<input type="text" class="step-owner"' + (datalistId ? ' list="' + datalistId + '"' : '') +
        ' placeholder="Wie?" data-step-owner="' + step.id + '" value="' + escapeHtml(step.owner || "") + '">' +
      (deletable
        ? '<button type="button" class="step-del" data-step-delete="' + step.id +
          '" data-step-name="' + escapeHtml(step.title) + '" title="Deze stap verwijderen" aria-label="Stap verwijderen">×</button>'
        : '') +
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

    var fillBtn = card.querySelector('[data-fill-dates]');
    if (fillBtn && handlers.onFillDates) fillBtn.addEventListener("click", function () {
      handlers.onFillDates(camp);
    });

    var dupBtn = card.querySelector('[data-duplicate]');
    if (dupBtn && handlers.onDuplicate) dupBtn.addEventListener("click", function () { handlers.onDuplicate(camp); });

    card.querySelectorAll('[data-add-step]').forEach(function (btn) {
      if (!handlers.onAddStep) return;
      btn.addEventListener("click", function () {
        handlers.onAddStep(camp.id, btn.getAttribute("data-add-step"));
      });
    });
    card.querySelectorAll('[data-step-delete]').forEach(function (btn) {
      if (!handlers.onDeleteStep) return;
      btn.addEventListener("click", function () {
        handlers.onDeleteStep(btn.getAttribute("data-step-delete"), btn.getAttribute("data-step-name") || "");
      });
    });
  }

  /** Voegt één stap toe aan een bestaand kamp, achteraan in die fase.
   *  `campSteps` dient enkel om het volgnummer te bepalen. */
  function addStepToCamp(campId, phase, title, campSteps) {
    var inPhase = (campSteps || []).filter(function (s) { return s.phase === phase; });
    var maxOrder = inPhase.reduce(function (m, s) { return Math.max(m, Number(s.order) || 0); }, 0);
    return apiPost("addSteps", {
      campId: campId,
      steps: [{ phase: phase, title: title, order: maxOrder + 1 }]
    });
  }

  /* ---------------- Invulpagina voor één kamp (noodkaart, terugblik) ----------------
     Anders dan de hoofdpagina ververst zo'n pagina niet om de 10 seconden: je
     bent er een hele tijd aan het typen, en wat je invult mag niet onder je
     vingers vervangen worden. In de plaats daarvan kijkt "Opslaan" eerst of
     iemand anders intussen hetzelfde kamp aanpaste, en vraagt dan wat te doen.

     opts:
       pagina     — bestandsnaam, voor de kampkeuze als ?id= ontbreekt
       onKamp     — function (camp): de pagina opbouwen met dit kamp
       huidig     — function (camp): de waarden die deze pagina beheert, zoals
                    ze nu in de Sheet staan (om wijzigingen van anderen te zien)
       velden     — function (): de velden om op te slaan, als { kolom: tekst }
       naOpslaan  — optioneel, function (): na geslaagd opslaan
       nooitOpgeslagen — optioneel, function (camp): true als er voor dit kamp
                    nog niets bewaard werd (de balk zegt dan niet "alles opgeslagen")
     Verwacht in de pagina: #conn-dot, #conn-text, #banner-slot, #page-slot,
     en een .save-bar met #save-status en #save-btn. */
  function createEditPage(opts) {
    var campId = new URLSearchParams(location.search).get("id");
    var state = { camp: null, dirty: false, saving: false, apiUpToDate: true, snapshot: "", savedAt: "" };
    var saveBtn = document.getElementById("save-btn");
    var statusEl = document.getElementById("save-status");
    var bar = document.querySelector(".save-bar");

    renderVersionBadge();

    function setConn(cls, text) {
      document.getElementById("conn-dot").className = "dot" + (cls ? " " + cls : "");
      document.getElementById("conn-text").textContent = text;
    }

    function updateBar() {
      if (!saveBtn) return;
      saveBtn.disabled = !state.camp || !state.dirty || state.saving || !state.apiUpToDate;
      saveBtn.textContent = state.saving ? "Bezig met opslaan…" : "Opslaan";
      if (!statusEl) return;
      if (!state.apiUpToDate) { statusEl.className = "save-status bad"; statusEl.textContent = "Opslaan kan nog niet (zie melding bovenaan)"; }
      else if (state.dirty) { statusEl.className = "save-status dirty"; statusEl.textContent = "Niet-opgeslagen wijzigingen"; }
      else if (state.savedAt) { statusEl.className = "save-status ok"; statusEl.textContent = "Opgeslagen om " + state.savedAt; }
      else if (state.camp && opts.nooitOpgeslagen && opts.nooitOpgeslagen(state.camp)) { statusEl.className = "save-status"; statusEl.textContent = "Nog nooit opgeslagen"; }
      else { statusEl.className = "save-status"; statusEl.textContent = "Alles is opgeslagen"; }
    }

    function renderPicker(melding) {
      if (bar) bar.hidden = true;
      document.getElementById("page-slot").innerHTML =
        '<div class="form-section"><h2>Kies een kamp</h2><p class="hint">' + escapeHtml(melding) + '</p>' +
        '<div class="row-list">' + state.alle.map(function (c) {
          return '<a class="btn" href="' + opts.pagina + '?id=' + encodeURIComponent(c.id) + '">' + escapeHtml(c.name) +
            (c.archived ? ' <span class="pill">archief</span>' : '') + '</a>';
        }).join("") + '</div></div>';
    }

    function start() {
      updateBar();
      if (SETUP_NEEDED) {
        setConn("bad", "Nog niet ingesteld");
        if (bar) bar.hidden = true;
        renderSetupBanner("banner-slot");
        return;
      }
      fetchAll().then(function (data) {
        setConn("ok", "Verbonden");
        state.alle = data.camps;
        state.apiUpToDate = data.apiUpToDate;
        var camp = data.camps.filter(function (c) { return c.id === campId; })[0];
        if (!camp) {
          renderPicker(campId ? "Geen kamp gevonden met deze link — misschien verwijderd?" : "Deze pagina werd zonder kamp geopend.");
          return;
        }
        state.camp = camp;
        state.snapshot = JSON.stringify(opts.huidig(camp));
        if (!state.apiUpToDate) {
          document.getElementById("banner-slot").innerHTML =
            '<div class="banner bad"><strong>Opslaan kan nog niet.</strong> Het Apps Script op de server is nog niet bijgewerkt ' +
            'naar de versie die deze pagina nodig heeft. Plak <code>apps-script.gs</code> opnieuw in de Apps Script-editor en ' +
            'deploy een <strong>nieuwe versie</strong> (zie README). Tot dan kan je alles bekijken en afdrukken, maar niet bewaren.</div>';
        }
        if (bar) bar.hidden = false;
        opts.onKamp(camp);
        updateBar();
      }).catch(function (err) {
        setConn("bad", "Kan niet verbinden");
        document.getElementById("banner-slot").innerHTML =
          '<div class="banner bad">Kon de gedeelde Sheet niet bereiken (' + escapeHtml(err && err.message ? err.message : String(err)) +
          '). Herlaad de pagina om opnieuw te proberen.</div>';
      });
    }

    function markDirty() { if (!state.dirty) { state.dirty = true; updateBar(); } }

    function save() {
      if (!state.camp || !state.dirty || state.saving || !state.apiUpToDate) return Promise.resolve(false);
      state.saving = true; updateBar();
      // Eerst kijken of iemand anders intussen hetzelfde aanpaste. Zonder deze
      // controle zou de laatste die opslaat stil het werk van de ander wissen.
      return fetchAll().then(function (data) {
        var vers = data.camps.filter(function (c) { return c.id === state.camp.id; })[0];
        if (!vers) throw new Error("dit kamp bestaat niet meer — misschien intussen verwijderd");
        var nuInSheet = JSON.stringify(opts.huidig(vers));
        if (nuInSheet !== state.snapshot && !window.confirm(
          "Iemand anders heeft dit intussen ook aangepast en opgeslagen.\n\n" +
          "OK = jouw versie opslaan (de andere wijzigingen gaan verloren).\n" +
          "Annuleren = niets opslaan, zodat je eerst kan kijken (herlaad de pagina; wat je hier typte, gaat dan wel verloren).")) {
          return false;
        }
        var fields = opts.velden();
        return apiPost("updateCamp", { id: state.camp.id, fields: fields }).then(function () {
          // Lokaal bijwerken in dezelfde vorm als fetchAll het zou teruggeven.
          var normaliseer = { stays: normVerblijven, emergency: normNoodinfo, review: normTerugblik };
          Object.keys(fields).forEach(function (k) {
            state.camp[k] = normaliseer[k] ? normaliseer[k](fields[k]) : fields[k];
          });
          state.snapshot = JSON.stringify(opts.huidig(state.camp));
          state.dirty = false;
          var nu = new Date();
          state.savedAt = String(nu.getHours()).padStart(2, "0") + ":" + String(nu.getMinutes()).padStart(2, "0");
          if (opts.naOpslaan) opts.naOpslaan();
          return true;
        });
      }).catch(function (err) {
        alert("Opslaan is niet gelukt: " + (err && err.message ? err.message : "onbekende fout") + ". Je gegevens staan nog op het scherm; probeer opnieuw.");
        return false;
      }).then(function (ok) {
        state.saving = false; updateBar();
        return ok;
      });
    }

    if (saveBtn) saveBtn.addEventListener("click", function () { save(); });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); save(); }
    });
    window.addEventListener("beforeunload", function (e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
    });

    return {
      start: start, save: save, markDirty: markDirty,
      camp: function () { return state.camp; },
      isDirty: function () { return state.dirty; }
    };
  }

  /** Leest en zet een waarde via een pad als "ziekenhuis.telefoon". */
  function leesPad(obj, pad) {
    return pad.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function zetPad(obj, pad, waarde) {
    var delen = pad.split("."), o = obj;
    for (var i = 0; i < delen.length - 1; i++) {
      if (o[delen[i]] == null || typeof o[delen[i]] !== "object") o[delen[i]] = {};
      o = o[delen[i]];
    }
    o[delen[delen.length - 1]] = waarde;
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
    return !d || (!d.name && !d.customLabel && !d.destination && !d.startDate && !d.endDate && !d.transport && !d.guides && !d.camping && !d.notes && !d.requestDate && !d.approvalDate);
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
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    escapeHtml: escapeHtml, cssEscape: cssEscape, todayStr: todayStr, daysUntil: daysUntil,
    normalizeDateStr: normalizeDateStr, formatDateNL: formatDateNL, boolish: boolish, formatEUR: formatEUR, stepStatusClass: stepStatusClass,
    openConnectionDialog: openConnectionDialog,
    typeLabel: typeLabel, stepsForCamp: stepsForCamp, buildDefaultSteps: buildDefaultSteps,
    missingStepDates: missingStepDates, targetDateForTitle: targetDateForTitle, shiftDate: shiftDate,
    landVanBestemming: landVanBestemming, routedatabankKnop: routedatabankKnop,
    NOODNUMMERS: NOODNUMMERS, NOODNUMMERS_NAGEKEKEN: NOODNUMMERS_NAGEKEKEN, landVoorNoodkaart: landVoorNoodkaart,
    VERBLIJF_TYPES: VERBLIJF_TYPES, GESCHIKT_VOOR: GESCHIKT_VOOR, TERUGKEREN: TERUGKEREN,
    normVerblijf: normVerblijf, normVerblijven: normVerblijven, normNoodinfo: normNoodinfo, noodinfoVoorDuplicaat: noodinfoVoorDuplicaat,
    normDag: normDag, normPlek: normPlek, normTerugblik: normTerugblik, heeftTerugblik: heeftTerugblik,
    nieuweTerugblik: nieuweTerugblik, vulPlekkenAan: vulPlekkenAan,
    databankBestandsnaam: databankBestandsnaam, terugblikNaarMarkdown: terugblikNaarMarkdown, downloadTekst: downloadTekst,
    createEditPage: createEditPage, leesPad: leesPad, zetPad: zetPad,
    addStepToCamp: addStepToCamp,
    begeleiderOptions: begeleiderOptions,
    parseGuides: parseGuides, formatGuides: formatGuides, guideNames: guideNames,
    renderSetupBanner: renderSetupBanner,
    renderConnStatus: renderConnStatus, createPageRuntime: createPageRuntime,
    VERSION: VERSION, CHANGELOG: CHANGELOG, renderVersionBadge: renderVersionBadge,
    apiGet: apiGet, apiPost: apiPost, fetchAll: fetchAll,
    renderCampCard: renderCampCard, renderStepRow: renderStepRow, bindCampCard: bindCampCard,
    saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft, draftIsEmpty: draftIsEmpty,
    compressImageFile: compressImageFile
  };
})();
