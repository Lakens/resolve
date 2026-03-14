# QuartoReview User Guide

QuartoReview is a desktop application for editing and reviewing Quarto (`.qmd`), R Markdown (`.Rmd`), and Markdown (`.md`) documents. It provides a rich WYSIWYG editor with track changes, comments, references, R chunk preview, and version comparison.

* * *

## 1\. Opening and Saving Files

QuartoReview supports two modes: **local file mode** and **GitHub mode**. You can switch between them at any time.

### Local File Mode (no account required)

1.  Click the **hamburger menu** (≡) in the top-right corner of the toolbar.
    
2.  Select **Open local file**.
    
3.  Browse to any `.qmd`, `.Rmd`, or `.md` file on your computer and open it.
    
4.  The file opens in the editor. The filename appears in the toolbar.
    
5.  To save, click the **Save** button (💾) in the toolbar, or use **Ctrl+S**. The file is saved back to its original location on your computer — no account or internet connection required.

In local file mode, **no data leaves your computer**.

### GitHub Mode (optional)

GitHub mode lets you load and save files directly from your GitHub repositories.

1.  Click the **hamburger menu** (≡) and select **Set up GitHub access**.
    
2.  Follow the instructions to create a GitHub Personal Access Token (PAT) and enter it in the setup screen.
    
3.  Once connected, use the **repository** and **file** dropdowns in the toolbar to select a file from your GitHub account.
    
4.  To save, click the **Save** button. You will be prompted for a commit message before the file is saved back to GitHub.

> **Tip:** If you have a bibliography file (`references.bib`) in the same folder as your document, QuartoReview will load it automatically.

### Supported File Formats

| Extension | Description |
| --- | --- |
| .qmd | Quarto Markdown |
| .Rmd | R Markdown |
| .md | Plain Markdown |
| .ipynb | Jupyter Notebook |

* * *

## 2\. Editing, Commenting, and Tracking Changes

### Editing

The editor is a WYSIWYG (what-you-see-is-what-you-get) editor. You can type directly in the document, and formatting is rendered immediately. Standard text formatting is available through the toolbar:

*   **Bold**, _Italic_, Underline, ~Strikethrough~
    
*   Headings (H1–H4)
    
*   Bullet lists and numbered lists
    
*   Block quotes
    
*   Inline code and code blocks
    
*   Math equations (LaTeX syntax, rendered with MathJax)

Code chunks (R, Python, etc.) appear as distinct blocks with syntax highlighting. Their chunk options (e.g., `echo=FALSE`, chunk names) are preserved exactly when saving.

### Comments

1.  Select any text in the document.
    
2.  A small toolbar will appear above the selection — click the **comment icon** (💬).
    
3.  Type your comment in the text field that appears and press **Enter** or click **Add**.
    
4.  The commented text is highlighted, and the comment appears in the **sidebar** on the right.
    
5.  Click a comment in the sidebar to navigate to the corresponding text.
    
6.  To resolve a comment, click the **checkmark** (✓) next to it in the sidebar.

### Track Changes

Track changes records all edits as suggestions that can be accepted or rejected — useful for collaborative review.

1.  Click the **Track Changes** button in the toolbar (it highlights when active).
    
2.  While track changes is on:
    
    *   **Added text** appears in blue.
        
    *   **Deleted text** appears in red with strikethrough.
        
3.  To review changes, use the **accept** (✓) and **reject** (✗) buttons that appear next to each change, or use the toolbar buttons to accept or reject all changes at once.
    
4.  Turn off track changes by clicking the button again. New edits will no longer be marked.

### Sharing (GitHub mode only)

Click the **Share** button in the toolbar to get a shareable link to the document on GitHub, or to invite collaborators by GitHub username.

* * *

## 3\. Adding References

QuartoReview has built-in support for academic references using `.bib` bibliography files.

### Setting Up a Bibliography

*   Place a `references.bib` file in the same directory as your document.
    
*   QuartoReview will detect and load it automatically when you open the file.

### Inserting a Citation

1.  Position your cursor where you want the citation, or select some text.
    
2.  A small toolbar appears — click the **cite icon** (📖).
    
3.  In the citation dialog, you can:
    
    *   **Search your existing bibliography** by author, title, or key and select an entry.
        
    *   **Enter a DOI** to automatically fetch the reference from the internet and add it to your `references.bib` file.
        
