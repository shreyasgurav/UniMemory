"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, logout } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.")) {
      return;
    }
    
    setDeleting(true);
    try {
      // In a real app, you'd call an API to delete the account first
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Failed to delete account:", error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
      </div>

      {/* Plan Info */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-neutral-900">Free Plan</p>
            <p className="text-sm text-neutral-500">Limited API requests and memory storage</p>
          </div>
          <span className="px-3 py-1 bg-neutral-100 text-neutral-600 text-sm font-medium rounded-full">
            Current Plan
          </span>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white border border-red-100 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-4">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-neutral-900">Delete Account</p>
            <p className="text-sm text-neutral-500">Permanently delete your account and all data.</p>
          </div>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {deleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Account"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
