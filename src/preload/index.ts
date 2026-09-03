import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ApiKeyStatus,
  AuthState,
  AuthUser,
  CalendarEvent,
  CalendarStatus,
  ExtractResult,
  Result,
  SourceFile,
  UpdateStatus,
  WorkspaceData,
} from '../shared/types';

/**
 * The entire surface the renderer gets. No Node, no filesystem, no API key —
 * secrets stay in the main process and only ever leave it as a masked hint.
 */
const api = {
  auth: {
    state: (): Promise<AuthState> => ipcRenderer.invoke('auth:state'),
    signIn: (): Promise<Result<AuthUser>> => ipcRenderer.invoke('auth:signIn'),
    signOut: (): Promise<Result<null>> => ipcRenderer.invoke('auth:signOut'),
    forget: (): Promise<Result<null>> => ipcRenderer.invoke('auth:forget'),
  },
  keys: {
    status: (): Promise<Result<ApiKeyStatus>> => ipcRenderer.invoke('keys:status'),
    save: (key: string): Promise<Result<ApiKeyStatus>> => ipcRenderer.invoke('keys:save', key),
    clear: (): Promise<Result<ApiKeyStatus>> => ipcRenderer.invoke('keys:clear'),
    setModel: (model: string): Promise<Result<ApiKeyStatus>> =>
      ipcRenderer.invoke('keys:setModel', model),
    encryptionAvailable: (): Promise<boolean> => ipcRenderer.invoke('keys:encryptionAvailable'),
  },
  calendar: {
    status: (): Promise<Result<CalendarStatus>> => ipcRenderer.invoke('calendar:status'),
    setEnabled: (enabled: boolean): Promise<Result<CalendarStatus>> =>
      ipcRenderer.invoke('calendar:setEnabled', enabled),
    /** `timeMin`/`timeMax` are ISO instants bounding the visible month grid. */
    events: (timeMin: string, timeMax: string): Promise<Result<CalendarEvent[]>> =>
      ipcRenderer.invoke('calendar:events', timeMin, timeMax),
  },
  workspace: {
    read: (): Promise<Result<WorkspaceData>> => ipcRenderer.invoke('workspace:read'),
    write: (data: WorkspaceData): Promise<Result<null>> =>
      ipcRenderer.invoke('workspace:write', data),
  },
  syllabus: {
    pick: (): Promise<Result<string | null>> => ipcRenderer.invoke('syllabus:pick'),
    /** Electron no longer exposes File.path; this is the supported replacement. */
    pathForDroppedFile: (file: File): string => webUtils.getPathForFile(file),
    extract: (filePath: string): Promise<Result<ExtractResult>> =>
      ipcRenderer.invoke('syllabus:extract', filePath),
    /** Original bytes of an imported file, for rendering it as it really looks. */
    read: (filePath: string): Promise<Result<SourceFile>> =>
      ipcRenderer.invoke('syllabus:read', filePath),
  },
  updates: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
    check: (): Promise<Result<UpdateStatus>> => ipcRenderer.invoke('update:check'),
    download: (): Promise<Result<null>> => ipcRenderer.invoke('update:download'),
    install: (): Promise<Result<null>> => ipcRenderer.invoke('update:install'),
    openReleases: (): Promise<Result<null>> => ipcRenderer.invoke('update:openReleases'),
    /** Main pushes progress and state changes; returns an unsubscribe function. */
    onChange: (handler: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: unknown, status: UpdateStatus): void => handler(status);
      ipcRenderer.on('update:changed', listener);
      return () => ipcRenderer.removeListener('update:changed', listener);
    },
  },
  openExternal: (url: string): Promise<Result<null>> => ipcRenderer.invoke('shell:open', url),
  platform: process.platform,
};

export type DeadlinesApi = typeof api;

contextBridge.exposeInMainWorld('deadlines', api);
