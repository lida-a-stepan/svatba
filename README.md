# Svatební web Lídy a Štěpána

Statická stránka na GitHub Pages a RSVP přes Google Apps Script do Google tabulky. Nepotřebuje build ani vlastní server.

| Soubor | Obsah |
|---|---|
| `index.html` | veřejný text webu (jména, datum, obec, program, obecné informace) |
| `styles.css` | vzhled; barvy jsou nahoře v `:root` |
| `script.js` | louka v úvodu, kód z pozvánky, RSVP; nahoře je `SCRIPT_URL` |
| `fonts/` | písma hostovaná přímo na webu (Fraunces, Atkinson Hyperlegible, licence OFL) |
| `apps-script/Code.gs` | backend, vkládá se do Apps Scriptu |
| `pozvanka/` | tisková šablona pozvánek A5 s QR kódy (viz níže) |

## Co je veřejné a co ne

Repo i stránka jsou veřejné, takže **do repa nepatří nic citlivého**. Je to tak navržené:

- **Veřejně:** jména, datum, obec, program, obecné informace.
- **Jen s kódem z pozvánky:** adresa statku, odkazy na Mapy.com a Google Maps, telefony, informace k darům (list *Pro hosty*: `adresa`, `mapa_mapy`, `mapa_google`, `kontakty`, `dary`). Web je načte až po zadání platného kódu.
- **Nikdy v repu:** seznam hostů, odpovědi, čísla účtů. Pozor, co jednou commitnete, zůstane v historii gitu.

## Bezpečnostní opatření

- Odpověď se uloží jen s platným kódem z pozvánky. Kód má 8 znaků z 31 možných (≈ 8,5 × 10¹¹ kombinací).
- Rate limit je 10 odpovědí za hodinu na jeden kód a 120 celkem. E-mailová upozornění hlídají denní kvótu.
- `@OnlyCurrentDoc` znamená, že skript vidí jen svou tabulku, ne celý Google Drive.
- Vstupy se ořezávají a text začínající `= + - @` se neuloží jako vzorec. Počet osob je omezený podle pozvánky.
- Soukromé údaje se do stránky vkládají jen jako text (`textContent`), nikdy jako HTML.
- Content-Security-Policy povoluje jen vlastní soubory a Apps Script. Kvůli `no-referrer` se kód neposílá jiným webům. Po načtení se kód odstraní z adresního řádku a uloží v prohlížeči hosta.
- Písma se načítají z vlastního webu, takže Google nevidí IP adresy návštěvníků. `noindex` a `robots.txt` brání indexaci stránky.

Doporučení k účtům: zapněte 2FA na GitHubu i na svatebním Google účtu. Tabulku nesdílejte odkazem a nepoužívejte „Publikovat na webu“. Commity dělejte s `noreply` e-mailem z GitHubu.

## Zapojení

1. Ve svatebním Google účtu vytvořte tabulku a otevřete **Rozšíření → Apps Script**.
2. Obsah `apps-script/Code.gs` vložte místo výchozího kódu. Nastavte `SITE_URL` a uložte.
3. Vyberte funkci `setup` a klikněte **Spustit**. Při povolení oprávnění zvolte *Pokročilé → Přejít na projekt* a pak *Povolit*. Vzniknou listy *Odpovědi*, *Hosté* a *Pro hosty*.
4. **Nasadit → Nové nasazení → Webová aplikace**, *Spustit jako: Já*, *Přístup: Kdokoli*. Zkopírujte URL končící na `/exec`.
5. URL vložte do `SCRIPT_URL` v `script.js`, commit a push.
6. Vyplňte list *Pro hosty* (adresy, mapa, kontakty, dary).
7. Do listu *Hosté* zapište domácnosti a max. počet osob a v tabulce zvolte **Svatba → Vygenerovat odkazy pro hosty**. Doplní se kódy a osobní odkazy pro pozvánky (QR kód).
8. Domácnostem, kterým nabízíte pokoj přímo na statku, napište do sloupce *Pokoj na statku (ano)* „ano“. Jen jim se ve formuláři tato možnost ukáže, a server ji ostatním nepřijme.

Po každé změně kódu v Apps Scriptu: **Nasadit → Spravovat nasazení → upravit → Verze: Nová verze**. URL zůstane stejná.

## Pozvánky k tisku

`pozvanka/index.html` vytvoří oboustrannou pozvánku A5 pro každou domácnost, s jejím jménem, počtem osob, QR kódem a kódem k ručnímu zadání.

1. V tabulce spusťte `generateInviteLinks`. Pak list *Hosté* stáhněte přes *Soubor → Stáhnout → CSV*.
2. Otevřete `pozvanka/index.html` (stačí soubor z disku, nebo `…github.io/svatba/pozvanka/`) a načtěte CSV. Soubor zůstane v prohlížeči, nikam se neodesílá.
3. **Vytisknout** → A5, oboustranně, okraje žádné, měřítko 100 %. Nebo uložit jako PDF pro tiskárnu.

CSV soubory a PDF jsou v `.gitignore`. Seznam hostů do repa nepatří. Termín RSVP se mění nahoře v `pozvanka.js`, texty v `index.html`. QR kódy generuje knihovna `qrcode.js` (qrcode-generator, MIT) přímo v prohlížeči.
