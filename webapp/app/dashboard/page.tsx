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

      {/* Quick Start Guide */}
      <div className="mt-8 bg-white border border-gray-100 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Getting Started</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-medium shrink-0">
              1
            </div>
            <div>
              <p className="font-medium text-neutral-900">Create an API Key</p>
              <p className="text-sm text-neutral-500">Go to API Keys section and generate a new key for your application.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-medium shrink-0">
              2
            </div>
            <div>
              <p className="font-medium text-neutral-900">Install the SDK</p>
              <p className="text-sm text-neutral-500">Use npm or pip to install the UniMemory client library.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-medium shrink-0">
              3
            </div>
            <div>
              <p className="font-medium text-neutral-900">Add Memory to Your App</p>
              <p className="text-sm text-neutral-500">Use the SDK to store and retrieve memories in your application.</p>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="mt-6 bg-neutral-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm text-neutral-100 font-mono">
{`import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Add a memory
await client.addMemory({
  content: "User prefers dark mode"
});

// Search memories
const results = await client.search("preferences");`}
          </pre>
        </div>
      </div>
    </div>
  );
}
