"use client";

import { useRouter } from "next/navigation";
import { User } from "firebase/auth";

interface HeaderProps {
  user: User | null;
  showProfileDropdown: boolean;
  setShowProfileDropdown: (show: boolean) => void;
  onLogout: () => void;
}

export default function Header({ user, showProfileDropdown, setShowProfileDropdown, onLogout }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="px-6 py-4 sticky top-0 z-50 glass-nav">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src="/Unimemory Name Logo NoBG.png" 
            alt="UniMemory" 
            className="h-8 w-auto cursor-pointer"
            onClick={() => router.push(user ? "/dashboard" : "/")}
          />
        </div>
        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
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
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-neutral-900 hidden sm:block">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </span>
              <svg 
                className={`w-4 h-4 text-neutral-500 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showProfileDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowProfileDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20 animate-fade-in">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-neutral-900">
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
        ) : (
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
