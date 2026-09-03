import { DragEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight,
  AlertTriangle, Circle, Edit3, ExternalLink, FileText, FileUp, KeyRound, LayoutDashboard, ListTodo,
  Plus, Settings2, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import type { ApiKeyStatus, Assignment, AssignmentKind, AuthUser, CalendarEvent, Course, ExtractResult } from '../../shared/types';
import { COURSE_COLORS } from '../../shared/types';
import ImportReview from './ImportReview';
import Settings from './Settings';
import { UpdateBanner, useUpdateStatus } from './UpdatePanel';

type Modal = 'upload' | 'review' | 'assignment' | 'preview' | 'delete-course' | 'delete-assignment' | null;
type View = 'overview' | 'calendar' | 'course' | 'settings';

const monthName: Record<string, string> = { '01':'JAN','02':'FEB','03':'MAR','04':'APR','05':'MAY','06':'JUN','07':'JUL','08':'AUG','09':'SEP','10':'OCT','11':'NOV','12':'DEC' };
const palette = COURSE_COLORS;
/** A course keeps its chosen colour; otherwise it inherits a stable palette slot. */
function courseColor(course:{color?:string}|undefined, index:number) { return course?.color || palette[index%palette.length]; }
/**
 * Finished work sinks below everything unfinished, then both groups run in date
 * order. In a calendar day cell every item already shares a date, so the same
 * comparator puts ticked items at the bottom of that day.
 */
function byDueThenDone(a:Assignment, b:Assignment) {
  if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
  return String(a.due ?? 'z').localeCompare(String(b.due ?? 'z'));
}

function dateParts(value: string | null) {
  if (!value) return { day:'—', month:'TBD', full:'Date to be announced' };
  const date = new Date(value);
  return { day:String(date.getDate()).padStart(2,'0'), month:monthName[String(date.getMonth()+1).padStart(2,'0')], full:date.toLocaleString('en-US',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}) };
}

