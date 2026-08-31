import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import honoApp, { SESSION_TOKEN } from '../src/server/index.js';
import { setNativeDirectoryPicker } from '../src/server/routes/settings.js';
import { grantSessionRoot } from '../src/server/util/paths.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let serverInstance: any = null;

// Determine app root & resource paths
// If running from an electron-builder portable executable, PORTABLE_EXECUTABLE_DIR contains the actual folder where the .exe sits (e.g. USB drive)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd());
process.env.APP_BASE_DIR = appPath;

// The packaged build serves its own HTML, so it can inject the per-launch session token and
// require it on every mutating request.
process.env.WDT_REQUIRE_SESSION_TOKEN = '1';

// Point the analysis worker pool at the bundled worker script. Without this the pool falls back to
// in-process analysis, which works but uses a single core.
const workerScript = path.resolve(__dirname, 'analysis-worker.js');
if (fs.existsSync(workerScript)) {
  process.env.WDT_ANALYSIS_WORKER = workerScript;
}

console.log(`[Electron] Base Application Directory: ${appPath}`);

// Ensure local portable folders exist (e.g. on USB drive)
const dataDir = path.join(appPath, 'data');
const downloadsDir = path.join(appPath, 'downloads');
const libraryDir = path.join(appPath, 'library');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
if (!fs.existsSync(libraryDir)) fs.mkdirSync(libraryDir, { recursive: true });

/**
 * Native folder picker.
 *
 * Replaces the server's shell-out to PowerShell / osascript / zenity. Besides removing the shell
 * from the path entirely, this is what doc/ARCHITECTURE.md always claimed the desktop build did.
 */
setNativeDirectoryPicker(async (defaultPath?: string, description?: string) => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
    title: description || 'Select Directory',
    defaultPath: defaultPath || appPath,
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/**
 * Injects the session token into the served HTML so the renderer can authenticate its own calls.
 * The token never touches disk and changes on every launch.
 */
function injectSessionToken(html: string): string {
  const tag = `<script>window.__WDT_SESSION__=${JSON.stringify(SESSION_TOKEN)};</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : `${tag}${html}`;
}

async function startServer(): Promise<number> {
  const PORT = 34567;
  const distDir = path.resolve(__dirname, '..', 'dist');

  // Serve static assets in production mode
  if (!isDev && fs.existsSync(distDir)) {
    honoApp.use('/*', serveStatic({ root: distDir }));
    honoApp.get('*', (c) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return c.html(injectSessionToken(fs.readFileSync(indexPath, 'utf-8')));
      }
      return c.text('Not found', 404);
    });
  }

  return new Promise((resolve) => {
    serverInstance = serve(
      {
        fetch: honoApp.fetch,
        port: PORT,
        hostname: '127.0.0.1',
      },
      () => {
        console.log(`[Electron Embedded Server] Running at http://127.0.0.1:${PORT}`);
        resolve(PORT);
      }
    );
  });
}

async function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#090d16',
    title: 'WebDeeJayTOOLS',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // No preload script needs Node, so the renderer runs fully sandboxed.
      sandbox: true,
    },
  });

  const url = isDev && process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : `http://127.0.0.1:${port}`;

  console.log(`[Electron] Loading UI from: ${url}`);
  await mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links (e.g. play.qobuz.com) in user's default desktop browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Refuse in-window navigation to anything that is not the local app.
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const allowed = targetUrl.startsWith(url);
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // The portable folders are the app's own; they are allowed roots from the start.
    grantSessionRoot(downloadsDir);
    grantSessionRoot(libraryDir);

    const port = await startServer();
    await createWindow(port);

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow(port);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (serverInstance && typeof serverInstance.close === 'function') {
        serverInstance.close();
      }
      app.quit();
    }
  });
}
