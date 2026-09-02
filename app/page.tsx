'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import mammoth from 'mammoth';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight,
  Circle, Clock3, Edit3, FileText, FileUp, LayoutDashboard, ListTodo,
  Plus, Search, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';

type AssignmentKind = 'paper' | 'quiz' | 'reading' | 'class';
type Assignment = { id: string; title: string; due: string | null; kind: AssignmentKind; weight?: number; details: string; completed?: boolean; confidence?: 'high' | 'review' };
type Course = { id: string; title: string; shortTitle: string; term: string; instructor: string; schedule: string; location: string; assignments: Assignment[] };
type Modal = 'upload' | 'review' | 'assignment' | 'delete-course' | 'delete-assignment' | null;

const sampleCourse: Course = {
  id: 'political-economy-2026', title: 'Political Economy from Adam Smith to COVID-19', shortTitle: 'Political Economy', term: 'Fall 2026', instructor: 'Yanni Kotsonis', schedule: 'Monday & Wednesday · 9:30 AM', location: 'Cantor Film Center',
  assignments: [
    { id: 'paper-1', title: 'Paper No. 1', due: '2026-09-25T18:00:00', kind: 'paper', weight: 10, details: '5 double-spaced pages · Smith, Malthus, and Marx on value', confidence: 'high' },
    { id: 'paper-2', title: 'Paper No. 2', due: '2026-10-23T18:00:00', kind: 'paper', weight: 10, details: '5 double-spaced pages · Keynes, Hayek, and Friedman on crisis', confidence: 'high' },
    { id: 'quiz-1', title: 'In-class quiz / précis 1', due: null, kind: 'quiz', weight: 15, details: 'Date set by your recitation instructor', confidence: 'review' },
    { id: 'quiz-2', title: 'In-class quiz / précis 2', due: null, kind: 'quiz', weight: 15, details: 'Date set by your recitation instructor', confidence: 'review' },
    { id: 'quiz-3', title: 'In-class quiz / précis 3', due: null, kind: 'quiz', weight: 15, details: 'Date set by your recitation instructor', confidence: 'review' },
    { id: 'paper-3', title: 'Paper No. 3', due: '2026-12-14T18:00:00', kind: 'paper', weight: 10, details: 'Up to 10 double-spaced pages · Great Recession vs. COVID policy', confidence: 'high' },
  ],
};

const monthName: Record<string, string> = { '01':'JAN','02':'FEB','03':'MAR','04':'APR','05':'MAY','06':'JUN','07':'JUL','08':'AUG','09':'SEP','10':'OCT','11':'NOV','12':'DEC' };
const monthNumber: Record<string, number> = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
const palette = ['#e66d52', '#7189c4', '#c5984f', '#719485', '#9d78a8'];

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
  const meetingIndex = meeting ? lines.findIndex((line) => line.includes(meeting[0])) : -1;
  const assignments: Assignment[] = [];
  const paperPattern = /Paper\s*(?:No\.?\s*)?(\d)[\s\S]{0,420}?due\s+(\d{1,2})\s+(September|October|November|December|January|February|March|April|May|June|July|August)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?))?/gi;
  for (const match of clean.matchAll(paperPattern)) {
    let hour = Number(match[4] ?? 23); const minute = Number(match[5] ?? 59);
    if (/p/i.test(match[6] ?? '') && hour < 12) hour += 12;
    if (/a/i.test(match[6] ?? '') && hour === 12) hour = 0;
    const pages = match[0].match(/(?:up to\s+)?\d+\s+double-spaced pages|five double-spaced pages/i)?.[0];
    assignments.push({ id:`paper-${match[1]}-${crypto.randomUUID()}`, title:`Paper No. ${match[1]}`, due:parseDate(match[3], match[2], year, `${hour}:${String(minute).padStart(2,'0')}`), kind:'paper', weight:10, details:pages ? `${pages} · Imported from syllabus` : 'Imported from syllabus', confidence:'high' });
  }
  const countText = clean.match(/total of\s+(three|four|five|\d+)\s+in-class quizzes/i)?.[1];
  const quizCount = Number(countText?.replace('three','3').replace('four','4').replace('five','5') ?? 0);
  const quizWeight = Number(clean.match(/quizzes?[\s\S]{0,180}?(\d+) percent each/i)?.[1] ?? 0);
  for (let index=1; index<=quizCount; index+=1) assignments.push({ id:`quiz-${index}-${crypto.randomUUID()}`, title:`In-class quiz / précis ${index}`, due:null, kind:'quiz', weight:quizWeight||undefined, details:'Date to be set by instructor', confidence:'review' });
  if (!assignments.length) assignments.push({ id:`review-${crypto.randomUUID()}`, title:'Review imported syllabus', due:null, kind:'class', details:'No clearly dated assignments were found', confidence:'review' });
  return { id:`course-${crypto.randomUUID()}`, title, shortTitle:title.split(/[:—-]/)[0].slice(0,34), term, instructor, schedule:meeting?.[0] ?? 'Schedule not found', location:meetingIndex >= 0 && lines[meetingIndex+1]?.length < 70 ? lines[meetingIndex+1] : 'Location not found', assignments };
}

