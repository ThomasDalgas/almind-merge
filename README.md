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

Det nye HTML5-artillerispil findes på https://almindgames.funken.dk/artilleri/ . Det har fotorealistiske tankaktiver og deterministisk tyngdekraft, kratere samt tanks der falder, glider og roterer. Spilfilerne ligger i `dist/artilleri/`, og den fælles profil bruges via Supabase. Onlinekampe kræver migration `supabase/migrations/202610160001_artillery.sql` (aktiveret 16. oktober 2026).


Artilleri-opdatering: landscape-visning låser siden under kampen; to fingre eller touchpad-rul styrer vinkel og kraft, tap/klik skyder. Sigtelinje optjenes hver 300 point. Vindflag og fotorealistiske træer er tilføjet.

### Almind-Merge versions and player-facing news
Update `dist/releases.js` with each relevant release: version, Danish date and a few short player-facing changes. Keep previous releases below the latest. Bump the release module and changed asset query versions in `dist/index.html` (and dependent imports). Keep the initial version button text aligned. Avoid implementation details in the notes.

Merge score dates use Europe/Copenhagen; `duration_ms` stores active round duration (excluding pauses). Existing rounds without this field show unknown duration. Apply `supabase/migrations/202610170003_merge_score_time.sql` to enable duration persistence and `am_leaderboard_v2`; old clients remain compatible.

### Kompakt rundelog (1.1.4)
Kør `supabase/migrations/202610180001_merge_round_log.sql` i Supabase SQL Editor. Migreringen kan køres igen og er kompatibel med klienter, der allerede spiller. Den opretter ingen ny tabel og bevarer rettighederne på `am_rounds`.

`round_log` indeholder kun serverberegnede antal drop, merges (inklusive Svend-par), Svend-par, Ryst og Fjern samt klientens version og afslutningsårsag. Ingen hændelsesrækker eller bevægelser gemmes. Eksisterende afsluttede runder får ikke opdigtede tal. Loggen vises kun gennem den eksisterende adminbeskyttede spilleroversigt. Gamle klienters afslutning kan stå som ukendt; en ikke afsluttet runde er ikke nødvendigvis aktiv.

Ved nye releases skal også `getVersion` i leaderboard.js opdateres; versionen fastholdes i hver rundes lokale journal, så en senere offlineupload beholder sin oprindelige version. Nye klienter bruger ét log-RPC pr. autosave. Mangler migreringen, falder de tilbage til den gamle gemning resten af sidevisningen.