4.  The citation is inserted as `[@citation-key]` in the source. In the WYSIWYG view it renders as a formatted inline citation.

### Citation Syntax (for manual editing)

If you prefer to edit citations directly in the source, use standard Pandoc citation syntax:

| Syntax | Result |
| --- | --- |
| @smith2020 | Single citation |
| @smith2020 | Multiple citations |
| @smith2020 | Citation with page number |
| @smith2020 | Suppress author name |

### Bibliography File

When you add a citation via DOI, the reference is automatically appended to your `references.bib` file and saved alongside your document (either locally or to GitHub).

* * *

## 4\. Previewing and Evaluating R Chunks

QuartoReview can render and preview R code chunks directly in the editor, so you can see output without leaving the app.

### R Chunk Blocks

R code chunks appear as distinct blocks in the editor, labeled with the language (e.g., `r`). Chunk options such as `echo=FALSE`, `eval=FALSE`, or chunk names are displayed and preserved exactly when saving — they are never silently removed.

A typical chunk looks like this in source:

```{r my-chunk, echo=FALSE}
summary(mtcars)
```

### Previewing Output

1.  Click the **Run** button (▶) inside an R chunk, or use the **Run All** button in the toolbar to evaluate all chunks.
    
2.  Output appears directly below the chunk: tables, plots, and text output are all rendered inline.
    
3.  If R is not installed or not available, chunk output cannot be evaluated locally. The chunk text is still fully editable.

### Chunk Options

Common chunk options you can set directly in the chunk header:

| Option | Effect |
| --- | --- |
| echo=FALSE | Hide code, show output |
| eval=FALSE | Show code, do not run |
| include=FALSE | Run code, hide everything |
| fig.cap="..." | Add a figure caption |

These options are written and preserved verbatim — editing them in the WYSIWYG view updates the underlying source correctly.

* * *

## 5\. Comparing and Exporting Differences Across Versions

QuartoReview includes a **Diff Viewer** that lets you compare two versions of a document and export the differences.

### Opening the Diff Viewer

1.  Click the **Diff** button in the toolbar (or select it from the menu).
    
2.  The diff viewer opens in a split-pane view.

### Comparing Versions

You can compare:

*   **Two GitHub commits**: Select a repository and choose two commits from the dropdowns. The diff is computed from the raw `.qmd`/`.Rmd`/`.md` source files.
    
*   **Current document vs. saved version**: The diff highlights what has changed since the last save.

Differences are shown line by line:

*   **Green lines** — added content
    
*   **Red lines** — removed content
    
*   **Unchanged lines** — shown for context

### Exporting Differences

1.  In the diff viewer, click **Export** (or **Download**).
    
2.  The diff is exported as a formatted document (Word `.docx` or plain text) showing added and removed content, suitable for sharing with collaborators or reviewers who do not use QuartoReview.

* * *

## 6\. Interface

### Toolbar (top bar)

The toolbar runs across the top of the editor and contains the main controls:

| Element | Description |
| --- | --- |
| Repository / File dropdowns | (GitHub mode) Select which repo and file to load |
| Local filename | (Local mode) Shows the name of the open file |
| Save | Save the current document |
| Track Changes | Toggle track-changes mode on/off |
| Bold / Italic / etc. | Text formatting buttons |
| Heading level | Set heading level (H1–H4) |
| Lists | Bullet and numbered list buttons |
| Cite | Open the citation/reference dialog |
| Comment | Add a comment to selected text |
| Run / Run All | Execute R chunks |
| Diff | Open the diff/version comparison view |
| Share | (GitHub mode) Share the document |
| Dark mode | Toggle between light and dark theme |
| Menu | Hamburger menu: Open local file, Set up GitHub, Feedback |

### Sidebar

The sidebar on the right shows:

*   **Comments** — all comments in the document, in order. Click a comment to jump to it in the editor.
    
*   **Track changes** — pending suggestions that can be accepted or rejected.

Click the sidebar toggle button to show or hide the sidebar.

### Presence Indicators (GitHub mode)

When multiple people have the same GitHub document open, their avatars appear in the toolbar. QuartoReview does **not** support simultaneous editing — presence indicators help you avoid editing at the same time as someone else.

### Dark Mode

Click the **moon icon** (🌙) in the toolbar to switch to dark mode. The setting persists across sessions.

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+S | Save file |
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+Shift+C | Add comment |


