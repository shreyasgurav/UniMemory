"use client";

import { useState } from "react";
import { History, Activity, Link2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "firebase/auth";
import Image from "next/image";

interface SidebarProps {
  user: User | null;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const activeView = pathname?.includes("/memories")
    ? "memories"
    : pathname?.includes("/activity")
      ? "activity"
      : pathname?.includes("/connectors")
        ? "connectors"
        : "memories";

  const navItems = [
    {
      id: "memories",
      path: "/memories",
      icon: <History className="w-4 h-4" strokeWidth={1.5} />,
      label: "Memories"
    },
    {
      id: "activity",
      path: "/activity",
      icon: <Activity className="w-4 h-4" strokeWidth={1.5} />,
      label: "Activity"
    },
    {
      id: "connectors",
      path: "/connectors",
      icon: <Link2 className="w-4 h-4" strokeWidth={1.5} />,
      label: "Connectors"
    },
  ];

  return (
    <aside className="w-56 flex flex-col fixed h-full border-r border-neutral-100 bg-white">
      {/* Logo */}
      <div className="p-4 pl-5 flex items-center gap-2.5 border-b border-neutral-100">
        <button onClick={() => router.push("/")} className="cursor-pointer">
          <Image
            src="/Unimemory Name Logo NoBG.png"
            alt="UniMemory"
            width={112}
            height={28}
            style={{ height: 'auto', width: 'auto' }}
            className="h-7"
            priority
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-all ${activeView === item.id
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
      <div className="p-3">
        <div className="relative">
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 rounded-xl transition-all"
          >
            {user?.photoURL && !avatarError ? (
              <Image
                src={user.photoURL}
                alt={user.displayName || "User"}
                width={28}
                height={28}
                className="w-7 h-7 rounded-full object-cover"
                unoptimized
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-7 h-7 bg-neutral-200 rounded-full flex items-center justify-center">
                <span className="text-neutral-600 text-xs font-semibold">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
            )}
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium text-neutral-900 truncate text-[13px] leading-5">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-neutral-500 truncate leading-4">
                {user?.email || ''}
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
