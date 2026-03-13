# QuartoReview — macOS Desktop Quarto Editor

QuartoReview is a local macOS desktop app for editing `.qmd` (Quarto Markdown) files stored on GitHub. The React frontend and Express backend are bundled together inside an Electron shell, so you launch one app instead of managing separate browser and server processes.

---

## What it does

- Edit `.qmd` files with a rich WYSIWYG interface (headings, bold, italic, tables, math)
- Run R code chunks directly in the browser using WebAssembly (no local R required)
- Packages like `tidyverse`, `kableExtra`, and `palmerpenguins` are pre-loaded automatically
- Load and save files to any GitHub repository you have access to
- Inline comments, track changes, and citation management

---

## Overview of the setup

Setting up QuartoReview takes about 10 minutes and has four parts:

1. **Install Node.js** — the runtime that powers the app build (one-time)
2. **Install the app's dependencies** — download the desktop, backend, and frontend packages (one-time)
3. **Connect GitHub** — use the in-app onboarding flow to authorize QuartoReview with your own GitHub account
4. **Launch the desktop app** — QuartoReview runs as a standalone macOS application

---

## Step 1 — Install Node.js

Download and install Node.js **version 18 or later** from https://nodejs.org
Choose the **LTS** version. Accept all defaults during installation.

> **Already have Node.js?** Check your version by running `node --version` in a terminal. If it says v18 or higher, you're good.

---

## Step 2 — Get the code and install dependencies

**Get the code:**

- **Option A — Download ZIP** (easiest): Go to https://github.com/Lakens/QuartoReview, click the green **"Code"** button → **"Download ZIP"**, then extract it somewhere on your computer (Desktop or Documents is fine).
- **Option B — Clone with git**: `git clone https://github.com/Lakens/QuartoReview.git`

**Install dependencies** (one-time setup):

| Platform | How |
|----------|-----|
| Mac | Open Terminal, type `chmod +x install.sh && ./install.sh`, press Enter |

The script checks that Node.js is installed and downloads the desktop, backend, and frontend dependencies. It takes a few minutes and tells you when it's done.

---

## Step 3 — Connect GitHub

On first launch, QuartoReview opens an in-app GitHub setup dialog automatically if the app has not been configured yet.

You can connect GitHub in two ways:

### Option A — Personal access token (fastest for a local install)

This is the simplest route for a single-user desktop install.

1. In QuartoReview, click **"Connect GitHub"**
2. Choose **"Personal token"**
3. Click **"Open GitHub token page"**
4. Create a token with repository access on your own GitHub account
5. Paste the token into QuartoReview
6. Click **"Save token and sign in"**

QuartoReview validates the token and stores it locally on that Mac.

### Option B — GitHub OAuth App (keeps the explicit authorization flow)

Use this if you want GitHub to show an explicit app authorization screen when signing in.

1. In QuartoReview, click **"Connect GitHub"**
2. Choose **"GitHub OAuth app"**
3. Click **"Open GitHub OAuth settings"**
4. Create a GitHub OAuth app on your own GitHub account with these values:

   | Field | Value |
   |-------|-------|
   | Application name | `QuartoReview` (or anything you like) |
   | Homepage URL | `http://localhost:3001` |
   | Authorization callback URL | `http://localhost:3001/api/auth/callback` |

5. Copy the **Client ID** and **Client Secret** into the QuartoReview setup dialog
6. Leave the default redirect URI as `http://localhost:3001/api/auth/callback`
7. Click **"Save and continue to GitHub"**

GitHub will then show the standard authorization page for your OAuth app, and you sign in with your own GitHub account.

### Advanced option — edit the local config file manually

If needed, QuartoReview stores its local desktop configuration here:

`~/Library/Application Support/QuartoReview/.env`

Most users should not need to edit this file directly, because the app now manages it through the GUI onboarding flow.

---

## Step 4 — Launch the desktop app

Run:

```bash
chmod +x start.sh
./start.sh
```

This builds the frontend, starts the embedded backend, and opens the Electron desktop app.

**First launch behavior:**

1. QuartoReview opens
2. If GitHub has not been configured yet, the app shows the setup dialog automatically
3. Choose either **"Personal token"** or **"GitHub OAuth app"**
4. Complete the setup flow and continue into the editor

To build a distributable macOS app bundle and disk image, run:

```bash
npm run dist
```

