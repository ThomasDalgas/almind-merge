# Artilleri online

## Online — spillerliste

Artilleri genbruger den eksisterende Almind Games-profil automatisk i samme browser og på samme origin som Merge. Menuen viser den aktuelle profil. Artilleri registrerer eller omdøber ikke fælles profiler; nye profiler oprettes i Merge.

Åbn Artilleri på begge enheder, vælg modstanderen i **Klar til Artilleri**, og tryk **Invitér**. Modstanderen accepterer med **Spil**. Kampidentifikatorer er interne; ingen kampkode skal indtastes. Spillerlisten viser profiler med aktivitet i Artilleri de seneste 30 sekunder. Invitationer udløber efter to minutter. **Genoptag seneste onlinekamp** genskaber den seneste kamp fra skudloggen.

På en ny enhed: skriv dit eksisterende navn og vælg **Tilknyt eksisterende profil**. Der vises præcis to kontrolcifre. Åbn Artilleri i den browser, hvor din Merge-profil allerede er kendt, og godkend den tilsvarende anmodning. De to cifre er kun til sammenligning, aldrig et selvstændigt login. Anmodninger udløber efter tre minutter. **Brug en anden eksisterende profil** kan bruges til at vælge profil på en delt enhed.

### Database og Merge-isolation

Kør `supabase/migrations/202610170002_artillery_lobby.sql` efter de tidligere Artilleri-migrationer. Denne nye migration er endnu ikke kørt af Codex på produktion. Den opretter kun `aa_*` tabeller og funktioner og ændrer kun Artilleri-RPC'ernes profilopslag. Den skriver ikke til Merge-profiler, enhedstilknytninger, runder eller rekorder. Godkendelser gemmes i `aa_device_profiles` og gælder kun Artilleri. Auth-sessionen genbruges fortsat, som før.

Test: `PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/lobby-db.mjs` kontrollerer migration, invitationer, medlemskab, to-cifret enhedsgodkendelse og uændret Merge-identitet/funktioner. UI-flowet testes i `tests/lobby.test.mjs`.

Serveren reserverer ture atomisk og validerer input, men beregner ikke selv terræn/skade. Dette er fortsat et tillidsbaseret familiespil, ikke en servervalideret konkurrencerangliste.
