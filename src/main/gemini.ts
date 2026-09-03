import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Assignment, Course, ExtractResult } from '../shared/types';
import { MAX_FILE_BYTES, SUPPORTED_EXTENSIONS } from '../shared/types';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_EXTRACTED_TEXT = 1_500_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const courseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Full official course title, including course code when present.' },
    shortTitle: { type: 'string', description: 'A concise course name, no more than 34 characters.' },
    term: { type: 'string', description: 'Academic term and four-digit year.' },
    instructor: { type: 'string', description: 'Primary instructor name or Instructor not found.' },
    schedule: { type: 'string', description: 'Lecture days and times, or Schedule not found.' },
    location: { type: 'string', description: 'Primary classroom or online location, or Location not found.' },
    assignments: {
      type: 'array',
      description: 'Graded work and all required dated coursework, including readings and assigned media.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          due: {
            type: ['string', 'null'],
            description: 'Local date-time as YYYY-MM-DDTHH:mm:ss. Use 23:59:00 when a date is exact but no time is stated. Null when the date is unknown or depends on a section the student has not identified.',
          },
          kind: { type: 'string', enum: ['paper', 'quiz', 'reading', 'video', 'class'] },
          weight: { type: ['number', 'null'], description: 'Individual percentage of final grade, only when explicitly stated or arithmetically certain.' },
          details: { type: 'string', description: 'Brief useful instructions, scope, alternative section dates, or grading-category context.' },
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Every full http or https URL associated with this specific item. Empty when none is present.',
          },
          confidence: { type: 'string', enum: ['high', 'review'] },
          sourceQuote: {
            type: 'string',
            description: 'A short VERBATIM span copied character-for-character from the syllabus text this item was taken from, 10 to 200 characters. Copy exactly, including punctuation and capitalisation. Do not paraphrase, join distant fragments, or insert ellipses. Prefer the line naming the item and its date.',
          },
        },
        required: ['title', 'due', 'kind', 'weight', 'details', 'urls', 'confidence', 'sourceQuote'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concise issues the student should verify, such as tentative dates, section-dependent dates, or grading totals that cannot be allocated to individual items.',
    },
  },
  required: ['title', 'shortTitle', 'term', 'instructor', 'schedule', 'location', 'assignments', 'warnings'],
};

const extractionPrompt = `You are a meticulous university syllabus importer. Read the entire attached syllabus and create one clean course plan.

Extract the official course title/code, term, primary instructor, lecture schedule, and location. Extract every graded deliverable: exams, papers, projects, problem sets, homework, quizzes, presentations, participation deliverables, and other required submissions. Also extract every assigned video, film, podcast, or recording, including media intended to be watched during class. Include required readings when the syllabus ties them to a specific class date. Do not create tasks from general policies, optional materials, office hours, or topic-only calendar rows.

Rules:
- Resolve month/day dates using the syllabus term year, not today's year.
- Use local ISO date-times without a timezone. If an exact due date has no time, use 23:59:00.
- If a date is tentative, missing, or differs by recitation section and the student's section is unknown, set due to null, mark confidence as review, and put the possible dates in details.
- Never invent a date, time, room, instructor, assignment, or grade percentage.
- If a grading category is shared across multiple items, assign individual weights only when the syllabus makes the split explicit or it is arithmetically certain.
- Merge duplicate mentions from prose, tables, and calendars into one assignment.
- Tie each video or other media item to the class date where it appears in the schedule, even when it will be viewed during class rather than beforehand.
- Preserve every document hyperlink and written http/https URL that belongs to an item in its urls array. This includes video, reading, source, submission, and meeting links. Never shorten, rewrite, or invent a URL.
- When several links belong to one scheduled item, keep all of them on that item. Do not put unrelated course-wide links on every assignment.
- Use kind paper for papers/projects/problem sets/homework; quiz for quizzes/exams; reading for dated readings; video for assigned videos/films/podcasts/recordings; class for other required dated work.
- Keep details short but retain information the student needs to distinguish or complete the item.
- Add a warning for every material ambiguity the student should review.
- For sourceQuote, copy an exact verbatim span from the document text. It must appear character-for-character in the source: it is used to highlight where the item came from, so a shorter exact quote is far better than a longer paraphrase.

Return only the requested structured course object.`;

