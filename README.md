![Zestawienie logotypów KPO, RP i UE](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/KPO.jpg)

# Scena — scenografia dźwiękowa

Warsztat do budowania scen dźwięku przestrzennego w przeglądarce: rozstawiasz dźwięki
wokół słuchacza na płaszczyźnie 2D, chodzisz po scenie na słuchawkach i eksportujesz
gotowy materiał do pięciu plików. Statyczne pliki, żadnego kroku budowania — bez
instalacji, bez backendu, bez konta. Część zestawu narzędzi **Spatial Audio Lab**.

**Na żywo:** https://spatial-audio-lab.github.io/2D_Audio_Explorer/

> Repozytorium nazywa się `2D_Audio_Explorer` z powodów historycznych; aplikacja nazywa
> się **Scena**. Wcześniejsze nazwy („2D Audio Explorer", „Scenografia dźwiękowa 2D")
> wyszły z użycia.

## Możliwości

- **Import dźwięków** — przeciągasz własne pliki albo korzystasz z wbudowanej biblioteki
  (`library.json`) z wyszukiwarką i podziałem na kategorie.
- **Dwa tryby pracy** — *Edycja* (rozstawianie źródeł na płaszczyźnie) i *Eksploracja*
  (chodzenie po scenie klawiszami WASD/strzałkami, z pełnym efektem przestrzennym).
- **Ustawienia każdego źródła z osobna** — głośność, elewacja, szerokość stereo oraz tryb
  *W przestrzeni* / *Bezpośrednio* (dla lektora albo muzyki, która nie ma być częścią sceny).
- **Ruch źródeł w czasie** — orbita, błądzenie losowe albo narysowana trasa
  (`Shift`+klik dodaje punkty ścieżki).
- **Pogłos przestrzeni** — konwolucyjny reverb z regulacją wielkości pomieszczenia
  i tłumienia, wspólny dla całej sceny. W eksporcie AmbiX pogłos zachowuje szerokość:
  lewy kanał idzie w lewo, prawy w prawo, po 0,5 — nie jest zwijany do mono w kanale W.
- **Opis i autorstwo sceny** — tytuł, opcjonalny numer, opis do 400 znaków, autor
  i licencja (CC0 / CC BY / CC BY-SA / CC BY-NC / wszystkie prawa zastrzeżone).
- **Atrybucja pojedynczego dźwięku** — autor, licencja i link do źródła przy każdym
  obiekcie. Dane z biblioteki wpisują się same, pliki wczytane ręcznie uzupełnia
  użytkownik. Wszystko trafia do metadanych i do `_SCENA.json`.
- **Pomoc w trzech zakładkach** — *Podstawy*, *Zaawansowane* oraz **Banki dźwięków**
  (Freesound, radio aporee, Pixabay, Mixkit, BBC Sound Effects — z warunkami licencyjnymi
  każdego serwisu).
- **Dostępność** — powiększone czcionki i cele klikania, podniesiony kontrast, widoczny
  fokus klawiatury, pełna obsługa klawiaturą także dla akordeonów.

## Eksport — jedno archiwum, pięć plików w środku

| Plik | Do czego |
|---|---|
| `…_BINAURAL.wav` | zwykły odsłuch na słuchawkach, najostrzejszy kierunkowo |
| `…_AMBIX.wav` | 4-kanałowy format ambisoniczny do dalszej obróbki i do **Sfery** |
| `…_MAPA.jpg` | mapa sceny jako obraz — **czarno-biała, do druku**; źródła w ruchu mają narysowaną trasę ze strzałkami kierunku |
| `…_META.txt` | pełne metadane tekstem, z autorami i licencjami wszystkich dźwięków |
| `…_SCENA.json` | nazwy, pozycje (az/el) i obwiednie głośności — czyta to **Sfera** |

**Pozycja w mapie, w META i w polach `az/el/dist` JSON-a to POCZĄTEK NAGRANIA**, czyli
pierwsza klatka trajektorii — a nie miejsce, w którym stało źródło w chwili kliknięcia
„Eksportuj". Dla źródła w ruchu to dwie różne rzeczy: jeśli scena grała podczas eksportu,
punkt na ekranie jedzie dalej po orbicie, a nagranie i tak zaczyna się od suwaka **Start**.

