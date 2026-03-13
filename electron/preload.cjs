const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('quartoReviewDesktop', {
  isDesktopApp: true
});
