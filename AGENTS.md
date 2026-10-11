# Working on Little Color Club

Use the existing checkout. Cloud tasks already run in an isolated environment; do not create a Git worktree unless the user explicitly requests one.

- This is an offline Android app built with React, TypeScript, Canvas 2D, and Capacitor 7.
- Keep coloring controls large and simple. No ads, purchases, tracking, remote fonts, or unnecessary Android permissions.
- v1.2.0 contains 35 classic vector pages in `src/data/drawings.ts` and 137 original generated illustrations indexed in `src/data/illustrated.json`. Keep drawing and region IDs stable to preserve saved artwork.
- Illustrated metadata intentionally has empty `regions`; call `loadDrawing(id)` before painting or inspecting geometry. SVG thumbnails and detailed JSON are bundled in `public/drawings/` and load locally. Do not move every detailed page into the JavaScript bundle.
- Artwork sources and reviewed boundary repairs live in `artwork/sources/` and `artwork/manifest.json`. Read `artwork/README.md` before changing the tracing pipeline or regenerating assets. Review the generated audit and colored previews, verify number labels lie within visible regions, and keep compound paths filled with the even-odd rule.
- New v1.2.0 sheets use `grid: [2, 2]`, optional null cells, and `tracing: "bezier"` through the development-only system libpotrace library. Keep existing sheets on the legacy profile and verify existing asset hashes before accepting a regeneration. Do not ship unused source cells or colored review previews.
- Keep the 14-category library paginated, with exact easy/medium/hard filters and parent limits. Preserve search, category, level, and pagination when navigating back from the studio; unavailable session storage must not block browsing.
- Keep transparent ink separate from vector outlines so erasing doesn't remove the illustration.
- Keep temporary fill animations and tap feedback out of exported images and saved artwork. Honor reduced-motion preferences. Zoom and panning must preserve hit testing, and moving the picture must not paint it.
- Artwork and profile storage must stay local; preserve saved artwork when changing data structures.
- Run `npm run build` and relevant `npm test` checks after changes.
- For native changes, activate the installed toolchain with `source /workspace/.tools/android-env.sh` if present, then run `npm run android:build`. APK output is `android/app/build/outputs/apk/debug/app-debug.apk`.
- Native assets are copied by `npm run android:sync`; editing web code requires a new sync/build before testing Android.
- Python packages in `artwork/requirements.txt` are optional regeneration tools, not app dependencies. Keep Python environments, review montages, and other toolchain caches outside the checkout.
- Never commit toolchain caches, local SDK paths, secrets, or signing keys. `downloads/` intentionally contains the current debug APK for easy device testing; regenerate it and its SHA-256 checksum when updating the advertised test build. Keep the package and Android version numbers in sync.
