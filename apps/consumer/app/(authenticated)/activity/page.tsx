"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";

interface ActivityEvent {
  id: string;
  type: string;
  source?: string;
  source_app?: string;
  agent?: string;
  memory_count?: number;
  details?: string;
  created_at: string;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, []);

  const loadActivity = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/activity?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setEvents([]);
        return;
      }
      const data = await response.json().catch(() => ({ events: [] }));
      const items = Array.isArray(data?.events) ? (data.events as ActivityEvent[]) : [];
      setEvents(items);
    } catch (error) {
      console.error("Failed to load activity:", error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const getSourceName = (event: ActivityEvent) => {
    const sourceApp = event.source_app || event.source || "";
    if (sourceApp.includes("chatgpt") || sourceApp.includes("chat")) return "ChatGPT";
    if (sourceApp.includes("claude")) return "Claude";
    if (sourceApp.includes("cursor")) return "Cursor";
    if (sourceApp.includes("chrome")) return "Chrome Extension";
    if (event.agent) return event.agent;
    return "Unknown";
  };

  const getSourceLogo = (sourceName: string) => {
    const name = sourceName.toLowerCase();
    if (name.includes("chatgpt")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-[#10A37F] flex items-center justify-center text-white font-semibold text-sm">
          GPT
        </div>
      );
    }
    if (name.includes("claude")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-[#CC9B7A] flex items-center justify-center text-white font-semibold text-sm">
          C
        </div>
      );
    }
    if (name.includes("cursor")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center text-white font-semibold text-sm">
          ⌘
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-sm">
        {sourceName.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-neutral-100 px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Activity</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 pb-8">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg bg-neutral-200 animate-pulse" />
                    {i < 4 && <div className="w-0.5 flex-1 bg-neutral-200 mt-2" />}
                  </div>
                  <div className="flex-1 pt-2">
                    <div className="h-5 bg-neutral-200 rounded w-1/3 animate-pulse mb-2" />
                    <div className="h-4 bg-neutral-200 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (events?.length ?? 0) === 0 ? (
            <div className="bg-white rounded-xl p-16 text-center">
              <p className="text-neutral-700 font-medium text-lg">No activity yet</p>
              <p className="text-sm text-neutral-500 mt-2">
                Activity will appear as you capture sources and memories
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {(events || []).map((event, index) => {
                const sourceName = getSourceName(event);
                return (
                  <div key={event.id} className="flex gap-4 pb-8 last:pb-0">
                    {/* Timeline Node */}
                    <div className="flex flex-col items-center">
                      {getSourceLogo(sourceName)}
                      {index < events.length - 1 && (
                        <div className="w-0.5 flex-1 bg-neutral-200 mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pt-2">
                      <h3 className="text-base font-semibold text-neutral-900 mb-1">
                        {sourceName}
                      </h3>
                      {event.memory_count !== undefined && event.memory_count > 0 && (
                        <p className="text-sm text-neutral-600 mb-1">
                          {event.memory_count} {event.memory_count === 1 ? "memory" : "memories"} added
                        </p>
                      )}
                      <p className="text-xs text-neutral-400">
                        {new Date(event.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
