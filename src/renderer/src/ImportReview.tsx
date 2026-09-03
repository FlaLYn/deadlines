import { useState } from 'react';
import { AlertTriangle, ChevronRight, Circle, Clock3, FileText, Search, Sparkles } from 'lucide-react';
import type { Assignment, ExtractResult } from '../../shared/types';
import SourceDocument from './SourceDocument';

function dateLabel(due: string | null): string {
  if (!due) return 'DATE TBD';
  const date = new Date(due);
  return `${date.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${String(date.getDate()).padStart(2, '0')}`;
}

export default function ImportReview({
  result,
  onConfirm,
  onChooseAnother,
}: {
  result: ExtractResult;
  onConfirm: () => void;
  onChooseAnother: () => void;
}) {
  const { course, warnings, sourceName } = result;
  const [query, setQuery] = useState('');

  const visible = query.trim()
    ? course.assignments.filter((item) =>
        `${item.title} ${item.details}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : course.assignments;

  return (
    <div className="import-review">
      <header className="review-header">
        <div>
          <p className="modal-step">
            <Sparkles size={13} /> AI IMPORT READY
          </p>
          <h2 id="import-title">Check what Gemini found.</h2>
          <p className="review-lede">
            Nothing is added until you confirm, and everything stays editable afterwards.
            The syllabus is on the left so you can check the items against it.
          </p>
        </div>
        <div className="review-counts">
          <span>
            <FileText size={15} />
            <b>{course.assignments.length}</b> items
          </span>
          <span>
            <Clock3 size={15} />
            <b>{course.assignments.filter((item) => item.due).length}</b> dated
          </span>
          <span>
            <Circle size={15} />
            <b>{course.assignments.filter((item) => item.confidence === 'review').length}</b> to review
          </span>
        </div>
      </header>

      <div className="review-course-strip">
        <div>
          <small>COURSE</small>
          <strong>{course.title}</strong>
        </div>
        <div>
          <small>TERM</small>
          <strong>{course.term}</strong>
        </div>
        <div>
          <small>INSTRUCTOR</small>
          <strong>{course.instructor}</strong>
        </div>
        <div>
          <small>SCHEDULE</small>
          <strong>{course.schedule}</strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="import-warnings">
          <div>
            <AlertTriangle size={16} />
            <b>Check these details</b>
          </div>
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <div className="review-split">
        <section className="source-pane">
          <div className="pane-head">
            <span className="kicker">SOURCE</span>
            <b>{sourceName}</b>
            <small>Read-only preview</small>
          </div>
          <SourceDocument result={result} />
        </section>

        <section className="items-pane">
          <div className="pane-head">
            <span className="kicker">ASSIGNMENTS</span>
            <div className="pane-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter items"
                aria-label="Filter assignments"
              />
            </div>
          </div>
          <div className="items-body">
            {visible.map((assignment: Assignment) => (
              <article key={assignment.id} className="static">
                <span className={`preview-status ${assignment.confidence === 'review' ? 'review' : ''}`}>
                  {assignment.confidence === 'review' ? 'REVIEW' : 'READY'}
                </span>
                <div>
                  <b>{assignment.title}</b>
                  <small>{assignment.details}</small>
                </div>
                <time>{dateLabel(assignment.due)}</time>
              </article>
            ))}
            {!visible.length && (
              <p className="preview-empty">
                {course.assignments.length
                  ? 'Nothing matches that filter.'
                  : 'No graded work was found. You can still add the course and enter assignments manually.'}
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="modal-actions">
        <button className="secondary-button" onClick={onChooseAnother}>
          Choose another
        </button>
        <button className="import-button" onClick={onConfirm}>
          Add course <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