function initials(title: string) { return title.split(/\s+/).filter(Boolean).slice(0,2).map((word)=>word[0]).join('').toUpperCase(); }
function inputDate(value: string | null) { if (!value) return ''; const date=new Date(value); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function greeting() { const hour=new Date().getHours(); return hour<12?'Good morning.':hour<18?'Good afternoon.':'Good evening.'; }
function eventTime(value:string) { const date=new Date(value); return date.toLocaleTimeString('en-US',{hour:'numeric',minute:date.getMinutes()?'2-digit':undefined}).replace(' ',''); }
/**
 * All-day events carry plain YYYY-MM-DD dates with an exclusive end, so a one-day
 * event reads as start 5th / end 6th. Timed events are compared on their local date.
 */
function eventCoversDay(event:CalendarEvent, key:string) {
  if (!event.allDay) return dayKey(new Date(event.start))===key;
  return key>=event.start.slice(0,10) && key<event.end.slice(0,10);
}
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function parseUrls(value: FormDataEntryValue | null) {
  return [...new Set(String(value ?? '').split(/[\s,]+/).map((url)=>url.trim()).filter((url)=>/^https?:\/\/\S+$/i.test(url)))];
}

function AssignmentLinks({ urls=[] }:{ urls?:string[] }) {
  if (!urls.length) return null;
  return <div className="assignment-links">{urls.map((url,index)=><button type="button" key={url} title={url} onClick={(event)=>{event.stopPropagation();void window.deadlines.openExternal(url)}}><ExternalLink size={12}/> {urls.length===1?'Open resource':`Resource ${index+1}`}</button>)}</div>;
}

function MonthCalendar({ courses, selectedCourse, setSelectedCourse, month, setMonth, onAdd, onEdit, googleEvents, googleShown, onToggleGoogle, googleError }:{ courses:Course[]; selectedCourse:string; setSelectedCourse:(id:string)=>void; month:Date; setMonth:(date:Date)=>void; onAdd:(courseId?:string,due?:string)=>void; onEdit:(courseId:string,assignment:Assignment)=>void; googleEvents:CalendarEvent[]; googleShown:boolean; onToggleGoogle:()=>void; googleError:string }) {
  const entries = courses.flatMap((course,courseIndex)=>course.assignments.filter((assignment)=>assignment.due&&(selectedCourse==='all'||selectedCourse===course.id)).map((assignment)=>({course,courseIndex,assignment})));
  const first = new Date(month.getFullYear(),month.getMonth(),1);
  const cells = Array.from({length:42},(_,index)=>new Date(month.getFullYear(),month.getMonth(),index-first.getDay()+1));
  const today = dayKey(new Date());
  return <section className="month-panel">
    <div className="month-toolbar"><div><span className="kicker">CALENDAR</span><h2>{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2></div><div className="month-controls"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} aria-label="Previous month"><ArrowLeft size={17}/></button><button className="today-button" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Today</button><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} aria-label="Next month"><ArrowRight size={17}/></button><button className="soft-button" onClick={()=>onAdd(selectedCourse==='all'?courses[0]?.id:selectedCourse)}><Plus size={17}/> Add assignment</button></div></div>
    <div className="calendar-filter"><button className={selectedCourse==='all'?'selected':''} onClick={()=>setSelectedCourse('all')}><i className="all-dot"/>All courses</button>{courses.map((course,index)=><button className={selectedCourse===course.id?'selected':''} key={course.id} onClick={()=>setSelectedCourse(course.id)}><i style={{background:courseColor(course,index)}}/>{course.shortTitle}</button>)}<button className={`google-chip ${googleShown?'selected':''}`} onClick={onToggleGoogle} title={googleShown?'Hide Google Calendar events':'Show Google Calendar events'}><i style={{background:'#4285F4'}}/>Google Calendar</button></div>{googleError&&<div className="calendar-notice"><AlertTriangle size={15}/><span>{googleError}</span></div>}
    <div className="month-scroll"><div className="month-grid"><div className="weekday-row">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day)=><span key={day}>{day}</span>)}</div>{cells.map((date)=>{const key=dayKey(date);const dayEntries=entries.filter(({assignment})=>assignment.due&&dayKey(new Date(assignment.due))===key).sort((a,b)=>byDueThenDone(a.assignment,b.assignment));const dayGoogle=googleShown?googleEvents.filter((event)=>eventCoversDay(event,key)):[];return <div className={`month-day ${date.getMonth()!==month.getMonth()?'outside':''} ${key===today?'is-today':''}`} key={key}><button className="day-number" onClick={()=>onAdd(selectedCourse==='all'?courses[0]?.id:selectedCourse,new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59).toISOString())} aria-label={`Add assignment on ${date.toLocaleDateString()}`}>{date.getDate()}</button><div className="day-events">{dayEntries.slice(0,3).map(({course,courseIndex,assignment})=><button className={`calendar-event ${assignment.completed?'completed':''}`} style={{'--course-color':courseColor(course,courseIndex)} as React.CSSProperties} key={`${course.id}-${assignment.id}`} onClick={()=>onEdit(course.id,assignment)} title={`${course.shortTitle}: ${assignment.title}`}><i/><span>{assignment.title}</span></button>)}{dayEntries.length>3&&<span className="more-events">+{dayEntries.length-3} more</span>}{dayGoogle.slice(0,2).map((event)=><button className="google-event" key={event.id} style={{'--course-color':event.color??'#4285F4'} as React.CSSProperties} onClick={()=>event.htmlLink&&void window.deadlines.openExternal(event.htmlLink)} title={`${event.calendarName}: ${event.title}${event.location?` · ${event.location}`:''}`}><i/><span>{event.allDay?event.title:`${eventTime(event.start)} ${event.title}`}</span></button>)}{dayGoogle.length>2&&<span className="more-events">+{dayGoogle.length-2} more</span>}</div></div>})}</div></div>
  </section>;
}

