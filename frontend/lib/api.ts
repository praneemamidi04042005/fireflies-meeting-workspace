import type { Meeting, MeetingDetail } from "@/lib/types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      cache: "no-store",
    });
  } catch {
    throw new Error("Can’t reach the meeting library. Start the FastAPI server and try again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  meetings: (query = "") => request<Meeting[]>(`/api/meetings${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  meeting: (id: string) => request<MeetingDetail>(`/api/meetings/${id}`),
  createMeeting: (body: Record<string, unknown>) => request<MeetingDetail>("/api/meetings", { method: "POST", body: JSON.stringify(body) }),
  updateMeeting: (id: string, body: Record<string, unknown>) => request<MeetingDetail>(`/api/meetings/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMeeting: (id: string) => request<void>(`/api/meetings/${id}`, { method: "DELETE" }),
  createAction: (id: string, text: string) => request<MeetingDetail>(`/api/meetings/${id}/actions`, { method: "POST", body: JSON.stringify({ text }) }),
  updateAction: (id: string, actionId: number, body: Record<string, unknown>) => request<MeetingDetail>(`/api/meetings/${id}/actions/${actionId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAction: (id: string, actionId: number) => request<MeetingDetail>(`/api/meetings/${id}/actions/${actionId}`, { method: "DELETE" }),
};

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} min${remainder ? ` ${remainder} sec` : ""}`;
}

export function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatMeetingDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
