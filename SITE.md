# Almind Games hosting

`dist/` is the original game and remains unchanged. `scripts/build-site.mjs` copies it to both the published root (for compatibility assets/admin/Artilleri) and `/merge/`, then overlays `site/` to supply the new chooser and `/merge-3d-test/`. GitHub Pages publishes `.site-build/`.

Run `npm test && node scripts/build-site.mjs`, then serve `.site-build/` with a local HTTP server. No dependencies are required for the site.

## Shared player profile

`site/profile.js` reuses the original `almind-score-session:<Supabase URL>` identity, auth refresh lock, and `am_player_profile`, `am_claim_name`, `am_use_player_code`, and `am_create_player_code` RPCs. Visiting the site does not create accounts. New identities are created only after an explicit profile action. No privileged key or database migration is needed. The public client configuration remains `dist/score-config.js`.

3D test scores are saved per profile ID in localStorage under `almind-merge-3d-test-best:<id>`. They are not sent to the original 11-tier score validator. Adding a shared 3D leaderboard requires its own round validation and storage.

## Update the 3D test

From the private 3D repository, run `python3 tools/export_web.py --site /path/to/almind-games-site`. It stages a separate Godot project with 1024px texture limits, exports without threads, compresses the pack into chunks below GitHub's file limit, and copies the web runtime into this repo. Native assets are unchanged. Review and commit the updated web files, then push main to deploy.

The web runtime needs WebGL2, WebAssembly and gzip DecompressionStream (current Safari/Chrome/Firefox). The test download is large; mobile memory and frame rate still require real-device testing.
