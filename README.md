# Brain Sculpting Camp — Offline Android App

100% offline standalone Android copy of **Brain Sculpting Camp**, wrapped with Capacitor (`com.brainsculptingcamp.mobile`).

## Architecture
- **UI**: React 19 + Tailwind CSS v4 (identical 9 workspaces, charts, timers, SM-2 spaced repetition, and goal rollups).
- **Database**: On-device SQLite via `@capacitor-community/sqlite` on Android (with `sql.js` + IndexedDB fallback for local web preview).
- **File Storage**: Imported PDFs, EPUBs, Speaking Studio recordings, study attachments, and fitness photos stored locally inside app-managed device storage (`@capacitor/filesystem` `Directory.Data/bsc_storage`).
- **Offline Readers & Media**: Built-in `pdfjs-dist` canvas PDF reader, `epubjs` EPUB reader, HTML5 audio playback from device storage, and an on-device English Practice Coach.
- **Portability**: Full JSON backup export and JSON backup import in **Settings**.

## Local Development & Verification
```bash
npm install
npm run lint
npm test
npm run build
npx cap sync android
```

## Building the APK via GitHub Actions
Push this folder to a GitHub repository (`main` or `master`). `.github/workflows/android-apk.yml` builds `android/app/build/outputs/apk/debug/app-debug.apk` automatically and uploads it as the downloadable `brain-sculpting-camp-debug-apk` workflow artifact.