/** Gemini's interactions API has several output shapes; find the first text part. */
function findOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.output_text === 'string') return data.output_text;

  const textFrom = (content: unknown): string | null => {
    if (!Array.isArray(content)) return null;
    const part = content.find(
      (item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text',
    ) as Record<string, unknown> | undefined;
    return typeof part?.text === 'string' ? part.text : null;
  };

  for (const output of Array.isArray(data.outputs) ? data.outputs : []) {
    if (!output || typeof output !== 'object') continue;
    const item = output as Record<string, unknown>;
    if (item.type === 'text' && typeof item.text === 'string') return item.text;
    const nested = textFrom(item.content);
    if (nested) return nested;
  }
  for (const step of Array.isArray(data.steps) ? data.steps : []) {
    if (!step || typeof step !== 'object') continue;
    const nested = textFrom((step as Record<string, unknown>).content);
    if (nested) return nested;
  }
  return null;
}

/**
 * Reads a PDF's text layer. Returns '' for scanned PDFs, which carry no text and
 * must fall back to sending the file itself.
 */
async function extractPdfText(filePath: string): Promise<string> {
  // The legacy build is the one that runs outside a browser.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(filePath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    // pdf.js emits positioned glyph runs in reading order with no newlines, so
    // `hasEOL` is the only line-break signal available for rebuilding lines.
    const lines: string[] = [];
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line.trimEnd());
        line = '';
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    pages.push(lines.join('\n'));
  }
  await pdf.cleanup();
  return pages.join('\n\n').trim();
}

type PreparedDocument = {
  /** What gets sent to Gemini. */
  input: Record<string, string>;
  /** Word documents only: mammoth's HTML, so the review can show real formatting. */
  html?: string;
  /**
   * The plain text the user will be shown next to the results. Gemini is told to
   * draw sourceQuote from exactly this string, so highlights can be located in it.
   * Empty when the format has no local extractor — highlighting is then skipped.
   */
  documentText: string;
};

/** Pulls content out locally where we can, preserving DOCX hyperlink targets. */
async function prepareDocument(filePath: string, extension: string): Promise<PreparedDocument> {
  const asPrompt = (plain: string, extra = ''): Record<string, string> => ({
    type: 'text',
    text:
      `Plain text of the syllabus (quote sourceQuote from THIS section only):\n\n` +
      `${plain.slice(0, MAX_EXTRACTED_TEXT)}${extra}`,
  });

  if (extension === '.docx') {
    const mammoth = await import('mammoth');
    const [{ value: rawText }, { value: html }] = await Promise.all([
      mammoth.extractRawText({ path: filePath }),
      mammoth.convertToHtml({ path: filePath }),
    ]);
    if (!rawText.trim() && !html.trim()) throw new Error('No readable text was found in this Word document.');
    const documentText = rawText.trim();
    // The HTML is carried only so link targets survive; quotes must not come from it.
    const extra = `\n\nHyperlink-preserving HTML (for URLs only, never quote from this):\n${html}`;
    return { input: asPrompt(documentText, extra), documentText, html };
  }

  if (['.txt', '.md', '.rtf'].includes(extension)) {
    const text = (await readFile(filePath, 'utf8')).trim();
    if (!text) throw new Error('That file appears to be empty.');
    return { input: asPrompt(text), documentText: text };
  }

  if (extension === '.pdf') {
    const text = await extractPdfText(filePath).catch(() => '');
    // A text layer means Gemini and the user see the identical string.
    if (text) return { input: asPrompt(text), documentText: text };
  }

  // Scanned PDFs and the office formats with no local extractor: let Gemini read
  // the file directly, and accept that there is nothing to highlight against.
  const buffer = await readFile(filePath);
  return {
    input: {
      type: 'document',
      data: buffer.toString('base64'),
      mime_type: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
    },
    documentText: '',
  };
}

