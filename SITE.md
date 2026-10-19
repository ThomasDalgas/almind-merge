# Almind Games hosting

`dist/` is the original game and remains unchanged. `scripts/build-site.mjs` copies it to both the published root (for compatibility assets/admin/Artilleri) and `/merge/`, then overlays `site/` to supply the new chooser and `/merge-3d-test/`. GitHub Pages publishes `.site-build/`.

Run `npm test && node scripts/build-site.mjs`, then serve `.site-build/` with a local HTTP server. No dependencies are required for the site.

## Shared player profile

`site/profile.js` reuses the original `almind-score-session:<Supabase URL>` identity, auth refresh lock, and `am_player_profile`, `am_claim_name`, `am_use_player_code`, and `am_create_player_code` RPCs. Visiting the site does not create accounts. New identities are created only after an explicit profile action. No privileged key or database migration is needed. The public client configuration remains `dist/score-config.js`.

3D scores now use migration `202610190001_merge3d_scores.sql`, applied to the existing Supabase project on 2026-10-19. `am3d_rounds` is separate from original rounds; authenticated writes resolve `am_player_id()` and verify the captured profile and creating device. Its server validator recomputes all 13 tiers, Svend bonus, drop timing, inventory and power usage from an append-only event journal. This is plausibility validation, not a physics replay or cheat-proof verification. Offline rounds do not have a trusted server start timestamp.

The public `am3d_leaderboard` shows all-time/week top 10 plus own rank. Scores are checkpointed every 15 seconds, on backgrounding, restart and Game Over. Pending rounds use independent `almind3d-round:<uuid>` keys, survive reload and retry on reconnect. A changed profile cannot receive another profile's queued round. Previously saved unvalidated local-only records are not automatically uploaded. Guest games and workshop events are excluded; valid points before entering practice remain eligible. The native iPhone app has not yet been connected to profile login; cross-device scores currently apply to the web version.

Checks: `npm test`; `PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/merge3d-db.mjs`. Original `dist/` remains untouched.

## Update the 3D test

From the private 3D repository, run `python3 tools/export_web.py --site /path/to/almind-games-site`. It stages a separate Godot project with 1024px texture limits, exports without threads, compresses the pack into chunks below GitHub's file limit, and copies the web runtime into this repo. Native assets are unchanged. Review and commit the updated web files, then push main to deploy.

The web runtime needs WebGL2, WebAssembly and gzip DecompressionStream (current Safari/Chrome/Firefox). The test download is large; mobile memory and frame rate still require real-device testing.
