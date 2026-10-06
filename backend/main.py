from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "fireflies.db")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Meeting Notes API", version="1.0.0")
allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
if os.getenv("FRONTEND_ORIGIN"):
    allowed_origins.append(os.environ["FRONTEND_ORIGIN"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def initialize_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                meeting_date TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                participants_json TEXT NOT NULL DEFAULT '[]',
                summary TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transcript_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                start_seconds INTEGER NOT NULL,
                end_seconds INTEGER NOT NULL,
                speaker TEXT NOT NULL,
                text TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_segments_meeting_time
                ON transcript_segments(meeting_id, start_seconds);
            CREATE TABLE IF NOT EXISTS action_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                assignee TEXT,
                due_date TEXT,
                is_complete INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS topics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                start_seconds INTEGER NOT NULL DEFAULT 0,
                summary TEXT NOT NULL DEFAULT ''
            );
            """
        )
        count = db.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
        if count == 0:
            seed(db)


def seed(db: sqlite3.Connection) -> None:
    today = date.today()
    meetings = [
        {
            "id": "m-product-sync",
            "title": "Product weekly sync",
            "days_ago": 0,
            "duration": 1980,
            "participants": ["Maya Chen", "Jordan Lee", "Alex Morgan", "Sam Rivera"],
            "summary": "The team aligned on the onboarding refresh, reviewed the latest activation data, and agreed to simplify the first-run checklist. The new flow is on track for a small customer test next week.",
            "lines": [
                (0, 0, 6, "Maya Chen", "Thanks everyone. Let’s start with the activation numbers from last week and then decide what we need to change in onboarding."),
                (38, 44, 13, "Jordan Lee", "We saw a nine percent lift in teams that completed the first workspace setup. The biggest drop-off is still the invite step."),
                (81, 88, 14, "Alex Morgan", "I think we’re asking for too much too early. We can move the invite prompt until after they create their first project."),
                (132, 138, 11, "Maya Chen", "That’s a good direction. Let’s make the checklist shorter and show the team invite as a recommended next step instead of a blocker."),
                (190, 196, 10, "Sam Rivera", "I can have the updated copy and empty states ready by Thursday. We should keep the existing flow behind a flag while we test."),
                (253, 260, 13, "Jordan Lee", "For the experiment, let’s track workspace creation, first project created, and the invite conversion separately."),
                (322, 329, 12, "Maya Chen", "Perfect. We’ll test with five customer teams next week and review the numbers together on Friday."),
                (415, 422, 8, "Alex Morgan", "I’ll share the prototype after this call. Please leave comments on the first-run checklist before Wednesday."),
            ],
            "actions": [("Move the team invite step after project creation", "Jordan Lee", 3), ("Share onboarding prototype for async review", "Alex Morgan", 2), ("Prepare revised empty-state copy by Thursday", "Sam Rivera", 4)],
            "topics": [("Activation data", 38, "First workspace setup is improving; the invite step remains the main point of drop-off."), ("Onboarding flow", 81, "Move the team invite after the first project and make it a recommended step."), ("Experiment plan", 253, "Track setup, first project, and invites separately with five customer teams."), ("Next steps", 322, "Review prototype comments midweek and evaluate test results next Friday.")],
        },
        {
            "id": "m-customer-discovery",
            "title": "Customer discovery — Northstar",
            "days_ago": 1,
            "duration": 2760,
            "participants": ["Priya Nair", "Chris Walker", "Taylor Kim"],
            "summary": "Northstar’s operations team is spending too much time reconciling reports across tools. They value clear ownership and fast handoffs more than advanced automation, and are open to a pilot with their support group.",
            "lines": [
                (0, 6, 9, "Priya Nair", "To begin, could you walk us through how your team handles a customer request from intake to resolution?"),
                (53, 59, 16, "Chris Walker", "Most of our time goes into finding the latest status. The details are spread across email, the ticketing system, and a shared spreadsheet."),
                (130, 136, 14, "Taylor Kim", "When the handoff works well, what makes the difference? Is it the automation or knowing exactly who owns the next step?"),
                (181, 188, 18, "Chris Walker", "Ownership, definitely. If we know who has it and when it will move, we can work around a manual step."),
                (272, 279, 12, "Priya Nair", "That’s helpful. If we could show a single timeline with the owner and the next milestone, would that fit into your current workflow?"),
                (336, 344, 17, "Chris Walker", "Yes, especially for escalations. We would need to filter by customer and see the last update without opening each ticket."),
                (430, 437, 14, "Taylor Kim", "Would your support team be able to try that with a few active accounts in the next month?"),
                (498, 505, 16, "Chris Walker", "I can get two team leads to join a pilot. Send me a short outline and I’ll confirm who should be involved."),
            ],
            "actions": [("Send pilot outline to Chris", "Priya Nair", 2), ("Draft a timeline prototype for escalations", "Taylor Kim", 5)],
            "topics": [("Current workflow", 53, "Work is split across email, tickets, and a shared spreadsheet."), ("What matters", 130, "Clear ownership and next milestones matter more than automation."), ("Pilot opportunity", 430, "Two support leads may be available to test with active accounts next month.")],
        },
        {
            "id": "m-design-review",
            "title": "Q3 design review",
            "days_ago": 3,
            "duration": 3540,
            "participants": ["Nina Patel", "Owen Brooks", "Maya Chen", "Devin Park"],
            "summary": "The review focused on making the analytics workspace easier to scan. The group chose a compact overview with progressive detail, stronger contrast for key metrics, and a shared pattern for saved views.",
            "lines": [
                (0, 7, 8, "Nina Patel", "I’ve grouped the feedback into navigation, dashboard density, and saved views. Let’s start with the overview screen."),
                (72, 78, 17, "Owen Brooks", "The current cards all compete for attention. Could the most important metric have stronger contrast and the secondary details stay quieter?"),
                (149, 156, 15, "Maya Chen", "We should also preserve a quick way to compare this week to last week without opening a separate report."),
                (232, 239, 13, "Devin Park", "For saved views, I’d like a consistent control across analytics and the account page. People shouldn’t have to relearn it."),
                (320, 326, 15, "Nina Patel", "Agreed. I’ll explore a compact overview that reveals detail as you scroll, with the comparison in the header."),
                (413, 420, 14, "Owen Brooks", "Let’s put the new version in front of three power users before we lock down the component library."),
                (510, 517, 11, "Nina Patel", "I’ll update the prototype and bring two options to our review on Thursday."),
            ],
            "actions": [("Create two compact overview options", "Nina Patel", 3), ("Recruit three analytics power users", "Owen Brooks", 6), ("Document the saved-view interaction pattern", "Devin Park", 5)],
            "topics": [("Overview hierarchy", 72, "Give the primary metric more contrast and reduce emphasis on supporting cards."), ("Saved views", 232, "Use one consistent saved-view interaction across product areas."), ("Usability check", 413, "Test the updated overview with three power users before finalizing components.")],
        },
        {
            "id": "m-launch-planning",
            "title": "Launch planning — Atlas",
            "days_ago": 5,
            "duration": 1620,
            "participants": ["Elliot Shaw", "Rina Das", "Cameron Bell"],
            "summary": "The Atlas launch remains on schedule for the 18th. The team agreed to focus the announcement on faster setup, prepare a customer story, and keep the rollout phased until support coverage is confirmed.",
            "lines": [
                (0, 6, 10, "Elliot Shaw", "We’re still targeting the 18th. I want to check the customer story, rollout checklist, and support coverage before we publish the announcement."),
                (64, 70, 15, "Rina Das", "The customer is comfortable sharing the setup-time result, but they need to approve the final quote first."),
                (146, 153, 12, "Cameron Bell", "We can start with a phased rollout to existing teams. That gives support a chance to see the questions before general availability."),
                (228, 235, 14, "Elliot Shaw", "Let’s position the announcement around getting a workspace running faster. We can keep the advanced controls in the release notes."),
                (332, 338, 13, "Rina Das", "I’ll get quote approval by Tuesday and share the customer story draft with legal at the same time."),
                (408, 415, 13, "Cameron Bell", "I’ll confirm the coverage schedule and flag any gaps before the rollout review on Wednesday."),
            ],
            "actions": [("Get approval for the customer quote", "Rina Das", 1), ("Confirm support coverage for phased rollout", "Cameron Bell", 2)],
            "topics": [("Launch timing", 0, "Target date remains the 18th, subject to final support checks."), ("Customer story", 64, "Customer approved sharing the result; final quote needs sign-off."), ("Rollout", 146, "Start with existing teams while support validates readiness.")],
        },
        {
            "id": "m-research-readout",
            "title": "Research readout: team handoffs",
            "days_ago": 8,
            "duration": 2400,
            "participants": ["Avery Brooks", "Priya Nair", "Jordan Lee"],
            "summary": "Across six interviews, teams described handoffs as the biggest source of lost context. A lightweight owner timeline and a visible last-updated signal were the most requested improvements.",
            "lines": [
                (0, 6, 10, "Avery Brooks", "We completed six interviews. I’ll share the patterns that showed up repeatedly and where the teams disagreed."),
                (70, 76, 14, "Priya Nair", "The consistent issue is that context gets lost between people, even when the underlying ticket has all the details."),
                (158, 165, 13, "Jordan Lee", "Several teams have their own workaround spreadsheet just to see who owns the next update."),
                (244, 251, 14, "Avery Brooks", "A visible owner timeline seems like the shared need. We should validate whether a last-updated indicator is enough for stale work."),
                (342, 349, 14, "Priya Nair", "I can bring the prototype into two of the follow-up interviews next week and ask them to narrate their handoff."),
                (437, 444, 11, "Jordan Lee", "Let’s keep the first concept narrow: owner, next milestone, and the latest update."),
            ],
            "actions": [("Test owner timeline concept in two interviews", "Priya Nair", 4), ("Share interview notes with product team", "Avery Brooks", 2)],
            "topics": [("Repeated friction", 70, "Teams lose context between owners and recreate status in spreadsheets."), ("Opportunity", 244, "A simple timeline may clarify ownership and stale work."), ("Concept scope", 437, "Start with owner, next milestone, and latest update.")],
        },
    ]

    for meeting in meetings:
        meeting_date = datetime.combine(today - timedelta(days=meeting["days_ago"]), datetime.min.time(), timezone.utc).isoformat()
        db.execute(
            "INSERT INTO meetings VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (meeting["id"], meeting["title"], meeting_date, meeting["duration"], json.dumps(meeting["participants"]), meeting["summary"], iso_now(), iso_now()),
        )
        for start, offset, length, speaker, text in meeting["lines"]:
            db.execute(
                "INSERT INTO transcript_segments(meeting_id,start_seconds,end_seconds,speaker,text) VALUES(?,?,?,?,?)",
                (meeting["id"], start, start + length, speaker, text),
            )
        for text, assignee, due_days in meeting["actions"]:
            db.execute(
                "INSERT INTO action_items(meeting_id,text,assignee,due_date,is_complete,created_at) VALUES(?,?,?,?,0,?)",
                (meeting["id"], text, assignee, (today + timedelta(days=due_days)).isoformat(), iso_now()),
            )
        for title, start, summary in meeting["topics"]:
            db.execute("INSERT INTO topics(meeting_id,title,start_seconds,summary) VALUES(?,?,?,?)", (meeting["id"], title, start, summary))


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    meeting_date: str | None = None
    duration_seconds: int = Field(default=0, ge=0)
    participants: list[str] = Field(default_factory=list)
    summary: str = ""
    transcript_text: str = ""


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    participants: list[str] | None = None
    meeting_date: str | None = None


class ActionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    assignee: str | None = None
    due_date: str | None = None


class ActionUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=500)
    assignee: str | None = None
    due_date: str | None = None
    is_complete: bool | None = None


def meeting_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "meeting_date": row["meeting_date"],
        "duration_seconds": row["duration_seconds"],
        "participants": json.loads(row["participants_json"]),
        "summary": row["summary"],
    }


def get_detail(db: sqlite3.Connection, meeting_id: str) -> dict[str, Any]:
    row = db.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    result = meeting_row(row)
    result["transcript"] = [dict(item) for item in db.execute("SELECT id,start_seconds,end_seconds,speaker,text FROM transcript_segments WHERE meeting_id=? ORDER BY start_seconds,id", (meeting_id,))]
    result["action_items"] = [
        {**dict(item), "is_complete": bool(item["is_complete"])}
        for item in db.execute("SELECT id,text,assignee,due_date,is_complete FROM action_items WHERE meeting_id=? ORDER BY id", (meeting_id,))
    ]
    result["topics"] = [dict(item) for item in db.execute("SELECT id,title,start_seconds,summary FROM topics WHERE meeting_id=? ORDER BY start_seconds,id", (meeting_id,))]
    return result


def parse_transcript(text: str, participants: list[str], duration: int) -> list[tuple[int, int, str, str]]:
    parsed: list[tuple[int, int, str, str]] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    timestamp_line = re.compile(r"^(\d{1,2}:\d{2}(?::\d{2})?)(?:[.,]\d+)?\s+-->")
    inline_time = re.compile(r"^(\d{1,2}:\d{2}(?::\d{2})?)(?:[.,]\d+)?\s*[|—-]?\s*(?:\[?([^\]]+)\]?\s*:\s*)?(.*)$")

    def seconds_from_stamp(stamp: str) -> int:
        parts = [int(part) for part in stamp.split(":")]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        return parts[0] * 3600 + parts[1] * 60 + parts[2]

    pending_start: int | None = None
    speaker_index = 0
    for line in lines:
        if line.upper() == "WEBVTT" or line.startswith("NOTE ") or line.isdigit():
            continue
        time_match = timestamp_line.match(line)
        if time_match:
            pending_start = seconds_from_stamp(time_match.group(1))
            continue

        match = inline_time.match(line)
        if match:
            stamp, speaker, words = match.groups()
            start = seconds_from_stamp(stamp)
            who = speaker.strip() if speaker else ""
            message = words.strip()
        else:
            start = pending_start if pending_start is not None else speaker_index * 12
            who = ""
            message = line
            speaker_match = re.match(r"^([^:]{1,50}):\s*(.+)$", line)
            if speaker_match:
                who, message = speaker_match.groups()
        if not who:
            who = participants[speaker_index % len(participants)] if participants else f"Speaker {speaker_index % 2 + 1}"
        if message:
            parsed.append((start, start + 7, who.strip(), message.strip()))
            speaker_index += 1
        pending_start = None
    if not parsed and text.strip():
        parsed.append((0, max(duration, 7), participants[0] if participants else "Speaker 1", text.strip()))
    return parsed


@app.on_event("startup")
def startup() -> None:
    initialize_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/meetings")
def list_meetings(q: str = "") -> list[dict[str, Any]]:
    with connect() as db:
        if q.strip():
            pattern = f"%{q.strip()}%"
            rows = db.execute(
                """SELECT DISTINCT m.* FROM meetings m
                   LEFT JOIN transcript_segments s ON s.meeting_id=m.id
                   WHERE m.title LIKE ? OR m.meeting_date LIKE ? OR m.summary LIKE ? OR m.participants_json LIKE ? OR s.text LIKE ?
                   ORDER BY m.meeting_date DESC""",
                (pattern, pattern, pattern, pattern, pattern),
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM meetings ORDER BY meeting_date DESC").fetchall()
        return [meeting_row(row) for row in rows]


@app.get("/api/meetings/{meeting_id}")
def read_meeting(meeting_id: str) -> dict[str, Any]:
    with connect() as db:
        return get_detail(db, meeting_id)


@app.post("/api/meetings", status_code=201)
def create_meeting(body: MeetingCreate) -> dict[str, Any]:
    meeting_id = f"m-{uuid.uuid4().hex[:10]}"
    now = iso_now()
    date_value = body.meeting_date or now
    segments = parse_transcript(body.transcript_text, body.participants, body.duration_seconds)
    duration = body.duration_seconds or (max((item[1] for item in segments), default=0))
    with connect() as db:
        db.execute(
            "INSERT INTO meetings VALUES(?,?,?,?,?,?,?,?)",
            (meeting_id, body.title.strip(), date_value, duration, json.dumps(body.participants), body.summary.strip(), now, now),
        )
        db.executemany(
            "INSERT INTO transcript_segments(meeting_id,start_seconds,end_seconds,speaker,text) VALUES(?,?,?,?,?)",
            [(meeting_id, start, end, speaker, text) for start, end, speaker, text in segments],
        )
        return get_detail(db, meeting_id)


@app.put("/api/meetings/{meeting_id}")
def update_meeting(meeting_id: str, body: MeetingUpdate) -> dict[str, Any]:
    values = body.model_dump(exclude_unset=True)
    with connect() as db:
        if db.execute("SELECT id FROM meetings WHERE id=?", (meeting_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Meeting not found")
        columns: list[str] = []
        params: list[Any] = []
        if "title" in values:
            columns.append("title=?")
            params.append(values["title"].strip())
        if "participants" in values:
            columns.append("participants_json=?")
            params.append(json.dumps([p.strip() for p in values["participants"] if p.strip()]))
        if "meeting_date" in values:
            columns.append("meeting_date=?")
            params.append(values["meeting_date"])
        if columns:
            columns.append("updated_at=?")
            params.extend([iso_now(), meeting_id])
            db.execute(f"UPDATE meetings SET {', '.join(columns)} WHERE id=?", params)
        return get_detail(db, meeting_id)


@app.delete("/api/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: str) -> Response:
    with connect() as db:
        cursor = db.execute("DELETE FROM meetings WHERE id=?", (meeting_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Meeting not found")
    return Response(status_code=204)


@app.post("/api/meetings/{meeting_id}/actions", status_code=201)
def create_action(meeting_id: str, body: ActionCreate) -> dict[str, Any]:
    with connect() as db:
        if db.execute("SELECT id FROM meetings WHERE id=?", (meeting_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Meeting not found")
        db.execute(
            "INSERT INTO action_items(meeting_id,text,assignee,due_date,is_complete,created_at) VALUES(?,?,?,?,0,?)",
            (meeting_id, body.text.strip(), body.assignee, body.due_date, iso_now()),
        )
        return get_detail(db, meeting_id)


@app.patch("/api/meetings/{meeting_id}/actions/{action_id}")
def update_action(meeting_id: str, action_id: int, body: ActionUpdate) -> dict[str, Any]:
    values = body.model_dump(exclude_unset=True)
    with connect() as db:
        if db.execute("SELECT id FROM meetings WHERE id=?", (meeting_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Meeting not found")
        action = db.execute("SELECT id FROM action_items WHERE id=? AND meeting_id=?", (action_id, meeting_id)).fetchone()
        if action is None:
            raise HTTPException(status_code=404, detail="Action item not found")
        mapping = {"text": "text", "assignee": "assignee", "due_date": "due_date", "is_complete": "is_complete"}
        assignments: list[str] = []
        params: list[Any] = []
        for key, column in mapping.items():
            if key in values:
                assignments.append(f"{column}=?")
                params.append(int(values[key]) if key == "is_complete" else values[key])
        if assignments:
            params.extend([action_id, meeting_id])
            db.execute(f"UPDATE action_items SET {', '.join(assignments)} WHERE id=? AND meeting_id=?", params)
        return get_detail(db, meeting_id)


@app.delete("/api/meetings/{meeting_id}/actions/{action_id}", status_code=204)
def delete_action(meeting_id: str, action_id: int) -> Response:
    with connect() as db:
        cursor = db.execute("DELETE FROM action_items WHERE id=? AND meeting_id=?", (action_id, meeting_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Action item not found")
    return Response(status_code=204)


@app.get("/api/search")
def global_search(q: str) -> list[dict[str, Any]]:
    query = q.strip()
    if not query:
        return []
    with connect() as db:
        pattern = f"%{query}%"
        rows = db.execute(
            """SELECT DISTINCT m.* FROM meetings m
               LEFT JOIN transcript_segments s ON s.meeting_id=m.id
               WHERE m.title LIKE ? OR m.meeting_date LIKE ? OR m.summary LIKE ? OR m.participants_json LIKE ? OR s.text LIKE ?
               ORDER BY m.meeting_date DESC""",
            (pattern, pattern, pattern, pattern, pattern),
        ).fetchall()
        return [meeting_row(row) for row in rows]
