"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Icon } from "@/components/icon";

const copy: Record<string, { title: string; detail: string }> = {
  upcoming: { title: "Upcoming meetings", detail: "Connect your calendar to see what’s coming up and invite Fireflies to your next conversation." },
  askfred: { title: "AskFred", detail: "Ask questions across your meetings and get answers grounded in your conversation history." },
  settings: { title: "Workspace settings", detail: "Manage your profile, preferences, and workspace details in one place." },
};

export default function PlaceholderPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = copy[slug] || { title: "Coming soon", detail: "This workspace view is on its way. Your meetings are ready whenever you are." };
  return <WorkspaceShell><header className="topbar"><div className="crumbs"><Link href="/">Workspace</Link><span className="crumb-slash">/</span><strong>{page.title}</strong></div><div className="topbar-right"><button className="profile-avatar">P</button></div></header><div className="placeholder-view"><div className="placeholder-icon"><Icon name={slug === "askfred" ? "spark" : slug === "upcoming" ? "calendar" : "settings"} size={25} /></div><div className="eyebrow">A LITTLE MORE TIME</div><h1>{page.title}</h1><p>{page.detail}</p><span className="coming-soon-pill"><span /> Coming soon</span><Link className="button-primary" href="/"><Icon name="arrow" size={15} /> Back to meetings</Link></div></WorkspaceShell>;
}
