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
- Ugen begynder mandag kl. 00:00 i Europe/Copenhagen, inkl. sommertid. Afslutningstidspunkt på serveren bestemmer ugen.
- Samme score afgøres af tidligste afslutning, derefter stabil spiller-id-sortering.
- Kaldenavn 2–20 bogstaver/tal, mellemrum, bindestreg eller underscore. Navne er ikke unikke/verificerede. HTML fortolkes aldrig.
- Navnet og afsluttede runder bliver offentlige, når spilleren gemmer navnet/scoren. Identitet og navn huskes i browseren, ikke på tværs af enheder. Rydning af browserdata giver en ny profil.
- Eksisterende lokale rekorder uploades ikke. Kun nye runder med serverudstedt runde-id kan indsendes.
- Rundestart blokerer ikke spillet. Ved langsomt login venter indsendelsen kort på serverens ur, så legitime runder stadig består varighedskontrollen.
- Spillet virker uden net. Lokal rekord bevares. En mislykket indsendelse kan prøves igen, mens resultatet stadig vises; start af ny runde eller genindlæsning kasserer det ventende resultat.

## Kontrol og begrænsninger

RLS er slået til, og browserroller har ingen direkte tabeladgang. Skrivefunktioner kræver `auth.uid()`, låser pr. spiller/runde og kontrollerer ejerskab. Runde-id er unikt og indsendelse er idempotent. Maks. 60 rundestarter pr. time/spiller. Anonyme konti begrænses også af Supabase Auths konfigurerede IP-rate-limit.

Serveren genberegner point fra en log med drops, merges, fjern og ryst. Den kontrollerer antal tilgængelige brikker, tier-grænser, de første fire drops, dropinterval, bonusforbrug, rækkefølge, maksimal logstørrelse og varighed mod serverens ur. Der sendes ikke et frit klientvalgt pointtal.

Det er **plausibilitetskontrol til et familiespil, ikke snydesikker fysisk replay**. Scripts kan stadig konstruere gyldige hændelsesforløb. En ny browser kan oprette en ny anonym profil. Der er ikke CAPTCHA, egentlig login eller global botbeskyttelse i denne version.

## Moderation

Brug Supabases Table Editor som ejer, aldrig en adminnøgle i spillet:

- `am_rounds.hidden=true` skjuler en konkret runde. En tidligere lavere rekord kan derefter blive spillerens bedste.
- `am_players.blocked=true` skjuler spillerens resultater og afviser nye runder/indsendelser.
- Ret `am_players.nickname` for at moderere et navn. En ikke-blokeret spiller kan ændre navnet igen ved næste indsendelse.

Uafsluttede rundebilletter er ikke synlige på listen. Overvåg lagring og ryd gamle uafsluttede billetter op efter behov med ejeradgang.

## Lokale kontroller

`npm test` kører almindelige spilregler og klienttests. Database- og integrationstests kræver `@electric-sql/pglite`; Playwright og Chrome bruges til integrationstesten. Hold disse afhængigheder uden for iCloud.

```
PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/highscore-db.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/highscore-ranking.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/highscore-integration.mjs
```

Integrationstesten starter sin egen lokale HTTP-server på port 4186 og PostgreSQL i hukommelsen. Den skriver aldrig til online Supabase. Skærmbilledet i `/tmp/almind-highscores-mobile.png` viser kun lokale testdata.
