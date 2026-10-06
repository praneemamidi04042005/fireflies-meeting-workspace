export type TranscriptSegment = {
  id: number;
  start_seconds: number;
  end_seconds: number;
  speaker: string;
  text: string;
};

export type ActionItem = {
  id: number;
  text: string;
  assignee: string | null;
  due_date: string | null;
  is_complete: boolean;
};

export type Topic = {
  id: number;
  title: string;
  start_seconds: number;
  summary: string;
};

export type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  duration_seconds: number;
  participants: string[];
  summary: string;
};

export type MeetingDetail = Meeting & {
  transcript: TranscriptSegment[];
  action_items: ActionItem[];
  topics: Topic[];
};
