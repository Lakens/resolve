import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaSun, FaMoon, FaEdit, FaShare } from 'react-icons/fa';
import ShareModal from '../Share/ShareModal';
import { useAuth } from '../../contexts/AuthContext';
import { subscribePackageStatus, subscribeFileStatus, installPackagesForQmd, syncFilesForQmd, evaluateInlineExpressions, getInlineRCache } from '../../utils/webRSingleton';
import { fetchNotebooksInRepo, fetchRawFile } from '../../utils/api';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mathematics from 'tiptap-math';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { CitationMark } from '../Citation/CitationMark';
import EditorBubbleMenuManager from './EditorBubbleMenuManager';
import { TrackChangeExtension } from '../../utils/TrackChanges';
import { CommentMark } from '../../utils/CommentMark';
import { RawCell } from '../../cells/rawCell';
import { CodeCell } from '../../cells/codeCell';
import { ipynbToTiptapDoc } from '../../utils/notebookConversionUtils';
import { qmdToTiptapDoc } from '../../utils/quartoConversionUtils';
import EditorToolbar from './EditorToolbar';
import { InlineRExtension } from './InlineRDecoration';
import { CommentsSidebar } from '../Comments/CommentsSidebar';
import { PreviewPane } from './PreviewPane';
import LoginButton from '../Auth/LoginButton';
import InlineMath from '../../utils/InlineMath/inlineMath';
import { formatApaReference } from '../../utils/apaUtils';
import { LanguageToolExtension } from './LanguageToolExtension';
import { LanguageToolPopover } from './LanguageToolPopover';
import DiffViewer from './DiffViewer';

const ReferencesList = ({ references }) => {
  if (!references || references.length === 0) return null;

  return (
    <div className="references-section">
      <h2>References</h2>
      <div>
        {references.map((ref, index) => (
          <p
            key={index}
            className="reference-item"
            dangerouslySetInnerHTML={{ __html: formatApaReference(ref.entryTags || {}) }}
          />
        ))}
      </div>
    </div>
  );
};

