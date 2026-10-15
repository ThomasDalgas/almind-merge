# Fælles highscoreliste

Status: tilsluttet det separate Almind-Merge-projekt (`sxzncydqjdwnkmbypeeu`, eu-west-1). Migration, anonym adgang og en rigtig spilrunde med læsning fra en anden browser er verificeret 14. oktober 2026. Den tekniske prøverunde er skjult fra ranglisten.

## Opsætning i det separate Almind-Merge-projekt

1. Opret et Supabase-projekt i Europe. Databaseadgangskoden håndteres af ejeren; spillet bruger den aldrig.
2. Kør `supabase/migrations/202610140001_highscores.sql` én gang i SQL Editor.
3. Authentication → Sign In / Providers → slå **Anonymous Sign-Ins** til. Behold platformens rate limits. Projektet skal være isoleret fra Lager og andre apps.
4. Indsæt projektets URL og **publishable key** (alternativt legacy anon key) i `dist/score-config.js`. De er offentlige klientværdier. Brug aldrig secret/service_role eller databaseadgangskode.
5. Test en rigtig runde på en lokal server, og læs den fra en anden browser. Kontrollér derefter `npm test` og publicér via eksisterende GitHub Pages-workflow.

## Adfærd

- Top 10 for denne uge og alle tider. Kun bedste runde pr. anonym spillerprofil.
- Egen placering vises også uden for Top 10, når den browser har en profil.
- Ugen begynder mandag kl. 00:00 i Europe/Copenhagen, inkl. sommertid. Tidspunktet for seneste pointforbedring på serveren bestemmer ugen.
- Samme score afgøres af tidligste gemte pointforbedring, derefter stabil spiller-id-sortering.
- Kaldenavn 2–20 bogstaver/tal, mellemrum, bindestreg eller underscore. Navne er ikke unikke/verificerede. HTML fortolkes aldrig.
- Navnet og validerede rekorder bliver offentlige undervejs. Før første spil spørges efter navn i en modal. Identitet og navn huskes i browseren, ikke på tværs af enheder. Rydning af browserdata giver en ny profil.
- Eksisterende lokale rekorder uploades ikke. Kun nye runder med serverudstedt runde-id kan indsendes.
- Rundestart blokerer ikke spillet. Ved langsomt login venter indsendelsen kort på serverens ur, så legitime runder stadig består varighedskontrollen.
- Spillet virker uden net. Lokal rekord bevares. Hændelser gemmes straks i en lokal kø pr. runde. Hvert 15. sekund på en synlig side samt ved pause og afslutning forsøges upload. Afbrudte uploads genoptages ved genåbning eller genforbindelse. En ny runde kasserer ikke den gamle kø.

## Kontrol og begrænsninger

RLS er slået til, og browserroller har ingen direkte tabeladgang. Skrivefunktioner kræver `auth.uid()`, låser pr. spiller/runde og kontrollerer ejerskab. Runde-id er unikt og indsendelse er idempotent. Maks. 60 rundestarter pr. time/spiller. Anonyme konti begrænses også af Supabase Auths konfigurerede IP-rate-limit.

Serveren genberegner point fra en log med drops, merges, fjern og ryst. Den kontrollerer antal tilgængelige brikker, tier-grænser, de første fire drops, dropinterval, bonusforbrug, rækkefølge, maksimal logstørrelse og varighed mod serverens ur. Der sendes ikke et frit klientvalgt pointtal.

Det er **plausibilitetskontrol til et familiespil, ikke snydesikker fysisk replay**. Scripts kan stadig konstruere gyldige hændelsesforløb. En ny browser kan oprette en ny anonym profil. Der er ikke CAPTCHA, egentlig login eller global botbeskyttelse i denne version.

## Moderation

Brug Supabases Table Editor som ejer, aldrig en adminnøgle i spillet:

- `am_rounds.hidden=true` skjuler en konkret runde. En tidligere lavere rekord kan derefter blive spillerens bedste.
- `am_players.blocked=true` skjuler spillerens resultater og afviser nye runder/indsendelser.
- Ret `am_players.nickname` for at moderere et navn. En ikke-blokeret spiller kan ændre navnet igen ved næste indsendelse.

