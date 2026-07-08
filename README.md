# SAL — Spatial Audio Lab

Aplikacja webowa do budowania scen dźwięku przestrzennego (binauralnego) w przeglądarce — rozstawiasz dźwięki w przestrzeni 2D, chodzisz po niej na słuchawkach i eksportujesz gotową scenę do plików audio. Całość działa jako pojedynczy plik `index.html` (bez instalacji, bez backendu) i jest hostowana przez GitHub Pages:

https://spatial-audio-lab.github.io/2D_Audio_Explorer/

## Możliwości

- **Import dźwięków** — przeciągnij własne pliki audio albo skorzystaj z wbudowanej biblioteki darmowych dźwięków z Freesound.org (`library.json`), z wyszukiwarką i podziałem na kategorie.
- **Dwa tryby pracy** — *Edycja* (rozstawianie źródeł na płaszczyźnie) i *Eksploracja* (chodzenie po scenie klawiszami WASD/strzałkami, z pełnym efektem przestrzennym na słuchawkach).
- **Ustawienia każdego źródła z osobna** — głośność, wysokość (elewacja góra/dół), szerokość stereo (rozciągnięcie dźwięku na obszar zamiast punktu) i tryb *W przestrzeni* / *Bezpośrednio* (np. dla lektora czy muzyki w tle, która nie ma być częścią sceny).
- **Ruch źródeł w czasie** — dźwięk może krążyć po orbicie, błądzić losowo albo poruszać się po narysowanej trasie (`Shift`+klik dodaje punkty ścieżki).
- **Pogłos przestrzeni** — generowany konwolucyjny reverb z regulacją wielkości pomieszczenia i tłumienia, wspólny dla całej sceny.
- **Eksport sceny (4 pliki naraz)** — binauralny WAV (do zwykłego odsłuchu na słuchawkach), AmbiX WAV (4-kanałowy format ambisoniczny do dalszej obróbki w innych narzędziach/VR), mapa sceny jako JPG oraz plik tekstowy z pełnymi metadanymi — przydatne np. do dokumentacji czy sprawozdań.
- **Dostępność** — powiększone rozmiary czcionek i większe cele klikania, podniesiony kontrast kolorów, widoczny fokus klawiatury i pełna obsługa klawiaturą (Tab/Enter/Spacja) także dla elementów typu akordeon.
- **Pomoc w trzech zakładkach** — *Podstawy* (prosty przewodnik bez żargonu dla osób, które pierwszy raz się z tym stykają), *Zaawansowane* (praktyczne wyjaśnienie każdego elementu interfejsu) i *Słownik* (najważniejsze pojęcia związane z dźwiękiem przestrzennym).

## Sterowanie

| Klawisz | Akcja |
|---|---|
| `W` `A` `S` `D` / strzałki | ruch w trybie Eksploracja |
| `Q` `E` | obrót |
| `Space` | odtwórz/zatrzymaj zaznaczone źródło |
| `Shift` + klik | dodaj punkt trasy (tryb ruchu „Ścieżka”) |

Kliknięcie kompasu (prawy górny róg canvasu) wyśrodkowuje scenę i ustawia słuchacza z powrotem na północ.

## Uruchomienie lokalnie

Żaden build ani serwer nie jest potrzebny — wystarczy otworzyć `index.html` w przeglądarce, albo dla pewności odpalić dowolny lokalny serwer statyczny, np.:

```
python -m http.server 8080
```

## Publikacja na GitHub Pages

Repozytorium zawiera `index.html` i `library.json` w katalogu głównym — wystarczy włączyć GitHub Pages w Settings → Pages → Source: wybrana gałąź. Dźwięki z biblioteki są streamowane z CDN Freesound, więc same pliki audio nie muszą być częścią repozytorium.