const EditorWrapper = ({
  referenceManager,
  filePath,
  setFilePath,
  ipynb,
  setIpynb,
  qmdContent,
  handleLoadFile,
  handleSaveFile,
  saveMessage,
  repositories,
  selectedRepo,
  setSelectedRepo,
  extensions,
  references,
}) => {
  const { isAuthenticated } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [notebooks, setNotebooks] = useState([]);
  const [error, setError] = useState(null);
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(false);
  const [commentMarkKey, setCommentMarkKey] = useState(0);
  const [pkgStatus, setPkgStatus] = useState({ phase: 'idle', current: null, index: 0, total: 0 });
  const [fileStatus, setFileStatus] = useState({ phase: 'idle', current: null, synced: 0, total: 0, skipped: [] });
  const [pkgBannerDismissed, setPkgBannerDismissed] = useState(false);
  const [fileBannerDismissed, setFileBannerDismissed] = useState(false);
  const [inlineRCache, setInlineRCache] = useState(() => getInlineRCache());
  const [isRenderingInlineR, setIsRenderingInlineR] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    return subscribePackageStatus(setPkgStatus);
  }, []);

  useEffect(() => {
    return subscribeFileStatus(setFileStatus);
  }, []);

  const handleCommentMarkUpdate = () => {
    setCommentMarkKey((prev) => prev + 1);
  }

  // LanguageTool popover state
  const [ltMatch, setLtMatch] = useState(null);
  const [ltAnchorPos, setLtAnchorPos] = useState(null);
  const ltMatchClickRef = useRef(null);
  ltMatchClickRef.current = useCallback((match, event) => {
    setLtMatch(match);
    setLtAnchorPos({ x: event.clientX, y: event.clientY });
  }, []);

  const handleLtDismiss = useCallback(() => {
    setLtMatch(null);
    setLtAnchorPos(null);
  }, []);

  const editor = useEditor({
    extensions: extensions || [
      StarterKit,
      RawCell,
      CodeCell,
      Underline,
      Highlight,
      Table,
      TableCell,
      TableHeader,
      TableRow,
      TrackChangeExtension,
      Mathematics,
      InlineMath,
      CommentMark.configure({
        HTMLAttributes: { class: 'comment-mark' },
        onUpdate: handleCommentMarkUpdate
      }),
      CitationMark,
      InlineRExtension,
      LanguageToolExtension.configure({
        onMatchClick: (match, event) => ltMatchClickRef.current?.(match, event),
      }),
    ],
    content: '',
    enableContentCheck: true,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
          spellcheck: 'true',
      },
    },
  });

  const handleLtAccept = useCallback((replacement) => {
    if (!editor || !ltMatch) return;
    editor.chain().focus().deleteRange({ from: ltMatch.from, to: ltMatch.to }).insertContentAt(ltMatch.from, replacement).run();
    handleLtDismiss();
  }, [editor, ltMatch, handleLtDismiss]);

  const handleRenderInlineR = useCallback(async () => {
    if (!editor || isRenderingInlineR) return;
    setIsRenderingInlineR(true);
    try {
      const exprs = new Set();
      const re = /`r\s+([^`]+?)`/g;
      editor.state.doc.descendants(node => {
        if (!node.isText) return;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(node.text)) !== null) exprs.add(m[1].trim());
      });
      if (exprs.size === 0) return;
      await evaluateInlineExpressions([...exprs]);
      setInlineRCache(new Map(getInlineRCache()));
      editor.view.dispatch(editor.view.state.tr.setMeta('inlineRUpdated', true));
    } finally {
      setIsRenderingInlineR(false);
    }
  }, [editor, isRenderingInlineR]);

  const onToggleTrackChanges = useCallback(() => {
    if (!editor) return;
    editor.commands.toggleTrackChangeStatus();
    const ext = editor.extensionManager.extensions.find(e => e.name === 'trackchange');
    setTrackChangesEnabled(ext?.options.enabled ?? false);
  }, [editor]);

  // Attach referenceManager to editor when both are available
  useEffect(() => {
    if (editor && referenceManager) {
      editor.referenceManager = referenceManager;
    }
  }, [editor, referenceManager]);

  // Word count — prose only, excludes codeCell and rawCell nodes
  const [wordCount, setWordCount] = useState(0);
  const wordCountAtLastSave = useRef(0);
  const isDirty = useRef(false);
  useEffect(() => {
    if (!editor) return;
    const countWords = () => {
      let text = '';
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'codeCell' || node.type.name === 'rawCell') return false;
        if (node.isText) text += ' ' + node.text;
      });
      setWordCount(text.trim().split(/\s+/).filter(w => w.length > 0).length);
    };
    const markDirty = () => { isDirty.current = true; };
    countWords();
    editor.on('update', countWords);
    editor.on('update', markDirty);
    return () => {
      editor.off('update', countWords);
      editor.off('update', markDirty);
    };
  }, [editor]);

  // Warn before closing/refreshing when there are unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const loadNotebooks = async () => {
      if (selectedRepo) {
        try {
          const repository = `${selectedRepo.owner.login}/${selectedRepo.name}`;
          const notebookList = await fetchNotebooksInRepo(repository);
          setNotebooks(notebookList);
          // Just populate the dropdown; don't auto-load
          if (!filePath && notebookList.length > 0) {
            setFilePath(notebookList[0]);
          }
        } catch (err) {
          setError('Failed to load notebooks');
          console.error('Error loading notebooks:', err);
        }
      }
    };
    loadNotebooks();
  }, [selectedRepo]);

  const onLoadFile = async () => {
    try {
      await handleLoadFile();
      isDirty.current = false;
    } catch (error) {
      setError(error.message);
    }
  }

  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');

  const onSaveFileClick = () => {
    if (!editor) return;
    setCommitMsg('');
    setShowCommitDialog(true);
  };

  const onCommitConfirm = async () => {
    setShowCommitDialog(false);
    try {
      await handleSaveFile(editor, commitMsg.trim() || 'Update document');
      wordCountAtLastSave.current = wordCount;
      isDirty.current = false;
    } catch (error) {
      setError(error.message);
    }
  };

  // Determine if it's an error message by checking the content of saveMessage
  const isError = saveMessage && saveMessage.toLowerCase().includes('error');

  useEffect(() => {
    if (editor && ipynb) {
      // Use requestAnimationFrame to schedule the update outside of React's rendering cycle
      requestAnimationFrame(() => {
        try {
          ipynbToTiptapDoc(ipynb, editor);
        } catch (err) {
          setError(err.message);
        }
      });
    }
  }, [editor, ipynb]);

  useEffect(() => {
    if (editor && qmdContent) {
      requestAnimationFrame(() => {
        try {
          qmdToTiptapDoc(qmdContent, editor);
        } catch (err) {
          setError(err.message);
        }
      });
      // Reset any previously dismissed banners for the new file
      setPkgBannerDismissed(false);
      setFileBannerDismissed(false);
      // Install + load packages, then sync data files into WebR's virtual FS.
      // Run sequentially: package installation uses evalRVoid internally, so
      // completing it first avoids concurrent R evaluations.
      const repo = selectedRepo ? `${selectedRepo.owner.login}/${selectedRepo.name}` : null;
      installPackagesForQmd(qmdContent).then(() => {
        syncFilesForQmd(qmdContent, filePath, repo, fetchRawFile);
      });
    }
  }, [editor, qmdContent]);

  // After content loads, reset the save baseline so newly-loaded words don't
  // count as unsaved. Double rAF: first rAF is when the content conversion runs;
  // second rAF is after the editor has updated and we can read the real count.
  useEffect(() => {
    if (!editor || (!ipynb && !qmdContent)) return;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let text = '';
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'codeCell' || node.type.name === 'rawCell') return false;
          if (node.isText) text += ' ' + node.text;
        });
        wordCountAtLastSave.current = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      });
    });
    return () => cancelAnimationFrame(outer);
  }, [editor, ipynb, qmdContent]);

  // Handle editor cleanup
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="app-container">
      {saveMessage && (
        <div className={`notification ${isError ? 'error' : ''}`}>
          {saveMessage}
        </div>
      )}
      <div className="banner-stack">
        {/* Progress banners — shown while active, not dismissable */}
        {pkgStatus.phase === 'installing' && (
          <div className="pkg-install-banner">
            {`Installing R packages… ${pkgStatus.current} (${pkgStatus.index}/${pkgStatus.total})`}
          </div>
        )}
        {fileStatus.phase === 'syncing' && (
          <div className="pkg-install-banner">
            {`Fetching data files… ${fileStatus.current || ''} (${fileStatus.synced + 1}/${fileStatus.total})`}
          </div>
        )}
        {/* Result banners — dismissable */}
        {pkgStatus.phase === 'done' && !pkgBannerDismissed && (
          <div className="pkg-install-banner pkg-install-banner--success">
            R packages installed and loaded.
            <button className="pkg-install-banner__close" onClick={() => setPkgBannerDismissed(true)} title="Dismiss">✕</button>
          </div>
        )}
        {pkgStatus.phase === 'error' && !pkgBannerDismissed && (
          <div className="pkg-install-banner pkg-install-banner--error">
            {pkgStatus.errors?.length > 0
              ? `Could not install: ${pkgStatus.errors.map(e => e.pkg).join(', ')} — not available for WebAssembly.`
              : 'R package installation failed — check browser console (F12) for details'}
            <button className="pkg-install-banner__close" onClick={() => setPkgBannerDismissed(true)} title="Dismiss">✕</button>
          </div>
        )}
        {fileStatus.phase === 'done' && fileStatus.total > 0 && !fileBannerDismissed && (
          fileStatus.skipped.length > 0 ? (
            <div className="pkg-install-banner pkg-install-banner--error">
              {`Data files not found in repository: ${fileStatus.skipped.join(', ')}`}
              <button className="pkg-install-banner__close" onClick={() => setFileBannerDismissed(true)} title="Dismiss">✕</button>
            </div>
          ) : (
            <div className="pkg-install-banner pkg-install-banner--success">
              {`All ${fileStatus.total} data file${fileStatus.total !== 1 ? 's' : ''} loaded.`}
              <button className="pkg-install-banner__close" onClick={() => setFileBannerDismissed(true)} title="Dismiss">✕</button>
            </div>
          )
        )}
      </div>
      <header className="app-header">
        <div className="header-top">
          <img src="/logo.png" alt="QuartoReview" className="app-logo" />
          <select
            value={selectedRepo?.fullName || ''}
            onChange={(e) => {
              const repo = repositories.find(r => r.fullName === e.target.value);
              setSelectedRepo(repo);
            }}
            className="repo-select"
          >
            <option value="">Select Repository</option>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.fullName}>
                {repo.fullName}
              </option>
            ))}
          </select>
          <select
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            className="file-select"
          >
            <option value="">Select a file</option>
            {notebooks.map((notebook) => (
              <option key={notebook} value={notebook}>
                {notebook}
              </option>
            ))}
          </select>
          <button className="hdr-btn" onClick={onLoadFile}>Load</button>
          <button className="hdr-btn" onClick={onSaveFileClick}>Save</button>
          {wordCount - wordCountAtLastSave.current >= 50 && (
            <span className="hdr-save-nudge">
              {wordCount - wordCountAtLastSave.current} unsaved words
            </span>
          )}
          <button
            className="hdr-dark-toggle"
            onClick={() => setDarkMode(v => !v)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="hdr-dark-icon">{darkMode ? <FaSun /> : <FaMoon />}</span>
            <span className={`hdr-dark-track${darkMode ? ' is-active' : ''}`}>
              <span className="hdr-dark-thumb" />
            </span>
          </button>
          <button
            className="hdr-dark-toggle"
            onClick={onToggleTrackChanges}
            title={trackChangesEnabled ? 'Disable track changes' : 'Enable track changes'}
          >
            <span className="hdr-dark-icon"><FaEdit /></span>
            <span className={`hdr-dark-track${trackChangesEnabled ? ' is-active' : ''}`}>
              <span className="hdr-dark-thumb" />
            </span>
          </button>
          <button
            className="hdr-btn hdr-share-btn"
            onClick={() => setIsShareModalOpen(true)}
            title="Share document"
          >
            <FaShare /> Share
          </button>
        </div>
        {editor && (
          <EditorToolbar
            editor={editor}
            referenceManager={referenceManager}
            showPreview={showPreview}
            onTogglePreview={() => { setShowPreview(v => !v); setShowDiff(false); }}
            showDiff={showDiff}
            onToggleDiff={() => { setShowDiff(v => !v); setShowPreview(false); }}
            onRenderInlineR={handleRenderInlineR}
            isRenderingInlineR={isRenderingInlineR}
          />
        )}
      </header>

      <main className="app-main">
        {!isAuthenticated ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
            <LoginButton />
          </div>
        ) : (
          <div className="content-container">
            <div className="editor-with-sidebar">
              <div className="editor-container">
                {editor?.isEditable && editor?.view && <EditorBubbleMenuManager editor={editor} />}
                <div className="editor-main">
                  <div className="editor-content-container">
                    <EditorContent editor={editor} />
                    <div className="references-container">
                      <ReferencesList references={references || referenceManager?.getReferences()} />
                    </div>
                  </div>
                  <div className="editor-statusbar">
                    {wordCount.toLocaleString()} words
                  </div>
                </div>
              </div>
              {showDiff    && <DiffViewer editor={editor} selectedRepo={selectedRepo} filePath={filePath} />}
              {showPreview && !showDiff && <PreviewPane editor={editor} references={references || referenceManager?.getReferences()} inlineRCache={inlineRCache} />}
              {!showPreview && !showDiff && editor && <CommentsSidebar editor={editor} />}
            </div>
          </div>
        )}
      </main>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        repository={selectedRepo?.fullName}
        filePath={filePath}
      />

      <LanguageToolPopover
        match={ltMatch}
        anchorPos={ltAnchorPos}
        onAccept={handleLtAccept}
        onDismiss={handleLtDismiss}
      />

      <footer className="app-footer">
        Built on <a href="https://github.com/MichelNivard/resolve" target="_blank" rel="noreferrer">Resolve</a> by Michel Nivard. Made by Daniel Lakens. Submit issues to <a href="https://github.com/Lakens/QuartoReview" target="_blank" rel="noreferrer">github.com/Lakens/QuartoReview</a>.
      </footer>

      {showCommitDialog && (
        <div className="commit-dialog-overlay" onClick={() => setShowCommitDialog(false)}>
          <div className="commit-dialog" onClick={e => e.stopPropagation()}>
            <h3>Describe your changes</h3>
            <input
              className="commit-dialog-input"
              type="text"
              placeholder="e.g. Revised introduction, added references"
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onCommitConfirm(); if (e.key === 'Escape') setShowCommitDialog(false); }}
              autoFocus
            />
            <div className="commit-dialog-actions">
              <button className="commit-dialog-cancel" onClick={() => setShowCommitDialog(false)}>Cancel</button>
              <button className="commit-dialog-save" onClick={onCommitConfirm}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorWrapper;