---

## Running R code

R runs entirely in your browser — no local R installation needed.

When you open the app, it automatically installs `tidyverse`, `kableExtra`, and `palmerpenguins` in the background. A blue banner in the bottom-right corner shows the progress. **This takes a few minutes on every page load** — R code will not run until the banner disappears.

Once ready:

- Click the **R** toolbar button to insert a new code chunk
- Type R code in the chunk
- Click the **Run** button (▶) on the chunk
- Output (text, tables, plots) appears below the chunk

---

## Troubleshooting

**The GitHub setup dialog appears, but sign-in still fails**
→ If you used a personal access token, make sure the token has repository access. If you used OAuth, make sure the client ID, client secret, and redirect URI match your GitHub OAuth app exactly.

**The app opens but I can't see any repositories**
→ Make sure you completed the in-app GitHub setup flow successfully. Repositories only appear after authentication. If you just created a GitHub account, create at least one repository on GitHub first.

> **Need help?** Submit issues at [github.com/Lakens/QuartoReview](https://github.com/Lakens/QuartoReview).

**R code gives "there is no package called …"**
→ Wait for the blue "Installing R packages…" banner to disappear before running code. If the banner is gone and the error persists, reload the page.

**R chunks show "Starting R…" and never finish**
→ Wait up to 60 seconds on first use. If it still hangs, open the browser DevTools (F12 → Console) and look for `[WebR]` log lines.

**Port 3001 is already in use**
→ Quit the conflicting process or restart QuartoReview after freeing port 3001.

---

## Project structure

```
QuartoReview/
├── electron/             # Electron main/preload process
├── backend/              # Express.js API server (embedded in the desktop app)
│   ├── api/              # API routes (auth, files, bibliography, etc.)
│   ├── middleware/        # Security middleware
│   └── .env.example      # Desktop configuration template
├── frontend/             # React + Vite app
│   ├── src/
│   │   ├── cells/        # Code cell, markdown cell, raw cell
│   │   ├── components/   # Editor, toolbar, comments, citations
│   │   └── utils/        # API helpers, GitHub utils, WebR singleton
│   └── public/           # Static files (WebR worker scripts)
├── install.sh            # Install all desktop dependencies
├── start.sh              # Build and launch the desktop app
└── README.md
```

---

## License

Elastic License v2 (ELv2) — see [LICENSE.md](LICENSE.md).

---

## Built on Resolve

QuartoReview is a fork of [Resolve](https://github.com/MichelNivard/resolve) by Michel Nivard. The original Resolve provided the foundational architecture on which this project is built: the TipTap/ProseMirror editor core, GitHub OAuth authentication, `.ipynb` loading and saving, the Track Changes extension, the comment mark system, the basic citation mark, raw and code cell architecture, inline math rendering, and the comments sidebar and share modal.

The following features were added in this fork by Daniel Lakens:

- **QMD format support** — `.qmd` (Quarto Markdown) as the primary file format, including full round-trip conversion between QMD and the TipTap document model, and persistence of inline comments as HTML spans within QMD files
- **Vite migration** — migrated the frontend from Create React App to Vite
- **Live preview pane** — side-by-side rendered prose preview
- **WebR in-browser R execution** — run R code chunks directly in the browser via WebAssembly, with `tidyverse`, `kableExtra`, and `palmerpenguins` pre-loaded; includes R plot and table rendering and automatic package installation
- **Zotero citation picker** — integration with Zotero's Better BibTeX "Cite as You Write" API, with APA in-text and reference list formatting
- **LanguageTool grammar and spell checking** — real-time grammar and spelling feedback via LanguageTool, with inline highlighting and one-click corrections
- **Diff viewer** — compare any saved version against the current document ("Changes since this version") or view what changed within a specific commit ("Changes in this version"), with word-level highlighting
- **Dark mode** — full dark theme with CSS variable overrides, toggled from the header
- **Word count and unsaved-words nudge** — live word count in the status bar, with a header warning after 50 unsaved words
- **Commit message dialog** — descriptive commit messages when saving to GitHub
- **UI redesign** — unified header row with file controls, track changes toggle, share button, and dark mode toggle; orange pill-style toolbar buttons for R chunk insertion, citation, and diff

Issues and contributions: [github.com/Lakens/QuartoReview](https://github.com/Lakens/QuartoReview)
