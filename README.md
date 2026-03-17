# QuartoReview - Desktop Quarto / R Markdown Editor

QuartoReview is a local desktop app for editing `.qmd`, `.Rmd`, and `.md` files. The React frontend and Express backend are bundled inside Electron, so you launch one app instead of managing a browser and a separate server.

* * *

## How to Install

Download the latest release from GitHub:

*   Latest release page: https://github.com/Lakens/QuartoReview/releases/latest
    
*   Windows direct download: https://github.com/Lakens/QuartoReview/releases/latest/download/QuartoReview-Windows.exe
    
*   macOS direct download (`.dmg`): https://github.com/Lakens/QuartoReview/releases/latest/download/QuartoReview-macOS.dmg
    
*   macOS backup download (`.zip`): https://github.com/Lakens/QuartoReview/releases/latest/download/QuartoReview-macOS.zip

These links always point to the newest tagged release.

### Windows install

1.  Download `QuartoReview-Windows.exe`.
    
2.  Double-click the installer.
    
3.  Windows may warn that the app is from an unknown publisher because the installer is currently **not code-signed**.
    
4.  If you see a Microsoft Defender SmartScreen warning:
    
    *   click **More info**
        
    *   click **Run anyway**
        
5.  Finish the installer and launch QuartoReview from the Start menu or desktop shortcut.

### macOS install

1.  Download `QuartoReview-macOS.dmg`.
    
2.  Open the `.dmg`.
    
3.  Drag **QuartoReview** into **Applications**.
    
4.  Because the current macOS build is **not yet code-signed or notarized**, macOS may block the first launch.
    
5.  Try opening the app once from **Applications**.
    
6.  If macOS says it cannot be opened:
    
    *   open **System Settings** -> **Privacy & Security**
        
    *   scroll to the security section near the bottom
        
    *   click **Open Anyway** for QuartoReview
        
    *   confirm by clicking **Open**
        
7.  If **Open Anyway** is still not sufficient, you can use this last-resort workaround in Terminal:

    ```bash
    xattr -dr com.apple.quarantine "/Applications/QuartoReview.app"
    ```

    Only do this for a copy you downloaded from this repository's official **Releases** page.

8.  After that first approval or quarantine removal, the app should launch normally.

### Important note about unsigned apps

QuartoReview releases are currently unsigned on both Windows and macOS. That means:

*   Windows may show a SmartScreen warning before first launch.
    
*   macOS may block the app until you explicitly allow it in **Privacy & Security**.

This is a temporary limitation of the current macOS build process. We are exploring signing and notarization options to make installation easier and avoid extra Gatekeeper steps.

Only install releases you downloaded from this repository’s **Releases** page:

*   https://github.com/Lakens/QuartoReview/releases

If you prefer not to trust unsigned binaries, you can build the app from source yourself.

### Alternative install options

If your operating system blocks the packaged app, there are three practical alternatives:

*   clone the repository and run QuartoReview locally
*   run it in your browser from a local checkout
*   build the desktop app yourself on your own machine

#### Option 1: Clone the repository and run locally

**Windows**

1.  Install **Node.js LTS** from https://nodejs.org
2.  Install **Git** from https://git-scm.com/download/win
3.  Clone the repository:

    ```powershell
    git clone https://github.com/Lakens/QuartoReview.git
    cd QuartoReview
    ```

4.  Run:

    ```powershell
    .\install.bat
    ```

5.  Then launch:

    ```powershell
    .\start.bat
    ```

**macOS**

1.  Install **Node.js LTS** from https://nodejs.org
2.  Install **Git** if it is not already available:

    ```bash
    xcode-select --install
    ```

3.  Clone the repository:

    ```bash
    git clone https://github.com/Lakens/QuartoReview.git
    cd QuartoReview
    ```

4.  Run:

    ```bash
    chmod +x install.sh start.sh
    ./install.sh
    ```

5.  Then launch:

    ```bash
    ./start.sh
    ```

#### Option 2: Run it in the browser from a local checkout

This avoids launching the packaged Electron app. It is useful if you want to try QuartoReview without building an installer.

**Windows**

