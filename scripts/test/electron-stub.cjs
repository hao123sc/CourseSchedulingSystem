module.exports = {
  dialog: {
    showSaveDialog: async () => ({ canceled: true, filePath: null }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => []
  },
  app: {
    getPath: () => '/tmp',
    getAppPath: () => process.cwd(),
    whenReady: () => Promise.resolve(),
    exit: () => {}
  },
  ipcMain: {
    handle: () => {},
    on: () => {}
  }
}
