# n9-portal

Static portal for the MeeGo Harmattan mirror at [**n9.mpw.sh**](https://n9.mpw.sh), built with Astro and deployed to Cloudflare Workers, backed by R2.

## How it works

```
                ┌─────────────────────────────────────┐
   request ──▶  │ Cloudflare Workers runtime           │
                │                                       │
                │  ┌─────────────┐    ┌──────────────┐ │
                │  │ ASSETS      │    │ worker.js    │ │
                │  │ (Astro dist)│    │              │ │
                │  └─────────────┘    └──────────────┘ │
                │       ▲                  ▲           │
                │   / /setup /browse   /api/list,      │
                │   /guides/...        raw R2 paths    │
                └──────────────────────────┼───────────┘
                                           │
                                           ▼
                                    R2 bucket "meego"
```

The Workers runtime serves the static site directly. Only requests that don't match a built file fall through to `worker.js`, which then either:

- Returns a JSON listing of the R2 bucket (`/api/list?prefix=…`), used by `/browse`
- Streams a raw R2 object (everything else — `.deb` files, `Release`, `Packages.gz`, etc.)

## Project layout

```
.
├── astro.config.mjs           Astro config (static output + Tailwind v4)
├── wrangler.toml              Workers config (ASSETS + R2 bindings)
├── worker.js                  /api/list and R2 fallthrough
├── package.json
├── src/
│   ├── layouts/
│   │   ├── Base.astro         Shared header/footer
│   │   └── GuideLayout.astro  Wraps markdown guide pages
│   ├── components/
│   │   ├── MirrorBrowser.astro    Alpine-powered file browser (with install modal)
│   │   ├── InstallCommand.astro   Copyable apt-get install block
│   │   └── PackageIcon.astro      Inline base64 icon w/ SVG fallback
│   ├── lib/
│   │   └── packages.ts        Typed catalog loader + helpers
│   ├── data/
│   │   └── packages.json      Generated catalog (sync-packages)
│   ├── pages/
│   │   ├── index.astro        Landing
│   │   ├── browse.astro       Raw bucket file browser
│   │   ├── firmware.astro     Firmware images (scoped browser over images/)
│   │   ├── design.astro       Design assets (scoped browser over design/)
│   │   ├── manuals.astro      Service manual & schematics (scoped browser over manuals/)
│   │   ├── packages/
│   │   │   ├── index.astro    Searchable package catalog
│   │   │   └── [name].astro   Per-package detail page (getStaticPaths)
│   │   └── guides/
│   │       ├── index.astro    Guides listing
│   │       └── *.md           Each guide (developer-mode includes mirror setup)
│   └── styles/global.css      Tailwind + custom theme
├── public/                    Static assets (favicon etc.)
│   ├── setup.deb             Built by scripts/build-deb.sh (gitignored)
│   └── search-index.json      Slim client-side search manifest (gitignored)
├── scripts/
│   ├── build-deb.sh           Generates the .deb
│   └── sync-packages.ts       Fetches & parses Packages.gz from all 5 repos
└── .github/workflows/deploy.yml  CI: build .deb + sync + Astro + wrangler deploy
```

## Local development

Prerequisites: [Bun](https://bun.sh/) and `dpkg-deb` (preinstalled on Linux; on macOS: `brew install dpkg`).

```bash
bun install
bun run build-deb     # one-time: generates public/setup.deb
bun run dev           # http://localhost:4321 — hot reload, BUT no Worker
```

The `bun run dev` server runs Astro alone — `/api/list` won't work because the Worker isn't running. To test the full stack (assets + Worker + R2) locally, use:

```bash
bun run build
bun run preview       # = wrangler dev — runs Worker against real R2
```

## Deployment

### Automatic (recommended)

Push to `main` and the GitHub Actions workflow handles it. You need two repository secrets:

| Secret name             | Where to get it                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, right sidebar on any zone overview page                                  |

Add them under repo Settings → Secrets and variables → Actions → New repository secret.

### Manual

```bash
bun run deploy
# = astro build && wrangler deploy
```

## Adding a guide

1. Create a new `.md` file in `src/pages/guides/`
2. Use this frontmatter:
   ```yaml
   ---
   layout: ../../layouts/GuideLayout.astro
   title: Your guide title
   description: One-liner shown in the guide list and meta tags.
   ---
   ```
3. Write markdown. The guides index page picks it up automatically via `Astro.glob`.

## Updating the mirror URL or sources

The apt sources are hardcoded in `scripts/build-deb.sh` and in the manual-setup section of `src/pages/guides/developer-mode.md`. If you change the URL or add a component, update both, then redeploy. The `.deb` is rebuilt on every CI run, so users always get a current copy at `https://n9.mpw.sh/setup.deb`.

## Refreshing the package catalog

The `/packages` catalog reads from `src/data/packages.json`, which is generated by parsing each repo's `Packages.gz` index. To refresh it locally:

```bash
bun run sync-packages
```

This fetches all five `Packages.gz` files (see `scripts/sync-packages.ts` for the list), parses Debian control-file stanzas, filters to `armel`/`all`, and writes both the full catalog and a slim client-side search manifest. CI runs it before every `astro build`, so production deploys always ship a current catalog.

To add or remove a repo, edit the `REPOS` array in `scripts/sync-packages.ts` and the matching one in `src/lib/packages.ts`.

## Notes

- **R2 still holds all package data.** The Astro build only bundles the website itself. The huge `harmattan-dev.nokia.com/` and `n9mirror/` trees stay in the bucket, served straight through the Worker.
- **No more `site/` prefix in R2.** Previously the website lived under `site/` inside the bucket; now it's bundled with the Worker deploy, and the bucket is data-only. You can safely delete the `site/` folder from the R2 bucket once this is deployed.
- **Cache TTLs.** Apt index files (`Release`, `Packages.gz`) get 5-minute caches; `.deb` files get 1-year caches. Adjust in `worker.js`.