Numer sceny jest opcjonalny: wyłączony, znika z nazw plików, z nagłówka mapy,
z metadanych i z JSON-a.

## Współpraca ze Sferą

**Sfera** (repozytorium `ambi`) odtwarza `…_AMBIX.wav` razem z `…_SCENA.json` i rysuje
na kuli podpisane, pulsujące punkty dokładnie tam, gdzie źródła stały na mapie. Pozycje
`az`/`el` w JSON-ie powstają w tej samej pętli i z tej samej funkcji co kodowanie AmbiX,
więc nie ma dwóch implementacji, które mogłyby się rozjechać.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| `W` `A` `S` `D` / strzałki | ruch w trybie Eksploracja |
| `Q` `E` | obrót |
| `Space` | odtwórz/zatrzymaj zaznaczone źródło |
| `Shift` + klik | dodaj punkt trasy (tryb ruchu „Ścieżka") |

Skróty milkną, gdy kursor stoi w polu edytowalnym — spacja w polu opisu wpisuje odstęp,
a nie zatrzymuje odtwarzanie. Kliknięcie kompasu (prawy górny róg) wyśrodkowuje scenę
i ustawia słuchacza z powrotem na północ.

## System wizualny

Zgodny z **SAL Design Manifest v3.0**: baza neutralna (#0A0C08 / #12150F / #F0EBE0),
akcenty semantyczne — **cyan #00E5CC** (sygnał aktywny / fokus), **amber #FFAB00**
(tytuły sekcji, ambisonia), **crimson #FF3355** (stop / błąd). Typografia:
Lexend + Azeret Mono. Kolor marki Hubu (acid #BEFF00) nie występuje w aplikacji.

Górny pasek marki (ikona SAL, `← SAL`, dioda stanu, nazwa, opis) jest wspólny dla
wszystkich narzędzi laboratorium. Ikona ładuje się z `/assets/brand/` repozytorium
portalu — wszystkie aplikacje siedzą pod tym samym originem, więc jest jedno miejsce
aktualizacji i zero duplikatów binariów.

Transport: w ciszy przycisk odtwarzania ma ramkę cyan, w trakcie grania pełne wypełnienie,
a przycisk zatrzymania dostaje ramkę crimson, która po zatrzymaniu gaśnie do neutralnej.

## Uruchomienie lokalnie

Build nie jest potrzebny. Otwarcie `index.html` prosto z dysku wczytuje style i cały kod
— arkusz i skrypty idą przez zwykłe znaczniki `<link>` i `<script src>`, które protokół
`file://` obsługuje. **Nie zadziała wtedy tylko Biblioteka SAL**: czyta `library.json`
przez `fetch`, a tego przeglądarka na `file://` blokuje polityką CORS. To świadomie
zostawione tak, jak jest — Biblioteka jest funkcją wersji na GitHub Pages. Własne pliki
z dysku wczytuje się normalnie, przyciskiem «Twój komputer» w panelu 01.

Żeby mieć również Bibliotekę, wystarczy dowolny serwer statyczny:

```
python -m http.server 8080
```

### Struktura źródeł

Kod jest rozłożony na klasyczne skrypty — bez modułów ES, bo te nie działają z `file://`,
i bez kroku składania. Przestrzeń nazw pozostaje globalna, tak jak przed rozbiciem, więc
harness pomiarowy sięga po `S`, `exportScene` i `createFromBuffer` bez żadnej warstwy
pośredniej.

| Plik | Co trzyma |
|---|---|
| `css/sal.css` | cały arkusz stylów |
| `js/00-audio.js` | kontekst audio, szyna master, pogłos konwolucyjny |
| `js/10-stan.js` | stan sceny `S` i uchwyty do elementów DOM |
| `js/20-ui.js` | toast, okno potwierdzenia, akordeon |
| `js/30-widok.js` | skalowanie płócien, przełącznik Edycja / Eksploracja |
| `js/40-biblioteka.js` | Biblioteka SAL: lewy panel, drzewo `library.json`, szukanie, wstawianie |
| `js/50-zrodlo.js` | model źródła i jego graf węzłów, routing, słuchacz |
| `js/60-panel.js` | prawy panel: **rejestr kontrolek**, lista źródeł, liczniki |
| `js/70-pasek.js` | pasek marki, modale Pomoc / O projekcie, klawiatura |
| `js/80-ruch.js` | mysz i dotyk, ruch źródeł, symulacja trajektorii |
| `js/85-rysowanie.js` | pętla klatek, scena i mapa w rogu |
| `js/90-eksport.js` | kodowanie WAV, obwiednia głośności, `exportScene()` |
| `js/99-init.js` | start aplikacji — **musi zostać ostatni** |

**Kolejność wczytywania jest kontraktem.** Prefiksy numeryczne odpowiadają kolejności
znaczników `<script>` na końcu `index.html`: plik może korzystać z tego, co zadeklarowały
pliki przed nim, ale nie odwrotnie. Nowy plik wstawia się z numerem pasującym do miejsca
w tej kolejności.

### Jak dodać kontrolkę do prawego panelu

Kontrolka jest opisana **w jednym miejscu** — w tablicy `KONTROLKI` na górze
`js/60-panel.js`. Z jednego opisu wynika wartość początkowa, format podpisu, zapis do
modelu, reset przy braku zaznaczenia i wygaszanie. Nasłuchy są delegowane z całego panelu,
więc nowa kontrolka nie potrzebuje własnego `addEventListener`.

Nowy suwak to jeden wiersz HTML w sekcji panelu i jeden obiekt:

```js
{ nazwa:'wysokosc', typ:'suwak', wej:'heightSlider', pole:'heightVal', zasieg:'zrodlo',
  skala:0.1, pusta:0, format:v=>v.toFixed(1)+'m',
  czyta:s=>s.height||0,
  pisze:(s,v)=>{ s.height=v; updPanners(s); } }
```

`zasieg` rozstrzyga, czego kontrolka dotyczy: `'zrodlo'` — wybranego dźwięku (wtedy
`czyta`/`pisze` dostają źródło, a `pusta` mówi, co pokazać, gdy nic nie jest zaznaczone);
`'scena'` — całej sceny, jak master i pogłos. `skala` przelicza surową wartość suwaka na
jednostki modelu. Obok są dwie mniejsze tablice: `WIDOCZNOSC` (kiedy sekcja się otwiera
albo gaśnie) i `WSKAZNIKI` (podpisy stanu w nagłówkach podsekcji).

Po zmianie uruchom `harness-panel.js` — sprawdza między innymi, czy **każdy** suwak
w panelu ma swój opis w rejestrze.

## Publikacja na GitHub Pages

Repozytorium zawiera `index.html`, `library.json` oraz katalogi `css/`, `js/` i
`assets/` — wystarczy włączyć
GitHub Pages w Settings → Pages → Source: wybrana gałąź. Dźwięki z biblioteki są
streamowane z CDN Freesound, więc same pliki audio nie muszą być częścią repozytorium.
---


# O projekcie

[![Baner SAL](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/assets/brand/SAL_logo-wordmark.png)](https://spatial-audio-lab.github.io/)

## Spatial Audio Lab: archiwum VR dla edukacji teatralnej
„Spatial Audio Lab” to projekt stypendialny skupiony na tworzeniu profesjonalnego archiwum dźwięku przestrzennego. W ramach działań powstaje baza nagrań w technologii Virtual Reality (VR), która łączy nowoczesną inżynierię dźwięku z edukacją teatralną i technikami uważności (mindfulness).

[https://spatial-audio-lab.github.io/](https://spatial-audio-lab.github.io/)

---

## Finansowanie

![Zestawienie logotypów KPO, RP i UE](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/KPO.jpg)

## Informacja o finansowaniu

Projekt jest realizowany w ramach programu stypendialnego Krajowego Planu Odbudowy i Zwiększania Odporności (KPO).

- **Program:** Inwestycja A2.5.1: Program wspierania działalności podmiotów sektora kultury i przemysłów kreatywnych na rzecz stymulowania ich rozwoju.
- **Instytucja Wspierająca:** Narodowy Instytut Muzyki i Tańca (NIMiT).
- **Wartość dofinansowania z Unii Europejskiej (NextGenerationEU):** 36 000,00 zł brutto.
- Umowa nr **143/KPO.STYPENDIA/NIMIT/2025**.