function CourseOverview({ courses, onOpen, onImport, onToggle, onCalendar }:{ courses:Course[]; onOpen:(id:string)=>void; onImport:()=>void; onToggle:(courseId:string,assignmentId:string)=>void; onCalendar:()=>void }) {
  const upcoming = courses.flatMap((course)=>course.assignments.filter((item)=>item.due&&!item.completed).map((assignment)=>({course,assignment}))).sort((a,b)=>String(a.assignment.due).localeCompare(String(b.assignment.due)));
  return <section className="canvas-overview">
    <div className="courses-heading"><div><span className="kicker">DASHBOARD</span><h2>Your courses</h2><p>{courses.length} active {courses.length===1?'class':'classes'} · everything for the semester at a glance</p></div><button className="soft-button" onClick={onImport}><Plus size={17}/> Add course</button></div>
    <div className="course-card-grid">{courses.map((course,index)=>{const next=course.assignments.filter((item)=>item.due&&!item.completed).sort((a,b)=>String(a.due).localeCompare(String(b.due)))[0];const completed=course.assignments.filter((item)=>item.completed).length;return <button className="dashboard-course-card" onClick={()=>onOpen(course.id)} key={course.id}><span className="course-card-cover" style={{'--card-color':courseColor(course,index)} as React.CSSProperties}><i/><b>{initials(course.shortTitle)}</b><small>{String(index+1).padStart(2,'0')}</small></span><span className="course-card-body"><small>{course.term.toUpperCase()}</small><strong>{course.title}</strong><span>{course.instructor}</span><span className="course-meeting">{course.schedule}</span></span><span className="course-card-footer">{next?<><span><small>NEXT</small><b>{next.title}</b></span><time>{dateParts(next.due).month} {dateParts(next.due).day}</time></>:<span><small>PROGRESS</small><b>{completed} of {course.assignments.length} complete</b></span>}<ChevronRight size={17}/></span></button>})}<button className="add-course-card" onClick={onImport}><span><Plus size={23}/></span><strong>Add another course</strong><small>Import a syllabus to create it automatically</small></button></div>
    <div className="overview-lower"><div><div className="section-heading"><div><span className="kicker">TO DO</span><h3>Coming up</h3></div><button onClick={onCalendar}>Open calendar</button></div><div className="assignment-list">{upcoming.slice(0,5).map(({course,assignment},index)=>{const d=dateParts(assignment.due);return <article className="assignment" key={`${course.id}-${assignment.id}`}><button className={`date-tile tone-${index%3}`} onClick={()=>onToggle(course.id,assignment.id)} aria-label={`Mark ${assignment.title} complete`}><b>{d.day}</b><span>{d.month}</span></button><div><h4>{assignment.title}</h4><p>{course.shortTitle} · {assignment.details}</p></div><span className="status">{d.full}</span><button className="row-arrow" onClick={()=>onOpen(course.id)} aria-label={`Open ${course.shortTitle}`}><ChevronRight size={18}/></button></article>})}{!upcoming.length&&<div className="list-empty"><CheckCircle2 size={20}/>You’re all caught up.</div>}</div></div><aside className="dashboard-summary"><span className="kicker">SEMESTER SNAPSHOT</span><h3>{courses.reduce((sum,course)=>sum+course.assignments.filter((item)=>!item.completed).length,0)}</h3><p>open items across your courses</p><div>{courses.map((course,index)=><span key={course.id}><i style={{background:courseColor(course,index)}}/><b>{course.shortTitle}</b><small>{course.assignments.filter((item)=>!item.completed).length}</small></span>)}</div></aside></div>
  </section>;
}

