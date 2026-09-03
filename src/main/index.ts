import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron';
import { extname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import type {
  ApiKeyStatus,
  SourceFile,
  UpdateStatus,
  AuthState,
  AuthUser,
  CalendarEvent,
  CalendarStatus,
  ExtractResult,
  Result,
  WorkspaceData,
} from '../shared/types';
import { CALENDAR_SCOPE, SUPPORTED_EXTENSIONS } from '../shared/types';
import * as auth from './auth';
import * as store from './store';
import { extractCourse, verifyApiKey } from './gemini';
import { listEvents } from './calendar';
import * as updater from './updater';

/**
 * The authoritative session. The renderer never names an account — every data
 * call is scoped to whoever is signed in here, so one profile cannot read another.
 */
let currentUser: AuthUser | null = null;
/** Paths the user chose this session; the only ones the renderer may read back. */
const importedPaths = new Set<string>();
let mainWindow: BrowserWindow | null = null;

// ------------------------------------------------------------------- window

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f4ef',
    title: 'DeadLines',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      // ESM output, since package.json declares "type": "module". Needs sandbox: false.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Links open in the real browser; this window only ever renders our own UI.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL;
    if (devServer && url.startsWith(devServer)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ---------------------------------------------------------------------- IPC

async function guarded<T>(run: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' };
  }
}

/** Every data handler funnels through here so an unauthenticated call cannot reach a store. */
function requireUser(): AuthUser {
  if (!currentUser) throw new Error('Sign in to continue.');
  return currentUser;
}

function apiKeyStatus(sub: string): ApiKeyStatus {
  const source = store.getGeminiKeySource(sub);
  return {
    configured: source !== 'none',
    hint: store.getGeminiKeyHint(sub),
    model: store.getGeminiModel(sub),
    source,
  };
}

function registerIpc(): void {
  ipcMain.handle('auth:state', (): AuthState =>
    currentUser ? { status: 'signed-in', user: currentUser } : { status: 'signed-out' },
  );

  ipcMain.handle('auth:signIn', () =>
    guarded(async () => {
      currentUser = await auth.signIn();
      return currentUser;
    }),
  );

  ipcMain.handle('auth:signOut', () =>
    guarded(async () => {
      const user = requireUser();
      await auth.signOut(user.sub);
      currentUser = null;
      return null;
    }),
  );

  ipcMain.handle('auth:forget', () =>
    guarded(async () => {
      const user = requireUser();
      await auth.signOut(user.sub);
      store.forgetAccount(user.sub);
      currentUser = null;
      return null;
    }),
  );

  // --------------------------------------------------------- Gemini API key

  ipcMain.handle('keys:status', () => guarded(() => apiKeyStatus(requireUser().sub)));

  ipcMain.handle('keys:save', (_event, key: unknown) =>
    guarded(async () => {
      const user = requireUser();
      const value = String(key ?? '').trim();
      if (!value) throw new Error('Paste your Gemini API key.');
      await verifyApiKey(value, store.getGeminiModel(user.sub));
      store.saveGeminiKey(user.sub, value);
      return apiKeyStatus(user.sub);
    }),
  );

  ipcMain.handle('keys:clear', () =>
    guarded(() => {
      const user = requireUser();
      store.clearGeminiKey(user.sub);
      return apiKeyStatus(user.sub);
    }),
  );

  ipcMain.handle('keys:setModel', (_event, model: unknown) =>
    guarded(() => {
      const user = requireUser();
      store.setGeminiModel(user.sub, String(model ?? ''));
      return apiKeyStatus(user.sub);
    }),
  );

  ipcMain.handle('keys:encryptionAvailable', () => store.isEncryptionAvailable());

  // -------------------------------------------------------------- calendar

  ipcMain.handle('calendar:status', () =>
    guarded<CalendarStatus>(() => {
      const user = requireUser();
      return {
        granted: store.hasScope(user.sub, CALENDAR_SCOPE),
        enabled: store.isCalendarEnabled(user.sub),
      };
    }),
  );

  ipcMain.handle('calendar:setEnabled', (_event, enabled: unknown) =>
    guarded<CalendarStatus>(() => {
      const user = requireUser();
      store.setCalendarEnabled(user.sub, Boolean(enabled));
      return {
        granted: store.hasScope(user.sub, CALENDAR_SCOPE),
        enabled: store.isCalendarEnabled(user.sub),
      };
    }),
  );

  ipcMain.handle('calendar:events', (_event, timeMin: unknown, timeMax: unknown) =>
    guarded<CalendarEvent[]>(async () => {
      const user = requireUser();
      if (!store.isCalendarEnabled(user.sub)) return [];
      if (!store.hasScope(user.sub, CALENDAR_SCOPE)) {
        throw new Error('Sign out and back in to let DeadLines read your Google Calendar.');
      }
      const token = await auth.getAccessToken(user.sub);
      try {
        return await listEvents(token, String(timeMin ?? ''), String(timeMax ?? ''));
      } catch (error) {
        // The stored grant and Google's view of it can drift; say so plainly.
        if (error instanceof Error && error.message === 'SCOPE_MISSING') {
          store.saveGrantedScopes(user.sub, '');
          throw new Error('Google Calendar access was not granted. Sign out and back in to allow it.');
        }
        throw error;
      }
    }),
  );

  // ------------------------------------------------------------- workspace

  ipcMain.handle('workspace:read', () => guarded(() => store.readWorkspace(requireUser().sub)));

  ipcMain.handle('workspace:write', (_event, data: unknown) =>
    guarded(() => {
      const user = requireUser();
      const value = (data ?? {}) as WorkspaceData;
      store.writeWorkspace(user.sub, {
        courses: Array.isArray(value.courses) ? value.courses : [],
        activeCourseId: String(value.activeCourseId ?? ''),
      });
      return null;
    }),
  );

  // -------------------------------------------------------------- syllabus

  ipcMain.handle('syllabus:pick', () =>
    guarded(async () => {
      requireUser();
      if (!mainWindow) return null;
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose a syllabus',
        buttonLabel: 'Import',
        properties: ['openFile'],
        filters: [{ name: 'Syllabus', extensions: [...SUPPORTED_EXTENSIONS] }],
      });
      const picked = canceled ? null : (filePaths[0] ?? null);
      if (picked) importedPaths.add(picked);
      return picked;
    }),
  );

  /**
   * Hands the original bytes to the renderer so the import review can show the real
   * document. Restricted to files the user picked this session — the renderer must
   * not be able to name an arbitrary path and have main read it.
   */
  ipcMain.handle('syllabus:read', (_event, filePath: unknown) =>
    guarded<SourceFile>(async () => {
      requireUser();
      const path = String(filePath ?? '');
      if (!importedPaths.has(path)) throw new Error('That file was not imported in this session.');
      const buffer = await readFile(path);
      return { base64: buffer.toString('base64'), extension: extname(path).toLowerCase() };
    }),
  );

  ipcMain.handle('syllabus:extract', (_event, filePath: unknown) =>
    guarded<ExtractResult>(async () => {
      const user = requireUser();
      const key = store.getGeminiKey(user.sub);
      if (!key) throw new Error('Add your Gemini API key in Settings before importing a syllabus.');
      const path = String(filePath ?? '');
      if (!path) throw new Error('Choose a syllabus file to import.');
      // Drag-and-drop never goes through the picker, so record it here too.
      importedPaths.add(path);
      return extractCourse(path, key, store.getGeminiModel(user.sub));
    }),
  );

  // --------------------------------------------------------------- updates

  ipcMain.handle('update:status', (): UpdateStatus => updater.getStatus());
  ipcMain.handle('update:check', () => guarded(() => updater.checkForUpdates()));
  ipcMain.handle('update:download', () => guarded(() => updater.downloadUpdate()));
  ipcMain.handle('update:install', () => guarded(() => updater.installUpdate()));
  ipcMain.handle('update:openReleases', () => guarded(() => updater.openReleasesPage()));

  ipcMain.handle('shell:open', (_event, url: unknown) =>
    guarded(async () => {
      const value = String(url ?? '');
      if (!/^https?:\/\//.test(value)) throw new Error('Only web links can be opened.');
      await shell.openExternal(value);
      return null;
    }),
  );
}

// ----------------------------------------------------------------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.deadlines.app');
    app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window));

    registerIpc();
    updater.initUpdater((status) => mainWindow?.webContents.send('update:changed', status));
    currentUser = await auth.restoreSession();
    createWindow();

    // Checked a little after launch so it never competes with first paint.
    setTimeout(() => void updater.checkForUpdates(), 4000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