Uafsluttede runder med et valideret checkpoint er synlige på listen; tomme rundebilletter er ikke. Overvåg lagring og ryd gamle uafsluttede billetter op efter behov med ejeradgang.

## Lokale kontroller

`npm test` kører almindelige spilregler og klienttests. Database- og integrationstests kræver `@electric-sql/pglite`; Playwright og Chrome bruges til integrationstesten. Hold disse afhængigheder uden for iCloud.

```
PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/highscore-db.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/highscore-ranking.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/highscore-integration.mjs
```

Integrationstesten starter sin egen lokale HTTP-server på port 4186 og PostgreSQL i hukommelsen. Den skriver aldrig til online Supabase. Skærmbilledet i `/tmp/almind-highscores-mobile.png` viser kun lokale testdata.

## Spiller nu og beskeder

Migration `202610140002_live_players.sql` er anvendt på Almind-Merge-projektet. Livevisningen bruger de eksisterende browserprofiler og serverudstedte rundebilletter. Et RPC-kald opdaterer egen midlertidige session og returnerer spillere + rekordhændelser cirka hvert femte sekund under spil (15 sekunder ved pause). Der er ingen ekstra SDK eller websocket-afhængighed.

- Kun synlige, aktive runder annonceres. Pause, afslutning og skjult side sender en afmelding; ved afbrudt forbindelse udløber sessionen senest 20 sekunder efter sidste serveropdatering. Baggrundsfaner stopper polling.
- Navn hentes fra spillerens gemte kaldenavn, ellers et stabilt `Gæst XXXX`-navn. Livepoint er foreløbige og klientrapporterede; de kan aldrig indsættes som highscore via livefunktionen.
- Serveren kontrollerer rundeejerskab, værdigrænser, afslutning, skjulning og blokering. Begge nye tabeller har RLS og ingen direkte browseradgang. Midlertidige sessioner ryddes efter en times udløb, rekordhændelser efter et døgn ved næste relevante skrivning.
- Flere faner for samme profil vises som én spiller (senest startede aktive runde). Afmelding af en gammel runde fjerner ikke en nyere rundes session. Højst de 50 førende samt egen spiller vises; tælleren angiver samlet antal.
- Serverens checkpoint-/afslutningstrigger giver højst én besked pr. runde ved en **streng forbedring** af total- eller ugerekorden. Totalrekord har prioritet, lighed giver ingen besked. Ugen følger Europe/Copenhagen. Hændelser fra skjulte/blokerede spillere vises ikke.
- Første tilslutning/genforbindelse etablerer en baseline uden gamle velkomst-/rekordbeskeder. Senere hændelser vises i en fast plads over banen i 3 sekunder, derefter foldes de op. Ingen overlap med canvas eller flytning af banen. Køen er begrænset til tre ventende beskeder med rekordprioritet; pause tømmer den.
- Livefunktionen fejler uafhængigt af selve spillet. Ved forbindelsesfejl ryddes forældede spillere lokalt og der vises forbindelsesstatus.

Kontroller: `npm test` inkluderer netværksrækkefølge, forsinket billet, fejlet genstart samt beskedtiming/kø. `tests/live-db.mjs` bruger PGlite til ejerskab, udløb, flere faner, rekordhændelser og moderation. `tests/live-integration.mjs` bruger samme lokale database med to uafhængige browserprofiler og tester point, join/rekordbeskeder, pause, offline/genforbindelse og at banen ikke flyttes/dækkes. Begge bruger samme miljøvariabler som de øvrige database-/browsertests. En separat kontrol på online Supabase verificerede to midlertidige spillere og faktisk 20-sekunders udløb uden at indsende highscores.

## Løbende rekorder (migration 003)

Migration `202610140003_checkpoint_scores.sql` er anvendt af ejeren og API-verificeret 14. oktober 2026. Den tilføjer `saved_at` og `am_checkpoint_round`. Både checkpoints og slutresultater genberegnes med samme validator; et ældre checkpoint kan aldrig sænke scoren, og en afsluttet runde kan ikke ændres. Eksisterende rekorder bevares. Navne er stadig ikke unikke: forskellige enheder/profiler kan hedde Niklas uden at deres konti sammenlægges.

