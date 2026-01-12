"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listAPIKeys, APIKey } from "@/lib/api";

export default function DashboardPage() {
  const [keysCount, setKeysCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      
      const keys = await listAPIKeys(token);
      setKeysCount(keys.filter(k => k.is_active).length);
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadStats();
      }
    });

    return () => unsubscribe();
  }, [loadStats]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Active API Keys</p>
          {loading ? (
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold text-neutral-900">{keysCount}</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Total Requests</p>
          <p className="text-2xl font-semibold text-neutral-900">0</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Memories Stored</p>
          <p className="text-2xl font-semibold text-neutral-900">0</p>
        </div>
      </div>

    </div>
  );
}
