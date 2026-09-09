---
paths:
  - "js/**/*.js"
---

# Reguły skryptów Sceny

Ładuje się tylko, gdy dotykasz plików w `js/`. Pełny kontrakt kolejności i mapa
funkcji: `..\CLAUDE.md` w tym repo.

- **Kolejność `<script>` w `index.html` jest kontraktem** — plik korzysta tylko
  z tego, co zadeklarowały pliki przed nim; `99-init.js` zawsze ostatni.
- **Przed nową funkcją sprawdź kolizję nazw:** `grep -rc 'nazwaFunkcji' js/ index.html`.
  Deklaracje się hoistują, kolizja wygrywa po cichu, bez błędu w konsoli.
- **Przestrzeń nazw jest globalna celowo** — harness sięga po `S`, `exportScene`,
  `createFromBuffer`. Nie zamykaj w moduł ani IIFE bez pytania.
- Po edycji: `node --check` na każdym pliku + kontrola cudzysłowów typograficznych
  (polecenia w `..\CLAUDE.md`).
