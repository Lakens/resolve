import React, { useState, useEffect } from 'react';
import { tiptapDocToQmd } from '../../utils/quartoConversionUtils';
import { renderDiffHtml } from '../../utils/diffUtils';
import { getFileHistory, getFileAtCommit } from '../../utils/api';
import '../../styles/components/editor/_diffviewer.css';

// mode: 'since' = commit vs current editor  |  'in' = commit vs its parent
const DiffViewer = ({ editor, selectedRepo, filePath }) => {
  const [commits, setCommits]           = useState([]);
  const [selectedSha, setSelectedSha]   = useState('');
  const [mode, setMode]                 = useState('since'); // 'since' | 'in'
  const [diffHtml, setDiffHtml]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [historyError, setHistoryError] = useState('');

  const repoName = selectedRepo?.fullName;
  const isQmd    = filePath?.endsWith('.qmd') || filePath?.endsWith('.Rmd') || filePath?.endsWith('.rmd') || filePath?.endsWith('.md');

  // Load commit history whenever repo/file change
  useEffect(() => {
    if (!repoName || !filePath || !isQmd) return;
    setCommits([]);
    setSelectedSha('');
    setDiffHtml('');
    setHistoryError('');

    getFileHistory(filePath, repoName)
      .then(({ commits: list }) => {
        setCommits(list);
        if (list.length > 0) setSelectedSha(list[0].sha);
      })
      .catch(() => setHistoryError('Could not load commit history for this file.'));
  }, [repoName, filePath, isQmd]);

  // Recompute diff whenever commit or mode changes
  useEffect(() => {
    if (!selectedSha || !editor || !repoName) return;
    let cancelled = false;

    setLoading(true);
    setDiffHtml('');
    setHistoryError('');

    const commit = commits.find(c => c.sha === selectedSha);

    const doSince = () =>
      // "Changes since this version": file at commit vs current editor
      getFileAtCommit(filePath, repoName, selectedSha).then(({ content: oldContent }) => {
        if (cancelled) return;
        const currentContent = tiptapDocToQmd(editor);
        const label = commit
          ? `${new Date(commit.date).toLocaleDateString()} — ${commit.message}`
          : selectedSha.slice(0, 7);
        setDiffHtml(renderDiffHtml(oldContent, currentContent, `Changes since: ${label}`));
      });

    const doIn = () => {
      // "Changes in this version": parent vs commit
      if (!commit?.parentSha) {
        // First ever commit — diff empty string vs the commit content
        return getFileAtCommit(filePath, repoName, selectedSha).then(({ content }) => {
          if (cancelled) return;
          const label = commit
            ? `${new Date(commit.date).toLocaleDateString()} — ${commit.message}`
            : selectedSha.slice(0, 7);
          setDiffHtml(renderDiffHtml('', content, `Changes in: ${label}`));
        });
      }
      return Promise.all([
        getFileAtCommit(filePath, repoName, commit.parentSha),
        getFileAtCommit(filePath, repoName, selectedSha),
      ]).then(([{ content: parentContent }, { content: commitContent }]) => {
        if (cancelled) return;
        const label = commit
          ? `${new Date(commit.date).toLocaleDateString()} — ${commit.message}`
          : selectedSha.slice(0, 7);
        setDiffHtml(renderDiffHtml(parentContent, commitContent, `Changes in: ${label}`));
      });
    };

    (mode === 'since' ? doSince() : doIn())
      .catch(e => { if (!cancelled) setHistoryError('Failed to compute diff: ' + e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedSha, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadHtml = () => {
    const blob = new Blob([diffHtml], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `diff-${(filePath || 'document').replace(/\//g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isQmd) {
    return (
      <div className="diff-viewer">
        <div className="diff-unsupported">
          Diff view is only available for <code>.qmd</code>, <code>.Rmd</code>, and <code>.md</code> files.
        </div>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-toolbar">
        {/* Mode toggle */}
        <div className="diff-mode-toggle">
          <button
            className={`diff-mode-btn${mode === 'since' ? ' active' : ''}`}
            onClick={() => setMode('since')}
            title="Show all changes from this version to the current document"
          >
            Since this version
          </button>
          <button
            className={`diff-mode-btn${mode === 'in' ? ' active' : ''}`}
            onClick={() => setMode('in')}
            title="Show only what was changed in this specific saved version"
          >
            In this version
          </button>
        </div>

        {/* Commit selector */}
        <select
          className="diff-commit-select"
          value={selectedSha}
          onChange={e => setSelectedSha(e.target.value)}
          disabled={commits.length === 0}
        >
          {commits.length === 0 && <option value="">Loading…</option>}
          {commits.map(c => (
            <option key={c.sha} value={c.sha}>
              {new Date(c.date).toLocaleDateString()} — {c.message.slice(0, 60)}
            </option>
          ))}
        </select>

        {diffHtml && (
          <button className="diff-download-btn" onClick={downloadHtml}>
            ↓ Download HTML
          </button>
        )}
      </div>

      {historyError && <div className="diff-error">{historyError}</div>}
      {loading      && <div className="diff-loading">Computing diff…</div>}

      {diffHtml && !loading && (
        <iframe
          className="diff-iframe"
          srcDoc={diffHtml}
          title="Document diff"
          sandbox="allow-same-origin"
        />
      )}
    </div>
  );
};

export default DiffViewer;