function dateParts(value: string | null) {
  if (!value) return { day:'—', month:'TBD', full:'Date to be announced' };
  const date = new Date(value);
  return { day:String(date.getDate()).padStart(2,'0'), month:monthName[String(date.getMonth()+1).padStart(2,'0')], full:date.toLocaleString('en-US',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}) };
}

function initials(title: string) { return title.split(/\s+/).filter(Boolean).slice(0,2).map((word)=>word[0]).join('').toUpperCase(); }
function inputDate(value: string | null) { if (!value) return ''; const date=new Date(value); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }

function MonthCalendar({ courses, selectedCourse, setSelectedCourse, month, setMonth, onAdd, onEdit }:{ courses:Course[]; selectedCourse:string; setSelectedCourse:(id:string)=>void; month:Date; setMonth:(date:Date)=>void; onAdd:(courseId?:string,due?:string)=>void; onEdit:(courseId:string,assignment:Assignment)=>void }) {
  const entries = courses.flatMap((course,courseIndex)=>course.assignments.filter((assignment)=>assignment.due&&(selectedCourse==='all'||selectedCourse===course.id)).map((assignment)=>({course,courseIndex,assignment})));
  const first = new Date(month.getFullYear(),month.getMonth(),1);
  const cells = Array.from({length:42},(_,index)=>new Date(month.getFullYear(),month.getMonth(),index-first.getDay()+1));
  const today = dayKey(new Date());
  return <section className="month-panel">
    <div className="month-toolbar"><div><span className="kicker">CALENDAR</span><h2>{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2></div><div className="month-controls"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} aria-label="Previous month"><ArrowLeft size={17}/></button><button className="today-button" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Today</button><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} aria-label="Next month"><ArrowRight size={17}/></button><button className="soft-button" onClick={()=>onAdd(selectedCourse==='all'?courses[0]?.id:selectedCourse)}><Plus size={17}/> Add assignment</button></div></div>
    <div className="calendar-filter"><button className={selectedCourse==='all'?'selected':''} onClick={()=>setSelectedCourse('all')}><i className="all-dot"/>All courses</button>{courses.map((course,index)=><button className={selectedCourse===course.id?'selected':''} key={course.id} onClick={()=>setSelectedCourse(course.id)}><i style={{background:palette[index%palette.length]}}/>{course.shortTitle}</button>)}</div>
    <div className="month-scroll"><div className="month-grid"><div className="weekday-row">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day)=><span key={day}>{day}</span>)}</div>{cells.map((date)=>{const key=dayKey(date);const dayEntries=entries.filter(({assignment})=>assignment.due&&dayKey(new Date(assignment.due))===key);return <div className={`month-day ${date.getMonth()!==month.getMonth()?'outside':''} ${key===today?'is-today':''}`} key={key}><button className="day-number" onClick={()=>onAdd(selectedCourse==='all'?courses[0]?.id:selectedCourse,new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59).toISOString())} aria-label={`Add assignment on ${date.toLocaleDateString()}`}>{date.getDate()}</button><div className="day-events">{dayEntries.slice(0,3).map(({course,courseIndex,assignment})=><button className={`calendar-event ${assignment.completed?'completed':''}`} style={{'--course-color':palette[courseIndex%palette.length]} as React.CSSProperties} key={`${course.id}-${assignment.id}`} onClick={()=>onEdit(course.id,assignment)} title={`${course.shortTitle}: ${assignment.title}`}><i/><span>{assignment.title}</span></button>)}{dayEntries.length>3&&<span className="more-events">+{dayEntries.length-3} more</span>}</div></div>})}</div></div>
  </section>;
}

