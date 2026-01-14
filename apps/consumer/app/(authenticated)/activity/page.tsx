"use client";

import { useState, useEffect } from "react";
import { Activity as ActivityIcon, FileText, Brain, Chrome, Code, Clock } from "lucide-react";
import { auth } from "@/lib/firebase";

interface ActivityEvent {
  id: string;
  type: string;
  source?: string;
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

  const getEventIcon = (event: ActivityEvent) => {
    if (event.type === "source_created") return <FileText className="w-4 h-4" />;
    if (event.type === "ingest") return <Brain className="w-4 h-4" />;
    if (event.source === "chrome_extension") return <Chrome className="w-4 h-4" />;
    if (event.agent) return <Code className="w-4 h-4" />;
    return <ActivityIcon className="w-4 h-4" />;
  };

  const getEventColor = (event: ActivityEvent) => {
    if (event.type === "source_created") return "bg-blue-100 text-blue-600";
    if (event.type === "ingest") return "bg-purple-100 text-purple-600";
    if (event.agent) return "bg-green-100 text-green-600";
    return "bg-neutral-100 text-neutral-600";
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-neutral-900">Activity</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
                  <div className="h-5 bg-neutral-100 rounded w-3/4 animate-pulse mb-2" />
                  <div className="h-4 bg-neutral-100 rounded w-1/2 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (events?.length ?? 0) === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
              <ActivityIcon className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
              <p className="text-neutral-600 font-medium">No activity yet</p>
              <p className="text-sm text-neutral-400 mt-1">
                Activity will appear as you capture sources and use memory-powered agents
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(events || []).map((event) => (
                <div
                  key={event.id}
                  className="bg-white border border-gray-100 rounded-xl p-5 hover:border-neutral-200 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getEventColor(event)}`}>
                      {getEventIcon(event)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-neutral-900">
                          {event.type === "source_created" && "Source Captured"}
                          {event.type === "ingest" && "Memories Extracted"}
                          {event.type === "agent_use" && "Agent Used Memory"}
                        </span>
                        {event.source && (
                          <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full">
                            {event.source}
                          </span>
                        )}
                        {event.agent && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-600 text-xs rounded-full">
                            {event.agent}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-600">{event.details}</p>
                      {event.memory_count !== undefined && event.memory_count > 0 && (
                        <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
                          <Brain className="w-3 h-3" />
                          {event.memory_count} {event.memory_count === 1 ? "memory" : "memories"}
                        </p>
                      )}
                      <p className="text-xs text-neutral-400 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
