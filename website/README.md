# Recorder Studio website

Static site — no build step. Open `index.html` or host the folder on GitHub Pages, Netlify, Vercel or Cloudflare Pages.

## Your media

Drop files into `assets/` with these names. Until a file exists, its slot shows a labelled placeholder with the expected path.

| File | Where | Suggested |
| --- | --- | --- |
| `hero.mp4` (+ optional `hero-poster.jpg`) | Hero window | 16:9, 1920×1080, 15–30 s loop |
| `zoom-auto.mp4`, `zoom-manual.mp4`, `zoom-framing.mp4` | Zoom tabs | 16:9 |
| `zoom-screenshot.png` | Scroll-zoom scene | 16:9 screenshot |
| `layout-camera.mp4`, `layout-split.mp4`, `layout-overlay.mp4`, `layout-screen.mp4`, `layout-cutout.mp4` | Layout steps | 16:9 |
| `motion-cursor.mp4` | Smooth cursor card | 16:9 |
| `motion-blur.png` | Motion blur card | 4:3 |
| `ratio.mp4` | Aspect ratio morph (cropped live) | 16:9, subject centred |
| `editor-screenshot.png` | Editing section | 21:9 |
| `og-image.png` | Link previews | 1200×630 |

Keep videos muted H.264 MP4 (`ffmpeg -i in.mp4 -an -c:v libx264 -crf 24 -preset slow -movflags +faststart out.mp4`). A filename ending in `.png`/`.jpg`/`.webp` shows an image instead; change `data-src` in `index.html` to swap a video slot for a screenshot.

## Links and downloads

Edit `site.config.js`: GitHub URL, version, and download links. Either copy the files from `../release/` into `website/downloads/`, or point `installer` / `portable` at your GitHub release assets.
