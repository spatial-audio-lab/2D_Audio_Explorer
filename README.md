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
- **Fala dźwięku** — pod nazwą wybranego źródła widać jego przebieg: gdzie jest cicho,
  gdzie głośno i w którym miejscu nagrania właśnie jesteś. Kursor jedzie w trakcie
  odsłuchu. Dźwięki strumieniowane z biblioteki fali nie mają — nie ma ich w pamięci.
- **Czas każdego źródła** — *Odtwarzanie: Loop / Raz* (tło grające bez końca albo
  pojedyncze zdarzenie) oraz suwak *Wejście*, czyli sekunda, w której dźwięk wchodzi.
  Wejście liczy się od zera, które stawia przycisk **▶ Wszystkie**; pojedyncze ▶ przy
  źródle na liście gra od razu i jest podglądem brzmienia, nie odtworzeniem sceny.
  Źródło, które czeka na swoją sekundę albo już wybrzmiało, **nadal jedzie po swojej
  trajektorii** — tak samo jak w eksporcie.
- **Pogłos przestrzeni** — konwolucyjny reverb z regulacją wielkości pomieszczenia
  i tłumienia, wspólny dla całej sceny. W eksporcie AmbiX pogłos zachowuje szerokość:
  lewy kanał idzie w lewo, prawy w prawo, po 0,5 — nie jest zwijany do mono w kanale W.
- **Opis i autorstwo sceny** — tytuł, opcjonalny numer, opis do 400 znaków, autor
  i licencja (CC0 / CC BY / CC BY-SA / CC BY-NC / wszystkie prawa zastrzeżone).
- **Atrybucja pojedynczego dźwięku** — autor, licencja i link do źródła przy każdym
  obiekcie. Dane z biblioteki wpisują się same, pliki wczytane ręcznie uzupełnia
  użytkownik. Wszystko trafia do metadanych i do `_SCENA.json`.
- **Projekt roboczy** — sekcja 6 zapisuje układ sceny do pliku `.sal.json` i wczytuje go
  z powrotem. Osobno działa **autozapis** w pamięci przeglądarki: po ponownym otwarciu
  strony na dole płótna czeka pasek „Wróć do niej". Szczegóły niżej.
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

### Głośność nagrania — mierzona, nie zmieniana

Eksport podaje **głośność scaloną w LUFS** (ITU-R BS.1770-4) i **szczyt próbkowy w dBFS**
— w `_META.txt`, w polu `loudness` w `_SCENA.json` i w wierszu postępu przy generowaniu.

To jest **pomiar, nie korekta**. Dźwięk w plikach nie jest ruszany (`applied: false`),
bo wyrównanie głośności jest decyzją o tym, gdzie nagranie trafi: podcast celuje zwykle
w −16 LUFS, audiobook w standardzie ACX w −23…−18 dB RMS przy szczycie poniżej −3 dBFS.
Różnicę do celu dodaje się w narzędziu, którym składa się odcinek.

Szczyt jest **próbkowy**, a nie *true peak*: między próbkami przebieg może iść nieco
wyżej. Nazwa w plikach mówi to wprost, żeby nikt nie brał jednego za drugie.

Mierzony jest tor **binauralny**, bo to jest plik, który się publikuje. Przy AmbiX
głośność zależy od dekodera po drugiej stronie.

## Projekt roboczy — żeby scena przeżyła zamknięcie karty

Sekcja **6. Projekt** ma dwa przyciski i jedną linijkę stanu.

- **Zapisz projekt** pobiera plik `.sal.json` z pozycjami, ruchem, wejściami, pogłosem
  i wszystkimi polami okna eksportu.
- **Wczytaj projekt** przywraca to z powrotem.
- **Autozapis** trzyma ostatni stan w pamięci przeglądarki i sam się odzywa po ponownym
  otwarciu strony — paskiem na dole płótna. Nie działa w trakcie odsłuchu (źródło w ruchu
  ma inne współrzędne w każdej klatce, więc zapis z takiej chwili byłby pozycją z połowy
  obiegu) i **nigdy nie nadpisuje zapisu pustą sceną**.

**Czego w projekcie nie ma: dźwięków.** Plik audio z dysku waży dziesiątki megabajtów,
a przeglądarka i tak nie odczyta go ponownie bez wskazania przez człowieka (File System
Access API nie działa z `file://`). Projekt zapamiętuje więc **nazwę pliku** i po wczytaniu
pokazuje bursztynową ramkę: *„2 dźwięki czekają na pliki z Twojego komputera"* — z guzikiem
**Wskaż pliki**. Dopasowanie idzie po nazwie; plik, który do niczego nie pasuje, wchodzi
do sceny jako nowy dźwięk, zamiast zniknąć bez słowa.

Dźwięki z **Biblioteki SAL** wracają same — wystarczy ich identyfikator.

Projekt zapisany **przed** wskazaniem brakujących plików nie gubi tych dźwięków: wracają
do pliku razem z resztą, na swoje miejsca w kolejności.

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
| `js/55-sceny-demo.js` | gotowe sceny z `sceny-demo.json` — trzy przyciski w sekcji 1 |
| `js/60-panel.js` | prawy panel: **rejestr kontrolek**, lista źródeł, liczniki |
| `js/70-pasek.js` | pasek marki, modale Pomoc / O projekcie, klawiatura |
| `js/80-ruch.js` | mysz i dotyk, ruch źródeł, symulacja trajektorii |
| `js/84-fala.js` | fala wybranego dźwięku i kursor odtwarzania w panelu |
| `js/85-rysowanie.js` | pętla klatek, scena i mapa w rogu |
| `js/90-eksport.js` | kodowanie WAV, obwiednia głośności, pomiar głośności, `exportScene()` |
| `js/95-projekt.js` | zapis projektu `.sal.json`, wczytanie i autozapis w przeglądarce |
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
{ nazwa:'wysokosc', telefon:false, typ:'suwak', wej:'heightSlider', pole:'heightVal',
  zasieg:'zrodlo', skala:0.1, pusta:0, format:v=>v.toFixed(1)+'m',
  czyta:s=>s.height||0,
  pisze:(s,v)=>{ s.height=v; updPanners(s); } }
```

`zasieg` rozstrzyga, czego kontrolka dotyczy: `'zrodlo'` — wybranego dźwięku (wtedy
`czyta`/`pisze` dostają źródło, a `pusta` mówi, co pokazać, gdy nic nie jest zaznaczone);
`'scena'` — całej sceny, jak master i pogłos. `skala` przelicza surową wartość suwaka na
jednostki modelu. Obok są dwie mniejsze tablice: `WIDOCZNOSC` (kiedy sekcja się otwiera
albo gaśnie) i `WSKAZNIKI` (podpisy stanu w nagłówkach podsekcji).

`telefon` jest **obowiązkowe** i mówi, czy kontrolka zostaje w skróconym panelu poniżej
900 px. Dziś jest ich jedenaście z dwudziestu dwóch; reszta czeka pod przyciskiem
«Pokaż wszystkie ustawienia». `_diag-telefon.js` nie przepuści opisu bez tego pola —
„zapomniałem” i „świadomie schowałem” wyglądają w kodzie tak samo, więc decyzja musi
być jawna. Podsekcje i bloki markupu, których rejestr nie zna (atrybucja, 3.1, 4.1,
sekcja 5), wylicza obok `POJEMNIKI_POZA_TELEFONEM`.

Po zmianie uruchom `harness-panel.js` — sprawdza między innymi, czy **każdy** suwak
w panelu ma swój opis w rejestrze — oraz `_diag-telefon.js`.

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


