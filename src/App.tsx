import { useState, useEffect } from "react";
import TopMenu from "../components/TopMenu";
import ChatSidebar from "../components/ChatSidebar.tsx";
import InfoPanel from "../components/InfoPanel";
import PrivacyPolicy from "../components/PrivacyPolicy.tsx";
import CommandPalette from "../components/CommandPalette";
import ClickSpark from '../components/ClickSpark';
import StatusBar from "../components/StatusBar.tsx";
import Tab2 from "../components/Tab2.tsx";
import "./editor.css";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [privacyPolicyOpen, setPrivacyPolicyOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [Tab2Open, setTab2Open] = useState(false);

  // ── Keyboard shortcuts 
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      // Open command palette with Ctrl+Shift+P or Cmd+Shift+P
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
  <ClickSpark
    sparkColor="#ffffff"
    sparkSize={10}
    sparkRadius={15}
    sparkCount={8}
    duration={400}
  >
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* ── Top menu bar ───── */}
      <TopMenu
        onOpenInfoPanel={() => setInfoPanelOpen(true)}
          onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
          onOpenTab2={()=>setTab2Open(true)}
      />
      
      {/* ── Info Panel Overlay */}
      <InfoPanel isOpen={infoPanelOpen} onClose={() => setInfoPanelOpen(false)} />
        <PrivacyPolicy isOpen={privacyPolicyOpen} onClose={() => setPrivacyPolicyOpen(false)} />
        <Tab2 isOpen={Tab2Open} onClose={() => setTab2Open(false)} />

      {/* ── Main area ──────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
              <div className="text-center">
                <button onClick={() => setInfoPanelOpen(true)} className="bg-lime-50 rounded-2xl text-1xl p-1">
                  <p className="text-amber-900 font-bold">Get started</p>
                </button>

            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div
          className={`
            shrink-0 border-l border-zinc-800/60 overflow-hidden
            transition-all duration-200 ease-out
            ${sidebarOpen ? "w-96" : "w-0"}
          `}
        >
          {sidebarOpen && (
            <ChatSidebar
              onClose={() => setSidebarOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={[
          {
            id: "toggle-sidebar",
            label: "Toggle Sidebar",
            category: "View",
            icon: "📑",
            shortcut: "Ctrl+B",
            action: () => setSidebarOpen((v) => !v),
          },
          {
            id: "open-information",
            label: "Open Information",
            category: "Settings",
            icon: "ℹ️",
            action: () => setInfoPanelOpen(true),
          },
          {
            id: "open-privacy",
            label: "Open Privacy Policies",
            category: "Settings",
            icon: "🔒",
            action: () => setPrivacyPolicyOpen(true),
          },
          
          
        ]}
      />
      </div>
  </ClickSpark>
  );
}