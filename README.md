# DeadLines

A desktop app that turns a course syllabus into an organized plan. Drop in a PDF or Word
syllabus and Gemini reads the prose, tables, and calendar to build an editable course with
every deadline.

Formerly a Next.js web app on Cloudflare Workers; now an Electron desktop app with no server
of its own.

## How it works

- **Sign-in goes straight to Google.** OAuth 2.0 authorization code flow with PKCE and a
  loopback redirect — the standard flow for installed apps. There is no DeadLines backend.
- **Gemini runs on a key you control.** Each user supplies their own key. Imports go from the
  machine directly to Google's Gemini API — nothing is proxied.
- **Everything stays local.** Courses, assignments, and your API key live in this machine's
  app-data folder, in a separate directory per signed-in Google account.

## First run

Two one-time steps, both free.

### 1. A Google OAuth client (for sign-in)

This is a **developer** step, done once. It never appears in the UI — users only ever see the
"Continue with Google" button, exactly like any other app with a Google sign-in.

1. Set up the consent screen at
   [Google Cloud Console → Google Auth Platform](https://console.cloud.google.com/auth/overview):
   User type **External**, plus an app name and support email.
2. Open [Credentials](https://console.cloud.google.com/apis/credentials) →
   **Create credentials → OAuth client ID** → application type **Desktop app**.
3. Copy `.env.example` to `.env` and set `MAIN_VITE_GOOGLE_CLIENT_ID` (and
   `MAIN_VITE_GOOGLE_CLIENT_SECRET`, if Google showed one). Rebuild.

Without it, the sign-in button is still shown but reports
`This build has no Google client ID` when pressed.

> While the consent screen is in **Testing**, only accounts listed under **Audience → Test
> users** can sign in; everyone else gets "Access blocked". The scopes used here (`openid`,
> `email`, `profile`) are non-sensitive, so **Publish app** needs no Google review.

> A desktop OAuth client's ID and secret are not confidential — Google documents installed-app
> credentials as non-secret, which is why PKCE is required. Still, `.env` is gitignored.

### 2. A Gemini API key (for syllabus import)

Each account brings its own key. Right after sign-in the app shows a one-time step to create a key at
[Google AI Studio](https://aistudio.google.com/apikey) and paste it in; it is verified against
Google before saving, and never asked for again. A user can also skip and add one later from
Settings, with syllabus import disabled until they do.

> **Why there is no third option.** Signing in with Google cannot itself produce a Gemini key.
> Google exposes no OAuth scope or API for creating an API key on a user's behalf — keys are
> made by hand. The `Authorization: Bearer` path does exist, but it needs a Google Cloud
> project with billing plus an `X-Goog-User-Project` header, which is more setup per user, not
> less. Proxying Gemini CLI OAuth tokens is a Terms of Service violation Google enforces.

A user-supplied key is encrypted with the OS keychain via Electron's `safeStorage` (Keychain on
macOS, DPAPI on Windows, libsecret on Linux). The key never enters the renderer process —
imports run in the main process, and the UI only ever sees a masked hint like `AIzaSy…9fQ2`.

## Development

```bash
npm install
npm run dev
```

If Electron's binary did not download during install, run `node node_modules/electron/install.js`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the app with hot reload |
| `npm run build` | Typecheck and build all three bundles |
| `npm run typecheck` | Typecheck main/preload and renderer separately |
| `npm run pack:mac` | Build a macOS `.dmg` into `release/` |
| `npm run pack:win` | Build a Windows NSIS installer |
| `npm run pack:linux` | Build a Linux AppImage |

Packaged macOS builds are unsigned. To distribute, add a signing identity in
`electron-builder.yml`; otherwise Gatekeeper requires right-click → Open on first launch.

## Layout

```
src/
  main/        Electron main process — the only place with disk, network, and secrets
    index.ts   Window, lifecycle, and every IPC handler
    auth.ts    Google OAuth: PKCE, loopback server, token refresh and revoke
    store.ts   Per-account encrypted storage under the app-data folder
    gemini.ts  Syllabus extraction against the Gemini API
  preload/     The contextBridge surface — the entire renderer API
  renderer/    React UI (no Node access)
    src/App.tsx        Auth gate: sign-in → (key step) → dashboard
    src/Login.tsx      The Google sign-in screen
    src/KeySetup.tsx   One-time Gemini key step for each account
    src/Dashboard.tsx  Courses, calendar, and assignment management
    src/Settings.tsx   API key and account
  shared/      Types used by both processes
legacy-web/    The previous Next.js app, kept for reference — safe to delete
```

### Security posture

- `contextIsolation` on, `nodeIntegration` off; the renderer's whole capability set is the
  preload bridge.
- The renderer never names an account. Every data IPC resolves the account from the session
  held in the main process, so one profile cannot read another's courses or key.
- A strict CSP; `will-navigate` and `setWindowOpenHandler` push all external links to the
  system browser rather than loading them in-app.
- OAuth uses PKCE (S256) with a `state` parameter compared in constant time.
