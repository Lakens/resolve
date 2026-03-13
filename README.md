# QuartoReview — WYSIWYG Quarto Markdown Editor

QuartoReview is a browser-based editor for `.qmd` (Quarto Markdown) files stored on GitHub. It lets you write, edit, and run R code chunks in the browser — no local R installation needed — and saves everything back to your GitHub repository.

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

1. **Install Node.js** — the runtime that powers the app (one-time)
2. **Install the app's dependencies** — download the libraries QuartoReview needs (one-time, automated)
3. **Connect to GitHub** — register QuartoReview as an app in your GitHub account so the "Login with GitHub" button works (one-time, ~5 minutes)
4. **Launch and log in** — double-click to start, then click "Login with GitHub" in your browser

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
| Windows | Double-click `install.bat` in the resolve folder |
| Mac | Open Terminal, type `chmod +x install.sh && ./install.sh`, press Enter |

The script checks that Node.js is installed and downloads everything the app needs. It takes 1–2 minutes and tells you when it's done.

---

## Step 3 — Connect QuartoReview to GitHub (enables login)

QuartoReview uses GitHub to store your files and to verify who you are. To make the **"Login with GitHub"** button work, you need to register QuartoReview as an "OAuth App" in your GitHub account. This is a one-time step that takes about 5 minutes.

**Why is this needed?** GitHub requires any app that reads or writes repositories on your behalf to be registered. This is what creates the secure login flow.

### 3a — Create the OAuth App

1. Go to https://github.com/settings/developers
2. Click **"OAuth Apps"** in the left sidebar
3. Click **"New OAuth App"**
4. Fill in the form exactly as shown:

   | Field | Value |
   |-------|-------|
   | Application name | `QuartoReview` (or anything you like) |
   | Homepage URL | `http://localhost:5173` |
   | Authorization callback URL | `http://localhost:3001/api/auth/callback` |

5. Click **"Register application"**
6. On the next page, copy the **Client ID** — you'll need it in the next step
7. Click **"Generate a new client secret"**, then copy the **Client Secret** — you only see it once, so copy it now

### 3b — Save your credentials

In the `backend/` folder, create a file named `.env` (just the name `.env`, no other extension).
Paste the following into it:

```
GITHUB_CLIENT_ID=paste_your_client_id_here
GITHUB_CLIENT_SECRET=paste_your_client_secret_here
REDIRECT_URI=http://localhost:3001/api/auth/callback
SESSION_SECRET=any_long_random_string_you_make_up
NODE_ENV=development
```

Replace the two `paste_your_…` values with what you copied in step 3a.
For `SESSION_SECRET`, invent any long string — for example: `mySecretKey12345abcdef`.

**The `.env` file is never uploaded to GitHub** (it's in `.gitignore`) so your credentials stay on your computer only.

---

## Step 4 — Launch the app and log in

| Platform | How to launch |
|----------|--------------|
| Windows | Double-click `start.bat` |
| Mac | Run `./start.sh` in Terminal (first time: `chmod +x start.sh`) |

The script opens two windows (backend and frontend) and opens your browser to `http://localhost:5173` after a few seconds.

**To log in:**

1. Click **"Login with GitHub"** on the page
2. GitHub will ask you to authorize QuartoReview — click **"Authorize"**
3. You will be sent back to QuartoReview, now logged in
4. Select a repository from the dropdown, then select a `.qmd` file to open it

> **Don't see a "Login with GitHub" button?** Make sure both the backend and frontend windows are running (step 4 opens them automatically). If the button does nothing, check the [troubleshooting](#troubleshooting) section.

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

**"Login with GitHub" does nothing or shows an error**
→ Check that `backend/.env` exists and that `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` match your OAuth App exactly (no extra spaces). Restart the backend window after editing `.env`.

**The app opens but I can't see any repositories**
→ Make sure you clicked "Login with GitHub" and completed the GitHub authorization. Repositories only appear after login. If you just created a GitHub account, create at least one repository on GitHub first.

> **Need help?** Submit issues at [github.com/Lakens/QuartoReview](https://github.com/Lakens/QuartoReview).

**R code gives "there is no package called …"**
→ Wait for the blue "Installing R packages…" banner to disappear before running code. If the banner is gone and the error persists, reload the page.

**R chunks show "Starting R…" and never finish**
→ Wait up to 60 seconds on first use. If it still hangs, open the browser DevTools (F12 → Console) and look for `[WebR]` log lines.

**Port already in use**
→ Run `start.bat` (or `start.sh`) again — it kills anything on ports 3001 and 5173 before starting.

---

## Project structure

```
QuartoReview/
├── backend/              # Express.js API server (port 3001)
│   ├── api/              # API routes (auth, files, bibliography, etc.)
│   ├── middleware/        # Security middleware
│   └── .env              # Your credentials (create this — not in git)
├── frontend/             # React + Vite app (port 5173)
│   ├── src/
│   │   ├── cells/        # Code cell, markdown cell, raw cell
│   │   ├── components/   # Editor, toolbar, comments, citations
│   │   └── utils/        # API helpers, GitHub utils, WebR singleton
│   └── public/           # Static files (WebR worker scripts)
├── install.bat           # Windows: first-time dependency install
├── install.sh            # Mac/Linux: first-time dependency install
├── start.bat             # Windows: launch backend + frontend
├── start.sh              # Mac/Linux: launch backend + frontend
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
