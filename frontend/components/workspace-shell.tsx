"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

const navItems = [
  { label: "Home", icon: "home" as const, href: "/" },
  { label: "Meetings", icon: "notebook" as const, href: "/" },
  { label: "Upcoming", icon: "calendar" as const, href: "/upcoming" },
  { label: "AskFred", icon: "spark" as const, href: "/askfred" },
];

export function WorkspaceShell({ children, showUpgrade = true }: { children: ReactNode; showUpgrade?: boolean }) {
  const pathname = usePathname();
  return <div className="app-frame">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Fireflies home">
        <span className="brand-mark"><span /><span /><span /><span /></span>
        <span>fireflies<span className="brand-dot">.ai</span></span>
      </Link>
      <button className="workspace-switch"><span className="workspace-avatar">P</span><span className="workspace-name">Pranee&apos;s workspace</span><Icon name="chevron" size={15} /></button>
      <button className="invite-button"><Icon name="plus" size={16} /> Invite teammates</button>
      <div className="side-section-label">WORKSPACE</div>
      <nav className="side-nav">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/meetings/") : pathname === item.href;
          return <Link href={item.href} key={item.label} className={`nav-item ${active ? "active" : ""}`}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.label === "AskFred" && <span className="new-pill">NEW</span>}</Link>;
        })}
      </nav>
      <div className="side-section-label library-label">LIBRARY <button title="Add folder"><Icon name="plus" size={14} /></button></div>
      <Link className="nav-item library-item" href="/"><span className="folder-dot" /> All meetings</Link>
      <Link className="nav-item library-item" href="/"><span className="folder-dot lavender" /> My meetings</Link>
      <div className="sidebar-spacer" />
      {showUpgrade && <div className="upgrade-card"><div className="upgrade-icon"><Icon name="spark" size={17} /></div><strong>Make every meeting count</strong><p>Get more from your conversations with AI-powered notes.</p><button onClick={() => window.alert("Coming soon — workspace plans")}>Explore plans <Icon name="arrow" size={14} /></button></div>}
      <div className="sidebar-footer"><Link href="/settings" className="nav-item"><Icon name="settings" size={17} /> Settings</Link><button className="nav-item help-button" onClick={() => window.alert("Help center coming soon") }><Icon name="help" size={17} /> Help center</button></div>
    </aside>
    <main className="main-area">{children}</main>
  </div>;
}
