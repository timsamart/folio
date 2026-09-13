# Folio

A little room to read. Folio is a mobile Markdown reader with Mermaid diagrams, syntax-highlighted code, LaTeX mathematics, and a personal offline library.

**[Open Folio](https://timsamart.github.io/folio/)** · **[Download a release](https://github.com/timsamart/folio/releases/latest)**

## Install on your phone

Open the app link in your browser. On **iPhone or iPad**, use Safari → Share → Add to Home Screen. On **Android**, use your browser's Install app or Add to Home screen command. Desktop browsers that support installed web apps also offer an install button.

Keep Folio open until offline reading is ready. Your documents, fonts, code highlighting, math, and diagram renderers can then work without a connection. This is an installable web app, not an APK or App Store package.

## Read your way

- Open multiple `.md`, `.markdown`, `.mdown`, or `.txt` files, drag and drop, or paste Markdown. Up to 2 MB per document.
- Mermaid diagrams with a larger, scrollable view, readable zoom, and source copying.
- Highlighted code with copying and optional line wrapping.
- KaTeX inline `$...$` and display `$$...$$` mathematics, plus tables, checklists, and footnotes.
- Document and passage search, a navigable outline, bookmarks, and saved reading positions.
- Daylight, paper, night, and system themes; reading fonts, spacing, width, and focus mode.
- Original Markdown download and complete library backup/restore.

<img src="docs/mobile.png" alt="Folio reading view on a phone" width="320" />

## Your documents stay on your device

Folio has no account, analytics, or cloud synchronization. Documents live in this browser's IndexedDB storage. Markdown images load only when requested. Browser storage can be cleared or evicted, so keep an independent backup using **Document options → Back up library**.

Libraries are specific to the device and website origin. To move from a local preview or another installation, export a library backup there and restore it here. Normal outbound links and manually loaded images make their usual network requests.

## Run locally

Use Node.js 24 LTS and npm:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174/folio/`.

```sh
npm run check
npm run build
npm run preview
```

The production preview supports offline caching and installation on localhost. Development mode does not register a service worker.

## Deployment and downloads

Pushes to `main` run the checks, build, and deploy to GitHub Pages through `.github/workflows/pages.yml`. The default base path is `/folio/`. In repository Settings → Pages, the source must be **GitHub Actions**.

The release ZIP contains a ready-to-host static build for a domain root. To produce it locally:

```sh
npm run build:portable
```

Serve the contents of `portable-dist/` at `/` on an HTTPS host. For a local preview, run `python -m http.server 8000 --directory portable-dist` and open `http://localhost:8000`. Opening `index.html` directly as a file is not supported because browser modules and service workers need HTTP(S).

## Implementation and verification

Vanilla JavaScript and Vite; Marked, DOMPurify, Highlight.js, KaTeX, Mermaid, and Lucide. All runtime libraries and fonts are bundled, without a runtime CDN dependency. Raw HTML is shown as text, Markdown output is sanitized, KaTeX uses `trust: false`, and Mermaid uses strict security.

Browser validation covers 320–1440px layouts, offline reloads, all three renderers, malformed diagrams, import and restore, original exports, search, bookmarks, saved positions, reading preferences, and reduced motion. Physical iOS/Android installation remains untested. `npm run build` also verifies that every offline asset exists and that the manifest and hosting paths agree.

Design work used Frontend Design, UI/UX Pro Max, and Vercel Web Design Guidelines; browser validation used Playwright.

Bundled fonts use the SIL Open Font License. See [third-party notices](THIRD_PARTY_NOTICES.md) and the license files under `static/licenses/`.
