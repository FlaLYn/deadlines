import { NextResponse } from 'next/server';

export const runtime = 'edge';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

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
      description: 'Graded work and required dated coursework found in the syllabus.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          due: {
            type: ['string', 'null'],
            description: 'Local date-time as YYYY-MM-DDTHH:mm:ss. Use 23:59:00 when a date is exact but no time is stated. Null when the date is unknown or depends on a section the student has not identified.',
          },
          kind: { type: 'string', enum: ['paper', 'quiz', 'reading', 'class'] },
          weight: { type: ['number', 'null'], description: 'Individual percentage of final grade, only when explicitly stated or arithmetically certain.' },
          details: { type: 'string', description: 'Brief useful instructions, scope, alternative section dates, or grading-category context.' },
          confidence: { type: 'string', enum: ['high', 'review'] },
        },
        required: ['title', 'due', 'kind', 'weight', 'details', 'confidence'],
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

Extract the official course title/code, term, primary instructor, lecture schedule, and location. Extract every graded deliverable: exams, papers, projects, problem sets, homework, quizzes, presentations, participation deliverables, and other required submissions. Include required readings only when the syllabus ties them to a specific class date. Do not create tasks from general policies, optional materials, office hours, or topic-only calendar rows.

Rules:
- Resolve month/day dates using the syllabus term year, not today's year.
- Use local ISO date-times without a timezone. If an exact due date has no time, use 23:59:00.
- If a date is tentative, missing, or differs by recitation section and the student's section is unknown, set due to null, mark confidence as review, and put the possible dates in details.
- Never invent a date, time, room, instructor, assignment, or grade percentage.
- If a grading category is shared across multiple items, assign individual weights only when the syllabus makes the split explicit or it is arithmetically certain.
- Merge duplicate mentions from prose, tables, and calendars into one assignment.
- Use kind paper for papers/projects/problem sets/homework; quiz for quizzes/exams; reading for dated readings; class for other required dated work.
- Keep details short but retain information the student needs to distinguish or complete the item.
- Add a warning for every material ambiguity the student should review.

Return only the requested structured course object.`;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function findOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.output_text === 'string') return data.output_text;
  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  for (const output of outputs) {
    if (output && typeof output === 'object') {
      const item = output as Record<string, unknown>;
      if (item.type === 'text' && typeof item.text === 'string') return item.text;
      if (Array.isArray(item.content)) {
        const text = item.content.find((content) => content && typeof content === 'object' && (content as Record<string, unknown>).type === 'text') as Record<string, unknown> | undefined;
        if (typeof text?.text === 'string') return text.text;
      }
    }
  }
  const steps = Array.isArray(data.steps) ? data.steps : [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    const text = content.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text') as Record<string, unknown> | undefined;
    if (typeof text?.text === 'string') return text.text;
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini is not configured yet. Add GEMINI_API_KEY to the server environment.' }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const uploaded = form.get('file');
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: 'Choose a syllabus file to import.' }, { status: 400 });
    }
    if (!uploaded.size || uploaded.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'The syllabus must be between 1 byte and 20 MB.' }, { status: 413 });
    }

    const extractedTextValue = form.get('extractedText');
    const extractedText = typeof extractedTextValue === 'string' ? extractedTextValue.trim() : '';
    if (extractedText.length > 1_500_000) {
      return NextResponse.json({ error: 'The extracted syllabus text is too large to analyze.' }, { status: 413 });
    }
    const mimeType = uploaded.type || 'application/octet-stream';
    const documentInput = extractedText
      ? { type:'text', text:`Extracted document text:\n\n${extractedText}` }
      : { type:'document', data:bytesToBase64(new Uint8Array(await uploaded.arrayBuffer())), mime_type:mimeType };
    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
        input: [
          documentInput,
          { type: 'text', text: `${extractionPrompt}\n\nSource filename: ${uploaded.name}` },
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: courseSchema,
        },
      }),
    });

    const geminiPayload = await geminiResponse.json() as Record<string, unknown>;
    if (!geminiResponse.ok) {
      const apiError = geminiPayload.error as Record<string, unknown> | undefined;
      const message = typeof apiError?.message === 'string' ? apiError.message : 'Gemini could not analyze this syllabus.';
      return NextResponse.json({ error: message }, { status: geminiResponse.status });
    }

    const outputText = findOutputText(geminiPayload);
    if (!outputText) return NextResponse.json({ error: 'Gemini returned no course data.' }, { status: 502 });
    const extracted = JSON.parse(outputText) as Record<string, unknown>;
    const assignments = Array.isArray(extracted.assignments) ? extracted.assignments : [];

    return NextResponse.json({
      course: {
        id: `course-${crypto.randomUUID()}`,
        title: String(extracted.title || uploaded.name),
        shortTitle: String(extracted.shortTitle || extracted.title || uploaded.name).slice(0, 34),
        term: String(extracted.term || 'Term not found'),
        instructor: String(extracted.instructor || 'Instructor not found'),
        schedule: String(extracted.schedule || 'Schedule not found'),
        location: String(extracted.location || 'Location not found'),
        assignments: assignments.map((assignment, index) => {
          const item = assignment as Record<string, unknown>;
          return {
            id: `imported-${index + 1}-${crypto.randomUUID()}`,
            title: String(item.title || `Imported item ${index + 1}`),
            due: typeof item.due === 'string' && item.due ? item.due : null,
            kind: ['paper', 'quiz', 'reading', 'class'].includes(String(item.kind)) ? item.kind : 'class',
            weight: typeof item.weight === 'number' ? item.weight : undefined,
            details: String(item.details || 'Imported from syllabus'),
            confidence: item.confidence === 'high' ? 'high' : 'review',
          };
        }),
      },
      warnings: Array.isArray(extracted.warnings) ? extracted.warnings.map(String) : [],
      sourceName: uploaded.name,
    });
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Gemini returned course data that could not be read.' : 'The syllabus could not be analyzed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
