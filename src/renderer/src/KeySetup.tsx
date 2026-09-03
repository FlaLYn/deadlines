import { FormEvent, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import type { AuthUser } from '../../shared/types';

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

/** Shown after sign-in when this account has not saved its own Gemini key yet. */
export default function KeySetup({
  user,
  onReady,
  onSkip,
}: {
  user: AuthUser;
  onReady: () => void;
  onSkip: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const key = String(new FormData(event.currentTarget).get('apiKey') ?? '');
    setBusy(true);
    setError('');
    const result = await window.deadlines.keys.save(key);
    setBusy(false);
    if (result.ok) onReady();
    else setError(result.error);
  }

  const firstName = user.name.split(/\s+/)[0] || 'there';

  return (
    <main className="auth-screen">
      <div className="titlebar-drag" />
      <section className="auth-art">
        <div className="auth-brand">
          <span>D</span>
          <span>DeadLines</span>
        </div>
        <h1>One last thing, {firstName}.</h1>
        <p>
          Reading a syllabus takes a Gemini API key. It is free to create, takes about a
          minute, and you only ever do it once — after this you go straight to your courses.
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="kicker">STEP 2 OF 2</span>
          <h2>Connect Gemini.</h2>
          <p>
            The key is billed to your own Google account and stays encrypted on this device.
          </p>

          <ol className="setup-steps">
            <li>
              Open{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => void window.deadlines.openExternal(AI_STUDIO_URL)}
              >
                Google AI Studio <ExternalLink size={11} />
              </button>{' '}
              and sign in with the same account.
            </li>
            <li>
              Click <b>Create API key</b>, then copy it.
            </li>
            <li>Paste it below. DeadLines checks it with Google before saving.</li>
          </ol>

          <form className="setup-form" onSubmit={submit}>
            <label>
              Gemini API key
              <input name="apiKey" type="password" placeholder="AIza…" autoComplete="off" autoFocus required />
            </label>
            {error && (
              <div className="auth-error">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            <button className="import-button" type="submit" disabled={busy}>
              {busy ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
              {busy ? 'Checking with Google…' : 'Verify and continue'}
            </button>
          </form>

          <p className="auth-note">
            <button type="button" className="link-button" onClick={onSkip}>
              Skip for now
            </button>{' '}
            — you can still add courses by hand, and add a key later from Settings.
            Syllabus import stays off until you do.
          </p>
        </div>
      </section>
    </main>
  );
}
