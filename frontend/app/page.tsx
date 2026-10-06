"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { MeetingModal } from "@/components/meeting-modal";
import { WorkspaceShell } from "@/components/workspace-shell";
import { api, formatDuration, formatMeetingDate } from "@/lib/api";
import type { Meeting } from "@/lib/types";

const avatarColors = ["avatar-blue", "avatar-violet", "avatar-mint", "avatar-peach", "avatar-slate"];

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

export default function HomePage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) setQuery(initialQuery);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const records = await api.meetings(query.trim());
        if (active) { setMeetings(records); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load meetings");
      } finally { if (active) setLoading(false); }
    }, query ? 180 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, retryCount]);

  const visibleMeetings = useMemo(() => meetings.filter((meeting) => {
    if (period === "all") return true;
    const age = Date.now() - new Date(meeting.meeting_date).getTime();
    return age < (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
  }), [meetings, period]);
  const totalHours = (meetings.reduce((total, meeting) => total + meeting.duration_seconds, 0) / 3600).toFixed(1);

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 3000); }

  return <WorkspaceShell>
    <header className="topbar">
      <div className="crumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Meetings</strong></div>
      <div className="topbar-right"><div className="global-search"><Icon name="search" size={17} /><input aria-label="Search meetings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meetings, people, keywords" /><kbd>⌘ K</kbd></div><button className="help-round" title="Help"><Icon name="help" size={18} /></button><button className="profile-avatar" title="Profile">P</button></div>
    </header>
    <div className="page-content dashboard-content">
      <div className="page-intro"><div><div className="eyebrow">YOUR LIBRARY</div><h1>Meetings</h1><p className="page-subtitle">Every conversation, organized and ready to revisit.</p></div><button className="button-primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={17} /> Add meeting</button></div>
      <section className="metric-row">
        <div className="metric-card"><div className="metric-icon metric-lilac"><Icon name="notebook" size={17} /></div><div><span>Total meetings</span><strong>{meetings.length}</strong><small>in your workspace</small></div><div className="metric-spark"><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
        <div className="metric-card"><div className="metric-icon metric-blue"><Icon name="clock" size={17} /></div><div><span>Time captured</span><strong>{totalHours}<em> hrs</em></strong><small>across all meetings</small></div><div className="metric-spark blue-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
        <div className="metric-card highlight-metric"><div className="metric-icon metric-gold"><Icon name="check" size={17} /></div><div><span>Never miss a follow-up</span><strong>Action items</strong><small>Keep your next steps moving</small></div><button className="text-link" onClick={() => showToast("Action item overview coming soon")}>View all <Icon name="arrow" size={14} /></button></div>
      </section>
      <section className="meetings-section">
        <div className="section-toolbar"><div className="meeting-tabs"><button className="meeting-tab active">All meetings <span>{meetings.length}</span></button><button className="meeting-tab" onClick={() => showToast("You’re viewing your workspace library")}>Shared with me</button></div><div className="toolbar-controls"><label className="filter-select"><Icon name="filter" size={15} /><select aria-label="Filter meetings by date" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">Any date</option><option value="week">Past week</option><option value="month">Past month</option></select><Icon name="chevron" size={14} /></label><button className="sort-button" onClick={() => showToast("Sorted by most recent")}><Icon name="clock" size={15} /> Most recent <Icon name="chevron" size={14} /></button></div></div>
        <div className="meeting-table-wrap">
          <table className="meeting-table"><thead><tr><th>MEETING</th><th>PARTICIPANTS</th><th>DATE</th><th>DURATION</th><th aria-label="Actions" /></tr></thead><tbody>
            {loading && <tr><td colSpan={5}><div className="table-state"><span className="loading-dot" /> Loading your meetings…</div></td></tr>}
            {!loading && error && <tr><td colSpan={5}><div className="table-state error-state"><div><strong>Your library is waiting</strong><span>{error}</span></div><button className="button-secondary small-button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button></div></td></tr>}
            {!loading && !error && visibleMeetings.map((meeting, index) => <tr className="meeting-row" key={meeting.id} onClick={() => router.push(`/meetings/${meeting.id}`)}>
              <td><div className="meeting-title-cell"><div className={`meeting-symbol symbol-${index % 5}`}><Icon name={index % 2 ? "message" : "users"} size={17} /></div><div className="meeting-title-copy"><strong>{meeting.title}</strong><span>{meeting.participants.length} participants <span className="row-dot">·</span> <span className="transcript-indicator"><span /> Transcript ready</span></span></div></div></td>
              <td><div className="avatar-stack">{meeting.participants.slice(0, 4).map((person, personIndex) => <span title={person} className={`person-avatar ${avatarColors[(index + personIndex) % avatarColors.length]}`} key={person}>{initials(person)}</span>)}{meeting.participants.length > 4 && <span className="person-avatar avatar-extra">+{meeting.participants.length - 4}</span>}</div></td>
              <td><div className="date-cell">{formatMeetingDate(meeting.meeting_date)}<span>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(meeting.meeting_date))}</span></div></td>
              <td><span className="duration-cell"><Icon name="clock" size={14} />{formatDuration(meeting.duration_seconds)}</span></td>
              <td><button className="row-more" aria-label={`Open ${meeting.title}`} onClick={(event) => { event.stopPropagation(); router.push(`/meetings/${meeting.id}`); }}><Icon name="more" size={18} /></button></td>
            </tr>)}
            {!loading && !error && visibleMeetings.length === 0 && <tr><td colSpan={5}><div className="empty-state"><div className="empty-illustration"><Icon name="search" size={25} /></div><strong>No meetings found</strong><span>Try a different search or add your first meeting.</span><button className="button-secondary small-button" onClick={() => { setQuery(""); setPeriod("all"); }}>Clear filters</button></div></td></tr>}
          </tbody></table>
          {!loading && !error && visibleMeetings.length > 0 && <div className="table-footer"><span>Showing <strong>{visibleMeetings.length}</strong> of {meetings.length} meetings</span><button onClick={() => showToast("You’re all caught up")}>You’re all caught up <span>✓</span></button></div>}
        </div>
      </section>
      <footer className="dashboard-footnote"><span className="privacy-lock">◈</span> Your meeting notes are private to your workspace. <Link href="/settings">Learn about privacy <Icon name="arrow" size={12} /></Link></footer>
    </div>
    {showCreate && <MeetingModal onClose={() => setShowCreate(false)} onCreate={(meeting) => { setShowCreate(false); router.push(`/meetings/${meeting.id}`); }} />}
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}
  </WorkspaceShell>;
}
