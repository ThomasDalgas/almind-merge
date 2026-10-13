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
- Fem kontinuerlige spilsekunder over topgrænsen afslutter runden. Pause, skjult fane og brikværksted fryser simuleringen.

## Filer

`dist/game.js`: fysik, rendering, input og brikværksted. `dist/rules.js`: rene regler. `dist/theme.js`: tegning og tema-lagring. `dist/style.css`: responsivt layout. `dist/assets/`: lokal fysikmotor, polygonopdeling, Mor Tina og licenser. `dist/shapes.js`: silhuetsporing og kantede pladsholdere.

`?test=1` tilføjer en lokal testgrænseflade på `window.__mergeTest` til reproducerbare browsertests. Almindelige besøg har ikke denne grænseflade.

## Kontrol af polygonfysik

Med den lokale server kørende: `node tests/browser.mjs` og `node tests/polygon-browser.mjs` (Playwright fra .qa samt installeret Chrome). Sidstnævnte kontrollerer Tinas konkave form, 64+64→128, en åben fordybning med blokerende kant samt billedets justering ved rotation.

## GitHub Pages

Spil: https://thomasdalgas.github.io/almind-merge/

Push til main kører npm test og publicerer dist/ automatisk. Rekorder er lokale for browser og domæne.
