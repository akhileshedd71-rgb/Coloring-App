# Working on Little Color Club

Use the existing checkout. Cloud tasks already run in an isolated environment; do not create a Git worktree unless the user explicitly requests one.

- This is an offline Android app built with React, TypeScript, Canvas 2D, and Capacitor 7.
- Keep coloring controls large and simple. No ads, purchases, tracking, remote fonts, or unnecessary Android permissions.
- Drawings are original vector paths in `src/data/drawings.ts`; verify new number labels lie within their visible regions.
- Keep transparent ink separate from vector outlines so erasing doesn't remove the illustration.
- Artwork and profile storage must stay local; preserve saved artwork when changing data structures.
- Run `npm run build` and relevant `npm test` checks after changes.
- For native changes, activate the installed toolchain with `source /workspace/.tools/android-env.sh` if present, then run `npm run android:build`. APK output is `android/app/build/outputs/apk/debug/app-debug.apk`.
- Native assets are copied by `npm run android:sync`; editing web code requires a new sync/build before testing Android.
- Never commit toolchain caches, local SDK paths, secrets, or signing keys. `downloads/` intentionally contains the initial debug APK for easy device testing; regenerate it if updating the advertised test build.
