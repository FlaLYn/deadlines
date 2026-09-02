'use client';

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import mammoth from 'mammoth';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronRight, Circle, Clock3, FileText, FileUp,
  LayoutDashboard, ListTodo, Plus, Search, Sparkles, UploadCloud, X,
} from 'lucide-react';

type Assignment = {
  id: string;
  title: string;
  due: string | null;
  kind: 'paper' | 'quiz' | 'reading' | 'class';
  weight?: number;
  details: string;
  completed?: boolean;
  confidence?: 'high' | 'review';
};

type Course = {
  id: string;
  title: string;
  shortTitle: string;
  term: string;
  instructor: string;
  schedule: string;
  location: string;
  assignments: Assignment[];
};

const sampleCourse: Course = {
  id: 'political-economy-2026',
  title: 'Political Economy from Adam Smith to COVID-19',
  shortTitle: 'Political Economy',
  term: 'Fall 2026',
  instructor: 'Yanni Kotsonis',
  schedule: 'Monday & Wednesday · 9:30 AM',
  location: 'Cantor Film Center',
  assignments: [
    { id: 'paper-1', title: 'Paper No. 1', due: '2026-09-25T18:00:00', kind: 'paper', weight: 10, details: '5 double-spaced pages · Smith, Malthus, and Marx on value', confidence: 'high' },
    { id: 'paper-2', title: 'Paper No. 2', due: '2026-10-23T18:00:00', kind: 'paper', weight: 10, details: '5 double-spaced pages · Keynes, Hayek, and Friedman on crisis', confidence: 'high' },
    { id: 'quiz-1', title: 'In-class quiz / précis 1', due: null, kind: 'quiz', weight: 15, details: 'Date set by your recitation instructor', confidence: 'review' },
    { id: 'quiz-2', title: 'In-class quiz / précis 2', due: null, kind: 'quiz', weight: 15, details: 'Date set by your recitation instructor', confidence: 'review' },
    { id: 'quiz-3', title: 'In-class quiz / précis 3', due: null, kind: 'quiz', weight: 15, details: 'Date set by your recitation instructor', confidence: 'review' },
    { id: 'paper-3', title: 'Paper No. 3', due: '2026-12-14T18:00:00', kind: 'paper', weight: 10, details: 'Up to 10 double-spaced pages · Great Recession vs. COVID policy', confidence: 'high' },
  ],
};

const scheduleItems = [
  { date: 'SEP 02', title: 'The Economy', subtitle: 'From philosophy to mathematics', reading: 'Timothy Mitchell, “Fixing the Economy”' },
  { date: 'SEP 09', title: 'Adam Smith', subtitle: 'Labour, value, and unlimited wealth', reading: 'The Wealth of Nations, selected pages' },
  { date: 'SEP 14', title: 'Thomas Malthus', subtitle: 'Population, scarcity, and providence', reading: 'An Essay on the Principle of Population' },
  { date: 'SEP 21', title: 'Karl Marx', subtitle: 'Capitalism, crisis, and dialectics', reading: 'Capital, ch. 1; The Communist Manifesto' },
  { date: 'OCT 05', title: 'John Maynard Keynes', subtitle: 'Saving capitalism from itself · Zoom', reading: 'The End of Laissez Faire; General Theory' },
  { date: 'OCT 14', title: 'Hayek & Friedman', subtitle: 'Monetarism and the new liberalism', reading: 'The Road to Serfdom; Capitalism and Freedom' },
];

const monthName: Record<string, string> = { '01':'JAN','02':'FEB','03':'MAR','04':'APR','05':'MAY','06':'JUN','07':'JUL','08':'AUG','09':'SEP','10':'OCT','11':'NOV','12':'DEC' };
const monthNumber: Record<string, number> = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };

function parseDate(month: string, day: string, year: number, time = '23:59') {
  const monthIndex = monthNumber[month.toLowerCase()];
  if (monthIndex === undefined) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, monthIndex, Number(day), hours, minutes).toISOString();
}