1.  Install **Node.js LTS** and **Git**.
2.  Clone the repository:

    ```powershell
    git clone https://github.com/Lakens/QuartoReview.git
    cd QuartoReview
    ```

3.  Install dependencies:

    ```powershell
    npm run install:backend
    npm run install:frontend
    ```

4.  Start QuartoReview in browser mode:

    ```powershell
    .\start.bat
    ```

5.  If your browser does not open automatically, go to:

    ```text
    http://localhost:5173
    ```

**macOS**

1.  Install **Node.js LTS** and **Git**.
2.  Clone the repository:

    ```bash
    git clone https://github.com/Lakens/QuartoReview.git
    cd QuartoReview
    ```

3.  Install dependencies:

    ```bash
    npm run install:backend
    npm run install:frontend
    ```

4.  In the first Terminal window, start the backend:

    ```bash
    cd backend
    npm start
    ```

5.  In a second Terminal window, start the frontend:

    ```bash
    cd frontend
    npm start
    ```

6.  Open your browser at:

    ```text
    http://localhost:5173
    ```

#### Option 3: Build the desktop app yourself

This still creates an unsigned app unless you add signing yourself, but some users prefer building from source on their own machine instead of downloading a prebuilt binary.

**Windows**

1.  Install **Node.js LTS** and **Git**.
2.  Clone the repository:

    ```powershell
    git clone https://github.com/Lakens/QuartoReview.git
    cd QuartoReview
    ```

3.  Run:

    ```powershell
    .\build_win.bat
    ```

4.  When the build finishes, the installer will be in:

    ```text
    dist\
    ```

**macOS**

1.  Install **Node.js LTS** and **Git**.
2.  Clone the repository:

    ```bash
    git clone https://github.com/Lakens/QuartoReview.git
    cd QuartoReview
    ```

3.  Run:

    ```bash
    chmod +x build_mac.sh
    ./build_mac.sh
    ```

4.  When the build finishes, the macOS artifacts will be in:

    ```text
    dist/
    ```

### First launch

On first launch, QuartoReview opens to an empty workspace.

From the app menu you can:

*   use **Open local file…** to edit a file on your computer
    
*   use **Open guide** to read the bundled `GUIDE.md`
    
*   use **Set up GitHub access** to work directly with GitHub repositories

* * *

## What It Does

*   Edit `.qmd`, `.Rmd`, and `.md` files with a rich WYSIWYG interface
    
*   Run R code chunks directly in the browser using WebAssembly
    
*   Auto-install R packages referenced in the document
    
*   Load and save files from GitHub repositories
    
*   Add comments, track changes, citations, preview, and diffs
    
*   Add citations from Zotero or by DOI, then save them to `references.bib`

* * *

## GitHub Setup

GitHub mode is optional. Local file mode works without any account.

On first use of GitHub mode:

1.  Open the app menu.
    
2.  Choose **Set up GitHub access**.
    
3.  Choose either:
    
    *   **Personal token**
        
    *   **GitHub OAuth app**

### Option A - Personal access token

This is the simplest route for a single-user desktop install.

1.  In QuartoReview, choose **Personal token**
    
2.  Click **Open GitHub token page**
    
3.  Create a token with repository access
    
4.  Paste it into QuartoReview
    
5.  Save

### Option B - GitHub OAuth app

Use this if you want the explicit GitHub authorization flow.

1.  In QuartoReview, choose **GitHub OAuth app**
    
2.  Create a GitHub OAuth app with:

| Field | Value |
| --- | --- |
| Application name | QuartoReview |
| Homepage URL | http://127.0.0.1 |
| Authorization callback URL | http://127.0.0.1/api/auth/callback |

3.  Paste the client ID and client secret into QuartoReview
    
4.  Continue to GitHub

For desktop installs, QuartoReview now chooses a free local port automatically. The loopback callback above is the stable OAuth app setting, and the app fills in the active port at runtime.

Desktop configuration is stored locally in:

*   macOS: `~/Library/Application Support/QuartoReview/.env`
    
*   Windows: `%APPDATA%\QuartoReview\.env`

* * *

## Running R Code

R runs entirely in your browser - no local R installation is required.

When you open a `.qmd`, `.Rmd`, or `.md` file, QuartoReview automatically:

