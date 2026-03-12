import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribePackageStatus } from '../../utils/webRSingleton';
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
import { CommentsSidebar } from '../Comments/CommentsSidebar';
import { PreviewPane } from './PreviewPane';
import LoginButton from '../Auth/LoginButton';
import { fetchNotebooksInRepo } from '../../utils/api';
import InlineMath from '../../utils/InlineMath/inlineMath';
import { formatApaReference } from '../../utils/apaUtils';
import { LanguageToolExtension } from './LanguageToolExtension';
import { LanguageToolPopover } from './LanguageToolPopover';

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
  const [notebooks, setNotebooks] = useState([]);
  const [error, setError] = useState(null);
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(false);
  const [commentMarkKey, setCommentMarkKey] = useState(0);
  const [pkgStatus, setPkgStatus] = useState({ phase: 'idle', current: null, index: 0, total: 0 });

  useEffect(() => {
    return subscribePackageStatus(setPkgStatus);
  }, []);

  const handleTrackChangesToggle = (enabled) => {
    setTrackChangesEnabled(enabled);
  }

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

  // Attach referenceManager to editor when both are available
  useEffect(() => {
    if (editor && referenceManager) {
      editor.referenceManager = referenceManager;
    }
  }, [editor, referenceManager]);

  // Word count — prose only, excludes codeCell and rawCell nodes
  const [wordCount, setWordCount] = useState(0);
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
    countWords();
    editor.on('update', countWords);
    return () => editor.off('update', countWords);
  }, [editor]);

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
    } catch (error) {
      setError(error.message);
    }
  }

  const onSaveFileClick = async () => {
    if (!editor) return;
    try {
      await handleSaveFile(editor);
    } catch (error) {
      setError(error.message);
    }
  }

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
    }
  }, [editor, qmdContent]);

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
      {(pkgStatus.phase === 'installing' || pkgStatus.phase === 'error') && (
        <div className={`pkg-install-banner${pkgStatus.phase === 'error' ? ' pkg-install-banner--error' : ''}`}>
          {pkgStatus.phase === 'installing'
            ? `Installing R packages… ${pkgStatus.current} (${pkgStatus.index}/${pkgStatus.total})`
            : 'R package installation failed — check browser console (F12) for details'}
        </div>
      )}
      <header className="app-header">
        <div className="header-top">
          <div className="header-controls">
            <div className="header-row">
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
            </div>
            <div className="header-row">
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
              <button className="hdr-btn" onClick={onLoadFile}>
                {filePath?.endsWith('.qmd') ? 'Load' : 'Load'}
              </button>
              <button className="hdr-btn" onClick={onSaveFileClick}>
                Save
              </button>
            </div>
          </div>
        </div>
        {editor && (
          <EditorToolbar
            editor={editor}
            selectedRepo={selectedRepo}
            filePath={filePath}
            referenceManager={referenceManager}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview(v => !v)}
          />
        )}
      </header>

      <main className="app-main flex-grow overflow-y-auto">
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
              {showPreview && <PreviewPane editor={editor} references={references || referenceManager?.getReferences()} />}
              {!showPreview && editor && <CommentsSidebar editor={editor} />}
            </div>
          </div>
        )}
      </main>

      <LanguageToolPopover
        match={ltMatch}
        anchorPos={ltAnchorPos}
        onAccept={handleLtAccept}
        onDismiss={handleLtDismiss}
      />
    </div>
  );
};

export default EditorWrapper;
