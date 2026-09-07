// pobierz-ptaki-xc.js — jednorazowy/okresowy pobor metadanych ptakow z xeno-canto.org
// do biblioteki Sceny. Narzedzie, nie czesc apki — nie ma zaleznosci runtime.
//
// Klucz API NIGDY nie wchodzi do repo ani do kodu apki (Scena jest statyczna, publikowana
// na GitHub Pages — kazdy string w js/ jest publicznie czytelny). Skrypt czyta go z pliku
// .xeno-canto-key w katalogu repo (jedna linia, sam klucz), ktory jest w .gitignore.
//
// Uzycie:
//   1. Zaloz konto na xeno-canto.org, wygeneruj klucz (Twoje konto -> API key).
//   2. Zapisz go do pliku .xeno-canto-key w tym katalogu (bez cudzyslowow, bez spacji).
//   3. node narzedzia/pobierz-ptaki-xc.js
//
// Skrypt TYLKO CZYTA API i wypisuje tabele — nie dotyka library.json. Wynik zapisuje
// do narzedzia/ptaki-wynik.json do przejrzenia. Wpisanie do biblioteki to osobny krok
// (narzedzia/wpisz-ptaki-do-biblioteki.js), uruchamiany po akceptacji wyniku.

const fs = require('fs');
const path = require('path');
const https = require('https');

const KLUCZ_PLIK = path.join(__dirname, '..', '.xeno-canto-key');
const WYNIK_PLIK = path.join(__dirname, 'ptaki-wynik.json');

if (!fs.existsSync(KLUCZ_PLIK)) {
  console.error('Brak pliku .xeno-canto-key w katalogu repo. Zapisz tam swoj klucz API (jedna linia) i uruchom ponownie.');
  process.exit(1);
}
// Plik moze byc zapisany w UTF-16LE z BOM (np. PowerShell '>' domyslnie tak robi) —
// klucz jest czystym hexem, wiec bezpiecznie odsiewamy wszystko, co nim nie jest,
// niezaleznie od kodowania pliku.
const surowy = fs.readFileSync(KLUCZ_PLIK);
const proboweUtf16 = surowy.toString('utf16le').replace(/[^0-9a-fA-F]/g, '');
const proboweUtf8 = surowy.toString('utf8').replace(/[^0-9a-fA-F]/g, '');
const KLUCZ = proboweUtf16.length > proboweUtf8.length ? proboweUtf16 : proboweUtf8;
if (!KLUCZ) {
  console.error('.xeno-canto-key jest pusty albo nie da sie z niego wyciagnac klucza.');
  process.exit(1);
}

// 15 gatunkow, trzy siedliska po piec. Nazwy polskie i naukowe zmierzone wobec
// nomenklatury PTO (Polskie Towarzystwo Ornitologiczne), nie zgadywane.
const GATUNKI = [
  // ptaki_lesne
  { pod: 'ptaki_lesne', pl: 'Zięba', gen: 'Fringilla', sp: 'coelebs' },
  { pod: 'ptaki_lesne', pl: 'Kos', gen: 'Turdus', sp: 'merula' },
  { pod: 'ptaki_lesne', pl: 'Puszczyk', gen: 'Strix', sp: 'aluco' },
  { pod: 'ptaki_lesne', pl: 'Dzięcioł duży', gen: 'Dendrocopos', sp: 'major' },
  { pod: 'ptaki_lesne', pl: 'Kukułka', gen: 'Cuculus', sp: 'canorus' },
  // ptaki_wodne
  { pod: 'ptaki_wodne', pl: 'Łabędź niemy', gen: 'Cygnus', sp: 'olor' },
  { pod: 'ptaki_wodne', pl: 'Czajka', gen: 'Vanellus', sp: 'vanellus' },
  { pod: 'ptaki_wodne', pl: 'Żuraw', gen: 'Grus', sp: 'grus' },
  { pod: 'ptaki_wodne', pl: 'Krzyżówka', gen: 'Anas', sp: 'platyrhynchos' },
  { pod: 'ptaki_wodne', pl: 'Perkoz dwuczuby', gen: 'Podiceps', sp: 'cristatus' },
  // ptaki_miejskie
  { pod: 'ptaki_miejskie', pl: 'Wróbel', gen: 'Passer', sp: 'domesticus' },
  { pod: 'ptaki_miejskie', pl: 'Sikora bogatka', gen: 'Parus', sp: 'major' },
  { pod: 'ptaki_miejskie', pl: 'Kawka', gen: 'Coloeus', sp: 'monedula' },
  { pod: 'ptaki_miejskie', pl: 'Jaskółka dymówka', gen: 'Hirundo', sp: 'rustica' },
  { pod: 'ptaki_miejskie', pl: 'Gołąb miejski', gen: 'Columba', sp: 'livia' },
];

function pobierzJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SAL-Scena/1 (narzedzie biblioteki)' } }, res => {
      let dane = '';
      res.on('data', d => dane += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
        try { resolve(JSON.parse(dane)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const KOLEJNOSC_JAKOSCI = ['A', 'B', 'C', 'D', 'E', 'no score'];

// ND (No Derivatives) wyklucza nagranie od razu — Scena miksuje, pozycjonuje przestrzennie
// i eksportuje dzwiek jako czesc nowego pliku, co jest dokladnie tym, czego ND zabrania.
function jestND(lic) { return /\/by-nc-nd\/|\/by-nd\//.test(lic || ''); }

async function znajdzNagranie(gatunek) {
  const q = encodeURIComponent(`gen:"${gatunek.gen}" sp:"${gatunek.sp}"`);
  const url = `https://xeno-canto.org/api/3/recordings?query=${q}&key=${KLUCZ}`;
  const odp = await pobierzJson(url);
  if (odp.error) throw new Error(gatunek.pl + ': ' + (odp.message || odp.error));
  const nagrania = (odp.recordings || []).filter(n => !jestND(n.lic));
  if (!nagrania.length) return null;
  nagrania.sort((a, b) => KOLEJNOSC_JAKOSCI.indexOf(a.q) - KOLEJNOSC_JAKOSCI.indexOf(b.q));
  return nagrania[0];
}

(async () => {
  const wyniki = [];
  console.log('gatunek'.padEnd(20), 'jakosc', 'nagrywajacy'.padEnd(22), 'licencja');
  for (const g of GATUNKI) {
    try {
      const n = await znajdzNagranie(g);
      if (!n) { console.log(g.pl.padEnd(20), '— brak wynikow w xeno-canto'); continue; }
      const komercyjne = !/nc/i.test(n.lic || '');
      wyniki.push({ gatunek: g, nagranie: n, komercyjne });
      console.log(
        g.pl.padEnd(20),
        String(n.q || '?').padEnd(7),
        String(n.rec || '?').padEnd(22),
        (n.lic || '?').replace('https://creativecommons.org/licenses/', '').replace(/\/$/, '')
      );
    } catch (e) {
      console.log(g.pl.padEnd(20), 'BLAD:', e.message);
    }
    // xeno-canto prosi o rozsadne tempo zapytan — jedno na sekunde wystarczy dla 15 gatunkow.
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.writeFileSync(WYNIK_PLIK, JSON.stringify(wyniki, null, 2), 'utf8');
  console.log('\nZapisano', wyniki.length, 'wynikow do', WYNIK_PLIK);
  console.log('Nic nie zmieniono w library.json — to osobny krok po przejrzeniu wyniku.');
})();
