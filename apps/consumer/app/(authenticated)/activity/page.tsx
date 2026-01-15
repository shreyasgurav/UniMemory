"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { auth } from "@/lib/firebase";

interface ActivityEvent {
  id: string;
  type: string;
  source?: string;
  source_app?: string;
  agent?: string;
  memory_count?: number;
  details?: string;
  raw_preview?: string;
  tool_name?: string;
  created_at: string;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadActivity = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!loading && events.length > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [loading, events.length]);

  const getSourceName = (event: ActivityEvent) => {
    // MCP activity
    if (event.source === "mcp" && event.agent) {
      const agentMap: Record<string, string> = {
        cursor: "Cursor",
        claude: "Claude Desktop",
        vscode: "VS Code",
        windsurf: "Windsurf",
        cline: "Cline",
        gemini: "Gemini CLI"
      };
      return agentMap[event.agent] || event.agent;
    }
    
    // Legacy source detection
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
        <img 
          src="https://chat.openai.com/favicon.ico" 
          alt="ChatGPT"
          className="w-8 h-8 rounded-lg"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310A37F'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    if (name.includes("claude")) {
      return (
        <img 
          src="https://claude.ai/favicon.ico" 
          alt="Claude"
          className="w-8 h-8 rounded-lg"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23CC9B7A'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    if (name.includes("cursor")) {
      return (
        <img 
          src="https://cursor.sh/favicon.ico" 
          alt="Cursor"
          className="w-8 h-8 rounded-lg"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23000000'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    if (name.includes("windsurf")) {
      return (
        <img 
          src="https://www.codeium.com/favicon.ico" 
          alt="Windsurf"
          className="w-8 h-8 rounded-lg"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2309B6A2'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    if (name.includes("chrome")) {
      return (
        <img 
          src="https://www.google.com/chrome/static/images/chrome-logo.svg" 
          alt="Chrome Extension"
          className="w-8 h-8 rounded-lg"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234285F4'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-xs">
        {sourceName.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-50">
      {/* Header */}
      <div className="px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Activity</h1>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="w-full flex justify-center pl-0 md:pl-56 lg:pl-64">
          <div className="w-full max-w-2xl">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 relative">
                  <div className="flex flex-col items-center relative">
                    <div className="w-8 h-8 rounded-lg bg-neutral-200 animate-pulse relative z-10" />
                    {i < 4 && (
                      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px bg-neutral-200 animate-pulse" style={{ height: 'calc(100% + 2rem)' }} />
                    )}
                  </div>
                  <div className="flex-1 pb-8">
                    <div className="h-5 bg-neutral-200 rounded w-1/3 animate-pulse mb-2" />
                    <div className="h-4 bg-neutral-200 rounded w-2/3 animate-pulse mb-2" />
                    <div className="h-3 bg-neutral-200 rounded w-1/4 animate-pulse" />
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
              {([...events]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              ).map((event, index, arr) => {
                const sourceName = getSourceName(event);
                const rawPreview = event.details || event.raw_preview || "";
                const truncatedPreview = rawPreview.length > 100 ? rawPreview.substring(0, 100) + "..." : rawPreview;
                
                return (
                  <div key={event.id} className="flex gap-4 relative">
                    {/* Timeline Node */}
                    <div className="flex flex-col items-center relative">
                      <div className="relative z-10">
                        {getSourceLogo(sourceName)}
                      </div>
                      {index < arr.length - 1 && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px bg-neutral-200" style={{ height: 'calc(100% + 2rem)' }} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-8">
                      <div className="flex items-baseline gap-2 mb-1">
                        <h3 className="text-base font-semibold text-neutral-900">
                          {sourceName}
                        </h3>
                        {event.memory_count !== undefined && event.memory_count > 0 && (
                          <span className="text-sm text-neutral-500">
                            {event.memory_count} {event.memory_count === 1 ? "memory" : "memories"}
                          </span>
                        )}
                      </div>
                      {truncatedPreview && (
                        <p className="text-sm text-neutral-600 mb-2 leading-relaxed">
                          {truncatedPreview}
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
    </div>
  );
}
