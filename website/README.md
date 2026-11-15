# Recorder Studio website

A static landing page with no build step and no external media. It is bilingual (English / O‘zbekcha), and the UI previews are drawn with CSS.

- **Downloads:** buttons ask the GitHub API for the newest release (`uz4studiosuz/Recorder-Studio`) and link its `Setup` and `Portable` `.exe` assets, showing the version and size. If the API is unreachable, they fall back to `releases/latest/download/Recorder-Studio-Setup-x64.exe` and `…-Portable-x64.exe`.
- **Settings:** `site.config.js` holds the repository and the fallback links.
- **Hosting:** `.github/workflows/pages.yml` publishes this folder to GitHub Pages on every push to `main` that changes `website/`. Turn it on once in **Settings → Pages → Source: GitHub Actions**. The site will be at `https://uz4studiosuz.github.io/Recorder-Studio/`.
- **Local preview:** serve the folder with any static server, for example `npx serve website`.
