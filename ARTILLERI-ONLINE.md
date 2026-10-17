

1. Kør `supabase/migrations/202610170001_artillery_online_hardening.sql` i det eksisterende Supabase-projekt. Den lukker en NULL-fejl i medlemskontrollen for ventende kampe og afviser tomme skudparametre. Den ændrer ikke eksisterende kampdata. Denne nye migration er endnu ikke kørt af Codex.
2. Begge enheder åbner den samme aktuelle Artilleri-version og bruger **hver sin spillerprofil**. En spillerkode flytter samme identitet; den skal ikke deles mellem modstandere.
3. Værten vælger **Opret kamp**. Kampkoden står midt på banen, indtil modstanderen tilslutter sig.
4. Modstanderen indtaster kampkoden og vælger **Deltag**. Kun spilleren i tur kan skyde. Polling sker hvert 1,5 sekund og venter under skudafsendelse og animation.
5. Efter genindlæsning ligger sidste kampkode i feltet: vælg **Deltag / genoptag**. Skudloggen genskaber banen. På iPhone vælges **Fortsæt spil** efter skift tilbage fra baggrunden.

Verifikation: automatiserede tests for to klienters ens replay, turstyring, ventelobby og genindtræden. En rigtig onlinekamp mellem to fysiske enheder skal stadig afprøves efter SQL-opdateringen. Serveren beregner fortsat ikke skade uafhængigt (familiespil).
