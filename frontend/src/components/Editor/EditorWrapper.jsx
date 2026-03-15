import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaSun, FaMoon, FaEdit, FaBars, FaSpellCheck } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribePackageStatus,
  subscribeFileStatus,
  installPackagesForQmd,
  syncFilesForQmd,
  evaluateInlineExpressions,
  getInlineRCache,
  resetPackageStatus,
  resetFileStatus,
  setFileStatusError,
} from '../../utils/webRSingleton';
import { fetchNotebooksInRepo, fetchRawFile, zoteroPickReference } from '../../utils/api';
import { Extension } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Plugin, PluginKey } from 'prosemirror-state';
import StarterKit from '@tiptap/starter-kit';
import Mathematics from 'tiptap-math';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
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
import { qmdToTiptapDoc, tiptapDocToQmd } from '../../utils/quartoConversionUtils';
import EditorToolbar from './EditorToolbar';
import { InlineRExtension } from './InlineRDecoration';
import { CommentsSidebar } from '../Comments/CommentsSidebar';
import { PreviewPane } from './PreviewPane';
import LoginButton from '../Auth/LoginButton';
import InlineMath from '../../utils/InlineMath/inlineMath';
import { formatApaReference, formatApaInText } from '../../utils/apaUtils';
import { HarperExtension, harperKey } from './HarperExtension';
import { HarperPopover } from './HarperPopover';
import DiffViewer from './DiffViewer';
import bibtexParse from 'bibtex-parser-js';

const searchHighlightKey = new PluginKey('searchHighlight');

const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchHighlightKey);
            if (meta?.clear) {
              return DecorationSet.empty;
            }
            if (meta?.matches) {
              return DecorationSet.create(
                tr.doc,
                meta.matches.map((match, index) =>
                  Decoration.inline(match.from, match.to, {
                    class: index === meta.activeIndex
                      ? 'search-highlight search-highlight--active'
                      : 'search-highlight',
                  })
                )
              );
            }
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

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

