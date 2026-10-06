
# Fireflies Meeting Workspace

A Fireflies-inspired meeting notes workspace built for the fullstack assignment. It includes a searchable meeting library, transcript and summary view, mock recording controls, chapter navigation, AskFred-style transcript lookup, and persisted action items.

## Tech stack

- **Frontend:** Next.js 14, React 18, TypeScript, CSS
- **Backend:** Python, FastAPI, Pydantic
- **Database:** SQLite with foreign keys and indexed transcript timestamps

## Run locally

Requirements: Node.js 18.17+ and Python 3.10+.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API creates `backend/data/fireflies.db` at startup and seeds five example meetings when the database is empty. To use another SQLite file, set `DATABASE_PATH` before starting Uvicorn. `FRONTEND_ORIGIN` adds a deployed frontend origin to the local CORS allowlist. The interactive API reference is available at `http://localhost:8000/docs`.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend uses `http://localhost:8000` by default. To point it at another API, copy `frontend/.env.example` to `frontend/.env.local`, set `NEXT_PUBLIC_API_URL`, and restart the dev server.

## Architecture

The Next.js app is organized around two primary views:

- `/` loads the meeting library and supports global title, participant, and transcript search, plus date filters and recent-first sorting.
- `/meetings/[id]` loads meeting metadata, summary, transcript segments, chapters, and action items. Transcript rows and chapter rows seek the placeholder player; playback advances the current timestamp and highlights the active transcript segment.

`frontend/lib/api.ts` contains the typed API client and formatting helpers. Shared workspace navigation, icons, and the create-meeting dialog live in `frontend/components/`.

FastAPI endpoints in `backend/main.py` handle persistence and validation. SQLite is accessed through short-lived connections with `PRAGMA foreign_keys = ON`; deleting a meeting cascades to its transcript, chapters, and actions. Seed data is inserted only when the meetings table is empty.

## Database schema

| Table | Purpose | Main fields and relationships |
| --- | --- | --- |
| `meetings` | Meeting metadata and summary | `id` (text primary key), title, date, duration, JSON participants, summary, created/updated timestamps |
| `transcript_segments` | Searchable, timestamped utterances | integer primary key, `meeting_id` foreign key, start/end seconds, speaker, text; indexed by meeting and start time |
| `action_items` | Follow-up tasks | integer primary key, `meeting_id` foreign key, text, assignee, due date, completion flag, created timestamp |
| `topics` | Summary outline / chapters | integer primary key, `meeting_id` foreign key, title, start seconds, short summary |

Participants are stored as a JSON array on a meeting because this assignment does not model user accounts or team membership. The transcript, task, and chapter records use separate tables so they can be queried and updated independently.

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/api/meetings?q=` | List recent meetings; optional query covers title, participants, and transcript text |
| `GET` | `/api/meetings/{id}` | Meeting detail with transcript, chapters, and action items |
| `POST` | `/api/meetings` | Create a meeting from metadata and pasted transcript text |
| `PUT` | `/api/meetings/{id}` | Update title, participants, or date |
| `DELETE` | `/api/meetings/{id}` | Delete a meeting and its related records |
| `POST` | `/api/meetings/{id}/actions` | Add an action item |
| `PATCH` | `/api/meetings/{id}/actions/{action_id}` | Edit or complete an action item |
| `DELETE` | `/api/meetings/{id}/actions/{action_id}` | Delete an action item |
| `GET` | `/api/search?q=` | Search meeting metadata, summaries, and transcript text |

## Assumptions and mocked behavior

- The signed-in workspace is a default profile; authentication, access control, calendar sync, and integrations are placeholders.
- Example summaries, transcript segments, and action items are seeded locally. New meetings accept pasted plain-text or VTT-style transcript content; timestamps and speaker labels are parsed when present.
- The recording preview is intentionally decorative. Playback and seeking demonstrate the transcript interaction without real audio transcription or audio streaming.
- AskFred uses local keyword matching against the current transcript to return relevant passages; it does not call an LLM.
- The app is designed to run as two services locally. For a hosted demo, deploy the frontend and FastAPI backend separately, set `NEXT_PUBLIC_API_URL` to the public API origin, set `FRONTEND_ORIGIN` to the deployed frontend URL, and use persistent storage for the SQLite database.

## Project layout

```text
frontend/   Next.js app, reusable components, styles, typed API client
backend/    FastAPI service, SQLite schema, seed data
```
