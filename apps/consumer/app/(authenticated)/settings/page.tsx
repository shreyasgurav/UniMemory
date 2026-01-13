"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { getSettings, updateSettings, UserSettings } from "@/lib/api";
import { Settings, Shield, Database, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await getIdToken();
          if (!token) return;
          const data = await getSettings(token);
          setSettings(data);
        } catch (error) {
          console.error("Failed to load settings:", error);
          setSettings({ ingest_enabled: true });
        } finally {
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleToggleIngest = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const updated = await updateSettings(token, { ingest_enabled: !settings.ingest_enabled });
      setSettings(updated);
    } catch (error) {
      console.error("Failed to update settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-100 rounded w-1/4" />
          <div className="h-32 bg-neutral-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Manage your memory preferences
        </p>
      </div>

      {/* Memory Ingestion */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-neutral-900">Memory Ingestion</h2>
            <p className="text-sm text-neutral-500 mt-1 mb-4">
              When enabled, UniMemory will automatically extract and store memories from your connected sources.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">
                {settings?.ingest_enabled ? "Ingestion is active" : "Ingestion is paused"}
              </span>
              <button
                onClick={handleToggleIngest}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.ingest_enabled ? "bg-green-500" : "bg-neutral-300"
                }`}
              >
                {saving ? (
                  <Loader2 className="absolute left-1/2 -translate-x-1/2 w-4 h-4 animate-spin text-white" />
                ) : (
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings?.ingest_enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Info */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-neutral-900">Privacy & Data</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Your data is stored securely and is only accessible by you. UniMemory uses your data to:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-600">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full mt-1.5" />
                Extract and store relevant memories from your sources
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full mt-1.5" />
                Generate summaries to help you understand your data
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full mt-1.5" />
                Enable semantic search across your memories
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
