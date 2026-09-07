// wpisz-ptaki-do-biblioteki.js — wpisuje narzedzia/ptaki-wynik.json (wynik
// pobierz-ptaki-xc.js, juz przejrzany) do library.json jako nowy dzial "Ptaki".
// Osobny krok od pobierania celowo — pobieranie samo nie zmienia zadnego pliku danych.
//
// Uzycie: node narzedzia/wpisz-ptaki-do-biblioteki.js

const fs = require('fs');
const path = require('path');

const WYNIK_PLIK = path.join(__dirname, 'ptaki-wynik.json');
const LIBRARY_PLIK = path.join(__dirname, '..', 'library.json');

if (!fs.existsSync(WYNIK_PLIK)) {
  console.error('Brak narzedzia/ptaki-wynik.json — uruchom najpierw pobierz-ptaki-xc.js.');
  process.exit(1);
}

// Nazwy polskie gatunkow slyszalnych w tle (pole 'also' z xeno-canto) — zmierzone
// wobec nomenklatury PTO tam, gdzie to ptak; Pteronemobius heydenii jest owadem
// (swierszcz), wiec zostaje ogolna nazwa polska plus lacinska w nawiasie.
const NAZWY_TLA = {
  'Anser anser': 'gęgawa',
  'Streptopelia decaocto': 'sierpówka',
  'Passer domesticus': 'wróbel',
  'Coloeus monedula': 'kawka',
  'Pteronemobius heydenii': 'świerszcz (Pteronemobius heydenii)',
};

const PODDZIALY = {
  ptaki_lesne: { label: 'Ptaki leśne', icon: '◦' },
  ptaki_wodne: { label: 'Ptaki wodne', icon: '≋' },
  ptaki_miejskie: { label: 'Ptaki miejskie', icon: '⊕' },
};

function parsujCzasTrwania(mmss) {
  const [m, s] = String(mmss || '0:00').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

function zbudujLicencje(lic) {
  const url = lic || '';
  if (/publicdomain\/zero/.test(url)) {
    return { short: 'CC0', commercial: true, attribution: false, url };
  }
  const m = url.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  const skrot = m ? `CC ${m[1].toUpperCase().replace(/-/g, ' ')} ${m[2]}` : 'CC ?';
  return { short: skrot, commercial: !/nc/i.test(url), attribution: true, url };
}

const wyniki = JSON.parse(fs.readFileSync(WYNIK_PLIK, 'utf8'));
const library = JSON.parse(fs.readFileSync(LIBRARY_PLIK, 'utf8'));

const poddzialySounds = { ptaki_lesne: [], ptaki_wodne: [], ptaki_miejskie: [] };

for (const r of wyniki) {
  const n = r.nagranie;
  const g = r.gatunek;
  const tlo = (n.also || []).map(l => NAZWY_TLA[l] || l);
  const label = tlo.length ? `${g.pl} (w tle: ${tlo.join(', ')})` : g.pl;
  const tags = [g.pl.toLowerCase(), `${g.gen} ${g.sp}`.toLowerCase(), ...tlo];
  poddzialySounds[g.pod].push({
    id: `xc_${n.id}`,
    label,
    file: null,
    preview_url: `https://xeno-canto.org/${n.id}/download`,
    source: 'xeno-canto',
    source_url: `https://xeno-canto.org/${n.id}`,
    author: n.rec || 'nieznany',
    duration: parsujCzasTrwania(n.length),
    channels: null,
    type: 'mp3',
    samplerate: null,
    tags,
    license: zbudujLicencje(n.lic),
    defaultVolume: 0.7,
    category: g.pod,
    has_local: false,
    has_stream: true,
  });
}

const dzialPtaki = {
  id: 'ptaki',
  label: 'Ptaki',
  icon: '◈',
  subcategories: Object.entries(PODDZIALY).map(([id, def]) => ({
    id, label: def.label, icon: def.icon, sounds: poddzialySounds[id],
  })),
};

// Dopisujemy dzial na koncu listy, nie nadpisujac istniejacych 75 dzwiekow.
library.categories.push(dzialPtaki);
library.total_sounds = (library.total_sounds || 0) + wyniki.length;
library.stats = library.stats || {};
library.stats.stream_only = (library.stats.stream_only || 0) + wyniki.length;
library.generated = new Date().toISOString();

fs.writeFileSync(LIBRARY_PLIK, JSON.stringify(library, null, 2), 'utf8');
console.log('Dopisano', wyniki.length, 'dzwiekow do library.json w dziale "Ptaki".');
console.log('total_sounds:', library.total_sounds);