1.  scans the document for `library()` and `require()` calls
    
2.  installs those packages in the in-browser R environment
    
3.  loads each package
    
4.  scans for file-reading calls like `read_csv()`, `read_excel()`, `load()`, and `source()`
    
5.  fetches referenced data files from GitHub into WebR’s virtual filesystem

A blue banner shows progress while packages and data files are loading.

* * *

## References

QuartoReview supports two citation workflows for GitHub-backed documents:

1.  Use the `Cite` button in the toolbar to pick a reference from Zotero with Better BibTeX.
    
2.  Select text in the editor, then use the citation bubble to enter a DOI such as `10.1037/xlm0001204`.

Both methods insert a citation into the document and save the reference into `references.bib`, typically next to the document in the repository.

In local-file mode, bibliography support is more limited and there is not yet the same managed `references.bib` save flow.

* * *

## Troubleshooting

**Windows says the app is unsafe** -> This is expected for an unsigned app. Use **More info** -> **Run anyway** only if you downloaded it from this repository’s Releases page.

**macOS says the app cannot be opened** -> Open **System Settings** -> **Privacy & Security** and click **Open Anyway** for QuartoReview. If that still does not work, as a last resort run `xattr -dr com.apple.quarantine "/Applications/QuartoReview.app"` in Terminal for the copy you downloaded from the official Releases page.

**The app opens but I cannot see repositories** -> Complete the in-app GitHub setup flow successfully first. Repositories only appear after authentication.

**R code gives “there is no package called …”** -> Wait for the package-install banner to finish before running code.

**R code gives “cannot open file …: No such file or directory”** -> Check that the file exists in the repository and that the path in your code is correct relative to the document.

**A local port is already in use** -> Restart QuartoReview. Recent versions automatically choose a free local port and clean up old embedded backend processes more reliably after crashes.

> Need help? Submit issues at github.com/Lakens/QuartoReview.

* * *

## Building From Source

If you want to build the app yourself:

1.  Install Node.js 18 or later from https://nodejs.org
    
2.  Clone the repository:

```bash
git clone https://github.com/Lakens/QuartoReview.git
cd QuartoReview
```

3.  Install dependencies:

```bash
npm run install:all
```

4.  Launch in desktop mode:

```bash
npm start
```

5.  Build installers:

```bash
build_win.bat
```

```bash
chmod +x build_mac.sh
./build_mac.sh
```

Generated installers go into `dist/`.

`dist/` is intentionally ignored by git because it contains generated build output and platform-specific binaries. Share releases through GitHub Releases instead of committing `dist/`.

* * *

## CI and Releases

*   `.github/workflows/build-desktop.yml` builds Windows and macOS apps when app-relevant files change
    
*   `.github/workflows/release-desktop.yml` builds and publishes tagged releases such as `v1.0.1`
    
*   Releases attach stable download assets:
    
    *   `QuartoReview-Windows.exe`
        
    *   `QuartoReview-macOS.dmg`
        
    *   `QuartoReview-macOS.zip`

* * *

## Project Structure

```text
QuartoReview/
|- electron/             # Electron main/preload process
|- backend/              # Express API server embedded in the desktop app
|- frontend/             # React + Vite app
|- GUIDE.md              # In-app startup guide
|- build_win.bat
|- build_mac.bat
|- build_mac.sh
|- README.md
```

* * *

## License

MIT License - see LICENSE.md.

* * *

## Built On Resolve

QuartoReview is a fork of Resolve by Michel Nivard. The original Resolve provided the foundational architecture on which this project is built.

Major additions in this fork include:

*   `.qmd`, `.Rmd`, and `.md` support
    
*   Vite migration
    
*   live preview pane
    
*   WebR in-browser R execution
    
*   GitHub data file sync for R workflows
    
*   Zotero citation picker
    
*   Harper local grammar and spell checking
    
*   diff viewer
    
*   dark mode
    
*   word count and unsaved-words warning
    
*   commit message dialog
    
*   desktop packaging for Windows and macOS, splash screen
    
*   Search functionality (CTRL+F)

Issues and contributions: github.com/Lakens/QuartoReview
