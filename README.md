# Almind-Merge

Et selvstændigt HTML5 merge-spil med original canvas-grafik og genererede lyde. Ingen grafik, lyd eller kode fra Brainrot Merge er genbrugt. Spillereglerne er implementeret ud fra den fokuserede analyse af build 25060601; fysik og udtryk er en selvstændig fortolkning.

## Kør lokalt

`npm start` og åbn http://localhost:4173. Ingen npm-installation eller build er nødvendig. `npm test` tester spillereglerne. Matter.js 0.20.0 er med som lokal MIT-licenseret fil.

## Figurer

Den offentlige udgave bruger familiens faste 11 figurer. Brikværksted og import/eksport er fjernet. Rekorder gemmes lokalt i browseren. Grafik og lyd kan ændres i kildekoden.

## Regler

- Typer 0–10; værdi `2 ** (type + 1)`.
- Samme type + samme type → næste type i midtpunktet. Svend (type 10, 2048) er sidste brik og merger ikke videre.
- Point ved drop er den droppede briks værdi; point ved merge er resultatets værdi.
- De første fire drops er type 0. Derefter vælges næste type fra `[0, min(max(maxTier, 3), 5))`.
- Minimum 0,5 sekund mellem drops.
- 15 kontinuerlige spilsekunder over topgrænsen afslutter runden. Pause, skjult fane og brikværksted fryser simuleringen.

## Filer

`dist/game.js`: fysik, rendering, input og brikværksted. `dist/rules.js`: rene regler. `dist/theme.js`: tegning og tema-lagring. `dist/style.css`: responsivt layout. `dist/assets/`: lokal fysikmotor, polygonopdeling, Mor Tina og licenser. `dist/shapes.js`: silhuetsporing og kantede pladsholdere.

`?test=1` tilføjer en lokal testgrænseflade på `window.__mergeTest` til reproducerbare browsertests. Almindelige besøg har ikke denne grænseflade.

## Kontrol af polygonfysik

Med den lokale server kørende: `node tests/browser.mjs` og `node tests/polygon-browser.mjs` (Playwright fra .qa samt installeret Chrome). Sidstnævnte kontrollerer Tinas konkave form, 64+64→128, en åben fordybning med blokerende kant samt billedets justering ved rotation.

## GitHub Pages

Spil: https://thomasdalgas.github.io/almind-merge/

Push til main kører npm test og publicerer dist/ automatisk. Lokal rekord bevares i browseren. Fælles highscore er tilsluttet Supabase; se [opsætning og status](supabase/README.md).

## Hjælpemidler

Hver runde starter med én Ryst og én Fjern. Ved 6.000 point gives én Fjern, ved 12.000 én Ryst, ved 18.000 én Fjern osv. Ryst giver bunken et kort fysisk skub; Fjern vælges og bruges ved at trykke på en brik. Tomme tryk bruger ingen ladning. Tryk Fjern igen for at annullere. Hjælpemidler nulstilles ved en ny runde.

## Telefon, iPad og hjemmeskærm

Start spil forsøger at åbne dokumentet i fuldskærm og låse orienteringen til portrait på touch-enheder. Native API-kald er valgfrie; afvisning stopper ikke spillet. Hvis en aktiv mobilrunde vises i landscape, pauses fysik og fare-timer, og en vend-skærmen-besked vises. Tilbage i portrait fortsættes med Spil videre. Pause giver adgang til resten af siden.

Aktivt spil bruger den tilgængelige dynamiske viewport med safe-area-plads. Pinch og dobbelttryk begrænses med viewport, touch-action og gesture-fallback. Browserens og styresystemets tilgængelighedsindstillinger kan stadig tilsidesætte zoombegrænsning.

Safari: Del → Føj til hjemmeskærm. Manifest og Apple-metadata åbner spillet som standalone; Apple-ikonet er 180×180 og manifestikonet 512×512. Begge bruger det eksisterende familielogo på en uigennemsigtig baggrund. Et tidligere gemt gråt ikon skal typisk fjernes og tilføjes igen. Ingen offline/service-worker-cache er tilføjet.

`GAME_TEST_URL=http://127.0.0.1:4188 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/mobile-display-browser.mjs` tester seks touch-viewports, drag, tofinger-input, landscape-pause, tilbagevenden, menuscroll og desktop. Native fullscreen/orientation-kald testes med understøttet/afvist API-simulering; de erstatter ikke en fysisk Safari-enhedstest. Testen blokerer online Supabase-kald.


## Almind Artilleri

Det nye HTML5-artillerispil findes på https://thomasdalgas.github.io/almind-merge/artilleri/ . Spilfilerne ligger i `dist/artilleri/`, og den fælles profil bruges via Supabase. Onlinekampe kræver migration `supabase/migrations/202610160001_artillery.sql` (aktiveret 16. oktober 2026).
