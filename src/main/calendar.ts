import type { CalendarEvent } from '../shared/types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
/** Enough to cover a month view plus its leading and trailing weeks. */
const MAX_EVENTS_PER_CALENDAR = 250;
/** Guards against an account with dozens of subscribed calendars stalling the view. */
const MAX_CALENDARS = 12;

type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
  accessRole?: string;
};

type GoogleEvent = {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

/** Turns a Google API failure into something a person can act on. */
async function readError(response: Response): Promise<never> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; errors?: { reason?: string }[] };
  };
  const message = payload.error?.message ?? '';
  const reason = payload.error?.errors?.[0]?.reason ?? '';

  if (response.status === 403 && /has not been used in project|is disabled/i.test(message)) {
    throw new Error(
      'The Google Calendar API is not enabled for this app’s Google Cloud project. ' +
        'Enable it in the Cloud Console, wait a minute, then try again.',
    );
  }
  if (response.status === 403 && /insufficient|ACCESS_TOKEN_SCOPE/i.test(message + reason)) {
    throw new Error('SCOPE_MISSING');
  }
  if (response.status === 401) throw new Error('SCOPE_MISSING');
  if (response.status === 429 || reason === 'rateLimitExceeded') {
    throw new Error('Google Calendar is rate limiting this account. Try again shortly.');
  }
  throw new Error(message || `Google Calendar returned ${response.status}.`);
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as T;
}

function toEvent(raw: GoogleEvent, calendarName: string, color: string | null): CalendarEvent | null {
  // Cancelled occurrences still come back from the API; they are not real entries.
  if (raw.status === 'cancelled') return null;
  const startRaw = raw.start?.dateTime ?? raw.start?.date;
  if (!startRaw || !raw.id) return null;
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);

  return {
    id: raw.id,
    title: raw.summary?.trim() || '(no title)',
    start: startRaw,
    end: raw.end?.dateTime ?? raw.end?.date ?? startRaw,
    allDay,
    calendarName,
    color,
    location: raw.location?.trim() || null,
    htmlLink: raw.htmlLink ?? null,
  };
}

/**
 * Every event the account can see in a window, across all of its calendars.
 *
 * `singleEvents` expands recurring series into individual occurrences, which is what
 * a month grid needs — otherwise a weekly seminar appears once, on the date the
 * series was created.
 */
export async function listEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const list = await apiGet<{ items?: GoogleCalendarListEntry[] }>('/users/me/calendarList', accessToken);

  const calendars = (list.items ?? [])
    // Respect the user's own visibility choices in Google Calendar.
    .filter((entry) => entry.id && entry.selected !== false)
    .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
    .slice(0, MAX_CALENDARS);

  const query = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(MAX_EVENTS_PER_CALENDAR),
  }).toString();

  const perCalendar = await Promise.all(
    calendars.map(async (entry) => {
      try {
        const events = await apiGet<{ items?: GoogleEvent[] }>(
          `/calendars/${encodeURIComponent(entry.id as string)}/events?${query}`,
          accessToken,
        );
        const name = entry.summary?.trim() || 'Calendar';
        const color = entry.backgroundColor ?? null;
        return (events.items ?? [])
          .map((raw) => toEvent(raw, name, color))
          .filter((event): event is CalendarEvent => event !== null);
      } catch (error) {
        // A missing scope is fatal for the whole request; one unreadable calendar is not.
        if (error instanceof Error && error.message === 'SCOPE_MISSING') throw error;
        return [];
      }
    }),
  );

  return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
}