Kør `tests/checkpoint-db.mjs` og `tests/checkpoint-integration.mjs` med samme PGLite/Playwright-miljøvariabler. Sidstnævnte tester navnemodal, genbrug af identitet, gemning før Game Over og offline-genåbning.

## Unikke navne (004 — aktiveret)

Aktiveret af ejeren og API-kontrolleret 14. oktober 2026: de tre højeste rekorder er bevaret, de to lavere dubletter er væk fra listen, og profil-/navnefunktionerne afviser anonym adgang. Ved opsætning fra migration 003 køres **hele `supabase/apply-unique-names.sql` én gang**. Den indeholder både migration 004 og den ønskede oprydning; kør ikke 004 separat bagefter. Oprydningen bruger navn, point og tidspunkt fra den observerede liste, aldrig flytbare placeringer. Den skjuler de eksisterende runder for Niklas 7.138 og Thomas 10, så tidligere lavere runder ikke dukker op i stedet. Runderne kan gendannes af ejeren. Hvis de to observerede poster har ændret sig, afbrydes hele transaktionen til ny kontrol.

Et unikt databaseindeks beskytter navne uden forskel på store/små bogstaver og overflødige mellemrum. Ved gamle dubletter beholder profilen med højeste synlige score navnet; den anden skal vælge et nyt. Ingen konti eller point sammenlægges. Et nyt navn reserveres online før spilstart. Samme browser kan genbruge sit navn; på en anden enhed skal man vælge et ledigt navn, da spillet endnu ikke har login på tværs af enheder. Autosave bruger profilens aktuelle navn, så gamle køposter ikke kan omdøbe spilleren.

Databaseaktivering er verificeret før klientudgivelsen. Verificér med `tests/unique-names-db.mjs` og `tests/checkpoint-integration.mjs`. Begge er kørt lokalt med succes; de skriver ikke til produktion. Browseradgang til Supabase fejlede med timeout under denne ændring.

## Faste spillerkoder og Svend-par (005/006 — aktiveret)

Aktiveret af ejeren 14. oktober 2026. API-kontrollen bekræfter de nye kodefunktioner med korrekt afvisning af anonym adgang og fortsat læsning af eksisterende rekorder. Til opsætning eller genkørsel bruges hele `supabase/apply-player-codes-and-svend.sql`. Den er samlet i én transaktion og kan køres igen. Den indeholder migration 005 og 006; opret ikke kode-tabeller manuelt. Alle nye tabeller har RLS, og browserroller har ingen direkte adgang.

- Spilleren laver en fast, tilfældig kode med 10 hextegn fra sin eksisterende profil. Navn + kode tilknytter en anden browsers anonyme identitet til samme profil. Kun SHA-256 af koden gemmes. Koden udløber ikke; ny kode erstatter den gamle. Allerede tilknyttede enheder forbliver tilknyttet ved kodeskift.
- Koden er en adgangskode til profilen og vises kun ved oprettelse. Ingen e-mail eller loginudbyder kræves. Fem forsøg pr. browseridentitet pr. 15 minutter; tælleren gemmes også ved forkert kode. Nye anonyme konti er fortsat underlagt Supabase Auths rate limit. Det er en familieprofil, ikke stærk personverifikation.
- Samme profil får én highscoreplacering. Flere samtidige enheder kan spille hver sin runde. Livevisningen viser profilens senest startede aktive runde, ikke en sum. Gamle runder flyttes ikke ved profilskift: den oprettende enhed kan færdiggøre sin kø, men scoren bliver på den oprindelige profil.
- Klienten viser fælles bedste resultat og gemmer lokale rekorder separat pr. profil. Kodeskift til anden profil tilbydes på forsiden for at undgå at ændre spiller midt i runden.
- To Svend ved kontakt fjernes uden en ny brik og uden ekstra point. Merge-hændelsen valideres som forbrug af to tier-10-brikker. En anden rydning uden to nye Svend afvises.

