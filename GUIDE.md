# QuartoReview User Guide

QuartoReview is a desktop application for editing and reviewing Quarto (`.qmd`), R Markdown (`.Rmd`), and Markdown (`.md`) documents. It provides a rich WYSIWYG editor with track changes, comments, references, R chunk preview, and version comparison.

**Be aware that this tool can contain bugs, and can overwrite your files. Keep a backup version of all documents you will edit with this tool.**

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

QuartoReview has built-in support for academic references using `.bib` bibliography files. You need to have Zotero installed and open, and the 'BetterBibtex' plugin. This will allow you to directly communicate with your Zotero library. Alternatively, you can manually edit the .bib file.

### Setting Up a Bibliography

*   Place a `references.bib` file in the same directory as your document.
    
*   QuartoReview will detect and load it automatically when you open the file.

### Inserting a Citation

1.  Position your cursor where you want the citation, or select some text.
    
2.  Click the 'Cite' button in the toolbar to launch the Zotero selection window.
    
3.  In the citation dialog, you can **search your existing bibliography** by author, title, or key and select an entry. The citation is inserted as `[@citation-key]` in the source file. In the Preview window it renders as a formatted inline citation with following APA 7 guidelines.

### Bibliography File

When you add a citation via Zotero, the reference is automatically appended to your `references.bib` file and saved alongside your document (either locally or to GitHub).

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

1.  Click the **Run** button (▶) inside an R chunk.
    
2.  Output appears directly below the chunk, printed by WebR: tables, plots, and text output are all rendered inline.

### R inline code

To view all inline code (presented in Qmd files inside "\`") you can click the 'r' button in the toolbar. This will achieve two things

1.  In the text editor, the inline code will change color, and hovering over the inline code will show the result of the code. The code is not replaced with the result, as this is the raw Qmd file.
    
2.  In the preview window, inline code chunks are replaced by the result of the code.

### Chunk Options

Common chunk options you can set directly in the chunk header:

| Option | Effect |
| --- | --- |
| echo=FALSE | Hide code, show output |
| eval=FALSE | Show code, do not run |
| include=FALSE | Run code, hide everything |
| fig.cap=“…” | Add a figure caption |

These options are written and preserved verbatim — editing them in the WYSIWYG view updates the underlying source correctly.

* * *

## 5\. Comparing and Exporting Differences Across Versions

QuartoReview includes a **Diff** Viewer that lets you compare two versions of a document and export the differences.

### Opening the Diff Viewer

1.  Click the **Diff** button in the toolbar.
    
2.  The diff viewer opens in a split-pane view.

### Comparing Versions

You can select the option ‘Since this version’ or ‘In this version’.

*   **Select a previous version of the document from the GitHub repository.** The diff is computed from the raw `.qmd`/`.Rmd`/`.md` source files, and compared to the current version.
    
*   **Since this version vs. In this version**: The diff highlights what has changed since the last version selected, or the changes that were made in that version compared to the version immediately preceding it.

Differences are shown line by line:

*   **Green lines** — added content
    
*   **Red lines** — removed content

### Exporting Differences

1.  In the diff viewer, click **Download HTML**.
    
2.  The diff is exported as an html document (`.html`) showing added and removed content, suitable for sharing with collaborators or reviewers to communicate all changes - in text and in code - since a previous version.

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
