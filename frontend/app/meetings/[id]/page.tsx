"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { WorkspaceShell } from "@/components/workspace-shell";
import { api, formatClock, formatDuration, formatMeetingDate } from "@/lib/api";
import type { ActionItem, MeetingDetail, TranscriptSegment } from "@/lib/types";

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
const colors = ["avatar-blue", "avatar-violet", "avatar-mint", "avatar-peach"];

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part)}</>;
}

function EditMeetingModal({ meeting, onClose, onSave }: { meeting: MeetingDetail; onClose: () => void; onSave: (title: string, people: string[]) => void }) {
  const [title, setTitle] = useState(meeting.title);
  const [participants, setParticipants] = useState(meeting.participants.join(", "));
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal-card edit-modal" onSubmit={(event) => { event.preventDefault(); onSave(title, participants.split(",").map((person) => person.trim()).filter(Boolean)); }}>
    <div className="modal-heading"><div><div className="eyebrow">MEETING DETAILS</div><h2>Edit meeting</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="close" /></button></div>
    <label className="field-label">Meeting title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="field-label">Participants <span className="optional">(comma separated)</span><textarea rows={3} value={participants} onChange={(event) => setParticipants(event.target.value)} /></label>
    <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary"><Icon name="check" size={16} /> Save changes</button></div>
  </form></div>;
}

