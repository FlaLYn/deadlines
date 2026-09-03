import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2, LogOut, Monitor, Moon,
  ShieldAlert, Sun, Trash2,
} from 'lucide-react';
import type { ApiKeyStatus, AuthUser } from '../../shared/types';
import { readTheme, saveTheme, type Theme } from './theme';
import UpdatePanel, { useUpdateStatus } from './UpdatePanel';

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

export default function Settings({
  user,
  keyStatus,
  onKeyStatus,
  onSignOut,
  onForget,
  notify,
}: {
  user: AuthUser;
  keyStatus: ApiKeyStatus | null;
  onKeyStatus: (status: ApiKeyStatus) => void;
  onSignOut: () => void;
  onForget: () => void;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [confirmingForget, setConfirmingForget] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const updateStatus = useUpdateStatus();

  useEffect(() => {
    void window.deadlines.keys.encryptionAvailable().then(setEncryptionAvailable);
  }, []);

  async function saveKey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const key = String(new FormData(form).get('apiKey') ?? '');
    setBusy(true);
    setError('');
    const result = await window.deadlines.keys.save(key);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    onKeyStatus(result.data);
    notify('Gemini API key verified and saved.');
  }

  async function clearKey(): Promise<void> {
    const result = await window.deadlines.keys.clear();
    if (result.ok) {
      onKeyStatus(result.data);
      notify('API key removed from this device.');
    }
  }

  async function changeModel(model: string): Promise<void> {
    const result = await window.deadlines.keys.setModel(model);
    if (result.ok) onKeyStatus(result.data);
  }

  return (
    <section className="panel-page settings-page">
      <div className="section-heading">
        <div>
          <span className="kicker">SETTINGS</span>
          <h3>Your key and your account</h3>
        </div>
      </div>

      <div className="settings-block">
        <h3>Gemini API key</h3>
        <p>
          Syllabus imports are sent from this app straight to Google&rsquo;s Gemini API using your
          key. Usage is billed to your own Google account, and the key never leaves this device
          except in requests to Google.
        </p>

        <div className={`key-state ${keyStatus?.configured ? '' : 'missing'}`}>
          {keyStatus?.configured ? (
            <CheckCircle2 size={20} color="#5c8a6a" />
          ) : (
            <AlertTriangle size={20} color="#b3803a" />
          )}
          <div>
            <b>
              {keyStatus?.source === 'user'
                ? 'Your key is saved and verified'
                : 'No API key yet'}
            </b>
            <small>
              {keyStatus?.configured ? keyStatus.hint : 'Imports stay disabled until you add one.'}
            </small>
          </div>
          {keyStatus?.source === 'user' && (
            <button className="secondary-button spacer" onClick={() => void clearKey()}>
              <Trash2 size={15} /> Remove
            </button>
          )}
        </div>

        <form className="setup-form" onSubmit={saveKey}>
          <label>
            {keyStatus?.source === 'user' ? 'Replace key' : 'Add your key'}
            <input name="apiKey" type="password" placeholder="AIza…" autoComplete="off" required />
            <small>
              Create a free key at{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => void window.deadlines.openExternal(AI_STUDIO_URL)}
              >
                Google AI Studio <ExternalLink size={11} />
              </button>
            </small>
          </label>
          <label>
            Model
            <input
              name="model"
              defaultValue={keyStatus?.model ?? ''}
              onBlur={(event) => void changeModel(event.target.value)}
            />
            <small>Any Gemini model your key can reach.</small>
          </label>
          {error && (
            <div className="auth-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="settings-actions">
            <button className="import-button" type="submit" disabled={busy}>
              {busy ? <Loader2 size={17} className="spin" /> : <KeyRound size={17} />}
              {busy ? 'Verifying with Google…' : 'Verify and save key'}
            </button>
          </div>
        </form>

        {!encryptionAvailable && (
          <div className="settings-warn">
            <ShieldAlert size={16} />
            <span>
              This system&rsquo;s keychain is unavailable, so the key is stored unencrypted in the
              app&rsquo;s data folder. On Linux, installing <code>gnome-keyring</code> or{' '}
              <code>kwallet</code> enables encryption.
            </span>
          </div>
        )}
      </div>

      <div className="settings-block">
        <h3>Appearance</h3>
        <p>Applies to this Mac, whichever account is signed in.</p>
        <div className="theme-choice" role="radiogroup" aria-label="Theme">
          {(
            [
              { value: 'light', label: 'Light', icon: <Sun size={16} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
              { value: 'system', label: 'System', icon: <Monitor size={16} /> },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={theme === option.value}
              className={theme === option.value ? 'selected' : ''}
              onClick={() => {
                setTheme(option.value);
                saveTheme(option.value);
              }}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <UpdatePanel status={updateStatus} />

      <div className="settings-block">
        <h3>Account</h3>
        <p>Each Google account gets its own separate set of courses on this device.</p>

        <div className="account-row">
          {user.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="account-avatar-fallback">{initials(user.name)}</span>
          )}
          <div>
            <b>{user.name}</b>
            <small>{user.email}</small>
          </div>
        </div>

        <div className="settings-actions">
          <button className="secondary-button" onClick={onSignOut}>
            <LogOut size={15} /> Sign out
          </button>
          {confirmingForget ? (
            <>
              <button className="danger-button" onClick={onForget}>
                Delete everything for this account
              </button>
              <button className="secondary-button" onClick={() => setConfirmingForget(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="danger-outline" onClick={() => setConfirmingForget(true)}>
              <Trash2 size={15} /> Delete local data
            </button>
          )}
        </div>

        {confirmingForget && (
          <div className="settings-warn">
            <AlertTriangle size={16} />
            <span>
              This permanently removes this account&rsquo;s courses, assignments, and saved API key
              from this device. It cannot be undone.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
