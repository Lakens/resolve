const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quartoReviewDesktop', {
  isDesktopApp: true,

  // Local file access
  openLocalFile: ()                       => ipcRenderer.invoke('open-local-file'),
  saveLocalFile: (content, filePath)      => ipcRenderer.invoke('save-local-file', content, filePath),
  openStartupGuide: ()                    => ipcRenderer.invoke('open-startup-guide'),

  // In-app GitHub setup (replaces install-time wizard)
  showGitHubSetup: ()                     => ipcRenderer.invoke('show-github-setup'),
});
