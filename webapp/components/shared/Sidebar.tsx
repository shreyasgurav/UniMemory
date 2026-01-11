"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "firebase/auth";

interface SidebarProps {
  user: User | null;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Determine active view from pathname
  const activeView = pathname?.includes("/keys") 
    ? "keys" 
    : pathname?.includes("/settings")
    ? "settings"
    : pathname?.includes("/docs")
    ? "docs"
    : "dashboard";

  const navItems = [
    { 
      id: "dashboard", 
      path: "/dashboard",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ), 
      label: "Dashboard" 
    },
    { 
      id: "keys", 
      path: "/dashboard/keys",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ), 
      label: "API Keys" 
    },
    { 
      id: "docs", 
      path: "/dashboard/docs",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ), 
      label: "Documentation" 
    },
    { 
      id: "settings", 
      path: "/dashboard/settings",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ), 
      label: "Settings" 
    },
  ];

  return (
    <aside className="w-56 flex flex-col fixed h-full border-r border-neutral-100 bg-white">
      {/* Logo */}
      <div className="p-4 pl-5 flex items-center gap-2.5 border-b border-neutral-100">
        <img 
          src="/Unimemory Name Logo NoBG.png" 
          alt="UniMemory"
          className="h-7 w-auto cursor-pointer"
          onClick={() => router.push("/dashboard")}
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

      {/* User Profile Section */}
      <div className="p-3 border-t border-neutral-100">
        <div className="relative">
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 rounded-xl transition-all"
          >
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || "User"} 
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center">
                <span className="text-neutral-600 text-sm font-medium">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
            )}
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium text-neutral-900 truncate text-sm">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </p>
            </div>
            <svg 
              className={`w-4 h-4 text-neutral-400 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {/* Dropdown */}
          {showProfileDropdown && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowProfileDropdown(false)}
              />
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20 animate-fade-in">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {user?.displayName || 'User'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">
                    {user?.email}
                  </p>
                </div>
        <button
                  onClick={async () => {
                    setShowProfileDropdown(false);
                    await onLogout();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
                  Sign out
        </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
