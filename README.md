# Kampvoorbereiding — GitHub Pages-versie

Dit is de map die je naar GitHub uploadt om de tool live te hosten. De Apps Script-koppeling zelf blijft ongewijzigd (die staat al in jullie gedeelde Google Sheet) — enkel *waar de pagina's staan* verandert hier.

**Belangrijk verschil met de lokale versie in `Projecten/kampvoorbereiding/`:** in `shared.js` staat de Web-app-link hier bewust **niet** ingevuld (`API_URL: ""`). Omdat deze map publiek op GitHub komt te staan, zou een vast ingevulde link door iedereen die de repository vindt afleesbaar zijn. In de plaats daarvan vult elke begeleider die link **eenmalig zelf in** via een invoervak dat verschijnt — daarna onthoudt de browser dit (net als een wachtwoord dat "onthouden" wordt), zonder dat het ooit in de broncode staat.

## Stap voor stap: repository aanmaken en bestanden uploaden

1. Ga naar [github.com](https://github.com) en log in met je (nieuwe) account.
2. Klik rechtsboven op het **+**-icoon → **New repository**.
3. Vul in:
   - **Repository name**: bv. `bergkamp-kampvoorbereiding`
   - **Visibility**: **Public** (verplicht voor gratis GitHub Pages)
   - Laat "Add a README file" en de rest **uitgevinkt** — we uploaden zelf alle bestanden.
4. Klik **Create repository**.
5. Op de lege repo-pagina die nu verschijnt: klik de link **"uploading an existing file"** (of bovenaan **Add file → Upload files**).
6. Sleep alle bestanden uit déze map (`index.html`, `kampvoorbereiding.html`, `archief.html`, `budget.html`, `fiche.html`, `shared.css`, `shared.js`) naar het uploadvak. (Dit README-bestand hoeft niet mee, maar mag gerust ook mee — het is niet gevoelig.)
7. Scrol naar onder, typ een korte commit-boodschap (bv. "Eerste versie") en klik **Commit changes**.

## Stap voor stap: GitHub Pages activeren

8. Ga in dezelfde repository naar **Settings** (tandwiel bovenaan) → **Pages** (linkermenu, onder "Code and automation").
9. Bij **Source**: kies **Deploy from a branch**.
10. Bij **Branch**: kies **main** en map **/ (root)** → klik **Save**.
11. Wacht 1-2 minuten en herlaad de Pages-instellingenpagina. Bovenaan verschijnt een groen vak met de live link, iets als:
    `https://<jouw-gebruikersnaam>.github.io/bergkamp-kampvoorbereiding/`

## Eerste gebruik (jij én de andere twee begeleiders)

12. Open die link. Je ziet een rood vak "nog niet ingesteld" met een invoerveld.
13. Plak daar de bestaande Web-app-URL (dezelfde `/exec`-link die al in de lokale versie stond — vraag die na bij elkaar als je hem niet meer bij de hand hebt) en klik **Opslaan**.
14. De pagina herlaadt en werkt vanaf dan normaal — dit hoef je maar **één keer per toestel/browser** te doen. Jordy en Wout doen dit elk apart, eenmalig, in hun eigen browser.

## Nadien iets aanpassen?

Wijzig je later iets aan de code (bv. een nieuwe versie van deze tool)? Upload de gewijzigde bestanden gewoon opnieuw via **Add file → Upload files** in dezelfde repository (GitHub vraagt of je de bestaande bestanden wil vervangen — bevestig dat). Pages ververst zichzelf automatisch binnen een paar minuten na elke upload.

## Als er iets misloopt met Apps Script zelf

Deze map bevat geen `apps-script.gs` en geen Apps Script-opzetinstructies — die blijven ongewijzigd in `Projecten/kampvoorbereiding/README.md`. Deze GitHub-versie praat met **dezelfde** gedeelde Sheet/Apps Script-deployment als voorheen; er is niets aan die kant veranderd.
