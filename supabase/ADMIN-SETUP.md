# AlmindGames administration

Adresse: https://almindgames.funken.dk/admin/

## Engangsopsætning

1. I det dedikerede Supabase-projekt, vælg **Authentication → Users → Add user → Create new user**. Opret `thomas@funken.dk` med en særskilt stærk admin-adgangskode, og vælg **Auto Confirm User**. Hvis samme bekræftede mailkonto allerede findes i projektets Auth, bruges den. Dashboardets egen Supabase-konto er ikke automatisk en Auth-bruger i projektet.
2. Kør hele `setup-admin.sql` i SQL Editor. Den installerer migration 007 og giver kun den bekræftede, ikke-anonyme mailbruger administratoradgang. Kan genkøres. Alle nye tabeller har RLS og er lukket for almindelige klienter. Ingen eksisterende spiller eller score ændres ved installationen. Ingen service-role-nøgle skal tilføjes hjemmesiden.
3. Log ind på adminsiden med mail og admin-adgangskode. Mailkode kræver følgende SMTP-opsætning.

## Mailkode via DanDomain

I Supabase **Authentication → Email / SMTP Settings**, aktivér **Custom SMTP**:

| Felt | Værdi |
|---|---|
| Sender email | thomas@funken.dk |
| Sender name | AlmindGames |
| Host | asmtp.dandomain.dk |
| Port | 587 |
| Username | thomas@funken.dk |
| Password | Mailboksens adgangskode, indtastes kun direkte i Supabase |

DanDomains almindelige mailhotel bruger STARTTLS. Exchange har andre serveroplysninger. Kilde: https://support.dandomain.dk/mail/dandomain-mail-2018/generel-pop3-opsaetningsinfo-2018/ . Supabase Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp .

I **Authentication → Email Templates → Magic Link**, indsæt indholdet af `admin-email.html`. Bevar `{{ .Token }}`. Login foregår med koden på siden, så der kræves ikke et link med login-token eller nye redirect-URL'er. Siden bruger `create_user:false`; kontoen skal være oprettet først. SMTP-opsætningen er fælles for projektets Auth-mails. Anonyme spillerlogins bruger ikke mail.

Test: tryk “Send login-kode”, modtag mailen og log ind med koden. Test også, at en almindelig spillerprofil ikke har adminadgang. Den lokale test kan ikke bekræfte maillevering eller produktionsopsætningen.

## Funktioner og grænser

- Søg i aktive/slettede profiler; 25 resultater pr. side. Manuel opdatering, ingen baggrundspolling.
- Rediger unikke spillernavne, se Almind-Merge-rekord og seneste 20 runder, antal enheder og ændringshistorik.
- Lav ny fast spillerkode uden at kende den gamle. Kun hash gemmes; koden vises én gang og fjernes fra siden ved logout, profilsøgning/-skift eller næste handling. Allerede tilknyttede enheder bevares ved kodeskift.
- “Slet fra spillet” er en reversibel deaktivering. Den blokerer profilen, frigiver navnet, fjerner spillerkoden og live-tilstedeværelsen. Runder bevares, og profiler kan gendannes. Tidligere særskilt skjulte runder forbliver skjult. Gendannelse kræver, at navnet er ledigt. Dette sletter ikke Supabase Auth-konti permanent.
- Ændringer bruger profilens UUID, versionskontrol og transaktionel historik. Spillerkoder og hashes skrives aldrig i historikken.
- Adminadgang er knyttet til en bekræftet Auth-brugers UUID i `ag_admins`, ikke til navnet Thomas eller en spillerkode. `enabled=false` spærrer alle efterfølgende admin-RPC-kald, også med et tidligere udstedt login-token.
- Adminsession gemmes separat i `sessionStorage`; spillets session og navn ændres ikke. Admin har separat logout og ingen tredjepartsscripts. En ny fane kræver som udgangspunkt nyt login; browserens gendannelse af faner kan bevare sessionStorage.
- `ag_games` registrerer spil. Første integration er Almind-Merge. Nye spil kræver egne score-/rundeintegrationer; denne version flytter ikke eksisterende data og opretter ikke nye spil automatisk.

## Test

`npm test` tester adminsession, OTP-parametre, refresh, logout og eksisterende spillogik.

`PGLITE_MODULE=... node tests/admin-db.mjs` tester adgangskontrol, manglende mailbekræftelse, anonyme brugere, tilbagekaldt adminrolle, direkte tabeladgang, navnekollision, gamle redigeringer, spillerkode, historik, slet/gendan, bevarede rekorder og genkørsel af migrationen.

`PLAYWRIGHT_MODULE=... GAME_TEST_URL=http://127.0.0.1:4195 node tests/admin-browser.mjs` tester den faktiske UI med simuleret API på desktop/mobil. Der sendes ingen mails og ændres ingen produktionsprofiler.

## Aktiveringsstatus

Bygget og lokalt testet. Databaseinstallation, oprettelse af admin-konto og SMTP skal aktiveres af ejeren i Supabase. Ingen administratorhemmeligheder findes i repositoryet.