const isElectron = typeof window !== 'undefined' && !!window.quartoReviewDesktop;

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
  localFilePath,
  activeDocument,
  handleSwitchToGitHubMode,
  handleOpenLocalFile,
  handleOpenStartupGuide,
  handleSaveLocalFile,
}) => {
  const { isAuthenticated, user } = useAuth();
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
  const [showSource, setShowSource] = useState(false);
  const [rawSource, setRawSource] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMatches, setFindMatches] = useState([]);
  const [activeFindMatchIndex, setActiveFindMatchIndex] = useState(0);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(() => {
    const stored = window.localStorage.getItem('harper-spellcheck-enabled');
    return stored === null ? true : stored === 'true';
  });
  const menuRef = useRef(null);
  const sourceEditorRef = useRef(null);
  const spellcheckEnabledRef = useRef(spellcheckEnabled);
  const lastEditAtRef = useRef(Date.now());
  const lastAutosaveAtRef = useRef(0);
  const lastCheckpointAtRef = useRef(0);
  const baselineContentRef = useRef('');
  const sessionStartSavedRef = useRef(false);
  const latestAutosaveHashRef = useRef('');

  const autosaveSupported = Boolean(isElectron && window.quartoReviewDesktop?.saveAutosave && activeDocument && qmdContent);
  const AUTOSAVE_IDLE_MS = 15000;
  const AUTOSAVE_INTERVAL_MS = 60000;
  const CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000;

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    spellcheckEnabledRef.current = spellcheckEnabled;
    window.localStorage.setItem('harper-spellcheck-enabled', String(spellcheckEnabled));
  }, [spellcheckEnabled]);

  useEffect(() => {
    const loadVersion = async () => {
      if (!window.quartoReviewDesktop?.getAppVersion) return;
      try {
        const version = await window.quartoReviewDesktop.getAppVersion();
        setAppVersion(version || '');
      } catch (error) {
        console.error('Failed to load app version:', error);
      }
    };

    loadVersion();
  }, []);

  useEffect(() => {
    return subscribePackageStatus(setPkgStatus);
  }, []);

  useEffect(() => {
    return subscribeFileStatus(setFileStatus);
  }, []);

  useEffect(() => {
    const shouldAutoDismiss = (pkgStatus.phase === 'done' || pkgStatus.phase === 'error') && !pkgBannerDismissed;
    if (!shouldAutoDismiss) return undefined;

    const timerId = window.setTimeout(() => {
      setPkgBannerDismissed(true);
    }, 5000);

    return () => window.clearTimeout(timerId);
  }, [pkgStatus.phase, pkgBannerDismissed]);

  useEffect(() => {
    const shouldAutoDismiss = (fileStatus.phase === 'done' || fileStatus.phase === 'error') && !fileBannerDismissed;
    if (!shouldAutoDismiss) return undefined;

    const timerId = window.setTimeout(() => {
      setFileBannerDismissed(true);
    }, 5000);

    return () => window.clearTimeout(timerId);
  }, [fileStatus.phase, fileBannerDismissed]);

  const handleCommentMarkUpdate = () => {
    setCommentMarkKey((prev) => prev + 1);
  }

  // Harper popover state
  const [harperMatch, setHarperMatch] = useState(null);
  const [harperAnchorPos, setHarperAnchorPos] = useState(null);
  const harperMatchClickRef = useRef(null);
  harperMatchClickRef.current = useCallback((match, event) => {
    setHarperMatch(match);
    setHarperAnchorPos({ x: event.clientX, y: event.clientY });
  }, []);

  const handleHarperDismiss = useCallback(() => {
    setHarperMatch(null);
    setHarperAnchorPos(null);
  }, []);

  const configuredExtensions = [
    ...(extensions
      ? extensions.filter((extension) => extension?.name !== 'harper')
      : [
          StarterKit,
          RawCell,
          CodeCell,
          Underline,
          Highlight,
          Link.configure({
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            defaultProtocol: 'https',
          }),
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
        ]),
    HarperExtension.configure({
      onMatchClick: (match, event) => harperMatchClickRef.current?.(match, event),
      isEnabled: () => spellcheckEnabledRef.current,
    }),
    SearchHighlightExtension,
  ];

  const editor = useEditor({
    extensions: configuredExtensions,
    content: '',
    enableContentCheck: true,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
          spellcheck: 'true',
      },
    },
  });

  const handleHarperAccept = useCallback((replacement) => {
    if (!editor || !harperMatch) return;
    editor.chain().focus().deleteRange({ from: harperMatch.from, to: harperMatch.to }).insertContentAt(harperMatch.from, replacement).run();
    handleHarperDismiss();
  }, [editor, harperMatch, handleHarperDismiss]);

  const handleToggleSpellcheck = useCallback(() => {
    const nextValue = !spellcheckEnabledRef.current;
    spellcheckEnabledRef.current = nextValue;
    setSpellcheckEnabled(nextValue);
    setHarperMatch(null);
    setHarperAnchorPos(null);
  }, []);

  useEffect(() => {
    if (!editor?.view) return;
    editor.view.dispatch(editor.state.tr.setMeta(harperKey, {
      decorations: DecorationSet.empty,
      matches: [],
      enabled: spellcheckEnabled,
    }));
  }, [editor, spellcheckEnabled]);

  useEffect(() => {
    if (!editor?.view) return;
    editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, {
      matches: findMatches,
      activeIndex: activeFindMatchIndex,
    }));
  }, [editor, findMatches, activeFindMatchIndex]);

  const focusFindInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = document.querySelector('.tb-find-input');
      if (input) {
        input.focus();
        input.select();
      }
    });
  }, []);

  const collectSourceMatches = useCallback((query) => {
    const textarea = sourceEditorRef.current;
    if (!textarea || !query) return [];

    const haystack = textarea.value.toLowerCase();
    const needle = query.toLowerCase();
    const matches = [];
    let startIndex = 0;
    while (startIndex < haystack.length) {
      const foundAt = haystack.indexOf(needle, startIndex);
      if (foundAt === -1) break;
      matches.push({ from: foundAt, to: foundAt + query.length });
      startIndex = foundAt + Math.max(query.length, 1);
    }

    return matches;
  }, []);

  const findInSource = useCallback((query, direction = 'next') => {
    const textarea = sourceEditorRef.current;
    const matches = collectSourceMatches(query);

    if (matches.length === 0) return [];

    const currentStart = textarea.selectionStart;
    let nextIndex = matches.findIndex(match =>
      direction === 'prev' ? match.from >= currentStart : match.from > currentStart
    );

    if (direction === 'prev') {
      nextIndex = -1;
      for (let i = matches.length - 1; i >= 0; i -= 1) {
        if (matches[i].from < currentStart) {
          nextIndex = i;
          break;
        }
      }
    }

    if (nextIndex === -1) {
      nextIndex = direction === 'prev' ? matches.length - 1 : 0;
    }

    const match = matches[nextIndex];
    textarea.setSelectionRange(match.from, match.to);
    textarea.scrollTop = textarea.scrollHeight * (match.from / Math.max(textarea.value.length, 1));
    setActiveFindMatchIndex(nextIndex);
    return matches;
  }, [collectSourceMatches]);

  const collectEditorMatches = useCallback((query) => {
    if (!editor || !query) return [];

    const matches = [];
    const lowerQuery = query.toLowerCase();
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const haystack = node.text.toLowerCase();
      let searchIndex = 0;
      while (searchIndex < haystack.length) {
        const foundAt = haystack.indexOf(lowerQuery, searchIndex);
        if (foundAt === -1) break;
        matches.push({
          from: pos + foundAt,
          to: pos + foundAt + query.length,
        });
        searchIndex = foundAt + Math.max(query.length, 1);
      }
    });

    return matches;
  }, [editor]);

  const findInEditor = useCallback((query, direction = 'next') => {
    const matches = collectEditorMatches(query);

    if (matches.length === 0) return [];

    const currentFrom = editor.state.selection.from;
    let nextIndex;

    if (direction === 'prev') {
      nextIndex = -1;
      for (let i = matches.length - 1; i >= 0; i -= 1) {
        if (matches[i].from < currentFrom) {
          nextIndex = i;
          break;
        }
      }
      if (nextIndex === -1) nextIndex = matches.length - 1;
    } else {
      nextIndex = matches.findIndex(match => match.from > currentFrom);
      if (nextIndex === -1) nextIndex = 0;
    }

    const match = matches[nextIndex];
    editor.commands.setTextSelection({ from: match.from, to: match.to });
    setActiveFindMatchIndex(nextIndex);
    return matches;
  }, [collectEditorMatches, editor]);

  const runFind = useCallback((query, direction = 'next') => {
    if (!query) {
      setFindMatches([]);
      setActiveFindMatchIndex(0);
      return;
    }

    const matches = showSource
      ? findInSource(query, direction)
      : findInEditor(query, direction);

    setFindMatches(matches);
    if (matches.length === 0) {
      setActiveFindMatchIndex(0);
    }
  }, [findInEditor, findInSource, showSource]);

  const handleFindQueryChange = useCallback((query) => {
    setFindQuery(query);
    setFindMatches([]);
    setActiveFindMatchIndex(0);
  }, []);

  useEffect(() => {
    if (!showFindBar || !findQuery) {
      setFindMatches([]);
      setActiveFindMatchIndex(0);
      return;
    }

    const matches = showSource
      ? collectSourceMatches(findQuery)
      : collectEditorMatches(findQuery);
    setFindMatches(matches);
    setActiveFindMatchIndex(matches.length > 0 ? 0 : 0);
  }, [showFindBar, showSource, findQuery, collectEditorMatches, collectSourceMatches]);

  useEffect(() => {
    if (showSource || !editor || findMatches.length === 0) return;

    window.requestAnimationFrame(() => {
      const activeHighlight = editor.view.dom.querySelector('.search-highlight--active');
      if (activeHighlight?.scrollIntoView) {
        activeHighlight.scrollIntoView({ block: 'center', inline: 'nearest' });
      } else {
        editor.view.dom.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    });
  }, [editor, findMatches, activeFindMatchIndex, showSource]);

  const handleRenderInlineR = useCallback(async () => {
    if (!editor || isRenderingInlineR) return;
    setIsRenderingInlineR(true);
    try {
      const exprs = new Set();
      editor.state.doc.descendants(node => {
        if (!node.isText) return;
        if (!node.marks.some(m => m.type.name === 'code')) return;
        const match = node.text.match(/^r\s+(.+)$/);
        if (match) exprs.add(match[1].trim());
      });
      if (exprs.size === 0) return;
      await evaluateInlineExpressions([...exprs]);
      setInlineRCache(new Map(getInlineRCache()));
      editor.view.dispatch(editor.view.state.tr.setMeta('inlineRUpdated', true));
    } finally {
      setIsRenderingInlineR(false);
    }
  }, [editor, isRenderingInlineR]);

  const togglePreview = useCallback(() => {
    setShowPreview((value) => !value);
    setShowDiff(false);
  }, []);

  const toggleDiff = useCallback(() => {
    setShowDiff((value) => !value);
    setShowPreview(false);
  }, []);

  const handleAddCommentShortcut = useCallback(() => {
    if (!editor || showSource) return;

    const { from, to } = editor.state.selection;
    if (from === to) return;

    const commentText = window.prompt('Add comment:');
    if (!commentText?.trim()) return;

    editor.chain().focus().addComment({
      commentId: `comment-${Date.now()}`,
      username: user?.name || user?.login || 'Anonymous',
      avatarUrl: user?.avatar_url,
      text: commentText.trim(),
      timestamp: new Date().toISOString(),
    }).run();
  }, [editor, showSource, user]);

  const handleCiteZoteroShortcut = useCallback(async () => {
    if (!editor || !referenceManager || showSource) return;

    try {
      const bibtex = await zoteroPickReference();
      if (!bibtex || !bibtex.trim()) return;

      const parsed = bibtexParse.toJSON(bibtex);
      if (!parsed || parsed.length === 0) return;

      for (const entry of parsed) {
        const ref = {
          ...entry,
          citationKey: entry.citationKey || entry.key || '',
          entryTags: entry.entryTags || {},
        };
        referenceManager.addReference(ref);
      }
      await referenceManager.save();

      for (const entry of parsed) {
        const citationKey = entry.citationKey || entry.key || '';
        const displayText = formatApaInText(entry.entryTags || {});
        editor.chain().focus()
          .insertContent({
            type: 'text',
            marks: [{
              type: 'citation',
              attrs: {
                citationKey,
                isInBrackets: true,
                referenceDetails: JSON.stringify(entry.entryTags || {}),
                prefix: null,
                suffix: null,
                locator: null,
              },
            }],
            text: displayText,
          })
          .unsetMark('citation')
          .insertContent({ type: 'text', text: ' ' })
          .run();
      }
    } catch (error) {
      console.error('[Zotero shortcut] Error:', error);
      window.alert(error.response?.data?.error || 'Could not reach Zotero. Make sure Zotero is open with Better BibTeX installed.');
    }
  }, [editor, referenceManager, showSource]);

  const handleToggleSource = useCallback(() => {
    if (!showSource) {
      // Entering source mode: serialize current doc to QMD
      setRawSource(tiptapDocToQmd(editor));
      setShowSource(true);
    } else {
      // Leaving source mode: parse edited text back into TipTap
      qmdToTiptapDoc(rawSource, editor);
      setShowSource(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCommentsRefreshKey((prev) => prev + 1);
        });
      });
    }
  }, [editor, showSource, rawSource]);

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
    const markEditedAt = () => { lastEditAtRef.current = Date.now(); };
    countWords();
    editor.on('update', countWords);
    editor.on('update', markDirty);
    editor.on('update', markEditedAt);
    return () => {
      editor.off('update', countWords);
      editor.off('update', markDirty);
      editor.off('update', markEditedAt);
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
          // When switching repositories, reset the selected file to the first available file.
          if (notebookList.length > 0) {
            setFilePath(notebookList[0]);
          } else {
            setFilePath('');
          }
        } catch (err) {
          setError('Failed to load notebooks');
          console.error('Error loading notebooks:', err);
        }
      } else {
        setNotebooks([]);
        setFilePath('');
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
    if (localFilePath) {
      // Save directly to disk — no commit message needed
      if (showSource) qmdToTiptapDoc(rawSource, editor);
      handleSaveLocalFile(editor).then(() => {
        wordCountAtLastSave.current = wordCount;
        isDirty.current = false;
        baselineContentRef.current = tiptapDocToQmd(editor);
        sessionStartSavedRef.current = false;
        latestAutosaveHashRef.current = '';
      });
      return;
    }
    setCommitMsg('');
    setShowCommitDialog(true);
  };

  useEffect(() => {
    const handleFindShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setShowFindBar(true);
        focusFindInput();
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSaveFileClick();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        togglePreview();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        toggleDiff();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleToggleSource();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onToggleTrackChanges();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        handleRenderInlineR();
      } else if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleCiteZoteroShortcut();
      } else if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        handleAddCommentShortcut();
      } else if (event.key === 'Escape') {
        setShowFindBar(false);
      }
    };

    window.addEventListener('keydown', handleFindShortcut);
    return () => window.removeEventListener('keydown', handleFindShortcut);
  }, [
    focusFindInput,
    handleAddCommentShortcut,
    handleCiteZoteroShortcut,
    handleRenderInlineR,
    handleToggleSource,
    onSaveFileClick,
    onToggleTrackChanges,
    toggleDiff,
    togglePreview,
  ]);

  const onCommitConfirm = async () => {
    setShowCommitDialog(false);
    // If saving while in source mode, sync textarea content back to TipTap first
    if (showSource) {
      qmdToTiptapDoc(rawSource, editor);
    }
    try {
      await handleSaveFile(editor, commitMsg.trim() || 'Update document');
      wordCountAtLastSave.current = wordCount;
      isDirty.current = false;
      baselineContentRef.current = tiptapDocToQmd(editor);
      sessionStartSavedRef.current = false;
      latestAutosaveHashRef.current = '';
    } catch (error) {
      setError(error.message);
    }
  };

  // Determine if it's an error message by checking the content of saveMessage
  const isError = saveMessage && saveMessage.toLowerCase().includes('error');

  useEffect(() => {
    if (editor && ipynb) {
      if (showSource) {
        setShowSource(false);
        setRawSource('');
      }
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
    if (!editor || !qmdContent) return;

    let cancelled = false;
    const repo = selectedRepo ? `${selectedRepo.owner.login}/${selectedRepo.name}` : null;
    const loadedFilePath = filePath;

    if (showSource) {
      setRawSource(qmdContent);
    }

    requestAnimationFrame(() => {
      try {
        qmdToTiptapDoc(qmdContent, editor);
      } catch (err) {
        setError(err.message);
      }
    });

    // Reset any previously dismissed banners for the newly loaded document.
    setPkgBannerDismissed(false);
    setFileBannerDismissed(false);

    const loadQmdDependencies = async () => {
      resetPackageStatus();
      resetFileStatus();

      try {
        await installPackagesForQmd(qmdContent);
      } catch (err) {
        if (!cancelled) {
          setError(`R package setup failed: ${err.message}`);
        }
      }

      try {
        await syncFilesForQmd(qmdContent, loadedFilePath, repo, fetchRawFile);
      } catch (err) {
        setFileStatusError(err.message || 'Data file sync failed');
        if (!cancelled) {
          setError(`Data file sync failed: ${err.message}`);
        }
      }
    };

    loadQmdDependencies();

    return () => {
      cancelled = true;
    };
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
        baselineContentRef.current = tiptapDocToQmd(editor);
        sessionStartSavedRef.current = false;
        latestAutosaveHashRef.current = '';
        lastAutosaveAtRef.current = 0;
        lastCheckpointAtRef.current = 0;
        isDirty.current = false;
      });
    });
    return () => cancelAnimationFrame(outer);
  }, [editor, ipynb, qmdContent]);

  useEffect(() => {
    if (!autosaveSupported || !editor) return;

    const saveAutosave = async (kind, content) => {
      const contentHash = `${content.length}:${content}`;
      if (kind === 'latest' && latestAutosaveHashRef.current === contentHash) return;

      await window.quartoReviewDesktop.saveAutosave({
        document: activeDocument,
        content,
        kind,
      });

      if (kind === 'latest') {
        latestAutosaveHashRef.current = contentHash;
        lastAutosaveAtRef.current = Date.now();
      }
      if (kind === 'checkpoint') {
        lastCheckpointAtRef.current = Date.now();
      }
      if (kind === 'session-start') {
        sessionStartSavedRef.current = true;
      }
    };

    const timerId = window.setInterval(() => {
      const tick = async () => {
        if (!isDirty.current) return;

        const now = Date.now();
        if (now - lastEditAtRef.current < AUTOSAVE_IDLE_MS) return;

        const currentContent = showSource ? rawSource : tiptapDocToQmd(editor);
        if (!currentContent || currentContent === baselineContentRef.current) return;

        if (!sessionStartSavedRef.current && baselineContentRef.current) {
          await saveAutosave('session-start', baselineContentRef.current);
        }

        if (now - lastAutosaveAtRef.current >= AUTOSAVE_INTERVAL_MS) {
          await saveAutosave('latest', currentContent);
        }

        if (now - lastCheckpointAtRef.current >= CHECKPOINT_INTERVAL_MS) {
          await saveAutosave('checkpoint', currentContent);
        }
      };

      tick().catch((error) => {
        console.error('Autosave failed:', error);
      });
    }, 5000);

    return () => window.clearInterval(timerId);
  }, [autosaveSupported, editor, activeDocument, rawSource, showSource]);

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

  const layoutMode = showDiff ? 'diff' : (showPreview ? 'preview' : 'editor');
  const editorPaneClassName = `editor-container editor-container--${layoutMode}${showSource ? ' editor-container--source' : ''}`;
  const editorMainClassName = `editor-main${showSource ? ' editor-main--source' : ''}`;
  const editorContentClassName = `editor-content-container${showSource ? ' editor-content-container--source' : ''}`;
  const workspaceClassName = `editor-with-sidebar editor-with-sidebar--${layoutMode}`;

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
        {fileStatus.phase === 'error' && !fileBannerDismissed && (
          <div className="pkg-install-banner pkg-install-banner--error">
            {fileStatus.skipped[0] || 'Data file sync failed.'}
            <button className="pkg-install-banner__close" onClick={() => setFileBannerDismissed(true)} title="Dismiss">✕</button>
          </div>
        )}
      </div>
      <header className="app-header">
        <div className="header-top">
          <img src="/logo.png" alt="QuartoReview" className="app-logo" />

          {/* GitHub file selectors — only when not in local-file mode */}
          {!localFilePath && (
            <>
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
            </>
          )}

          {/* Local file indicator */}
          {localFilePath && (
            <span className="hdr-local-filename" title={localFilePath}>
              {localFilePath.split(/[\\/]/).pop()}
            </span>
          )}
          {localFilePath && (
            <button className="hdr-btn" onClick={handleSwitchToGitHubMode}>
              Switch to GitHub
            </button>
          )}

          <button className="hdr-btn" onClick={onSaveFileClick}>Save</button>
          {wordCount - wordCountAtLastSave.current >= 50 && (
            <span className="hdr-save-nudge">
              {wordCount - wordCountAtLastSave.current} unsaved words
            </span>
          )}
          <button
            className="hdr-dark-toggle"
            onClick={handleToggleSpellcheck}
            title={spellcheckEnabled ? 'Turn spelling and grammar check off' : 'Turn spelling and grammar check on'}
          >
            <span className="hdr-dark-icon"><FaSpellCheck /></span>
            <span className={`hdr-dark-track${spellcheckEnabled ? ' is-active' : ''}`}>
              <span className="hdr-dark-thumb" />
            </span>
          </button>
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
          {/* App menu — top right */}
          <div className="app-menu" ref={menuRef}>
            <button
              className="hdr-btn app-menu-btn"
              onClick={() => setShowMenu(v => !v)}
              title="Menu"
            >
              <FaBars />
            </button>
            {showMenu && (
              <div className="app-menu-dropdown">
                {isElectron && (
                  <button
                    className="app-menu-item"
                    onClick={() => { setShowMenu(false); handleOpenLocalFile(); }}
                  >
                    Open local file…
                  </button>
                )}
                {isElectron && (
                  <button
                    className="app-menu-item"
                    onClick={() => { setShowMenu(false); handleOpenStartupGuide(); }}
                  >
                    Open guide
                  </button>
                )}
                {isElectron && (
                  <button
                    className="app-menu-item"
                    onClick={() => { setShowMenu(false); window.quartoReviewDesktop.openAutosaveFolder(); }}
                  >
                    Open autosave folder
                  </button>
                )}
                {isElectron && (
                  <button
                    className="app-menu-item"
                    onClick={() => { setShowMenu(false); window.quartoReviewDesktop.showGitHubSetup(); }}
                  >
                    Set up GitHub access
                  </button>
                )}
                <a
                  className="app-menu-item"
                  href="https://github.com/Lakens/QuartoReview/issues"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowMenu(false)}
                >
                  Feedback
                </a>
              </div>
            )}
          </div>
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
            showSource={showSource}
            onToggleSource={handleToggleSource}
            showFindBar={showFindBar}
            findQuery={findQuery}
            findCount={findMatches.length}
            activeFindMatchIndex={activeFindMatchIndex}
            onOpenFind={() => {
              setShowFindBar(true);
              focusFindInput();
            }}
            onCloseFind={() => setShowFindBar(false)}
            onFindQueryChange={handleFindQueryChange}
            onFindNext={() => runFind(findQuery, 'next')}
            onFindPrev={() => runFind(findQuery, 'prev')}
          />
        )}
      </header>

      <main className="app-main">
        {!isAuthenticated && !localFilePath ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4rem', gap: '1.5rem' }}>
            <LoginButton />
            {isElectron && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#666', marginBottom: '0.75rem', fontSize: '0.9rem' }}>— or —</p>
                <button className="hdr-btn" onClick={handleOpenLocalFile} style={{ fontSize: '0.95rem', padding: '0.5rem 1.25rem' }}>
                  Open local file…
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="content-container">
            <div className={workspaceClassName}>
              <div className={editorPaneClassName}>
                {editor?.isEditable && editor?.view && <EditorBubbleMenuManager editor={editor} />}
                <div className={editorMainClassName}>
                  <div className={editorContentClassName}>
                    {showSource && (
                      <textarea
                        ref={sourceEditorRef}
                        className="source-editor"
                        value={rawSource}
                        onChange={e => setRawSource(e.target.value)}
                        wrap="soft"
                        spellCheck={false}
                      />
                    )}
                    <div style={showSource ? { display: 'none' } : undefined}>
                      <EditorContent editor={editor} />
                    </div>
                    <div className="references-container">
                      <ReferencesList references={references || referenceManager?.getReferences()} />
                    </div>
                  </div>
                  <div className="editor-statusbar">
                    {wordCount.toLocaleString()} words
                  </div>
                </div>
              </div>
              {showDiff    && <DiffViewer editor={editor} selectedRepo={selectedRepo} filePath={filePath} darkMode={darkMode} />}
              {showPreview && !showDiff && <PreviewPane editor={editor} references={references || referenceManager?.getReferences()} inlineRCache={inlineRCache} filePath={filePath} />}
              {!showPreview && !showDiff && editor && <CommentsSidebar editor={editor} refreshKey={commentsRefreshKey} />}
            </div>
          </div>
        )}
      </main>

      <HarperPopover
        match={harperMatch}
        anchorPos={harperAnchorPos}
        onAccept={handleHarperAccept}
        onDismiss={handleHarperDismiss}
      />

      <footer className="app-footer">
        Built on <a href="https://github.com/MichelNivard/resolve" target="_blank" rel="noreferrer">Resolve</a> by Michel Nivard. Made by Daniel Lakens. Version {appVersion || 'dev'}. Submit issues to <a href="https://github.com/Lakens/QuartoReview" target="_blank" rel="noreferrer">github.com/Lakens/QuartoReview</a>.
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
