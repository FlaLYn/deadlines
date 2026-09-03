export type Span = { start: number; end: number; assignmentId: string };

/**
 * A whitespace- and case-insensitive view of the document, plus a map back to
 * original offsets. Models quote text that is verbatim in substance but differs in
 * incidental whitespace — a line wrap becoming a space, a run of spaces collapsing —
 * which is by far the most common way an otherwise exact quote fails to match.
 */
type Normalised = { text: string; offsets: number[] };

function normalise(source: string): Normalised {
  let text = '';
  const offsets: number[] = [];
  let pendingSpace = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += ' ';
      offsets.push(index);
      pendingSpace = false;
    }
    // Curly quotes and dashes routinely come back straightened; fold them together.
    text += fold(character);
    offsets.push(index);
  }
  return { text, offsets };
}

function fold(character: string): string {
  const lower = character.toLowerCase();
  if ('‘’ʼ´`'.includes(lower)) return "'";
  if ('“”'.includes(lower)) return '"';
  if ('–—−'.includes(lower)) return '-';
  if (lower === ' ') return ' ';
  return lower;
}

function foldAll(value: string): string {
  return [...value].map(fold).join('');
}

/**
 * Locates one quote, tightening progressively as exactness fails.
 *
 * `isFree` rejects ranges another assignment already owns. Repeated structures —
 * a due-date table where every row looks like the last — mean the first match is
 * often taken, so each candidate walks forward through later occurrences rather
 * than giving up, which is the difference between tracing a row and reporting none.
 */
function locate(
  document: Normalised,
  quote: string,
  isFree: (start: number, end: number) => boolean,
): { start: number; end: number } | null {
  const needle = foldAll(quote).replace(/\s+/g, ' ').trim();
  if (needle.length < 8) return null;

  const toOriginal = (from: number, length: number): { start: number; end: number } => ({
    start: document.offsets[from],
    // +1 because offsets point at the first character of each kept glyph.
    end: document.offsets[Math.min(from + length - 1, document.offsets.length - 1)] + 1,
  });

  /** First occurrence of `phrase` whose original range is still unclaimed. */
  const firstFree = (phrase: string): { start: number; end: number } | null => {
    let from = document.text.indexOf(phrase);
    while (from !== -1) {
      const range = toOriginal(from, phrase.length);
      if (isFree(range.start, range.end)) return range;
      from = document.text.indexOf(phrase, from + 1);
    }
    return null;
  };

  const exact = firstFree(needle);
  if (exact) return exact;

  // Models often extend a quote past where the source ends, or trim it short.
  for (const fraction of [0.8, 0.6, 0.45, 0.3]) {
    const length = Math.floor(needle.length * fraction);
    if (length < 12) break;
    const prefix = firstFree(needle.slice(0, length));
    if (prefix) return prefix;
  }

  // Last resort: the longest run of words appearing verbatim, which usually pins
  // the right line even when the quote was stitched together from two places.
  const words = needle.split(' ');
  for (let size = Math.min(words.length, 12); size >= 4; size -= 1) {
    for (let from = 0; from + size <= words.length; from += 1) {
      const phrase = words.slice(from, from + size).join(' ');
      if (phrase.length < 14) continue;
      const found = firstFree(phrase);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Maps each assignment's quote onto a range in the document.
 *
 * Overlaps are dropped rather than merged: a highlight belongs to exactly one
 * assignment so that clicking through the list scrolls somewhere unambiguous.
 */
export function locateQuotes(
  documentText: string,
  items: { id: string; sourceQuote?: string }[],
): { spans: Span[]; unmatched: string[] } {
  if (!documentText) return { spans: [], unmatched: items.map((item) => item.id) };

  const document = normalise(documentText);
  const spans: Span[] = [];
  const unmatched: string[] = [];

  for (const item of items) {
    if (!item.sourceQuote) {
      unmatched.push(item.id);
      continue;
    }
    const isFree = (start: number, end: number): boolean =>
      !spans.some((span) => start < span.end && span.start < end);
    const range = locate(document, item.sourceQuote, isFree);
    if (!range) {
      unmatched.push(item.id);
      continue;
    }
    spans.push({ ...range, assignmentId: item.id });
  }

  spans.sort((a, b) => a.start - b.start);
  return { spans, unmatched };
}

export type Segment = { text: string; assignmentId: string | null };

/** Splits the document into consecutive plain and highlighted runs for rendering. */
export function toSegments(documentText: string, spans: Span[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ text: documentText.slice(cursor, span.start), assignmentId: null });
    }
    segments.push({
      text: documentText.slice(span.start, span.end),
      assignmentId: span.assignmentId,
    });
    cursor = span.end;
  }
  if (cursor < documentText.length) {
    segments.push({ text: documentText.slice(cursor), assignmentId: null });
  }
  return segments;
}