function normalizeCourse(extracted: Record<string, unknown>, fileName: string): Course {
  const rawAssignments = Array.isArray(extracted.assignments) ? extracted.assignments : [];
  const assignments: Assignment[] = rawAssignments.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const kind = String(item.kind);
    const urls = Array.isArray(item.urls)
      ? [...new Set(item.urls.map(String).map((url) => url.trim()).filter((url) => /^https?:\/\/\S+$/i.test(url)))]
      : [];
    return {
      id: `imported-${index + 1}-${randomUUID()}`,
      title: String(item.title || `Imported item ${index + 1}`),
      due: typeof item.due === 'string' && item.due ? item.due : null,
      kind: (['paper', 'quiz', 'reading', 'video', 'class'].includes(kind) ? kind : 'class') as Assignment['kind'],
      weight: typeof item.weight === 'number' ? item.weight : undefined,
      details: String(item.details || 'Imported from syllabus'),
      urls,
      confidence: item.confidence === 'high' ? 'high' : 'review',
      sourceQuote:
        typeof item.sourceQuote === 'string' && item.sourceQuote.trim()
          ? item.sourceQuote.trim()
          : undefined,
    };
  });

  return {
    id: `course-${randomUUID()}`,
    title: String(extracted.title || fileName),
    shortTitle: String(extracted.shortTitle || extracted.title || fileName).slice(0, 34),
    term: String(extracted.term || 'Term not found'),
    instructor: String(extracted.instructor || 'Instructor not found'),
    schedule: String(extracted.schedule || 'Schedule not found'),
    location: String(extracted.location || 'Location not found'),
    assignments,
  };
}

export async function extractCourse(
  filePath: string,
  apiKey: string,
  model: string,
): Promise<ExtractResult> {
  const fileName = basename(filePath);
  const extension = extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension.slice(1) as never)) {
    throw new Error('Choose a PDF, DOCX, TXT, Markdown, RTF, ODT, or PowerPoint syllabus.');
  }

  const info = await stat(filePath);
  if (!info.size) throw new Error('That file is empty.');
  if (info.size > MAX_FILE_BYTES) throw new Error('Please choose a syllabus smaller than 20 MB.');

  const { input: documentInput, documentText, html } = await prepareDocument(filePath, extension);

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model,
      input: [documentInput, { type: 'text', text: `${extractionPrompt}\n\nSource filename: ${fileName}` }],
      response_format: { type: 'text', mime_type: 'application/json', schema: courseSchema },
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error as Record<string, unknown> | undefined;
    const message = typeof apiError?.message === 'string' ? apiError.message : '';
    if (response.status === 400 && /api key/i.test(message)) {
      throw new Error('That Gemini API key was rejected. Check it in Settings.');
    }
    if (response.status === 429) {
      throw new Error('Your Gemini API key hit its rate limit. Wait a moment and try again.');
    }
    throw new Error(message || 'Gemini could not analyze this syllabus.');
  }

  const outputText = findOutputText(payload);
  if (!outputText) throw new Error('Gemini returned no course data.');

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(outputText) as Record<string, unknown>;
  } catch {
    throw new Error('Gemini returned course data that could not be read.');
  }

  return {
    course: normalizeCourse(extracted, fileName),
    warnings: Array.isArray(extracted.warnings) ? extracted.warnings.map(String) : [],
    sourceName: fileName,
    documentText,
    documentHtml: html ?? '',
    filePath,
    extension,
  };
}

/** Cheap round-trip so the user learns their key is bad in Settings, not mid-import. */
export async function verifyApiKey(apiKey: string, model: string): Promise<void> {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ model, input: [{ type: 'text', text: 'Reply with the single word: ok' }] }),
  });
  if (response.ok) return;

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const apiError = payload.error as Record<string, unknown> | undefined;
  const message = typeof apiError?.message === 'string' ? apiError.message : '';
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new Error(message || 'That key was rejected by Google.');
  }
  if (response.status === 404) {
    throw new Error(`The model "${model}" is not available to this key.`);
  }
  throw new Error(message || 'Could not reach the Gemini API.');
}