export default function MeetingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"transcript" | "ask">("transcript");
  const [showEdit, setShowEdit] = useState(false);
  const [newAction, setNewAction] = useState("");
  const [editingAction, setEditingAction] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [toast, setToast] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TranscriptSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const transcriptScroll = useRef<HTMLDivElement>(null);
  const duration = Math.max(meeting?.duration_seconds ?? 0, 1);

  const refresh = useCallback(async () => {
    try { setMeeting(await api.meeting(id)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load meeting"); }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCurrentTime((time) => {
      if (time + 1 >= duration) { setPlaying(false); return 0; }
      return time + 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [playing, duration]);

  const activeSegmentId = useMemo(() => {
    const current = meeting?.transcript.find((line) => currentTime >= line.start_seconds && currentTime < line.end_seconds);
    return current?.id ?? null;
  }, [meeting, currentTime]);
  const matches = useMemo(() => meeting?.transcript.filter((line) => line.text.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [meeting, query]);

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2800); }
  function seek(time: number) { setCurrentTime(Math.min(Math.max(time, 0), duration)); }

  async function updateAction(actionId: number, body: Record<string, unknown>) {
    if (!meeting) return;
    setBusy(true);
    try { setMeeting(await api.updateAction(meeting.id, actionId, body)); notify(body.is_complete ? "Action item completed" : "Action item updated"); setEditingAction(null); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Could not update action"); }
    finally { setBusy(false); }
  }

  async function addAction(event: FormEvent) {
    event.preventDefault();
    if (!meeting || !newAction.trim()) return;
    setBusy(true);
    try { setMeeting(await api.createAction(meeting.id, newAction.trim())); setNewAction(""); notify("Action item added"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Could not add action"); }
    finally { setBusy(false); }
  }

  async function removeAction(action: ActionItem) {
    if (!meeting) return;
    setBusy(true);
    try { await api.deleteAction(meeting.id, action.id); await refresh(); notify("Action item removed"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Could not remove action"); }
    finally { setBusy(false); }
  }

  async function saveDetails(title: string, participants: string[]) {
    if (!meeting) return;
    try { setMeeting(await api.updateMeeting(meeting.id, { title, participants })); setShowEdit(false); notify("Meeting details saved"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Could not update meeting"); }
  }

  async function deleteMeeting() {
    if (!meeting) return;
    if (!window.confirm(`Delete “${meeting.title}”? This also removes its transcript and action items.`)) return;
    try { await api.deleteMeeting(meeting.id); router.push("/"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Could not delete meeting"); }
  }

  function exportNotes() {
    if (!meeting) return;
    const content = `# ${meeting.title}\n\n${formatMeetingDate(meeting.meeting_date)} · ${formatDuration(meeting.duration_seconds)}\n\n## Summary\n${meeting.summary}\n\n## Action items\n${meeting.action_items.map((action) => `- [${action.is_complete ? "x" : " "}] ${action.text}${action.assignee ? ` — ${action.assignee}` : ""}`).join("\n")}\n\n## Transcript\n${meeting.transcript.map((line) => `[${formatClock(line.start_seconds)}] ${line.speaker}: ${line.text}`).join("\n")}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`; anchor.click(); URL.revokeObjectURL(url); notify("Notes exported as Markdown");
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    if (!meeting || !question.trim()) return;
    const terms = question.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
    const relevant = meeting.transcript.map((line) => ({ line, score: terms.filter((term) => line.text.toLowerCase().includes(term)).length })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((entry) => entry.line);
    setAnswer(relevant.length ? relevant : meeting.transcript.slice(0, 2));
  }

  if (error) return <WorkspaceShell><div className="detail-error"><div className="empty-illustration"><Icon name="notebook" size={25} /></div><h2>Meeting not found</h2><p>{error}</p><Link href="/" className="button-primary">Back to meetings</Link></div></WorkspaceShell>;
  if (!meeting) return <WorkspaceShell><div className="detail-loading"><span className="loading-dot" /> Preparing your meeting…</div></WorkspaceShell>;

  const completed = meeting.action_items.filter((item) => item.is_complete).length;
  return <WorkspaceShell showUpgrade={false}>
    <header className="topbar detail-topbar"><div className="crumbs"><Link href="/">Meetings</Link><span className="crumb-slash">/</span><strong>{meeting.title}</strong></div><div className="topbar-right"><div className="global-search compact-search"><Icon name="search" size={17} /><input aria-label="Search meetings" placeholder="Search all meetings" onKeyDown={(event) => { if (event.key === "Enter") router.push(`/?q=${encodeURIComponent((event.target as HTMLInputElement).value)}`); }} /><kbd>⌘ K</kbd></div><button className="profile-avatar" title="Profile">P</button></div></header>
    <div className="page-content detail-content">
      <div className="detail-heading"><div className="detail-title-group"><div className="detail-symbol"><Icon name="users" size={20} /></div><div><div className="eyebrow">MEETING NOTES <span className="live-dot" /> READY</div><h1>{meeting.title}</h1><div className="detail-meta"><span><Icon name="calendar" size={14} />{formatMeetingDate(meeting.meeting_date)}</span><span><Icon name="clock" size={14} />{formatDuration(meeting.duration_seconds)}</span><span><Icon name="users" size={14} />{meeting.participants.length} participants</span></div></div></div><div className="detail-actions"><button className="button-secondary" onClick={exportNotes}><Icon name="download" size={16} /> Export</button><button className="button-secondary icon-text-button" onClick={() => setShowEdit(true)}><Icon name="edit" size={16} /> Edit</button><button className="icon-button detail-menu" onClick={deleteMeeting} title="Delete meeting"><Icon name="trash" size={17} /></button></div></div>
      <div className="detail-tabs"><button className="detail-tab active"><Icon name="notebook" size={15} /> Notes</button><button className="detail-tab" onClick={() => { setView("transcript"); transcriptScroll.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Icon name="message" size={15} /> Transcript <span>{meeting.transcript.length}</span></button><button className="detail-tab" onClick={() => { setView("ask"); }}><Icon name="spark" size={15} /> AskFred</button><div className="detail-tab-spacer" /><span className="private-badge"><span /> Private</span></div>
      <div className="detail-layout">
        <section className="notes-column">
          <div className="video-card">
            <div className="video-art"><div className="video-grid" /><div className="wave-orb orb-one" /><div className="wave-orb orb-two" /><div className="video-brand-mark"><span /><span /><span /><span /></div><div className="video-overlay-label"><span className="recording-pulse" /> Recording preview</div><div className="video-caption">A clear recap<br />of every conversation.</div><div className="video-play" onClick={() => setPlaying((value) => !value)} role="button" tabIndex={0} aria-label={playing ? "Pause playback" : "Play playback"}><Icon name={playing ? "pause" : "play"} size={21} /></div></div>
            <div className="player-controls"><button className="player-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} size={16} /></button><span className="player-time">{formatClock(currentTime)}</span><input className="seek-range" aria-label="Seek meeting recording" type="range" min={0} max={duration} value={currentTime} onChange={(event) => seek(Number(event.target.value))} style={{ "--seek-progress": `${(currentTime / duration) * 100}%` } as React.CSSProperties} /><span className="player-time">{formatClock(duration)}</span><button className="player-speed" onClick={() => notify("Playback speed: 1×")}>1×</button><button className="player-more" onClick={() => notify("Audio preview is a placeholder")}>•••</button></div>
          </div>
          <div className="participant-card"><div className="participant-card-heading"><div><h3>Participants</h3><span>{meeting.participants.length} people in this conversation</span></div><button className="icon-button" onClick={() => setShowEdit(true)} title="Edit participants"><Icon name="edit" size={16} /></button></div><div className="participant-list">{meeting.participants.map((person, index) => <div className="participant-row" key={person}><span className={`person-avatar ${colors[index % colors.length]}`}>{initials(person)}</span><span>{person}</span>{index === 0 && <span className="host-pill">HOST</span>}</div>)}</div></div>
          <section className="summary-card"><div className="card-section-heading"><div className="summary-icon"><Icon name="spark" size={17} /></div><div><h2>AI summary</h2><span>Generated from your conversation</span></div><button className="icon-button card-more" title="Summary options" onClick={exportNotes}><Icon name="more" /></button></div><p className="summary-copy">{meeting.summary || "No summary has been added yet. Edit this meeting to add a recap."}</p><div className="summary-divider" /><div className="card-section-heading compact-heading"><div className="section-heading-icon"><Icon name="check" size={16} /></div><div><h3>Action items</h3><span>{completed} of {meeting.action_items.length} completed</span></div><span className="completion-count">{completed}/{meeting.action_items.length}</span></div>
            <div className="action-list">{meeting.action_items.map((action) => <div className={`action-item ${action.is_complete ? "is-complete" : ""}`} key={action.id}><button className={`action-check ${action.is_complete ? "checked" : ""}`} aria-label={action.is_complete ? "Mark incomplete" : "Mark complete"} onClick={() => updateAction(action.id, { is_complete: !action.is_complete })}><Icon name="check" size={13} /></button><div className="action-copy">{editingAction === action.id ? <form className="action-edit-form" onSubmit={(event) => { event.preventDefault(); updateAction(action.id, { text: editingText }); }}><input autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)} /><button type="submit" className="action-save" disabled={busy}><Icon name="check" size={14} /></button><button type="button" className="action-cancel" onClick={() => setEditingAction(null)}><Icon name="close" size={14} /></button><button type="button" className="action-delete" onClick={() => removeAction(action)} title="Delete action"><Icon name="trash" size={14} /></button></form> : <><span className="action-text">{action.text}</span><span className="action-meta">{action.assignee && <span className="action-assignee"><span className="mini-avatar">{initials(action.assignee)}</span>{action.assignee}</span>}{action.due_date && <span className="due-date">Due {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${action.due_date}T00:00:00`))}</span>}</span></>}</div>{editingAction !== action.id && <button className="action-edit-button" title="Edit action" onClick={() => { setEditingAction(action.id); setEditingText(action.text); }}><Icon name="edit" size={14} /></button>}</div>)}</div>
            <form className="add-action-form" onSubmit={addAction}><Icon name="plus" size={15} /><input value={newAction} onChange={(event) => setNewAction(event.target.value)} placeholder="Add an action item…" /><button disabled={busy || !newAction.trim()} aria-label="Add action item"><Icon name="arrow" size={16} /></button></form>
          </section>
          <section className="topics-card"><div className="card-section-heading"><div className="topics-icon"><Icon name="spark" size={17} /></div><div><h2>Topics & chapters</h2><span>Jump to a key moment</span></div></div><div className="topic-list">{meeting.topics.map((topic, index) => <button className="topic-row" key={topic.id} onClick={() => { seek(topic.start_seconds); setPlaying(false); }}><span className="topic-number">{String(index + 1).padStart(2, "0")}</span><span className="topic-copy"><strong>{topic.title}</strong><small>{topic.summary}</small></span><span className="topic-time">{formatClock(topic.start_seconds)}<Icon name="arrow" size={13} /></span></button>)}</div></section>
        </section>
        <section className="transcript-column" ref={transcriptScroll}>
          <div className="transcript-card">
            <div className="transcript-header"><div className="transcript-heading-copy"><div className="transcript-icon"><Icon name={view === "transcript" ? "message" : "spark"} size={17} /></div><div><h2>{view === "transcript" ? "Transcript" : "AskFred"}</h2><span>{view === "transcript" ? `${meeting.transcript.length} moments · ${meeting.participants.length} speakers` : "Ask anything about this meeting"}</span></div></div><button className="icon-button" title="More options" onClick={exportNotes}><Icon name="more" /></button></div>
            <div className="transcript-tabs"><button className={view === "transcript" ? "selected" : ""} onClick={() => setView("transcript")}>Transcript</button><button className={view === "ask" ? "selected" : ""} onClick={() => setView("ask")}><Icon name="spark" size={13} /> AskFred</button><span className="transcript-tab-spacer" /><button className="transcript-small-action" onClick={exportNotes}><Icon name="download" size={14} /> Export</button></div>
            {view === "transcript" ? <>
              <div className="transcript-search"><Icon name="search" size={16} /><input placeholder="Search transcript" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ F</kbd>{query && <button onClick={() => setQuery("")}><Icon name="close" size={14} /></button>}</div>
              {query && <div className="match-summary">{matches.length ? <><strong>{matches.length}</strong> matching {matches.length === 1 ? "moment" : "moments"}</> : "No matches in this transcript"}</div>}
              <div className="transcript-list">{meeting.transcript.map((line, index) => <button className={`transcript-line ${activeSegmentId === line.id ? "currently-playing" : ""} ${query && line.text.toLowerCase().includes(query.toLowerCase()) ? "search-hit" : ""}`} key={line.id} onClick={() => { seek(line.start_seconds); setPlaying(true); }}><span className="line-time">{formatClock(line.start_seconds)}</span><span className={`speaker-avatar ${colors[meeting.participants.indexOf(line.speaker) % colors.length] || colors[index % colors.length]}`}>{initials(line.speaker)}</span><span className="line-content"><strong>{line.speaker}</strong><span><HighlightText text={line.text} query={query} /></span></span><span className="line-play-indicator"><Icon name="play" size={12} /></span></button>)}{meeting.transcript.length === 0 && <div className="transcript-empty"><Icon name="message" size={20} /><strong>No transcript yet</strong><span>Add a transcript when creating a meeting.</span></div>}</div>
              <div className="transcript-footer"><span><span className="privacy-lock">◈</span> Only you can see this transcript</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top <span>↑</span></button></div>
            </> : <div className="askfred-panel"><div className="askfred-welcome"><div className="askfred-orb"><Icon name="spark" size={22} /></div><h3>Get more from this meeting</h3><p>Ask a question and I&apos;ll find the most relevant moments in your transcript.</p></div>{answer.length > 0 && <div className="ask-answer"><div className="ask-answer-label"><span className="askfred-mini"><Icon name="spark" size={12} /></span> From this meeting</div>{answer.map((line) => <button key={line.id} className="answer-quote" onClick={() => { setView("transcript"); seek(line.start_seconds); setPlaying(true); }}><span className="answer-timestamp">{formatClock(line.start_seconds)} · {line.speaker}</span><span>“{line.text}”</span></button>)}</div>}<form className="askfred-input" onSubmit={ask}><textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What were the key decisions?" /><div><span><Icon name="spark" size={13} /> AI answers are based on this transcript</span><button disabled={!question.trim()}><Icon name="arrow" size={16} /></button></div></form></div>}
          </div>
        </section>
      </div>
    </div>
    {showEdit && <EditMeetingModal meeting={meeting} onClose={() => setShowEdit(false)} onSave={saveDetails} />}
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}
  </WorkspaceShell>;
}
