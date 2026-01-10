"use client";

import { useEffect, useState, useCallback } from "react";
import { getIdToken } from "@/lib/firebase";
import { listAPIKeys, APIKey } from "@/lib/api";

interface DashboardViewProps {
  projectId: string;
}

export default function DashboardView({ projectId }: DashboardViewProps) {
  const [keys, setKeys] = useState<APIKey[]>([]);

  const loadKeys = useCallback(async () => {
    if (!projectId) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      const data = await listAPIKeys(token, projectId);
      setKeys(data);
    } catch (error) {
      console.error("Failed to load keys:", error);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadKeys();
    }
  }, [projectId, loadKeys]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-gray-200 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-neutral-500">API Keys</p>
              <p className="text-2xl font-semibold text-neutral-900">{keys.filter(k => k.is_active).length}</p>
            </div>
          </div>
          <p className="text-xs text-neutral-400">Active keys in this project</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-gray-200 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Requests</p>
              <p className="text-2xl font-semibold text-neutral-900">
                {keys.reduce((sum, k) => sum + (k.usage_count || 0), 0)}
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-400">API calls made this month</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-gray-200 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Memories</p>
              <p className="text-2xl font-semibold text-neutral-900">0</p>
            </div>
          </div>
          <p className="text-xs text-neutral-400">Stored in this project</p>
        </div>
      </div>
    </div>
  );
}