function parseSyllabus(text: string, fileName: string): Course {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  const lines = clean.split('\n').map((line) => line.trim()).filter(Boolean);
  const year = Number(clean.match(/\b(Fall|Spring|Summer|Winter)\s+(20\d{2})\b/i)?.[2] ?? new Date().getFullYear());
  const term = clean.match(/\b(Fall|Spring|Summer|Winter)\s+20\d{2}\b/i)?.[0] ?? `Academic year ${year}`;
  const title = lines.find((line) => line.length > 8 && line.length < 100 && !/syllabus|fall|spring|professor/i.test(line)) ?? fileName.replace(/\.docx$/i, '');
  const instructor = lines.slice(1, 8).find((line) => /^[A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){1,3}$/u.test(line)) ?? 'Instructor not found';
  const meeting = clean.match(/(Monday|Tuesday|Wednesday|Thursday|Friday)(?:\s*(?:and|&)\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday))?[^\n]{0,30}?\b(\d{1,2}:\d{2})\b/i);
  const locationLine = meeting ? lines[lines.findIndex((line) => line.includes(meeting[0])) + 1] : '';
  const assignments: Assignment[] = [];
  const paperPattern = /Paper\s*(?:No\.?\s*)?(\d)[\s\S]{0,420}?due\s+(\d{1,2})\s+(September|October|November|December|January|February|March|April|May|June|July|August)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?))?/gi;
  for (const match of clean.matchAll(paperPattern)) {
    let hour = Number(match[4] ?? 23);
    const minute = Number(match[5] ?? 59);
    if (/p/i.test(match[6] ?? '') && hour < 12) hour += 12;
    if (/a/i.test(match[6] ?? '') && hour === 12) hour = 0;
    const nearby = match[0];
    const pages = nearby.match(/(?:up to\s+)?\d+\s+double-spaced pages|five double-spaced pages/i)?.[0];
    assignments.push({
      id: `paper-${match[1]}-${Date.now()}`,
      title: `Paper No. ${match[1]}`,
      due: parseDate(match[3], match[2], year, `${hour}:${String(minute).padStart(2, '0')}`),
      kind: 'paper',
      weight: Number(clean.match(new RegExp(`Each(?: paper)?[^.]{0,80}?${match[1]}?[^.]{0,30}?(\\d+) percent`, 'i'))?.[1] ?? 10),
      details: pages ? `${pages} · Imported from syllabus` : 'Imported from syllabus',
      confidence: 'high',
    });
  }
  const quizCount = Number(clean.match(/total of\s+(three|four|five|\d+)\s+in-class quizzes/i)?.[1]?.replace('three','3').replace('four','4').replace('five','5') ?? 0);
  const quizWeight = Number(clean.match(/quizzes?[\s\S]{0,180}?(\d+) percent each/i)?.[1] ?? 0);
  for (let index = 1; index <= quizCount; index += 1) assignments.push({ id:`quiz-${index}-${Date.now()}`, title:`In-class quiz / précis ${index}`, due:null, kind:'quiz', weight:quizWeight || undefined, details:'Date to be set by instructor', confidence:'review' });
  if (!assignments.length) assignments.push({ id:`review-${Date.now()}`, title:'Review imported syllabus', due:null, kind:'class', details:'No clearly dated assignments were found', confidence:'review' });
  return {
    id: `course-${Date.now()}`,
    title,
    shortTitle: title.split(/[:—-]/)[0].slice(0, 34),
    term,
    instructor,
    schedule: meeting ? meeting[0] : 'Schedule not found',
    location: locationLine && locationLine.length < 70 ? locationLine : 'Location not found',
    assignments,
  };
}

