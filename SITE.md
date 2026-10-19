# Almind Games hosting

`dist/` contains the original game. The only gameplay-page changes for the shared hub are navigation links, their styling and a small navigation module; game rules and scoring remain unchanged. `scripts/build-site.mjs` copies it to both the published root (for compatibility assets/admin/Artilleri) and `/merge/`, then overlays `site/` to supply the new chooser and `/merge-3d-test/`. GitHub Pages publishes `.site-build/`.

Run `npm test && node scripts/build-site.mjs`, then serve `.site-build/` with a local HTTP server. No dependencies are required for the site.

## Shared player profile

`site/profile.js` reuses the original `almind-score-session:<Supabase URL>` identity, auth refresh lock, and `am_player_profile`, `am_claim_name`, `am_use_player_code`, and `am_create_player_code` RPCs. Visiting the site does not create accounts. New identities are created only after an explicit profile action. No privileged key or database migration is needed. The public client configuration remains `dist/score-config.js`.

3D scores now use migration `202610190001_merge3d_scores.sql`, applied to the existing Supabase project on 2026-10-19. `am3d_rounds` is separate from original rounds; authenticated writes resolve `am_player_id()` and verify the captured profile and creating device. Its server validator recomputes all 13 tiers, Svend bonus, drop timing, inventory and power usage from an append-only event journal. This is plausibility validation, not a physics replay or cheat-proof verification. Offline rounds do not have a trusted server start timestamp.

The public `am3d_leaderboard` shows all-time/week top 10 plus own rank. Scores are checkpointed every 15 seconds, on backgrounding, restart and Game Over. Pending rounds use independent `almind3d-round:<uuid>` keys, survive reload and retry on reconnect. A changed profile cannot receive another profile's queued round. Previously saved unvalidated local-only records are not automatically uploaded. Guest games and workshop events are excluded; valid points before entering practice remain eligible. The native iPhone app has not yet been connected to profile login; cross-device scores currently apply to the web version.

Checks: `npm test`; `PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/merge3d-db.mjs`. Original `dist/` remains untouched.

## Update the 3D test

From the private 3D repository, run `python3 tools/export_web.py --site /path/to/almind-games-site`. It stages a separate Godot project with 1024px texture limits, exports without threads, compresses the pack into chunks below GitHub's file limit, and copies the web runtime into this repo. Native assets are unchanged. Review and commit the updated web files, then push main to deploy.

The web runtime needs WebGL2, WebAssembly and gzip DecompressionStream (current Safari/Chrome/Firefox). The test download is large; mobile memory and frame rate still require real-device testing.

## Navigation and settings

Both Merge games offer a visible return to the chooser. Leaving pauses input and attempts score upload, with durable queues retained if the network is unavailable. The original game also has a dedicated touch-play navigation row. The 3D workshop and camera-button panel have been removed; camera gestures remain. 3D sound, touch mode, sensitivity and vertical inversion persist synchronously in browser storage per profile and browser, with native ConfigFile storage as the fallback. These device preferences are not synced between devices.

## Profile settings and paired leaderboards (19 October 2026)

The home page shows the existing original leaderboard (`am_leaderboard_v2`) beside the independent 3D leaderboard; below 760px these stack. Each has its own scope and refresh controls. Original game files and score storage are unchanged by this release.

Web 3D settings now use `am3d_settings` and `am3d_preferences`, installed by `202610190002_merge3d_preferences.sql`. The RPC resolves the linked player server-side, rejects a mismatched profile, validates four allowed fields, and exposes no direct table access. Old local settings seed the profile only if no row exists. Edits queue locally as field patches, debounce for 500ms, retry every 15 seconds/on reconnect, and flush on hide/leave. Settings are loaded before starting Godot; already-running games are not changed remotely. Guests remain local. The native iPhone build has no shared web profile integration yet.

Verification: unit tests cover separate device stores, offline/reload, stale seed and in-flight edits; `tests/merge3d-preferences-db.mjs` checks linked devices, input validation, profile isolation and database permissions in PGlite.
