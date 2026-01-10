"use client";

import { useRouter, useParams, usePathname } from "next/navigation";

interface SidebarProps {
  projectId: string;
}

export default function Sidebar({ projectId }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine active view from pathname
  const activeView = pathname?.includes("/keys") ? "keys" : "dashboard";

  const navItems = [
    { 
      id: "dashboard", 
      path: `/projects/${projectId}/dashboard`,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ), 
      label: "Dashboard" 
    },
    { 
      id: "keys", 
      path: `/projects/${projectId}/keys`,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ), 
      label: "API Keys" 
    },
  ];

  return (
    <aside className="w-56 flex flex-col fixed h-full border-r border-neutral-100 bg-white">
      {/* Logo */}
      <div className="p-4 pl-5 flex items-center gap-2.5 border-b border-neutral-100">
        <img 
          src="/Unimemory Name Logo NoBG.png" 
          alt="UniMemory"
          className="h-7 w-auto"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-all ${
                activeView === item.id 
                  ? "bg-neutral-100 text-neutral-900 font-medium" 
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-neutral-100 p-3">
        <button
          onClick={() => router.push("/projects")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 rounded-xl transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Projects</span>
        </button>
      </div>
    </aside>
  );
}