function dateParts(value: string | null) {
  if (!value) return { day: '—', month: 'TBD', full: 'Date to be announced' };
  const date = new Date(value);
  return { day: String(date.getDate()).padStart(2, '0'), month: monthName[String(date.getMonth() + 1).padStart(2, '0')], full: date.toLocaleString('en-US', { month:'long', day:'numeric', hour:'numeric', minute:'2-digit' }) };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'overview' | 'calendar' | 'course'>('overview');
  const [course, setCourse] = useState<Course>(sampleCourse);
  const [draft, setDraft] = useState<Course | null>(null);
  const [modal, setModal] = useState<'upload' | 'review' | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('courseflow-course');
    if (saved) try { setCourse(JSON.parse(saved)); } catch { /* keep sample */ }
  }, []);

  function persist(next: Course) {
    setCourse(next);
    localStorage.setItem('courseflow-course', JSON.stringify(next));
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setToast('Please choose a .docx syllabus.');
      setTimeout(() => setToast(''), 2800);
      return;
    }
    setParsing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      setDraft(parseSyllabus(result.value, file.name));
      setModal('review');
    } catch {
      setToast('That document could not be read. Try another .docx file.');
      setTimeout(() => setToast(''), 3200);
    } finally { setParsing(false); }
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) { readFile(event.target.files?.[0]); }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }
  function confirmImport() {
    if (!draft) return;
    persist(draft);
    setModal(null);
    setView('overview');
    setToast(`${draft.assignments.length} items added to ${draft.shortTitle}.`);
    setTimeout(() => setToast(''), 3500);
  }
  function toggleDone(id: string) {
    persist({ ...course, assignments: course.assignments.map((item) => item.id === id ? { ...item, completed: !item.completed } : item) });
  }

  const dated = course.assignments.filter((item) => item.due).sort((a,b) => String(a.due).localeCompare(String(b.due)));
  const completion = Math.round(course.assignments.filter((item) => item.completed).length / course.assignments.length * 100) || 0;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('overview')} aria-label="Courseflow home"><span className="brand-mark">C</span><span>Courseflow</span></button>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={`nav-item ${view === 'overview' ? 'active' : ''}`} onClick={() => setView('overview')}><LayoutDashboard size={18}/> Overview</button>
          <button className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}><CalendarDays size={18}/> Calendar</button>
          <button className={`nav-item ${view === 'course' ? 'active' : ''}`} onClick={() => setView('course')}><BookOpen size={18}/> Courses</button>
        </nav>
        <div className="sidebar-course">
          <span className="side-label">MY COURSES</span>
          <button onClick={() => setView('course')}><i /> <span>{course.shortTitle}</span></button>
          <button className="add-course" onClick={() => setModal('upload')}><Plus size={15}/> Add course</button>
        </div>
        <div className="semester-card"><span>{course.term}</span><strong>{course.assignments.length} course items</strong><div className="semester-progress"><i style={{width:`${Math.max(7, completion)}%`}} /></div><small>{completion}% complete</small></div>
        <div className="user-row"><span className="avatar">RP</span><span><strong>My workspace</strong><small>Saved on this device</small></span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'}).toUpperCase()}</p><h1>{view === 'overview' ? 'Good morning.' : view === 'calendar' ? 'Your semester.' : course.shortTitle}</h1></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18}/></button><button className="import-button" onClick={() => setModal('upload')}><FileUp size={18}/> Import syllabus</button></div>
        </header>

        {view === 'overview' && <>
          <section className="course-hero">
            <div className="course-copy"><span className="course-label"><i/> {course.shortTitle.toUpperCase()}</span><h2>Economic thought,<br/>made manageable.</h2><p>{course.schedule} · {course.location}<br/>Everything from your syllabus, in one calm place.</p><button className="view-course" onClick={() => setView('course')}>Open course <ArrowUpRight size={17}/></button></div>
            <div className="course-visual" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="visual-card card-one"><span>SMITH</span><b>01</b></div><div className="visual-card card-two"><span>KEYNES</span><b>06</b></div><div className="visual-card card-three"><span>COVID</span><b>12</b></div></div>
          </section>
          <section className="content-grid">
            <div><div className="section-heading"><div><span className="kicker">UP NEXT</span><h3>Upcoming work</h3></div><button onClick={() => setView('calendar')}>View all</button></div><div className="assignment-list">
              {dated.slice(0,3).map((item,index) => { const d=dateParts(item.due); return <article className={`assignment ${item.completed ? 'done' : ''}`} key={item.id}><button className={`date-tile tone-${index%3}`} onClick={() => toggleDone(item.id)} aria-label={`Mark ${item.title} ${item.completed?'incomplete':'complete'}`}>{item.completed?<Check size={19}/>:<><b>{d.day}</b><span>{d.month}</span></>}</button><div><h4>{item.title}</h4><p>{item.details}{item.weight ? ` · ${item.weight}% of grade` : ''}</p></div><span className="status">{item.completed?'Completed':'Not started'}</span><ChevronRight size={18}/></article> })}
            </div></div>
            <aside className="today-card"><span className="kicker">FIRST CLASS</span><h3>The Economy</h3><p>From philosophy to mathematics</p><div className="time-block"><span>09:30</span><i/><div><b>Lecture</b><small>{course.location}</small></div></div><div className="reading-chip"><BookOpen size={17}/><span><small>READ BEFORE CLASS</small>Mitchell, “Fixing the Economy”</span></div></aside>
          </section>
        </>}

        {view === 'calendar' && <section className="panel-page">
          <div className="calendar-head"><div><span className="kicker">FALL 2026</span><h2>September</h2></div><div><button className="icon-button"><ArrowLeft size={17}/></button><button className="today-button">Today</button><button className="icon-button"><ArrowRight size={17}/></button></div></div>
          <div className="calendar-grid"><div className="calendar-sidebar"><span className="side-label">COURSES</span><label><i/> {course.shortTitle}</label><div className="mini-stat"><ListTodo size={18}/><span><strong>{course.assignments.length}</strong> total items</span></div><div className="mini-stat"><CheckCircle2 size={18}/><span><strong>{course.assignments.filter(a=>a.completed).length}</strong> completed</span></div></div><div className="calendar-list"><div className="calendar-row header"><span>DATE</span><span>ITEM</span><span>TYPE</span><span>WEIGHT</span></div>{course.assignments.map((item) => {const d=dateParts(item.due); return <button className={`calendar-row ${item.completed?'done':''}`} key={item.id} onClick={()=>toggleDone(item.id)}><span className="calendar-date"><b>{d.day}</b>{d.month}</span><span><strong>{item.title}</strong><small>{item.due?d.full:item.details}</small></span><span className={`type-pill ${item.kind}`}>{item.kind}</span><span>{item.weight ? `${item.weight}%` : '—'}</span><span className="check-ring">{item.completed?<Check size={13}/>:null}</span></button>})}</div></div>
        </section>}

        {view === 'course' && <section className="panel-page">
          <div className="course-title-row"><div className="course-monogram">PE</div><div><span className="kicker">{course.term.toUpperCase()}</span><h2>{course.title}</h2><p>{course.instructor} · {course.schedule} · {course.location}</p></div></div>
          <div className="course-stats"><div><span>COURSE PROGRESS</span><strong>{completion}%</strong><div className="wide-progress"><i style={{width:`${completion}%`}}/></div></div><div><span>GRADE TRACKED</span><strong>{course.assignments.reduce((sum,item)=>sum+(item.weight??0),0)}%</strong><small>Participation makes up the remainder</small></div><div><span>NEEDS REVIEW</span><strong>{course.assignments.filter(a=>a.confidence==='review').length}</strong><small>Items without confirmed dates</small></div></div>
          <div className="course-columns"><div><div className="section-heading"><div><span className="kicker">SYLLABUS MAP</span><h3>Course schedule</h3></div></div><div className="schedule-list">{scheduleItems.map((item,index)=><article key={item.date}><span>{item.date}</span><i className={index===0?'current':''}/><div><h4>{item.title}</h4><p>{item.subtitle}</p><small><BookOpen size={13}/>{item.reading}</small></div></article>)}</div></div><aside className="grading-card"><span className="kicker">GRADING</span><h3>How it adds up</h3><div className="grade-donut"><div><strong>100</strong><span>points</span></div></div><div className="grade-key"><p><i className="coral-dot"/><span>Papers</span><b>30%</b></p><p><i className="blue-dot"/><span>Quizzes / précis</span><b>45%</b></p><p><i className="sage-dot"/><span>Participation</span><b>25%</b></p></div></aside></div>
        </section>}
      </section>

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => !parsing && setModal(null)}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event)=>event.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)} aria-label="Close"><X size={19}/></button>
        {modal === 'upload' && <><span className="modal-icon"><Sparkles size={20}/></span><p className="modal-step">NEW COURSE</p><h2 id="import-title">Turn a syllabus into a plan.</h2><p className="modal-intro">Upload a Word document and Courseflow will find your course details, assignments, due dates, readings, and grade weights.</p><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={(event)=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}><input ref={inputRef} type="file" accept=".docx" onChange={onInput}/>{parsing?<><span className="loader"/><strong>Reading your syllabus…</strong><small>Finding dates and assignments</small></>:<><UploadCloud size={30}/><strong>Drop your syllabus here</strong><small>or click to browse · DOCX up to 10 MB</small></>}</div><div className="privacy-note"><CheckCircle2 size={16}/><span><b>Your document stays private.</b> It is read in your browser and is not uploaded to a separate document service.</span></div></>}
        {modal === 'review' && draft && <><span className="modal-icon success"><Check size={20}/></span><p className="modal-step">READY TO IMPORT</p><h2 id="import-title">We found your course.</h2><p className="modal-intro">Review the essentials. You can edit anything later.</p><div className="review-course"><div><small>COURSE</small><strong>{draft.title}</strong></div><div><small>TERM</small><strong>{draft.term}</strong></div><div><small>INSTRUCTOR</small><strong>{draft.instructor}</strong></div><div><small>SCHEDULE</small><strong>{draft.schedule}</strong></div></div><div className="found-row"><span><FileText size={18}/><b>{draft.assignments.length}</b> items found</span><span><Clock3 size={18}/><b>{draft.assignments.filter(a=>a.due).length}</b> dated</span><span><Circle size={18}/><b>{draft.assignments.filter(a=>!a.due).length}</b> to review</span></div><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal('upload')}>Choose another</button><button className="import-button" onClick={confirmImport}>Add course <ArrowRight size={17}/></button></div></>}
      </section></div>}
      {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
    </main>
  );
}