function CourseOverview({ courses, onOpen, onImport, onToggle, onCalendar }:{ courses:Course[]; onOpen:(id:string)=>void; onImport:()=>void; onToggle:(courseId:string,assignmentId:string)=>void; onCalendar:()=>void }) {
  const upcoming = courses.flatMap((course)=>course.assignments.filter((item)=>item.due&&!item.completed).map((assignment)=>({course,assignment}))).sort((a,b)=>String(a.assignment.due).localeCompare(String(b.assignment.due)));
  return <section className="canvas-overview">
    <div className="courses-heading"><div><span className="kicker">DASHBOARD</span><h2>Your courses</h2><p>{courses.length} active {courses.length===1?'class':'classes'} · everything for the semester at a glance</p></div><button className="soft-button" onClick={onImport}><Plus size={17}/> Add course</button></div>
    <div className="course-card-grid">{courses.map((course,index)=>{const next=course.assignments.filter((item)=>item.due&&!item.completed).sort((a,b)=>String(a.due).localeCompare(String(b.due)))[0];const completed=course.assignments.filter((item)=>item.completed).length;return <button className="dashboard-course-card" onClick={()=>onOpen(course.id)} key={course.id}><span className="course-card-cover" style={{'--card-color':palette[index%palette.length]} as React.CSSProperties}><i/><b>{initials(course.shortTitle)}</b><small>{String(index+1).padStart(2,'0')}</small></span><span className="course-card-body"><small>{course.term.toUpperCase()}</small><strong>{course.title}</strong><span>{course.instructor}</span><span className="course-meeting">{course.schedule}</span></span><span className="course-card-footer">{next?<><span><small>NEXT</small><b>{next.title}</b></span><time>{dateParts(next.due).month} {dateParts(next.due).day}</time></>:<span><small>PROGRESS</small><b>{completed} of {course.assignments.length} complete</b></span>}<ChevronRight size={17}/></span></button>})}<button className="add-course-card" onClick={onImport}><span><Plus size={23}/></span><strong>Add another course</strong><small>Import a syllabus to create it automatically</small></button></div>
    <div className="overview-lower"><div><div className="section-heading"><div><span className="kicker">TO DO</span><h3>Coming up</h3></div><button onClick={onCalendar}>Open calendar</button></div><div className="assignment-list">{upcoming.slice(0,5).map(({course,assignment},index)=>{const d=dateParts(assignment.due);return <article className="assignment" key={`${course.id}-${assignment.id}`}><button className={`date-tile tone-${index%3}`} onClick={()=>onToggle(course.id,assignment.id)} aria-label={`Mark ${assignment.title} complete`}><b>{d.day}</b><span>{d.month}</span></button><div><h4>{assignment.title}</h4><p>{course.shortTitle} · {assignment.details}</p></div><span className="status">{d.full}</span><button className="row-arrow" onClick={()=>onOpen(course.id)} aria-label={`Open ${course.shortTitle}`}><ChevronRight size={18}/></button></article>})}{!upcoming.length&&<div className="list-empty"><CheckCircle2 size={20}/>You’re all caught up.</div>}</div></div><aside className="dashboard-summary"><span className="kicker">SEMESTER SNAPSHOT</span><h3>{courses.reduce((sum,course)=>sum+course.assignments.filter((item)=>!item.completed).length,0)}</h3><p>open items across your courses</p><div>{courses.map((course,index)=><span key={course.id}><i style={{background:palette[index%palette.length]}}/><b>{course.shortTitle}</b><small>{course.assignments.filter((item)=>!item.completed).length}</small></span>)}</div></aside></div>
  </section>;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'overview'|'calendar'|'course'>('overview');
  const [courses, setCourses] = useState<Course[]>([sampleCourse]);
  const [activeId, setActiveId] = useState(sampleCourse.id);
  const [calendarCourse, setCalendarCourse] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [draft, setDraft] = useState<Course|null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<{courseId:string; assignment:Assignment}|null>(null);
  const [assignmentDefaultDue, setAssignmentDefaultDue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{courseId:string; assignment:Assignment}|null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    try {
      const multi = localStorage.getItem('courseflow-courses');
      const legacy = localStorage.getItem('courseflow-course');
      const loaded: Course[] = multi ? JSON.parse(multi) : legacy ? [JSON.parse(legacy)] : [sampleCourse];
      setCourses(loaded);
      const storedActive = localStorage.getItem('courseflow-active-course');
      setActiveId(loaded.some((course)=>course.id===storedActive) ? String(storedActive) : loaded[0]?.id ?? '');
      if (!multi) localStorage.setItem('courseflow-courses', JSON.stringify(loaded));
    } catch { setCourses([sampleCourse]); }
  }, []);

  const activeCourse = courses.find((item)=>item.id===activeId) ?? courses[0] ?? null;
  const activeIndex = Math.max(0, courses.findIndex((item)=>item.id===activeCourse?.id));

  function notify(message:string) { setToast(message); setTimeout(()=>setToast(''),3200); }
  function save(next:Course[], nextActive=activeId) { setCourses(next); setActiveId(nextActive); localStorage.setItem('courseflow-courses',JSON.stringify(next)); localStorage.setItem('courseflow-active-course',nextActive); }
  function selectCourse(id:string) { setActiveId(id); localStorage.setItem('courseflow-active-course',id); setView('course'); }
  function updateCourse(id:string, update:(course:Course)=>Course) { save(courses.map((item)=>item.id===id?update(item):item)); }

  async function readFile(file?:File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) { notify('Please choose a .docx syllabus.'); return; }
    setParsing(true);
    try { const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}); setDraft(parseSyllabus(result.value,file.name)); setModal('review'); }
    catch { notify('That document could not be read. Try another .docx file.'); }
    finally { setParsing(false); }
  }
  function onInput(event:ChangeEvent<HTMLInputElement>) { readFile(event.target.files?.[0]); event.target.value=''; }
  function onDrop(event:DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }
  function confirmImport() { if (!draft) return; save([...courses,draft],draft.id); setCalendarCourse(draft.id); setModal(null); setView('course'); notify(`${draft.assignments.length} items added to ${draft.shortTitle}.`); }
  function toggleDone(courseId:string,id:string) { updateCourse(courseId,(course)=>({...course,assignments:course.assignments.map((item)=>item.id===id?{...item,completed:!item.completed}:item)})); }
  function openAssignment(courseId=activeCourse?.id ?? '',due?:string) { setEditing(null); setAssignmentDefaultDue(inputDate(due??null)); setActiveId(courseId || activeId); setModal('assignment'); }
  function editAssignment(courseId:string,assignment:Assignment) { setEditing({courseId,assignment}); setAssignmentDefaultDue(''); setModal('assignment'); }
  function saveAssignment(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data=new FormData(event.currentTarget); const targetId=String(data.get('courseId')); const due=String(data.get('due')||'');
    const item:Assignment={ id:editing?.assignment.id ?? `assignment-${crypto.randomUUID()}`, title:String(data.get('title')).trim(), due:due?new Date(due).toISOString():null, kind:String(data.get('kind')) as AssignmentKind, weight:data.get('weight')?Number(data.get('weight')):undefined, details:String(data.get('details')||'').trim()||'Added manually', completed:editing?.assignment.completed, confidence:'high' };
    const next=courses.map((course)=>({ ...course, assignments:course.assignments.filter((existing)=>existing.id!==item.id) }));
    const final=next.map((course)=>course.id===targetId?{...course,assignments:[...course.assignments,item]}:course);
    save(final,targetId); setModal(null); setView('course'); notify(editing?'Assignment updated.':'Assignment added.');
  }
  function deleteAssignment() { if (!pendingDelete) return; updateCourse(pendingDelete.courseId,(course)=>({...course,assignments:course.assignments.filter((item)=>item.id!==pendingDelete.assignment.id)})); setPendingDelete(null); setModal(null); notify('Assignment removed.'); }
  function deleteCourse() { if (!activeCourse) return; const next=courses.filter((item)=>item.id!==activeCourse.id); const nextId=next[0]?.id??''; save(next,nextId); setCalendarCourse('all'); setModal(null); setView(next.length?'overview':'course'); notify(`${activeCourse.shortTitle} removed.`); }

  const completion=activeCourse?.assignments.length?Math.round(activeCourse.assignments.filter((item)=>item.completed).length/activeCourse.assignments.length*100):0;

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>setView('overview')} aria-label="Courseflow home"><span className="brand-mark">C</span><span>Courseflow</span></button>
      <nav className="primary-nav" aria-label="Primary navigation"><button className={`nav-item ${view==='overview'?'active':''}`} onClick={()=>setView('overview')}><LayoutDashboard size={18}/> Overview</button><button className={`nav-item ${view==='calendar'?'active':''}`} onClick={()=>setView('calendar')}><CalendarDays size={18}/> Calendar</button><button className={`nav-item ${view==='course'?'active':''}`} onClick={()=>setView('course')}><BookOpen size={18}/> Courses</button></nav>
      <div className="sidebar-course"><span className="side-label">MY COURSES</span>{courses.map((course,index)=><button className={activeCourse?.id===course.id?'selected':''} key={course.id} onClick={()=>selectCourse(course.id)}><i style={{background:palette[index%palette.length]}}/><span>{course.shortTitle}</span></button>)}<button className="add-course" onClick={()=>setModal('upload')}><Plus size={15}/> Add course</button></div>
      <div className="semester-card"><span>MY WORKSPACE</span><strong>{courses.length} {courses.length===1?'course':'courses'}</strong><div className="semester-progress"><i style={{width:`${Math.max(courses.length?12:0,completion)}%`}}/></div><small>{activeCourse?`${completion}% of active course complete`:'Import a syllabus to begin'}</small></div>
      <div className="user-row"><span className="avatar">RP</span><span><strong>My workspace</strong><small>Saved on this device</small></span></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase()}</p><h1>{view==='overview'?'Good morning.':view==='calendar'?'Your semester.':activeCourse?.shortTitle??'Your courses'}</h1></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18}/></button>{activeCourse&&<button className="soft-button" onClick={()=>openAssignment()}><Plus size={17}/> Assignment</button>}<button className="import-button" onClick={()=>setModal('upload')}><FileUp size={18}/> Import syllabus</button></div></header>

      {!activeCourse ? <section className="empty-state"><span><BookOpen size={28}/></span><p className="kicker">A FRESH START</p><h2>No courses yet.</h2><p>Import a syllabus and Courseflow will build your course and assignment plan.</p><button className="import-button" onClick={()=>setModal('upload')}><FileUp size={18}/> Import your first syllabus</button></section> : <>
        {view==='overview'&&<CourseOverview courses={courses} onOpen={selectCourse} onImport={()=>setModal('upload')} onToggle={toggleDone} onCalendar={()=>setView('calendar')}/>}

        {view==='calendar'&&<MonthCalendar courses={courses} selectedCourse={calendarCourse} setSelectedCourse={setCalendarCourse} month={calendarMonth} setMonth={setCalendarMonth} onAdd={openAssignment} onEdit={editAssignment}/>}

        {view==='course'&&<section className="panel-page"><div className="course-title-row"><div className="course-monogram" style={{background:palette[activeIndex%palette.length]}}>{initials(activeCourse.shortTitle)}</div><div className="course-title-copy"><span className="kicker">{activeCourse.term.toUpperCase()}</span><h2>{activeCourse.title}</h2><p>{activeCourse.instructor} · {activeCourse.schedule} · {activeCourse.location}</p></div><div className="course-actions"><button className="soft-button" onClick={()=>openAssignment(activeCourse.id)}><Plus size={17}/> Add assignment</button><button className="danger-outline" onClick={()=>setModal('delete-course')}><Trash2 size={16}/> Remove course</button></div></div><div className="course-stats"><div><span>COURSE PROGRESS</span><strong>{completion}%</strong><div className="wide-progress"><i style={{width:`${completion}%`}}/></div></div><div><span>GRADE TRACKED</span><strong>{activeCourse.assignments.reduce((sum,item)=>sum+(item.weight??0),0)}%</strong><small>Across {activeCourse.assignments.length} assignments</small></div><div><span>NEEDS REVIEW</span><strong>{activeCourse.assignments.filter((item)=>item.confidence==='review').length}</strong><small>Items without confirmed dates</small></div></div><div className="course-columns"><div><div className="section-heading"><div><span className="kicker">COURSEWORK</span><h3>Assignments</h3></div><button onClick={()=>openAssignment(activeCourse.id)}>Add new</button></div><div className="manage-list">{[...activeCourse.assignments].sort((a,b)=>String(a.due??'z').localeCompare(String(b.due??'z'))).map((assignment,index)=>{const d=dateParts(assignment.due);return <article className={assignment.completed?'done':''} key={assignment.id}><button className={`date-tile tone-${index%3}`} onClick={()=>toggleDone(activeCourse.id,assignment.id)}>{assignment.completed?<Check size={18}/>:<><b>{d.day}</b><span>{d.month}</span></>}</button><div><h4>{assignment.title}</h4><p>{assignment.details}</p><small>{assignment.kind}{assignment.weight?` · ${assignment.weight}% of grade`:''}</small></div><div className="manage-actions"><button onClick={()=>editAssignment(activeCourse.id,assignment)}><Edit3 size={15}/> Edit</button><button onClick={()=>{setPendingDelete({courseId:activeCourse.id,assignment});setModal('delete-assignment')}}><Trash2 size={15}/></button></div></article>})}{!activeCourse.assignments.length&&<div className="list-empty"><ListTodo size={20}/>No assignments yet. Add the first one.</div>}</div></div><aside className="grading-card"><span className="kicker">COURSE TOOLS</span><h3>Stay in control</h3><div className="tool-callout"><Plus size={19}/><div><b>Add assignments</b><span>Choose this course, a due date, type, and grade weight.</span></div></div><div className="tool-callout"><Edit3 size={19}/><div><b>Edit anytime</b><span>Use the pencil beside any assignment.</span></div></div><div className="tool-callout danger"><Trash2 size={19}/><div><b>Remove safely</b><span>You’ll always confirm before anything is deleted.</span></div></div></aside></div></section>}
      </>}
    </section>

    {modal&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>!parsing&&setModal(null)}><section className={`import-modal ${modal==='assignment'?'assignment-modal':''}`} role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event)=>event.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)} aria-label="Close"><X size={19}/></button>
      {modal==='upload'&&<><span className="modal-icon"><Sparkles size={20}/></span><p className="modal-step">NEW COURSE</p><h2 id="import-title">Turn a syllabus into a plan.</h2><p className="modal-intro">Upload a Word document and Courseflow will add it as a new course without changing your existing classes.</p><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={(event)=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}><input ref={inputRef} type="file" accept=".docx" onChange={onInput}/>{parsing?<><span className="loader"/><strong>Reading your syllabus…</strong><small>Finding dates and assignments</small></>:<><UploadCloud size={30}/><strong>Drop your syllabus here</strong><small>or click to browse · DOCX up to 10 MB</small></>}</div><div className="privacy-note"><CheckCircle2 size={16}/><span><b>Your document stays private.</b> It is read in your browser.</span></div></>}
      {modal==='review'&&draft&&<><span className="modal-icon success"><Check size={20}/></span><p className="modal-step">READY TO IMPORT</p><h2 id="import-title">We found your course.</h2><p className="modal-intro">This will be added alongside your other classes.</p><div className="review-course"><div><small>COURSE</small><strong>{draft.title}</strong></div><div><small>TERM</small><strong>{draft.term}</strong></div><div><small>INSTRUCTOR</small><strong>{draft.instructor}</strong></div><div><small>SCHEDULE</small><strong>{draft.schedule}</strong></div></div><div className="found-row"><span><FileText size={18}/><b>{draft.assignments.length}</b> items found</span><span><Clock3 size={18}/><b>{draft.assignments.filter((item)=>item.due).length}</b> dated</span><span><Circle size={18}/><b>{draft.assignments.filter((item)=>!item.due).length}</b> to review</span></div><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal('upload')}>Choose another</button><button className="import-button" onClick={confirmImport}>Add course <ChevronRight size={17}/></button></div></>}
      {modal==='assignment'&&<><span className="modal-icon"><ListTodo size={20}/></span><p className="modal-step">{editing?'EDIT ASSIGNMENT':'NEW ASSIGNMENT'}</p><h2 id="import-title">{editing?'Update the details.':'Add something to your plan.'}</h2><form className="assignment-form" onSubmit={saveAssignment}><label><span>Course</span><select name="courseId" defaultValue={editing?.courseId??activeCourse?.id} required>{courses.map((course)=><option value={course.id} key={course.id}>{course.shortTitle}</option>)}</select></label><label className="full"><span>Assignment title</span><input name="title" defaultValue={editing?.assignment.title??''} placeholder="e.g. Midterm paper" required autoFocus/></label><label><span>Due date & time</span><input name="due" type="datetime-local" defaultValue={editing?inputDate(editing.assignment.due):assignmentDefaultDue}/></label><label><span>Type</span><select name="kind" defaultValue={editing?.assignment.kind??'paper'}><option value="paper">Paper / project</option><option value="quiz">Quiz / exam</option><option value="reading">Reading</option><option value="class">Class task</option></select></label><label><span>Grade weight (%)</span><input name="weight" type="number" min="0" max="100" step="0.5" defaultValue={editing?.assignment.weight??''} placeholder="Optional"/></label><label className="full"><span>Details</span><textarea name="details" defaultValue={editing?.assignment.details??''} placeholder="Pages, topic, instructions, or notes" rows={3}/></label><div className="modal-actions full"><button type="button" className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="import-button" type="submit">{editing?'Save changes':'Add assignment'}</button></div></form></>}
      {modal==='delete-course'&&activeCourse&&<div className="confirm-modal"><span className="modal-icon danger"><Trash2 size={20}/></span><p className="modal-step">REMOVE COURSE</p><h2 id="import-title">Remove {activeCourse.shortTitle}?</h2><p className="modal-intro">This removes the course and its {activeCourse.assignments.length} assignments from this device. This can’t be undone.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Keep course</button><button className="danger-button" onClick={deleteCourse}>Remove course</button></div></div>}
      {modal==='delete-assignment'&&pendingDelete&&<div className="confirm-modal"><span className="modal-icon danger"><Trash2 size={20}/></span><p className="modal-step">DELETE ASSIGNMENT</p><h2 id="import-title">Delete “{pendingDelete.assignment.title}”?</h2><p className="modal-intro">It will be removed from {courses.find((course)=>course.id===pendingDelete.courseId)?.shortTitle}. This can’t be undone.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="danger-button" onClick={deleteAssignment}>Delete assignment</button></div></div>}
    </section></div>}
    {toast&&<div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </main>;
}
