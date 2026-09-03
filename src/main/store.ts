import { app, safeStorage } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthUser, WorkspaceData } from '../shared/types';
import { DEFAULT_GEMINI_MODEL } from '../shared/types';

const buildEnv = import.meta.env as unknown as Record<string, string | undefined>;
const BUNDLED_GOOGLE_CLIENT_ID = (buildEnv.MAIN_VITE_GOOGLE_CLIENT_ID ?? '').trim();
const BUNDLED_GOOGLE_CLIENT_SECRET = (buildEnv.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? '').trim();

/** The OAuth client is a build-time value only; nothing about it is user-configurable. */
type AppConfig = { lastAccountSub: string | null };

type AccountSecrets = {
  /** safeStorage ciphertext, base64. */
  refreshToken: string | null;
  geminiApiKey: string | null;
  geminiKeyHint: string | null;
  geminiModel: string;
  /** Space-separated scopes Google actually granted, so we can tell before calling. */
  grantedScopes: string;
  /** User preference: overlay Google Calendar events on the month view. */
  calendarEnabled: boolean;
  /** False when the OS keychain was unavailable and values are stored as plain text. */
  encrypted: boolean;
};

const EMPTY_SECRETS: AccountSecrets = {
  refreshToken: null,
  geminiApiKey: null,
  geminiKeyHint: null,
  geminiModel: DEFAULT_GEMINI_MODEL,
  grantedScopes: '',
  calendarEnabled: true,
  encrypted: true,
};

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return { ...fallback, ...(JSON.parse(readFileSync(path, 'utf8')) as object) } as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
}

/** Google's `sub` is an opaque id; hash it so it never lands in a path verbatim. */
function accountDir(sub: string): string {
  const slug = createHash('sha256').update(sub).digest('hex').slice(0, 24);
  return join(app.getPath('userData'), 'accounts', slug);
}

const configPath = (): string => join(app.getPath('userData'), 'config.json');

// ---------------------------------------------------------------- app config

export function getConfig(): AppConfig {
  return readJson<AppConfig>(configPath(), { lastAccountSub: null });
}

/** The OAuth client this build ships with. Empty means the build was not configured. */
export function getOAuthClient(): { clientId: string; clientSecret: string } {
  return { clientId: BUNDLED_GOOGLE_CLIENT_ID, clientSecret: BUNDLED_GOOGLE_CLIENT_SECRET };
}

export function setLastAccount(sub: string | null): void {
  const current = readJson<AppConfig>(configPath(), {
    lastAccountSub: null,
  });
  writeJson(configPath(), { ...current, lastAccountSub: sub });
}

// ------------------------------------------------------------------ secrets

function encrypt(value: string): { blob: string; encrypted: boolean } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { blob: Buffer.from(value, 'utf8').toString('base64'), encrypted: false };
  }
  return { blob: safeStorage.encryptString(value).toString('base64'), encrypted: true };
}

function decrypt(blob: string | null, encrypted: boolean): string | null {
  if (!blob) return null;
  try {
    const buffer = Buffer.from(blob, 'base64');
    return encrypted ? safeStorage.decryptString(buffer) : buffer.toString('utf8');
  } catch {
    return null;
  }
}

function secretsPath(sub: string): string {
  return join(accountDir(sub), 'secrets.json');
}

function readSecrets(sub: string): AccountSecrets {
  return readJson<AccountSecrets>(secretsPath(sub), EMPTY_SECRETS);
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function saveRefreshToken(sub: string, token: string): void {
  const secrets = readSecrets(sub);
  const { blob, encrypted } = encrypt(token);
  writeJson(secretsPath(sub), { ...secrets, refreshToken: blob, encrypted });
}

export function getRefreshToken(sub: string): string | null {
  const secrets = readSecrets(sub);
  return decrypt(secrets.refreshToken, secrets.encrypted);
}

export function saveGeminiKey(sub: string, key: string): void {
  const secrets = readSecrets(sub);
  const trimmed = key.trim();
  const { blob, encrypted } = encrypt(trimmed);
  writeJson(secretsPath(sub), {
    ...secrets,
    geminiApiKey: blob,
    geminiKeyHint: `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`,
    encrypted,
  });
}

export function getGeminiKey(sub: string): string | null {
  const secrets = readSecrets(sub);
  return decrypt(secrets.geminiApiKey, secrets.encrypted);
}

export function getGeminiKeySource(sub: string): 'user' | 'none' {
  if (readSecrets(sub).geminiApiKey) return 'user';
  return 'none';
}

export function clearGeminiKey(sub: string): void {
  const secrets = readSecrets(sub);
  writeJson(secretsPath(sub), { ...secrets, geminiApiKey: null, geminiKeyHint: null });
}

export function saveGrantedScopes(sub: string, scopes: string): void {
  const secrets = readSecrets(sub);
  writeJson(secretsPath(sub), { ...secrets, grantedScopes: scopes });
}

export function hasScope(sub: string, scope: string): boolean {
  return readSecrets(sub).grantedScopes.split(/\s+/).includes(scope);
}

export function isCalendarEnabled(sub: string): boolean {
  return readSecrets(sub).calendarEnabled !== false;
}

export function setCalendarEnabled(sub: string, enabled: boolean): void {
  const secrets = readSecrets(sub);
  writeJson(secretsPath(sub), { ...secrets, calendarEnabled: enabled });
}

export function getGeminiKeyHint(sub: string): string | null {
  return readSecrets(sub).geminiKeyHint;
}

export function getGeminiModel(sub: string): string {
  return readSecrets(sub).geminiModel || DEFAULT_GEMINI_MODEL;
}

export function setGeminiModel(sub: string, model: string): void {
  const secrets = readSecrets(sub);
  writeJson(secretsPath(sub), { ...secrets, geminiModel: model.trim() || DEFAULT_GEMINI_MODEL });
}

// ------------------------------------------------------------------ profile

export function saveProfile(user: AuthUser): void {
  writeJson(join(accountDir(user.sub), 'profile.json'), user);
}

export function getProfile(sub: string): AuthUser | null {
  const path = join(accountDir(sub), 'profile.json');
  if (!existsSync(path)) return null;
  return readJson<AuthUser | null>(path, null);
}

// ---------------------------------------------------------------- workspace

export function readWorkspace(sub: string): WorkspaceData {
  return readJson<WorkspaceData>(join(accountDir(sub), 'workspace.json'), {
    courses: [],
    activeCourseId: '',
  });
}

export function writeWorkspace(sub: string, data: WorkspaceData): void {
  writeJson(join(accountDir(sub), 'workspace.json'), data);
}

/** Forgets everything about one account, including its saved Gemini key. */
export function forgetAccount(sub: string): void {
  rmSync(accountDir(sub), { recursive: true, force: true });
  setLastAccount(null);
}
