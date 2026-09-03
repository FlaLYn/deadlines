import { app, shell } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../shared/types';

const { autoUpdater } = electronUpdater;

/**
 * Update checking against GitHub Releases.
 *
 * Two delivery modes, because macOS forces the distinction:
 *
 *  - **install**: electron-updater downloads the release and swaps the app in place.
 *    On macOS this needs a Developer ID signature — Squirrel.Mac refuses to install
 *    an update it cannot verify — so an unsigned build can never use this path.
 *  - **manual**: the app says a version is available and opens the release page so
 *    the user downloads it themselves. Works everywhere, signed or not.
 *
 * The mode is decided at runtime rather than assumed, so the same build behaves
 * correctly before and after the app is signed.
 */

const REPO_URL = 'https://github.com/FlaLYn/deadlines';
const RELEASES_URL = `${REPO_URL}/releases/latest`;

let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() };
let notify: ((next: UpdateStatus) => void) | null = null;

function setStatus(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next } as UpdateStatus;
  notify?.(status);
}

/**
 * Whether this build can install an update itself. macOS requires a real signature;
 * `isPackaged` alone is not enough, because an ad-hoc signed build looks packaged
 * but still fails at install time with a code-signature error.
 */
function canSelfInstall(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform !== 'darwin') return true;
  // Set by electron-builder only when a Developer ID identity was used.
  return process.mas !== true && Boolean(process.env.DEADLINES_SIGNED);
}

export function initUpdater(onChange: (next: UpdateStatus) => void): void {
  notify = onChange;

  // Never surprise the user: downloading and installing are both explicit choices.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'available',
      available: {
        version: info.version,
        notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        url: RELEASES_URL,
        canInstall: canSelfInstall(),
      },
    });
  });

  autoUpdater.on('update-not-available', () => setStatus({ state: 'current', available: null }));

  autoUpdater.on('download-progress', (progress: { percent: number }) =>
    setStatus({ state: 'downloading', percent: Math.round(progress.percent) }),
  );

  autoUpdater.on('update-downloaded', () => setStatus({ state: 'ready' }));

  autoUpdater.on('error', (error: Error) => {
    setStatus({ state: 'error', error: describe(error) });
  });
}

function describe(error: Error): string {
  const message = error?.message ?? 'Update check failed.';
  if (/code signature|SQRL|Squirrel/i.test(message)) {
    return 'This build is not code-signed, so macOS will not install updates automatically. Download the new version instead.';
  }
  if (/ENOTFOUND|ETIMEDOUT|ENETUNREACH|EAI_AGAIN/i.test(message)) {
    return 'Could not reach GitHub. Check your connection and try again.';
  }
  if (/404/.test(message)) {
    return 'No published release was found yet for this app.';
  }
  return message;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  // In development there is no packaged app to compare against, and electron-updater
  // throws rather than no-oping, so report plainly instead of surfacing that error.
  if (!app.isPackaged) {
    setStatus({ state: 'dev', available: null });
    return status;
  }
  setStatus({ state: 'checking', error: undefined });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setStatus({ state: 'error', error: describe(error as Error) });
  }
  return status;
}

export async function downloadUpdate(): Promise<void> {
  if (!canSelfInstall()) {
    await shell.openExternal(RELEASES_URL);
    return;
  }
  setStatus({ state: 'downloading', percent: 0 });
  await autoUpdater.downloadUpdate();
}

export function installUpdate(): void {
  // isSilent false so the user sees the installer; isForceRunAfter restarts the app.
  autoUpdater.quitAndInstall(false, true);
}

export function openReleasesPage(): Promise<void> {
  return shell.openExternal(RELEASES_URL);
}

export function getStatus(): UpdateStatus {
  return status;
}
