"use client";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/icon";
import type { MeetingDetail } from "@/lib/types";

export function MeetingModal({ onClose, onCreate }: { onClose: () => void; onCreate: (meeting: MeetingDetail) => void }) {
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}/api/meetings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, participants: participants.split(",").map((person) => person.trim()).filter(Boolean), summary, transcript_text: transcript }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body?.detail || "Could not create meeting");
      onCreate(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create meeting");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal-card create-modal" onSubmit={submit}>
      <div className="modal-heading"><div><div className="eyebrow">NEW RECORDING</div><h2>Add a meeting</h2><p>Paste notes or a transcript to create a searchable meeting.</p></div><button type="button" className="icon-button" onClick={onClose}><Icon name="close" /></button></div>
      <label className="field-label">Meeting title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product planning sync" /></label>
      <label className="field-label">Participants <span className="optional">(comma separated)</span><input value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="Maya Chen, Jordan Lee" /></label>
      <label className="field-label">Summary <span className="optional">(optional)</span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What were the key takeaways?" /></label>
      <label className="field-label">Transcript <span className="optional">(.txt or .vtt content)</span><textarea rows={6} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={"00:00 Maya: Welcome, everyone…\n00:18 Jordan: Let's get started."} /></label>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button disabled={busy} className="button-primary"><Icon name="plus" size={16} />{busy ? "Creating…" : "Create meeting"}</button></div>
    </form>
  </div>;
}