export default function Dashboard({ user, onSignedOut }: { user: AuthUser; onSignedOut: () => void }) {
  const [view, setView] = useState<View>('overview');
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [calendarCourse, setCalendarCourse] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [draft, setDraft] = useState<ExtractResult|null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<{courseId:string; assignment:Assignment}|null>(null);
  const [assignmentDefaultDue, setAssignmentDefaultDue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{courseId:string; assignment:Assignment}|null>(null);
  const [preview, setPreview] = useState<{courseId:string; assignment:Assignment}|null>(null);
  const [renaming, setRenaming] = useState(false);
  const updateStatus = useUpdateStatus();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [googleShown, setGoogleShown] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [toast, setToast] = useState('');

  // The workspace lives in this account's folder in the app's user-data directory.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [workspace, keys] = await Promise.all([
        window.deadlines.workspace.read(),
        window.deadlines.keys.status(),
      ]);
      if (cancelled) return;
      if (workspace.ok) {
        setCourses(workspace.data.courses);
        const stored = workspace.data.activeCourseId;
        setActiveId(workspace.data.courses.some((course)=>course.id===stored) ? stored : workspace.data.courses[0]?.id ?? '');
      }
      if (keys.ok) setKeyStatus(keys.data);
      const calendar = await window.deadlines.calendar.status();
      if (!cancelled && calendar.ok) setGoogleShown(calendar.data.granted && calendar.data.enabled);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Google events are fetched per visible grid, not per month: the month view shows
   * six weeks, so it spills into the neighbouring months on both sides.
   */
  useEffect(() => {
    if (!googleShown) { setGoogleEvents([]); setGoogleError(''); return; }
    let cancelled = false;
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const from = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 42);
    void (async () => {
      const result = await window.deadlines.calendar.events(from.toISOString(), to.toISOString());
      if (cancelled) return;
      if (result.ok) { setGoogleEvents(result.data); setGoogleError(''); }
      else { setGoogleEvents([]); setGoogleError(result.error); }
    })();
    return () => { cancelled = true; };
  }, [googleShown, calendarMonth]);

  async function toggleGoogle() {
    const next = !googleShown;
    setGoogleShown(next);
    const result = await window.deadlines.calendar.setEnabled(next);
    if (result.ok && next && !result.data.granted) {
      setGoogleError('Sign out and back in to let DeadLines read your Google Calendar.');
    }
  }

  const activeCourse = courses.find((item)=>item.id===activeId) ?? courses[0] ?? null;
  const activeIndex = Math.max(0, courses.findIndex((item)=>item.id===activeCourse?.id));

  const notify = useCallback((message:string) => { setToast(message); setTimeout(()=>setToast(''),3200); }, []);
  function persist(next:Course[], nextActive:string) { void window.deadlines.workspace.write({ courses:next, activeCourseId:nextActive }); }
  function save(next:Course[], nextActive=activeId) { setCourses(next); setActiveId(nextActive); persist(next,nextActive); }
  function selectCourse(id:string) { setActiveId(id); persist(courses,id); setView('course'); }
  function updateCourse(id:string, update:(course:Course)=>Course) { save(courses.map((item)=>item.id===id?update(item):item)); }

  // Main reads the file and calls Gemini, so the API key never enters this process.
  async function importFrom(filePath:string|null) {
    if (!filePath) return;
    if (!keyStatus?.configured) { notify('Add your Gemini API key in Settings first.'); setView('settings'); return; }
    setParsing(true);
    const result = await window.deadlines.syllabus.extract(filePath);
    setParsing(false);
    if (!result.ok) { notify(result.error); return; }
    setDraft(result.data);
    setModal('review');
  }
  async function browseForSyllabus() {
    const picked = await window.deadlines.syllabus.pick();
    if (!picked.ok) { notify(picked.error); return; }
    await importFrom(picked.data);
  }
  function onDrop(event:DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void importFrom(window.deadlines.syllabus.pathForDroppedFile(file));
  }
  function startImport() { if (!keyStatus?.configured) { notify('Add your Gemini API key in Settings first.'); setView('settings'); return; } setModal('upload'); }

  function confirmImport() { if (!draft) return; const course=draft.course; save([...courses,course],course.id); setCalendarCourse(course.id); setModal(null); setView('course'); notify(`${course.assignments.length} items added to ${course.shortTitle}.`); setDraft(null); }
  function toggleDone(courseId:string,id:string) { updateCourse(courseId,(course)=>({...course,assignments:course.assignments.map((item)=>item.id===id?{...item,completed:!item.completed}:item)})); }
  function openAssignment(courseId=activeCourse?.id ?? '',due?:string) { setEditing(null); setAssignmentDefaultDue(inputDate(due??null)); setActiveId(courseId || activeId); setModal('assignment'); }
  function editAssignment(courseId:string,assignment:Assignment) { setEditing({courseId,assignment}); setAssignmentDefaultDue(''); setModal('assignment'); }
  function previewAssignment(courseId:string,assignment:Assignment) { setPreview({courseId,assignment}); setModal('preview'); }
  function setCourseColor(courseId:string,color:string) { updateCourse(courseId,(course)=>({...course,color})); }
  function saveCourseNames(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCourse) return;
    const data=new FormData(event.currentTarget);
    const title=String(data.get('title')??'').trim();
    const shortTitle=String(data.get('shortTitle')??'').trim().slice(0,34);
    if (!title||!shortTitle) return;
    updateCourse(activeCourse.id,(course)=>({...course,title,shortTitle}));
    setRenaming(false);
    notify('Course renamed.');
  }
  /** Preview holds its own copy, so a tick inside it has to be reflected there too. */
  function togglePreviewDone() { if (!preview) return; toggleDone(preview.courseId,preview.assignment.id); setPreview({...preview,assignment:{...preview.assignment,completed:!preview.assignment.completed}}); }
  function saveAssignment(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data=new FormData(event.currentTarget); const targetId=String(data.get('courseId')); const due=String(data.get('due')||'');
    const item:Assignment={ id:editing?.assignment.id ?? `assignment-${crypto.randomUUID()}`, title:String(data.get('title')).trim(), due:due?new Date(due).toISOString():null, kind:String(data.get('kind')) as AssignmentKind, weight:data.get('weight')?Number(data.get('weight')):undefined, details:String(data.get('details')||'').trim()||'Added manually', urls:parseUrls(data.get('urls')), completed:editing?.assignment.completed, confidence:'high' };
    const next=courses.map((course)=>({ ...course, assignments:course.assignments.filter((existing)=>existing.id!==item.id) }));
    const final=next.map((course)=>course.id===targetId?{...course,assignments:[...course.assignments,item]}:course);
    save(final,targetId); setModal(null); setView('course'); notify(editing?'Assignment updated.':'Assignment added.');
  }
  function deleteAssignment() { if (!pendingDelete) return; updateCourse(pendingDelete.courseId,(course)=>({...course,assignments:course.assignments.filter((item)=>item.id!==pendingDelete.assignment.id)})); setPendingDelete(null); setModal(null); notify('Assignment removed.'); }
  async function signOut() { const result=await window.deadlines.auth.signOut(); if (!result.ok) { notify(result.error); return; } onSignedOut(); }
  async function forgetAccount() { const result=await window.deadlines.auth.forget(); if (!result.ok) { notify(result.error); return; } onSignedOut(); }
  function deleteCourse() { if (!activeCourse) return; const next=courses.filter((item)=>item.id!==activeCourse.id); const nextId=next[0]?.id??''; save(next,nextId); setCalendarCourse('all'); setModal(null); setView(next.length?'overview':'course'); notify(`${activeCourse.shortTitle} removed.`); }

  const completion=activeCourse?.assignments.length?Math.round(activeCourse.assignments.filter((item)=>item.completed).length/activeCourse.assignments.length*100):0;

  return <main className="app-shell">
    <div className="titlebar-drag"/>
    <aside className="sidebar">
      <button className="brand" onClick={()=>setView('overview')} aria-label="DeadLines home"><span className="brand-mark">D</span><span>DeadLines</span></button>
      <nav className="primary-nav" aria-label="Primary navigation"><button className={`nav-item ${view==='overview'?'active':''}`} onClick={()=>setView('overview')}><LayoutDashboard size={18}/> Overview</button><button className={`nav-item ${view==='calendar'?'active':''}`} onClick={()=>setView('calendar')}><CalendarDays size={18}/> Calendar</button><button className={`nav-item ${view==='course'?'active':''}`} onClick={()=>setView('course')}><BookOpen size={18}/> Courses</button></nav>
      <div className="sidebar-course"><span className="side-label">MY COURSES</span>{courses.map((course,index)=><button className={activeCourse?.id===course.id?'selected':''} key={course.id} onClick={()=>selectCourse(course.id)}><i style={{background:courseColor(course,index)}}/><span>{course.shortTitle}</span></button>)}<button className="add-course" onClick={startImport}><Plus size={15}/> Add course</button></div>
      <div className="semester-card"><span>MY WORKSPACE</span><strong>{courses.length} {courses.length===1?'course':'courses'}</strong><div className="semester-progress"><i style={{width:`${Math.max(courses.length?12:0,completion)}%`}}/></div><small>{activeCourse?`${completion}% of active course complete`:'Import a syllabus to begin'}</small></div>
      <button className="user-row" onClick={()=>setView('settings')} title="Account and API key">{user.picture?<img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer"/>:<span className="avatar">{initials(user.name)}</span>}<span><strong>{user.name}</strong><small>{keyStatus?.configured?'Gemini key connected':'No API key yet'}</small></span></button>
    </aside>

    <section className="workspace">
      {!updateDismissed&&<UpdateBanner status={updateStatus} onOpenSettings={()=>{setView('settings');setUpdateDismissed(true)}} onDismiss={()=>setUpdateDismissed(true)}/>}
      <header className="topbar"><div><p className="eyebrow">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase()}</p><h1>{view==='settings'?'Settings.':view==='overview'?greeting():view==='calendar'?'Your semester.':activeCourse?.shortTitle??'Your courses'}</h1></div><div className="top-actions"><button className="icon-button" onClick={()=>setView('settings')} aria-label="Settings"><Settings2 size={18}/></button>{activeCourse&&view!=='settings'&&<button className="soft-button" onClick={()=>openAssignment()}><Plus size={17}/> Assignment</button>}<button className="import-button" onClick={startImport}><FileUp size={18}/> Import syllabus</button></div></header>

      {view==='settings' ? <Settings user={user} keyStatus={keyStatus} onKeyStatus={setKeyStatus} onSignOut={()=>void signOut()} onForget={()=>void forgetAccount()} notify={notify}/>
       : !loaded ? null
       : !activeCourse ? <section className="empty-state"><span><BookOpen size={28}/></span><p className="kicker">A FRESH START</p><h2>No courses yet.</h2><p>Import a syllabus and DeadLines will build your course and assignment plan.</p><button className="import-button" onClick={startImport}><FileUp size={18}/> Import your first syllabus</button>{!keyStatus?.configured&&<button className="secondary-button" onClick={()=>setView('settings')}><KeyRound size={16}/> Add your Gemini API key</button>}</section> : <>
        {view==='overview'&&<CourseOverview courses={courses} onOpen={selectCourse} onImport={startImport} onToggle={toggleDone} onCalendar={()=>setView('calendar')}/>}

        {view==='calendar'&&<MonthCalendar courses={courses} selectedCourse={calendarCourse} setSelectedCourse={setCalendarCourse} month={calendarMonth} setMonth={setCalendarMonth} onAdd={openAssignment} onEdit={editAssignment} googleEvents={googleEvents} googleShown={googleShown} onToggleGoogle={()=>void toggleGoogle()} googleError={googleError}/>}

        {view==='course'&&<section className="panel-page"><div className="course-title-row"><div className="course-monogram" style={{background:courseColor(activeCourse,activeIndex)}}>{initials(activeCourse.shortTitle)}</div><div className="course-title-copy"><span className="kicker">{activeCourse.term.toUpperCase()}</span>{renaming?<form className="rename-form" onSubmit={saveCourseNames}><input name="title" defaultValue={activeCourse.title} aria-label="Course title" autoFocus required/><input name="shortTitle" defaultValue={activeCourse.shortTitle} aria-label="Short name" maxLength={34} placeholder="Short name" required/><button className="import-button" type="submit"><Check size={15}/> Save</button><button type="button" className="secondary-button" onClick={()=>setRenaming(false)}>Cancel</button></form>:<h2 className="editable-title"><span>{activeCourse.title}</span><button onClick={()=>setRenaming(true)} aria-label="Rename course" title="Rename course"><Edit3 size={15}/></button></h2>}<p>{activeCourse.instructor} · {activeCourse.schedule} · {activeCourse.location}</p><div className="color-picker" role="group" aria-label="Course colour">{palette.map((color)=><button key={color} className={courseColor(activeCourse,activeIndex).toLowerCase()===color.toLowerCase()?'selected':''} style={{background:color}} onClick={()=>setCourseColor(activeCourse.id,color)} aria-label={`Use colour ${color}`} title={color}/>)}</div></div><div className="course-actions"><button className="soft-button" onClick={()=>openAssignment(activeCourse.id)}><Plus size={17}/> Add assignment</button><button className="danger-outline" onClick={()=>setModal('delete-course')}><Trash2 size={16}/> Remove course</button></div></div><div className="course-stats"><div><span>COURSE PROGRESS</span><strong>{completion}%</strong><div className="wide-progress"><i style={{width:`${completion}%`}}/></div></div><div><span>GRADE TRACKED</span><strong>{activeCourse.assignments.reduce((sum,item)=>sum+(item.weight??0),0)}%</strong><small>Across {activeCourse.assignments.length} assignments</small></div><div><span>NEEDS REVIEW</span><strong>{activeCourse.assignments.filter((item)=>item.confidence==='review').length}</strong><small>Items without confirmed dates</small></div></div><div className="course-columns"><div><div className="section-heading"><div><span className="kicker">COURSEWORK</span><h3>Assignments</h3></div><button onClick={()=>openAssignment(activeCourse.id)}>Add new</button></div><div className="manage-list">{[...activeCourse.assignments].sort(byDueThenDone).map((assignment,index)=>{const d=dateParts(assignment.due);return <article className={assignment.completed?'done':''} key={assignment.id} onClick={()=>previewAssignment(activeCourse.id,assignment)}><button className={`check-box ${assignment.completed?'checked':''}`} onClick={(event)=>{event.stopPropagation();toggleDone(activeCourse.id,assignment.id)}} role="checkbox" aria-checked={Boolean(assignment.completed)} aria-label={`Mark ${assignment.title} ${assignment.completed?'not done':'done'}`}>{assignment.completed&&<Check size={14}/>}</button><span className={`date-tile tone-${index%3}`}><b>{d.day}</b><span>{d.month}</span></span><div><h4>{assignment.title}</h4><p>{assignment.details}</p><small>{assignment.kind}{assignment.weight?` · ${assignment.weight}% of grade`:''}</small><AssignmentLinks urls={assignment.urls}/></div><div className="manage-actions"><button onClick={(event)=>{event.stopPropagation();editAssignment(activeCourse.id,assignment)}}><Edit3 size={15}/> Edit</button><button onClick={(event)=>{event.stopPropagation();setPendingDelete({courseId:activeCourse.id,assignment});setModal('delete-assignment')}}><Trash2 size={15}/></button></div></article>})}{!activeCourse.assignments.length&&<div className="list-empty"><ListTodo size={20}/>No assignments yet. Add the first one.</div>}</div></div><aside className="grading-card"><span className="kicker">COURSE TOOLS</span><h3>Stay in control</h3><div className="tool-callout"><Plus size={19}/><div><b>Add assignments</b><span>Choose this course, a due date, type, and resource links.</span></div></div><div className="tool-callout"><Edit3 size={19}/><div><b>Edit anytime</b><span>Use the pencil beside any assignment.</span></div></div><div className="tool-callout danger"><Trash2 size={19}/><div><b>Remove safely</b><span>You’ll always confirm before anything is deleted.</span></div></div></aside></div></section>}
      </>}
    </section>

    {modal&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>!parsing&&setModal(null)}><section className={`import-modal ${modal==='assignment'?'assignment-modal':''} ${modal==='review'?'review-modal wide-modal':''}`} role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event)=>event.stopPropagation()}><button className="modal-close" disabled={parsing} onClick={()=>setModal(null)} aria-label="Close"><X size={19}/></button>
      {modal==='upload'&&<><span className="modal-icon"><Sparkles size={20}/></span><p className="modal-step">AI COURSE IMPORT</p><h2 id="import-title">Turn any syllabus into a plan.</h2><p className="modal-intro">Gemini reads the whole document, understands prose and tables, then creates an editable course with assignments and dates.</p><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={(event)=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>!parsing&&void browseForSyllabus()}>{parsing?<><span className="loader"/><strong>Gemini is analyzing your syllabus…</strong><small>Reading every page, table, date, and grading rule</small></>:<><UploadCloud size={30}/><strong>Drop your syllabus here</strong><small>PDF, DOCX, TXT, MD, RTF, ODT, or PPTX · up to 20 MB</small></>}</div><div className="privacy-note"><CheckCircle2 size={16}/><span><b>Nothing passes through us.</b> The file is read on this device and sent straight to Gemini with your own API key{keyStatus?.hint?` (${keyStatus.hint})`:''}.</span></div></>}
      {modal==='review'&&draft&&<ImportReview result={draft} onConfirm={confirmImport} onChooseAnother={()=>void browseForSyllabus()}/>}
      {modal==='assignment'&&<><span className="modal-icon"><ListTodo size={20}/></span><p className="modal-step">{editing?'EDIT ASSIGNMENT':'NEW ASSIGNMENT'}</p><h2 id="import-title">{editing?'Update the details.':'Add something to your plan.'}</h2><form className="assignment-form" onSubmit={saveAssignment}><label><span>Course</span><select name="courseId" defaultValue={editing?.courseId??activeCourse?.id} required>{courses.map((course)=><option value={course.id} key={course.id}>{course.shortTitle}</option>)}</select></label><label className="full"><span>Assignment title</span><input name="title" defaultValue={editing?.assignment.title??''} placeholder="e.g. Midterm paper" required autoFocus/></label><label><span>Due date & time</span><input name="due" type="datetime-local" defaultValue={editing?inputDate(editing.assignment.due):assignmentDefaultDue}/></label><label><span>Type</span><select name="kind" defaultValue={editing?.assignment.kind??'paper'}><option value="paper">Paper / project</option><option value="quiz">Quiz / exam</option><option value="reading">Reading</option><option value="video">Video / media</option><option value="class">Class task</option></select></label><label><span>Grade weight (%)</span><input name="weight" type="number" min="0" max="100" step="0.5" defaultValue={editing?.assignment.weight??''} placeholder="Optional"/></label><label className="full"><span>Details</span><textarea name="details" defaultValue={editing?.assignment.details??''} placeholder="Pages, topic, instructions, or notes" rows={3}/></label><label className="full"><span>Resource links (one per line)</span><textarea name="urls" defaultValue={editing?.assignment.urls?.join('\n')??''} placeholder="https://…" rows={2}/></label><div className="modal-actions full"><button type="button" className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="import-button" type="submit">{editing?'Save changes':'Add assignment'}</button></div></form></>}
      {modal==='preview'&&preview&&(()=>{const d=dateParts(preview.assignment.due);const course=courses.find((item)=>item.id===preview.courseId);return <div className="preview-modal"><span className="modal-icon"><FileText size={20}/></span><p className="modal-step">{course?.shortTitle?.toUpperCase()??'ASSIGNMENT'}</p><h2 id="import-title" className={preview.assignment.completed?'is-done':''}>{preview.assignment.title}</h2><div className="preview-facts"><div><small>DUE</small><strong>{d.full}</strong></div><div><small>TYPE</small><strong>{preview.assignment.kind}</strong></div><div><small>WEIGHT</small><strong>{preview.assignment.weight?`${preview.assignment.weight}%`:'—'}</strong></div></div><p className="preview-details">{preview.assignment.details}</p><AssignmentLinks urls={preview.assignment.urls}/><div className="modal-actions"><button className="secondary-button" onClick={togglePreviewDone}>{preview.assignment.completed?<><Circle size={15}/> Mark not done</>:<><Check size={15}/> Mark done</>}</button><button className="import-button" onClick={()=>editAssignment(preview.courseId,preview.assignment)}><Edit3 size={16}/> Edit</button></div></div>})()}
      {modal==='delete-course'&&activeCourse&&<div className="confirm-modal"><span className="modal-icon danger"><Trash2 size={20}/></span><p className="modal-step">REMOVE COURSE</p><h2 id="import-title">Remove {activeCourse.shortTitle}?</h2><p className="modal-intro">This removes the course and its {activeCourse.assignments.length} assignments from this device. This can’t be undone.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Keep course</button><button className="danger-button" onClick={deleteCourse}>Remove course</button></div></div>}
      {modal==='delete-assignment'&&pendingDelete&&<div className="confirm-modal"><span className="modal-icon danger"><Trash2 size={20}/></span><p className="modal-step">DELETE ASSIGNMENT</p><h2 id="import-title">Delete “{pendingDelete.assignment.title}”?</h2><p className="modal-intro">It will be removed from {courses.find((course)=>course.id===pendingDelete.courseId)?.shortTitle}. This can’t be undone.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="danger-button" onClick={deleteAssignment}>Delete assignment</button></div></div>}
    </section></div>}
    {toast&&<div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </main>;
}
