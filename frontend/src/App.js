import React, { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from './contexts/AuthContext';
import { fetchNotebook, fetchFile, fetchRepositories, fetchUser, handleSharedDocument } from './utils/api';
import { tiptapDocToIpynb } from './utils/notebookConversionUtils';
import { tiptapDocToQmd } from './utils/quartoConversionUtils';
import { saveToGitHub, saveQmdToGitHub } from './utils/savetoGitHub';
import { getCurrentTime, isWithin30Minutes } from './utils/timeUtils';
import './styles/main.css';
import 'katex/dist/katex.min.css';
import EditorWrapper from './components/Editor/EditorWrapper';
import WarningBanner from './components/WarningBanner';
import { GitHubReferenceManager } from './utils/GitHubReferenceManager';
import { useParams, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';

// Import TipTap extensions
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Mathematics from 'tiptap-math';
import InlineMath from './utils/InlineMath/inlineMath';

// Import custom extensions
import { RawCell } from './cells/rawCell';
import { CodeCell } from './cells/codeCell';
import { TrackChangeExtension } from './utils/TrackChanges';
import { CommentMark } from './utils/CommentMark';
import { CitationMark } from './components/Citation/CitationMark';

function App() {
  const { isAuthenticated, user } = useContext(AuthContext);
  const { owner, repo } = useParams();
  const location = useLocation();
  const [betaCodeVerified, setBetaCodeVerified] = useState(false);
  const [betaCode, setBetaCode] = useState('');
  const [filePath, setFilePath] = useState('');
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [ipynb, setIpynb] = useState(null);
  const [qmdContent, setQmdContent] = useState(null);
  const [localFilePath, setLocalFilePath] = useState(null); // OS path when a local file is open
  const [startupGuideActive, setStartupGuideActive] = useState(false);
  const [referenceManager, setReferenceManager] = useState(null);
  const [references, setReferences] = useState([]); // Add references state
  const [saveMessage, setSaveMessage] = useState('');
  const [editorExtensions, setEditorExtensions] = useState(null);
  const [activeEditor, setActiveEditor] = useState(null);
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(false);
  const [commentMarkKey, setCommentMarkKey] = useState(0);
  const isLoadingFile = useRef(false);
  const hasLoadedStartupGuide = useRef(false);

  useEffect(() => {
    const loadStartupGuide = async () => {
      if (hasLoadedStartupGuide.current) return;
      if (owner || repo) return;
      if (!window.quartoReviewDesktop?.openStartupGuide) return;
      if (localFilePath || qmdContent || ipynb) return;

      const result = await window.quartoReviewDesktop.openStartupGuide();
      if (!result) return;

      hasLoadedStartupGuide.current = true;
      setLocalFilePath(result.filePath || result.displayName || 'GUIDE.md');
      setStartupGuideActive(true);
      setQmdContent(result.content);
      setIpynb(null);
      setSelectedRepo(null);
    };

    loadStartupGuide().catch((error) => {
      console.error('Error loading startup guide:', error);
    });
  }, [owner, repo, localFilePath, qmdContent, ipynb]);

  useEffect(() => {
    const loadRepositories = async () => {
      if (isAuthenticated) {
        try {
          const repos = await fetchRepositories();
          const validRepos = repos.filter(repo => repo.fullName && repo.owner?.login);
          setRepositories(validRepos);
          
          // If we have owner/repo from URL params, find and select that repo
          if (owner && repo && validRepos.length > 0) {
            const urlRepo = validRepos.find(r => 
              r.owner.login.toLowerCase() === owner.toLowerCase() && 
              r.name.toLowerCase() === repo.toLowerCase()
            );
            if (urlRepo) {
              setSelectedRepo(urlRepo);
              // Extract file path from URL if present
              const pathMatch = location.pathname.match(new RegExp(`/document/${owner}/${repo}/(.*)`));
              if (pathMatch && pathMatch[1]) {
                setFilePath(decodeURIComponent(pathMatch[1]));
              }
            }
          } else if (validRepos.length > 0) {
            setSelectedRepo(validRepos[0]);
          }
        } catch (error) {
          console.error('Error loading repositories:', error);
          setSaveMessage('Error loading repositories');
          setTimeout(() => setSaveMessage(''), 3000);
        }
      }
    };
    loadRepositories();
  }, [isAuthenticated, owner, repo, location.pathname]);

  // Update editor extensions when reference manager changes
  useEffect(() => {
    if (referenceManager) {
      console.log('🔄 Creating editor extensions with reference manager');
      setEditorExtensions([
        StarterKit,
        RawCell,
        CodeCell,
        Underline,
        Highlight,
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        TrackChangeExtension,
        CommentMark.configure({
          HTMLAttributes: {
            class: 'comment-mark',
          },
          onUpdate: handleCommentMarkUpdate
        }),
        Mathematics,
        InlineMath,
        CitationMark,
      ]);
    }
  }, [referenceManager]);

  useEffect(() => {
    if (!ipynb?.metadata?.active_editors || !isAuthenticated || !user || !filePath || !selectedRepo?.fullName) return;

    const cleanup = () => {
      const updatedEditors = ipynb.metadata.active_editors.filter(
        editor => isWithin30Minutes(editor.timestamp)
      );

      if (updatedEditors.length < ipynb.metadata.active_editors.length) {
        const updatedIpynb = { ...ipynb };
        updatedIpynb.metadata.active_editors = updatedEditors;
        saveToGitHub(updatedIpynb, filePath, selectedRepo, user)
          .catch(error => console.error('Error cleaning up old editors:', error));
      }
    };

    const intervalId = setInterval(cleanup, 60000); // Run every minute
    return () => clearInterval(intervalId);
  }, [ipynb, isAuthenticated, user, filePath, selectedRepo]);

  // Handle collaboration invitations on shared document URLs
  useEffect(() => {
    const handleSharedDocumentAccess = async () => {
      if (owner && repo && isAuthenticated) {
        try {
          const result = await handleSharedDocument(owner, repo, '');
          if (result.hasInvitation) {
            const confirmed = window.confirm(`Accept invitation to collaborate on ${owner}/${repo}?`);
            if (confirmed) {
              const path = location.pathname.split(`/document/${owner}/${repo}/`)[1] || '';
              const notebook = await result.accept();
              setIpynb(notebook);
              setSelectedRepo({ fullName: `${owner}/${repo}`, owner: { login: owner }, name: repo });
              if (path) setFilePath(path);
            }
          }
        } catch (error) {
          console.error('Error handling shared document:', error);
        }
      }
    };
    handleSharedDocumentAccess();
  }, [owner, repo, isAuthenticated]);

  const checkLastEditor = (notebook) => {
    if (!notebook?.metadata?.active_editors) return null;
    const lastEdit = new Date(notebook.metadata.active_editors.timestamp);
    const now = new Date(getCurrentTime());
    const diffMinutes = (now - lastEdit) / (1000 * 60);
    if (diffMinutes <= 30) {
      return notebook.metadata.active_editors.name;
    }
    return null;
  };

  const handleOpenLocalFile = async () => {
    const result = await window.quartoReviewDesktop?.openLocalFile();
    if (!result) return;
    setLocalFilePath(result.filePath);
    setStartupGuideActive(false);
    setQmdContent(result.content);
    setIpynb(null);
    setSelectedRepo(null);
  };

  const handleSwitchToGitHubMode = () => {
    setLocalFilePath(null);
    setStartupGuideActive(false);
    setQmdContent(null);
    setIpynb(null);
  };

  const handleSaveLocalFile = async (editor) => {
    const content = tiptapDocToQmd(editor);
    const result = await window.quartoReviewDesktop?.saveLocalFile(content, localFilePath);
    if (result?.filePath) {
      setLocalFilePath(result.filePath);
      setSaveMessage('File saved');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleLoadFile = async () => {
    if (isLoadingFile.current) return;
    if (!filePath) {
      setSaveMessage('Please enter a file path');
      return;
    }
    if (!isAuthenticated) {
      setSaveMessage('Please log in first');
      return;
    }
    if (!selectedRepo) {
      setSaveMessage('Please select a repository');
      return;
    }
    if (!selectedRepo.owner?.login || !selectedRepo.fullName) {
      setSaveMessage('Invalid repository format');
      return;
    }

    isLoadingFile.current = true;
    try {
      setLocalFilePath(null);
      setStartupGuideActive(false);

      if (filePath.endsWith('.qmd') || filePath.endsWith('.Rmd') || filePath.endsWith('.rmd') || filePath.endsWith('.md')) {
        // --- QMD/Rmd/Md path: no user required ---
        const result = await fetchFile(filePath, selectedRepo.fullName);
        setQmdContent(result.content);
        setIpynb(null);
      } else {
        // --- ipynb path ---
        const notebook = await fetchNotebook(filePath, selectedRepo.fullName);
        if (!notebook.metadata) {
          notebook.metadata = {};
        }
        if (!notebook.metadata.active_editors) {
          notebook.metadata.active_editors = [];
        }

        notebook.metadata.active_editors = notebook.metadata.active_editors.filter(
          editor => isWithin30Minutes(editor.timestamp)
        );

        // Only track active editors when user data is available
        if (user) {
          const existingEditorIndex = notebook.metadata.active_editors.findIndex(
            editor => editor.name === (user.name || user.login)
          );
          if (existingEditorIndex === -1) {
            notebook.metadata.active_editors.push({
              name: user.name || user.login,
              avatar_url: user.avatar_url,
              timestamp: getCurrentTime()
            });
          } else {
            notebook.metadata.active_editors[existingEditorIndex].timestamp = getCurrentTime();
          }
          await saveToGitHub(notebook, filePath, selectedRepo, user);
        }

        setIpynb(notebook);
        setQmdContent(null);
      }

      const manager = new GitHubReferenceManager(
        null,
        selectedRepo.fullName,
        filePath,
        selectedRepo.owner.login
      );
      await manager.init();
      setReferenceManager(manager);
      const refs = manager.getReferences();
      setReferences(refs);

      setSaveMessage('File loaded successfully');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error loading file:', error);
      if (error.response?.status === 404) {
        setSaveMessage('File not found');
      } else {
        setSaveMessage(`Error loading file: ${error.message}`);
      }
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      isLoadingFile.current = false;
    }
  };

  const onSaveFile = async (editor, commitMessage) => {
    if (!editor) {
      console.warn('No editor instance available.');
      return;
    }
    if (!isAuthenticated || !user?.login) {
      console.error('No authentication information available');
      return;
    }
    if (!selectedRepo) {
      console.error('No repository selected');
      return;
    }

    try {
      if (filePath.endsWith('.qmd') || filePath.endsWith('.Rmd') || filePath.endsWith('.rmd') || filePath.endsWith('.md')) {
        const qmdString = tiptapDocToQmd(editor);
        await saveQmdToGitHub(qmdString, filePath, selectedRepo, commitMessage);
      } else {
        if (!ipynb) {
          console.warn('No ipynb file available.');
          return;
        }
        const newIpynb = tiptapDocToIpynb(editor, ipynb);
        await saveToGitHub(newIpynb, filePath, selectedRepo, user, commitMessage);
      }

      setSaveMessage('File updated successfully');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving file:', error);
      setSaveMessage(`Error saving file: ${error.message}`);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleTrackChangesToggle = (enabled) => {
    setTrackChangesEnabled(enabled);
  };

  const handleCommentMarkUpdate = () => {
    setCommentMarkKey((prev) => prev + 1);
  };

  const verifyBetaCode = () => {
    if (betaCode === 'beta-test-crash-dummy') {
      setBetaCodeVerified(true);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      verifyBetaCode();
    }
  };

  return (
    <div className="App">
      <Analytics />
      <WarningBanner editors={ipynb?.metadata?.active_editors} currentUser={user} />
      <EditorWrapper
        referenceManager={referenceManager}
        filePath={filePath}
        setFilePath={setFilePath}
        ipynb={ipynb}
        setIpynb={setIpynb}
        qmdContent={qmdContent}
        handleLoadFile={handleLoadFile}
        handleSaveFile={onSaveFile}
        saveMessage={saveMessage}
        repositories={repositories}
        selectedRepo={selectedRepo}
        setSelectedRepo={setSelectedRepo}
        extensions={editorExtensions}
        references={references}
        localFilePath={localFilePath}
        startupGuideActive={startupGuideActive}
        handleSwitchToGitHubMode={handleSwitchToGitHubMode}
        handleOpenLocalFile={handleOpenLocalFile}
        handleSaveLocalFile={handleSaveLocalFile}
      />
    </div>
  );
}

export default App;