Testet lokalt: `player-codes-db.mjs`, `svend-clear-db.mjs`, `svend-clear-browser.mjs`, `checkpoint-integration.mjs` med to browserkontekster, almindelige unit tests samt desktop-/mobilvisninger. Integrationstesten opretter koden, afviser en forkert kode, tilknytter en anden browser og kontrollerer fælles rekord efter genindlæsning.

## Forbrug og Thomas-sammenlægning (14. oktober 2026)

- Live: 5 sekunder under spil, 15 under pause, ingen løbende polling i skjulte faner. Tidligere var begge 3 sekunder.
- Checkpoint: 15 sekunder i synlig fane, samt straks ved pause, Game Over, sideskift, synlighedsskift og genforbindelse. Alle hændelser gemmes fortsat straks lokalt; uændrede logs uploades ikke igen. Tidligere var det 5 sekunder.
- Ranglisten opdateres automatisk hvert minut, kun når den er synlig og spillet ikke kører. Manuel Opdater, fokus, pause og genforbindelse opdaterer stadig straks. Tidligere var intervallet 15 sekunder.
- Ved kontinuerlig aktivitet falder de planlagte live-/checkpoint-kald fra højst cirka 1.920 til 960 pr. spilletime; livscykluskald og fejlgenforsøg kommer oveni. Det halverer ikke nødvendigvis faktureret egress, da svarstørrelser og trafik varierer.
- Den offentlige måling viste 312 byte i live-JSON med to deltagere og 502 byte i highscore-JSON med fire profiler. HTTP-overhead, Auth, andre projekter og månedstotal er ikke målt. Billeder/lyd ligger på GitHub Pages. Den fulde eventlog sendes ind til validering, men gemmes ikke i databasen; hvert checkpoint opdaterer samme runderække.
- Officielle Free-grænser kontrolleret: 500 MB database pr. projekt, 5 GB uncached egress pr. faktureringscyklus plus separat 5 GB cached egress. Egress er fælles på organisationsniveau. Se https://supabase.com/pricing og https://supabase.com/docs/guides/platform/manage-your-usage/egress . Faktisk forbrug kræver dashboardets Usage-tal.

Sammenlægningen er annulleret efter brugerens ændrede ønske. `merge-thomas-profiles.sql` stopper nu uden ændringer. Brug i stedet `rename-thomasmac.sql` (forberedt og testet, endnu ikke aktiveret): skjul den lave Thomas-profil på 18.662, og omdøb ThomasMac til Thomas. ThomasMacs identitet, kode, enheder og højeste score bevares; ingen runder eller enheder flyttes mellem profiler. Sidst observerede ThomasMac-rekord var 36.704. Test: `tests/rename-thomas-db.mjs`.

## Belønningsbeskeder og Svend-bonus (15. oktober 2026)

Klienten viser en 3-sekunders toast og en kort lyd ved optjente Fjern/Ryst. Flere belønninger fra samme scorehop samles; startbeholdningen udløser ingen besked. Toasten bruger det eksisterende område over banen, prioriteres over livebeskeder og ryddes ved pause, genstart og skjult fane. Lyd følger mute og spiller parallelt med andre effekter.

Migration `202610150008_svend_bonus.sql` tilføjer valideret bonus på **10.000 point** for to Svend. Den nye journalhændelse `b` kræver tier 10 og mindst to Svend i den serverberegnede beholdning. Begge forbruges, ingen ny brik skabes, og bonuspoint tæller mod næste Fjern/Ryst. Gamle `m`-hændelser med to Svend beholder nul bonus, så eksisterende klienter og offline-journaler fortsat valideres korrekt.

`am_game_rules()` annoncerer bonusunderstøttelse. Klienten aktiverer kun bonus i nye runder, hvis databasen har bekræftet den. Ved manglende migration/forbindelse bruges de gamle regler. Genindlæs efter SQL-installationen. Ingen gamle highscores genberegnes. Migrationen er forberedt og testet; afventer ejerens aktivering i Supabase.

Tests: `reward-notices.test.mjs`, `rules.test.mjs`, `rewards-browser.mjs`, `svend-clear-browser.mjs` og `svend-clear-db.mjs` dækker grænser, dubletter, kø/varighed, mute, mobil-layout, ny bonus samt gamle runder og afvisning af gentagen/forkert bonus.
