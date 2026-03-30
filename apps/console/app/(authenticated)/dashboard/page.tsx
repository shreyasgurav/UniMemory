"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listAPIKeys, getDashboardStats, DashboardStats } from "@/lib/api";

export default function DashboardPage() {
  const [keysCount, setKeysCount] = useState(0);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      
      const [keys, dashboardStats] = await Promise.all([
        listAPIKeys(token),
        getDashboardStats(token)
      ]);
      
      setKeysCount(keys.filter(k => k.is_active).length);
      setStats(dashboardStats);
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
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Active API Keys</p>
          {loading ? (
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold text-neutral-900">{keysCount}</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Memories Stored</p>
          {loading ? (
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold text-neutral-900">{stats?.total_memories ?? 0}</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Sources Ingested</p>
          {loading ? (
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold text-neutral-900">{stats?.total_sources ?? 0}</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">End Users</p>
          {loading ? (
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold text-neutral-900">{stats?.total_end_users ?? 0}</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <p className="text-sm text-neutral-500 mb-2">Requests (24h / 7d)</p>
          {loading ? (
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold text-neutral-900">
              {stats?.requests_24h ?? 0}
              <span className="text-sm font-normal text-neutral-400 ml-1">/ {stats?.requests_7d ?? 0}</span>
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
