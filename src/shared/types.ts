export type AssignmentKind = 'paper' | 'quiz' | 'reading' | 'video' | 'class';

export type Assignment = {
  id: string;
  title: string;
  due: string | null;
  kind: AssignmentKind;
  weight?: number;
  details: string;
  /** Source, reading, video, submission, or meeting links attached to this item. */
  urls?: string[];
  /**
   * The verbatim run of syllabus text this item was derived from, used to highlight
   * the source during import. Absent when the document had no extractable text.
   */
  sourceQuote?: string;
  completed?: boolean;
  confidence?: 'high' | 'review';
};

export type Course = {
  id: string;
  title: string;
  shortTitle: string;
  term: string;
  instructor: string;
  schedule: string;
  location: string;
  /** Hex colour chosen by the user. Falls back to a palette slot when unset. */
  color?: string;
  assignments: Assignment[];
};

/** Colours offered in the course colour picker; the first is the default accent. */
export const COURSE_COLORS = [
  '#e66d52', '#7189c4', '#c5984f', '#719485', '#9d78a8',
  '#c96a8b', '#5f9ea0', '#8a8f5c', '#b5705c', '#6f7d9c',
] as const;

/** The signed-in Google identity. `sub` is the stable Google account id. */
export type AuthUser = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export type AuthState = { status: 'signed-out' } | { status: 'signed-in'; user: AuthUser };

/** One occurrence from the user's Google Calendar, flattened for display. */
export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO instant, or YYYY-MM-DD when allDay. */
  start: string;
  end: string;
  allDay: boolean;
  calendarName: string;
  /** Colour Google assigns the source calendar, when it provides one. */
  color: string | null;
  location: string | null;
  htmlLink: string | null;
};

export type CalendarStatus = {
  /** True once the signed-in account has granted the read-only Calendar scope. */
  granted: boolean;
  /** User preference: show Google events in the month view. */
  enabled: boolean;
};

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export type WorkspaceData = {
  courses: Course[];
  activeCourseId: string;
};

/** Never carries the key itself into the renderer — only whether one exists. */
export type ApiKeyStatus = {
  configured: boolean;
  /** e.g. "AIza…9fQ2" — enough to recognise the key, not to use it. */
  hint: string | null;
  model: string;
  source: 'user' | 'none';
};

export type ExtractRequest = {
  /** Absolute path chosen through the native file dialog. */
  filePath: string;
};

export type ExtractResult = {
  course: Course;
  warnings: string[];
  sourceName: string;
  /**
   * The syllabus text as the app read it — the exact string Gemini was given, so
   * every sourceQuote is findable in it. Empty for documents with no text layer
   * (a scanned PDF), in which case the import review hides the source pane.
   */
  documentText: string;
  /** Word documents converted to HTML, so the review can show real formatting. */
  documentHtml: string;
  /** Kept so the review can load the original file and render it faithfully. */
  filePath: string;
  extension: string;
};

/** The original bytes of an imported file, for rendering it as it really looks. */
export type SourceFile = {
  base64: string;
  extension: string;
};

/** Uniform IPC envelope: main never throws across the bridge. */
export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

export const SUPPORTED_EXTENSIONS = [
  'pdf', 'docx', 'txt', 'md', 'rtf', 'odt', 'ppt', 'pptx',
] as const;

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';

/** A release newer than the running build. */
export type UpdateInfo = {
  version: string;
  notes: string | null;
  url: string;
  /**
   * False when the app cannot install the update itself — an unsigned macOS build,
   * where Squirrel.Mac rejects updates it cannot verify. The UI then offers a
   * download link rather than an install button.
   */
  canInstall: boolean;
};

export type UpdateStatus = {
  state: 'idle' | 'dev' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';
  currentVersion: string;
  available?: UpdateInfo | null;
  percent?: number;
  error?: string;
};
