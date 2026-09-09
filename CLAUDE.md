# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Nadrzędne zasady (język, ton, commity, „mierz, nie zgaduj") leżą w `..\CLAUDE.md` —
nie powtarzam ich tu. Tylko to, co dotyczy **Sceny**.

## Czym to jest

**Scena** (repo `2D_Audio_Explorer`, nazwa historyczna) — warsztat scenografii dźwiękowej
w przeglądarce. Zero builda: `index.html` + `css/sal.css` + piętnaście `js/NN-*.js` przez
`<link>`/`<script src>`, działa z `file://`. Nie wprowadzaj `type="module"` (zabija `file://`)
ani zależności do apki (tylko harness je ma). Przestrzeń nazw globalna celowo — harness
sięga po `S`, `exportScene`, `createFromBuffer`. Biblioteka SAL nie działa z `file://`
(`fetch('library.json')`, CORS) — to decyzja, nie usterka.

## Kontrola po edycji

```bash
for f in js/*.js; do node --check "$f" || echo "SKLADNIA: $f"; done
node -e "const fs=require('fs');for(const f of fs.readdirSync('js')){const s=fs.readFileSync('js/'+f,'utf8');const z=[...'„”“«»‘’'].filter(c=>s.includes(c));if(z.length)console.log('typograficzne:',f,z.join(''));}"
```

Polskie cudzysłowy w JS = błąd składni. Przed nową funkcją: `grep -rc 'nazwa' js/ index.html`
— deklaracje się hoistują, kolizja wygrywa po cichu.

## Harnessy

W `..\_SAL-docs\harness\` (nie repo gita, bez historii). Playwright bez pobranej
przeglądarki — użyj systemowego Chrome:

```bash
cd ../_SAL-docs/harness && SAL_CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe" node harness.js ../../2D_Audio_Explorer
```

| Skrypt | Co mierzy | Wynik 07.09.2026 |
|---|---|---|
| `harness.js` | `exportScene()`; kierunek z **próbek AmbiX**, nie z kodu | **80/80** |
| `harness-panel.js` | panel: rejestr `KONTROLKI`, model ↔ panel | **115/115** |
| `harness-sfera.js` | Scena → archiwum → Sfera (wymaga `../../ambi`) | **43/43** |
| `_diag-projekt.js` | `.sal.json`, autozapis, dopasowanie plików | **76/76** |
| `_diag-lufs.js` | wzór LUFS z `90-eksport.js`, bez przeglądarki | **11/11** |

Zmiana w panelu/eksporcie/projekcie → odpowiedni skrypt. README harnessu bywa
nieaktualne (88/88 dla panelu) — ufaj tabeli wyżej. Siedem `_diag-*.js` miało wpisaną
na sztywno starą ścieżkę sprzed przeprowadzki do `SAL\` (poprawione 07.09.2026,
`_diag-telefon.js` po poprawce: 169/169) — nowy `_diag-*.js` też bierze katalog ze
stałej, nie z argumentu, więc sprawdź ją przy kopiowaniu wzorca. Linki między
aplikacjami: `node ../_SAL-docs/sal-serwer.js` (montuje repo pod produkcyjnymi
adresami; `http.server` daje 404 na sąsiadach).

## Architektura

Kolejność `<script>` w `index.html` jest kontraktem — plik korzysta tylko z tego, co
zadeklarowały pliki przed nim; `99-init.js` ostatni. Kluczowe: `00-audio.js` (`audioCtx`,
`masterGain`) → `10-stan.js` (`S`, `czasEksportu()`) → `50-zrodlo.js` (`buildSrc`,
`createFromBuffer`, `playSource`) → `60-panel.js` (`KONTROLKI`/`WIDOCZNOSC`/`WSKAZNIKI`,
`updateSel`) → `80-ruch.js` (`updateMotion`, `simulateTrajectory`, `katStartu`) →
`90-eksport.js` (`exportScene`, `planOdtwarzania`, `nazwaPliku`) → `95-projekt.js`
(`wczytajProjekt`).

**Współrzędne:** przód = −y, prawo = +x (`kierunekFOA()` w `90-eksport.js`). W `path`
SCENA.json `x`=prawo, `y`=przód (układ słuchacza) — `atan2(−x,−y)` daje wynik odbity.

### Jedna wielkość, jedno miejsce liczenia

Rozjazd tu kiedyś dał cztery różne kierunki jednego źródła w jednym archiwum.

| Wielkość | Źródło prawdy | Kto czyta |
|---|---|---|
| kiedy/jak długo brzmi | `planOdtwarzania()` | oba tory audio, `level` w JSON |
| pozycja w plikach | `pozStartowa()` = pierwsza klatka trajektorii, **nie** `s.x/s.y` | META, MAPA, `az/el/dist` |
| trajektoria | `simulateTrajectory()`, raz przed oboma renderami | binaural, FOA, `path` |
| nazwa pliku | `nazwaPliku()` | prefiks, ZIP, `audioFile` |
| czas nagrania | `czasEksportu()` | eksport, suwak Wejście |

Nie buduj opisu z nazwy pliku ani odwrotnie (`tytul` z ogonkami, `nm` po `nazwaPliku()`).

### Pary pól, których nie wolno zlewać

`s.playing` (jest w scenie, rusza się) vs `s.brzmi` (słychać teraz, świeci) — po
wybrzmieniu źródło krąży dalej niemo. `orbitStart` (parametr, stopnie od północy) vs
`orbitAngle` (stan biegu, dryfuje) — nigdy nie czytaj `orbitAngle` jako „startu".

### Panel

Kontrolka = jeden obiekt w `KONTROLKI` (`60-panel.js`): wartość, format, zapis, reset,
wygaszanie; nasłuchy delegowane z `#sidebar`. Pole `telefon` obowiązkowe (dziś 22
kontrolki, 11 z `telefon:true`). Po zmianie: `harness-panel.js`. Test-pułapka:
`new Event('input')` nie bąbelkuje bez `{bubbles:true}`.

## Eksport

Jedno nieskompresowane `.zip` (`zbudujZip`), stempel czasu z daty sceny (identyczne
archiwum przy powtórnym eksporcie). Pięć plików: `_BINAURAL.wav`, `_AMBIX.wav`,
`_MAPA.jpg` (cz-b, do druku), `_META.txt`, `_SCENA.json` (v3, kontrakt w
`..\_SAL-docs\kontrakt-scena-sfera.md`). Głośność mierzona nie korygowana
(`applied:false`), tor binauralny, szczyt próbkowy. **Nie zmieniaj formatu eksportu
bez policzenia, co się stanie z plikami już nagranymi.**

## Git

`core.autocrlf=true`, brak `.gitattributes`: roboczo CRLF, w blobach LF — diffy przez
`git diff -b -w`. Przed planowaniem: `git branch -a`, `git log --oneline -10`,
**`git worktree list`** (gotowa robota potrafi leżeć w porzuconym worktree tydzień).

## Reszta

Nazwy UI: `..\_SAL-docs\slownik-strony.md` — nieznana nazwa, dopisz po zmianie. Testy
wizualne robi Oskar — twoja część to zgodność cyfrowa: mierz, nie zamawiaj oglądania.
