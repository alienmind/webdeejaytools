import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import honoApp from '../src/server/index.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let serverInstance: any = null;

// Determine app root & resource paths
// If running from an electron-builder portable executable, PORTABLE_EXECUTABLE_DIR contains the actual folder where the .exe sits (e.g. USB drive)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd());
process.env.APP_BASE_DIR = appPath;

console.log(`[Electron] Base Application Directory: ${appPath}`);

// Ensure local portable folders exist (e.g. on USB drive)
const dataDir = path.join(appPath, 'data');
const downloadsDir = path.join(appPath, 'downloads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

async function startServer(): Promise<number> {
  const PORT = 34567;
  const distDir = path.resolve(__dirname, '..', 'dist');

  // Serve static assets in production mode
  if (!isDev && fs.existsSync(distDir)) {
    honoApp.use('/*', serveStatic({ root: distDir }));
    honoApp.get('*', (c) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return c.html(fs.readFileSync(indexPath, 'utf-8'));
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
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#090d16',
    title: 'WebDeeJayTOOLS',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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
