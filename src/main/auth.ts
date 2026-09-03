import { shell } from 'electron';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import type { AuthUser } from '../shared/types';
import { CALENDAR_SCOPE } from '../shared/types';
import * as store from './store';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
// calendar.readonly is a Google-designated sensitive scope: consent screens that
// request it need verification before users outside the test list can approve it.
const SCOPES = `openid email profile ${CALENDAR_SCOPE}`;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const base64url = (input: Buffer): string =>
  input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Constant-time compare so a malformed callback can't probe the state value. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function closingPage(heading: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>DeadLines</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f4ef;color:#13272a;
       font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{text-align:center;padding:40px;max-width:26rem}
  b{display:block;font-size:22px;letter-spacing:-.02em;margin-bottom:8px}
  span{color:#75827d;font-size:14px}
</style>
<main><b>${heading}</b><span>${body}</span></main>`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/**
 * Access tokens live about an hour and are only ever needed in this process, so they
 * stay in memory rather than on disk — a refresh token can always mint another.
 */
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

function cacheAccessToken(sub: string, tokens: TokenResponse): void {
  if (!tokens.access_token) return;
  const ttl = (tokens.expires_in ?? 3600) * 1000;
  // Retire it a minute early so a call can't start against an about-to-expire token.
  accessTokens.set(sub, { token: tokens.access_token, expiresAt: Date.now() + ttl - 60_000 });
}

/** Reads the id_token payload. Safe because the token came straight from Google over TLS. */
function decodeIdToken(idToken: string): AuthUser {
  const segment = idToken.split('.')[1];
  if (!segment) throw new Error('Google returned an unreadable identity token.');
  const claims = JSON.parse(Buffer.from(segment, 'base64').toString('utf8')) as Record<string, unknown>;
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!sub) throw new Error('Google returned an identity token without an account id.');
  return {
    sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    name: typeof claims.name === 'string' && claims.name ? claims.name : String(claims.email ?? 'Signed in'),
    picture: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

async function exchange(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google rejected the sign-in.');
  }
  return payload;
}

/** Waits for Google to redirect back to the loopback server, then returns the auth code. */
function awaitCallback(
  server: Server,
  expectedState: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Sign-in timed out. Try again.'));
    }, SIGN_IN_TIMEOUT_MS);

    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/') {
        response.writeHead(404).end();
        return;
      }
      const finish = (status: number, page: string, outcome: () => void): void => {
        response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
        clearTimeout(timer);
        outcome();
      };

      const error = url.searchParams.get('error');
      if (error) {
        finish(400, closingPage('Sign-in cancelled', 'You can close this tab and return to DeadLines.'), () =>
          reject(new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : error)),
        );
        return;
      }

      const state = url.searchParams.get('state') ?? '';
      const code = url.searchParams.get('code') ?? '';
      if (!code || !safeEqual(state, expectedState)) {
        finish(400, closingPage('Sign-in failed', 'The response from Google did not match this request.'), () =>
          reject(new Error('The sign-in response did not match this request. Please try again.')),
        );
        return;
      }

      finish(200, closingPage('You’re signed in', 'You can close this tab and return to DeadLines.'), () =>
        resolve({ code }),
      );
    });
  });
}

const NOT_CONFIGURED =
  'This build has no Google client ID. Set MAIN_VITE_GOOGLE_CLIENT_ID in .env and rebuild.';

export async function signIn(): Promise<AuthUser> {
  const { clientId: googleClientId, clientSecret: googleClientSecret } = store.getOAuthClient();
  if (!googleClientId) throw new Error(NOT_CONFIGURED);

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address() as AddressInfo;
    const redirectUri = `http://127.0.0.1:${port}`;

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent select_account',
    }).toString();

    const pending = awaitCallback(server, state);
    await shell.openExternal(authUrl.toString());
    const { code } = await pending;

    const tokens = await exchange({
      client_id: googleClientId,
      ...(googleClientSecret ? { client_secret: googleClientSecret } : {}),
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    if (!tokens.id_token) throw new Error('Google did not return an identity token.');
    const user = decodeIdToken(tokens.id_token);

    store.saveProfile(user);
    if (tokens.refresh_token) store.saveRefreshToken(user.sub, tokens.refresh_token);
    // Google may grant fewer scopes than requested if the user unticks one.
    store.saveGrantedScopes(user.sub, tokens.scope ?? SCOPES);
    if (tokens.access_token) cacheAccessToken(user.sub, tokens);
    store.setLastAccount(user.sub);
    return user;
  } finally {
    server.close();
  }
}

/**
 * Restores the previous session on launch. Confirms the refresh token still works
 * so a revoked account isn't left looking signed in.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const { clientId: googleClientId, clientSecret: googleClientSecret } = store.getOAuthClient();
  const { lastAccountSub } = store.getConfig();
  if (!googleClientId || !lastAccountSub) return null;

  const profile = store.getProfile(lastAccountSub);
  const refreshToken = store.getRefreshToken(lastAccountSub);
  if (!profile || !refreshToken) return null;

  try {
    const tokens = await exchange({
      client_id: googleClientId,
      ...(googleClientSecret ? { client_secret: googleClientSecret } : {}),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    // Google may rotate the refresh token; keep the newest one.
    if (tokens.refresh_token) store.saveRefreshToken(profile.sub, tokens.refresh_token);
    if (tokens.scope) store.saveGrantedScopes(profile.sub, tokens.scope);
    cacheAccessToken(profile.sub, tokens);
    if (tokens.id_token) {
      const refreshed = decodeIdToken(tokens.id_token);
      store.saveProfile(refreshed);
      return refreshed;
    }
    return profile;
  } catch {
    // Offline or revoked: don't strand the user's data, just require a fresh sign-in.
    store.setLastAccount(null);
    return null;
  }
}

/**
 * A live access token for Google APIs, minted from the stored refresh token and
 * reused until it nears expiry.
 */
export async function getAccessToken(sub: string): Promise<string> {
  const cached = accessTokens.get(sub);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const { clientId, clientSecret } = store.getOAuthClient();
  const refreshToken = store.getRefreshToken(sub);
  if (!clientId) throw new Error(NOT_CONFIGURED);
  if (!refreshToken) throw new Error('Sign in again to reconnect this account to Google.');

  const tokens = await exchange({
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (!tokens.access_token) throw new Error('Google did not return an access token.');
  if (tokens.scope) store.saveGrantedScopes(sub, tokens.scope);
  cacheAccessToken(sub, tokens);
  return tokens.access_token;
}

export async function signOut(sub: string): Promise<void> {
  const refreshToken = store.getRefreshToken(sub);
  if (refreshToken) {
    // Best effort — the local session is cleared either way.
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    }).catch(() => undefined);
  }
  accessTokens.delete(sub);
  store.setLastAccount(null);
}
