const { app, BrowserWindow, Menu, dialog, session } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const title = '复合材料气瓶缠绕铺层设计软件'
const page = path.join(__dirname, '../dist/index.html')
let mainWindow
app.setName(title)
// 对外版本标识只显示主.次（package.json 存 semver 1.0.0 → V1.0），与界面顶栏/状态栏一致。
const releaseLabel = `V${String(app.getVersion()).split('.').slice(0, 2).join('.')}`

function createWindow() {
  mainWindow = new BrowserWindow({
    title: `${title} ${releaseLabel}`,
    width: 1500, height: 960, minWidth: 1100, minHeight: 720,
    backgroundColor: '#f1f4f8', show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.setMenuBarVisibility(false)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(page).href) event.preventDefault()
  })
  mainWindow.webContents.on('page-title-updated', (event) => event.preventDefault())
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    if (code !== -3) dialog.showErrorBox('页面加载失败', `${description} (${code})`)
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.loadFile(page)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(() => {
    app.setAppUserModelId('cn.vessel.layup.designer')
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'",
      ] },
    }))
    session.defaultSession.on('will-download', (_event, item) => {
      const isPdf = path.extname(item.getFilename()).toLowerCase() === '.pdf'
      item.setSaveDialogOptions({
        title: isPdf ? '保存 PDF 计算书' : '保存 Excel 计算书',
        defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())),
        filters: isPdf ? [{ name: 'PDF 文档', extensions: ['pdf'] }] : [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      })
      item.once('done', (_done, state) => {
        if (state === 'interrupted') dialog.showErrorBox('导出未完成', '文件保存失败，请检查目标目录权限或磁盘空间后重试。')
      })
    })
    Menu.setApplicationMenu(null)
    createWindow()
  })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
