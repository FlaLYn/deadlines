import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { UpdateStatus } from '../../shared/types';

/** Subscribes to update state from the main process. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', currentVersion: '' });

  useEffect(() => {
    void window.deadlines.updates.status().then(setStatus);
    return window.deadlines.updates.onChange(setStatus);
  }, []);

  return status;
}

/** The dismissible strip that appears above the workspace when a release is out. */
export function UpdateBanner({
  status,
  onOpenSettings,
  onDismiss,
}: {
  status: UpdateStatus;
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  if (status.state !== 'available' || !status.available) return null;
  return (
    <div className="update-banner">
      <Sparkles size={16} />
      <span>
        <b>DeadLines {status.available.version} is available.</b> You have{' '}
        {status.currentVersion}.
      </span>
      <button className="import-button" onClick={onOpenSettings}>
        {status.available.canInstall ? 'Update' : 'Get it'}
      </button>
      <button className="link-button" onClick={onDismiss}>
        Later
      </button>
    </div>
  );
}

export default function UpdatePanel({ status }: { status: UpdateStatus }) {
  const [busy, setBusy] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    await window.deadlines.updates.check();
    setBusy(false);
  }

  const update = status.available;

  return (
    <div className="settings-block">
      <h3>Updates</h3>
      <p>
        DeadLines checks GitHub for new releases when it starts. Nothing is downloaded or
        installed without you choosing it.
      </p>

      <div className={`key-state ${status.state === 'available' ? 'missing' : ''}`}>
        {status.state === 'available' ? (
          <Sparkles size={20} color="#b3803a" />
        ) : status.state === 'error' ? (
          <AlertTriangle size={20} color="#b3803a" />
        ) : (
          <CheckCircle2 size={20} color="#5c8a6a" />
        )}
        <div>
          <b>
            {status.state === 'available' && update
              ? `Version ${update.version} is available`
              : status.state === 'downloading'
                ? `Downloading… ${status.percent ?? 0}%`
                : status.state === 'ready'
                  ? 'Update ready to install'
                  : status.state === 'checking'
                    ? 'Checking GitHub…'
                    : status.state === 'dev'
                      ? 'Running from source'
                      : status.state === 'error'
                        ? 'Could not check for updates'
                        : 'DeadLines is up to date'}
          </b>
          <small>
            {status.state === 'error'
              ? status.error
              : status.state === 'dev'
                ? 'Update checks only run in a packaged build.'
                : `You are on version ${status.currentVersion}`}
          </small>
        </div>
      </div>

      <div className="settings-actions">
        {status.state === 'ready' ? (
          <button className="import-button" onClick={() => void window.deadlines.updates.install()}>
            <RefreshCw size={16} /> Restart and install
          </button>
        ) : update ? (
          <button
            className="import-button"
            onClick={() => void window.deadlines.updates.download()}
            disabled={status.state === 'downloading'}
          >
            {status.state === 'downloading' ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            {update.canInstall ? 'Download and install' : 'Open the download page'}
          </button>
        ) : null}

        <button className="secondary-button" onClick={() => void check()} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          Check now
        </button>

        <button
          className="secondary-button"
          onClick={() => void window.deadlines.updates.openReleases()}
        >
          All releases
        </button>
      </div>

      {update && !update.canInstall && (
        <div className="settings-warn">
          <AlertTriangle size={16} />
          <span>
            This build is not code-signed, so macOS will not let it replace itself. The
            button opens the release page — download the new version and drag it over the
            old one. Signing the app with an Apple Developer ID enables one-click updates.
          </span>
        </div>
      )}

      {update?.notes && (
        <details className="release-notes">
          <summary>What&rsquo;s new in {update.version}</summary>
          <pre>{update.notes.replace(/<[^>]+>/g, '')}</pre>
        </details>
      )}
    </div>
  );
}
