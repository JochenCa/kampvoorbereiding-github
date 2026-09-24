# Kampvoorbereiding — GitHub Pages-versie

Dit is de map die je naar GitHub uploadt om de tool live te hosten. De Apps Script-koppeling zelf blijft ongewijzigd (die staat al in jullie gedeelde Google Sheet) — enkel *waar de pagina's staan* verandert hier.

**Belangrijk verschil met de lokale versie in `Projecten/kampvoorbereiding/`:** in `shared.js` staat hier wél de Web-app-link, maar **niet** de toegangscode (`ACCESS_KEY: ""`). Elke begeleider vult die code **eenmalig zelf in** via het venster dat verschijnt; daarna onthoudt de browser ze, zonder dat ze ooit in de broncode staat.

**Waarom mag die link wél publiek staan?** Omdat hij op zichzelf niets oplevert: de backend (`apps-script.gs`) weigert elke aanvraag zonder de juiste code met "Toegang geweigerd". De beveiliging zit dus volledig in de code, niet in het geheimhouden van de link.

**En waarom is dat handiger?** Komt er ooit een nieuwe Apps Script-deployment (dan verandert de `/exec`-link), dan volstaat het die ene regel in `shared.js` aan te passen en te pushen — iedereen zit automatisch weer goed. Vroeger moest elke begeleider die link handmatig opnieuw invoeren, en wie dat vergat bleef ongemerkt op een oude deployment werken.

## Stap voor stap: repository aanmaken en bestanden uploaden

1. Ga naar [github.com](https://github.com) en log in met je (nieuwe) account.
2. Klik rechtsboven op het **+**-icoon → **New repository**.
3. Vul in:
   - **Repository name**: bv. `bergkamp-kampvoorbereiding`
   - **Visibility**: **Public** (verplicht voor gratis GitHub Pages)
   - Laat "Add a README file" en de rest **uitgevinkt** — we uploaden zelf alle bestanden.
4. Klik **Create repository**.
5. Op de lege repo-pagina die nu verschijnt: klik de link **"uploading an existing file"** (of bovenaan **Add file → Upload files**).
6. Sleep alle bestanden uit déze map (`index.html`, `kampvoorbereiding.html`, `archief.html`, `budget.html`, `overzicht.html`, `fiche.html`, `noodkaart.html`, `terugblik.html`, `shared.css`, `shared.js`) naar het uploadvak. (Dit README-bestand hoeft niet mee, maar mag gerust ook mee — het is niet gevoelig.)
7. Scrol naar onder, typ een korte commit-boodschap (bv. "Eerste versie") en klik **Commit changes**.

## Stap voor stap: GitHub Pages activeren

8. Ga in dezelfde repository naar **Settings** (tandwiel bovenaan) → **Pages** (linkermenu, onder "Code and automation").
9. Bij **Source**: kies **Deploy from a branch**.
10. Bij **Branch**: kies **main** en map **/ (root)** → klik **Save**.
11. Wacht 1-2 minuten en herlaad de Pages-instellingenpagina. Bovenaan verschijnt een groen vak met de live link, iets als:
    `https://<jouw-gebruikersnaam>.github.io/bergkamp-kampvoorbereiding/`

## Eerste gebruik (jij én de andere twee begeleiders)

12. Open die link. Je ziet een rood vak "nog niet ingesteld" met de knop **Toegangscode invullen…**.
13. Vul daar de toegangscode in (`ACCESS_KEY` uit `apps-script.gs`). Vraag die na bij een medebegeleider als je ze niet bij de hand hebt, maar **niet via GitHub, mail of een openbaar kanaal**: mondeling of via een beveiligd bericht. De Web-app-link hoef je niet in te vullen, die staat al in de site. Klik daarna **Opslaan**.
14. De pagina herlaadt en werkt vanaf dan normaal — dit hoef je maar **één keer per toestel/browser** te doen. Jordy en Wout doen dit elk apart, eenmalig, in hun eigen browser.

## Nadien iets aanpassen?

Wijzig je later iets aan de code (bv. een nieuwe versie van deze tool)? Upload de gewijzigde bestanden gewoon opnieuw via **Add file → Upload files** in dezelfde repository (GitHub vraagt of je de bestaande bestanden wil vervangen — bevestig dat). Pages ververst zichzelf automatisch binnen een paar minuten na elke upload.

## Als er iets misloopt met Apps Script zelf

Deze map bevat geen `apps-script.gs` en geen Apps Script-opzetinstructies — die blijven ongewijzigd in `Projecten/kampvoorbereiding/README.md`. Deze GitHub-versie praat met **dezelfde** gedeelde Sheet/Apps Script-deployment als voorheen; er is niets aan die kant veranderd.
