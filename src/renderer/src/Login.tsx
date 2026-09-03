import { useState } from 'react';
import { AlertTriangle, CalendarDays, KeyRound, ShieldCheck, Loader2 } from 'lucide-react';
import type { AuthUser } from '../../shared/types';
import GoogleMark from './components/GoogleMark';

export default function Login({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn(): Promise<void> {
    setBusy(true);
    setError('');
    const result = await window.deadlines.auth.signIn();
    setBusy(false);
    if (result.ok) onSignedIn(result.data);
    else setError(result.error);
  }

  return (
    <main className="auth-screen">
      <div className="titlebar-drag" />
      <section className="auth-art">
        <div className="auth-brand">
          <span>D</span>
          <span>DeadLines</span>
        </div>
        <h1>Turn any syllabus into a plan.</h1>
        <p>
          Drop in a PDF or Word syllabus and Gemini reads the prose, the tables, and the calendar to
          build an editable course with every deadline.
        </p>
        <ul className="auth-points">
          <li>
            <CalendarDays size={18} />
            <div>
              <b>Every deadline in one calendar</b>
              <small>Across all your courses, with what needs review flagged</small>
            </div>
          </li>
          <li>
            <KeyRound size={18} />
            <div>
              <b>Powered by Gemini</b>
              <small>Reads prose, tables, and calendars — not just keywords</small>
            </div>
          </li>
          <li>
            <ShieldCheck size={18} />
            <div>
              <b>Your coursework stays local</b>
              <small>Saved on this machine — no account data leaves it</small>
            </div>
          </li>
        </ul>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="kicker">WELCOME</span>
          <h2>Sign in to your workspace.</h2>
          <p>Your courses are kept on this Mac, separately for each Google account that signs in.</p>

          <button className="google-button" onClick={() => void signIn()} disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <GoogleMark />}
            {busy ? 'Waiting for your browser…' : 'Continue with Google'}
          </button>

          {busy && (
            <p className="auth-note" style={{ marginTop: 14 }}>
              A browser tab opened for Google sign-in. Finish there and come back.
            </p>
          )}

          {error && (
            <div className="auth-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <p className="auth-note">
            <b>Nothing is uploaded to us.</b> DeadLines has no server. Sign-in goes straight to
            Google, and syllabus imports go straight to Gemini.
          </p>
        </div>
      </section>
    </main>
  );
}
