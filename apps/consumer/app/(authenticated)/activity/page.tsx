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
  title?: string;
  url?: string;
  platform?: string;
  source_metadata?: {
    favicon?: string;
    domain?: string;
    hostname?: string;
    [key: string]: any;
  };
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
    // UniMemory dashboard actions (deletions, etc.)
    if (event.source === "unimemory" || event.agent === "UniMemory") {
      return "UniMemory";
    }
    
    // MCP activity - check multiple fields for client type
    if (event.source === "mcp" || event.source_app === "mcp") {
      const clientType = event.agent || (event.source_metadata as any)?.client_type || "";
      const agentMap: Record<string, string> = {
        cursor: "Cursor",
        claude: "Claude Desktop",
        "claude-code": "Claude Code",
        vscode: "VS Code",
        windsurf: "Windsurf",
        cline: "Cline",
        antigravity: "Antigravity",
        gemini: "Gemini CLI"
      };
      return agentMap[clientType.toLowerCase()] || clientType || "MCP";
    }
    
    // Use platform field from backend if available
    if (event.platform) {
      return event.platform;
    }
    
    // Use domain from source_metadata if available
    if (event.source_metadata?.domain) {
      return event.source_metadata.domain;
    }
    
    // Extract from URL if available
    if (event.url) {
      try {
        const hostname = new URL(event.url).hostname;
        const parts = hostname.split('.');
        const domain = parts.length > 1 ? parts[parts.length - 2] : parts[0];
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      } catch {}
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

  const getSourceLogo = (event: ActivityEvent) => {
    const sourceName = getSourceName(event);
    
    // UniMemory logo for dashboard actions
    if (sourceName === "UniMemory") {
      return (
        <img 
          src="/unimemory-logo.png" 
          alt="UniMemory"
          className="w-8 h-8 rounded-lg object-contain"
        />
      );
    }
    
    // First, try to use favicon from source_metadata
    if (event.source_metadata?.favicon) {
      return (
        <img 
          src={event.source_metadata.favicon} 
          alt={sourceName}
          className="w-8 h-8 rounded-lg object-cover"
          onError={(e) => {
            // Fallback to letter avatar
            const target = e.currentTarget;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<div class="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-xs">${sourceName.charAt(0).toUpperCase()}</div>`;
            }
          }}
        />
      );
    }
    
    // Second, try to construct favicon URL from event URL
    if (event.url) {
      try {
        const urlObj = new URL(event.url);
        const faviconUrl = `${urlObj.origin}/favicon.ico`;
        return (
          <img 
            src={faviconUrl} 
            alt={sourceName}
            className="w-8 h-8 rounded-lg object-cover"
            onError={(e) => {
              // Fallback to letter avatar
              const target = e.currentTarget;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `<div class="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-xs">${sourceName.charAt(0).toUpperCase()}</div>`;
              }
            }}
          />
        );
      } catch {}
    }
    
    // Fallback to hardcoded favicons for known platforms
    const name = sourceName.toLowerCase();
    const knownFavicons: Record<string, string> = {
      chrome: "https://www.google.com/chrome/static/images/chrome-logo.svg",
      chatgpt: "https://chat.openai.com/favicon.ico",
      claude: "https://claude.ai/favicon.ico",
      cursor: "https://cursor.sh/favicon.ico",
      windsurf: "https://www.codeium.com/favicon.ico",
      github: "https://github.com/favicon.ico",
      stackoverflow: "https://stackoverflow.com/favicon.ico",
      reddit: "https://www.reddit.com/favicon.ico",
      twitter: "https://twitter.com/favicon.ico",
      linkedin: "https://linkedin.com/favicon.ico",
      medium: "https://medium.com/favicon.ico",
      notion: "https://notion.so/favicon.ico",
    };
    
    for (const [key, url] of Object.entries(knownFavicons)) {
      if (name.includes(key)) {
        return (
          <img 
            src={url} 
            alt={sourceName}
            className="w-8 h-8 rounded-lg object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `<div class="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-xs">${sourceName.charAt(0).toUpperCase()}</div>`;
              }
            }}
          />
        );
      }
    }
    
    // Final fallback: letter avatar
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
                
                // Get action label and color based on event type
                const getActionInfo = (type: string, toolName?: string) => {
                  // Handle MCP tool-specific actions
                  if (type === "mcp_call" && toolName) {
                    const toolActions: Record<string, { label: string; color: string; bgColor: string }> = {
                      add_source: { label: "Saved Source", color: "text-green-700", bgColor: "bg-green-50" },
                      add_memory: { label: "Saved Memory", color: "text-green-700", bgColor: "bg-green-50" },
                      search_memory: { label: "Searched", color: "text-blue-700", bgColor: "bg-blue-50" },
                      get_source: { label: "Retrieved", color: "text-purple-700", bgColor: "bg-purple-50" },
                      get_memory_context: { label: "Viewed Context", color: "text-purple-700", bgColor: "bg-purple-50" },
                    };
                    return toolActions[toolName] || { label: "MCP Call", color: "text-orange-700", bgColor: "bg-orange-50" };
                  }
                  
                  const actions: Record<string, { label: string; color: string; bgColor: string }> = {
                    source_created: { label: "Saved", color: "text-green-700", bgColor: "bg-green-50" },
                    memory_created: { label: "Added Memory", color: "text-green-700", bgColor: "bg-green-50" },
                    memory_deleted: { label: "Deleted", color: "text-red-700", bgColor: "bg-red-50" },
                    source_deleted: { label: "Deleted", color: "text-red-700", bgColor: "bg-red-50" },
                    memory_searched: { label: "Searched", color: "text-blue-700", bgColor: "bg-blue-50" },
                    memory_viewed: { label: "Viewed", color: "text-purple-700", bgColor: "bg-purple-50" },
                    source_viewed: { label: "Viewed", color: "text-purple-700", bgColor: "bg-purple-50" },
                    mcp_call: { label: "MCP Call", color: "text-orange-700", bgColor: "bg-orange-50" },
                    ingest: { label: "Ingested", color: "text-green-700", bgColor: "bg-green-50" },
                  };
                  return actions[type] || { label: type.replace(/_/g, " "), color: "text-neutral-700", bgColor: "bg-neutral-100" };
                };
                
                const actionInfo = getActionInfo(event.type, event.tool_name);
                
                return (
                  <div key={event.id} className="flex gap-4 relative">
                    {/* Timeline Node */}
                    <div className="flex flex-col items-center relative">
                      <div className="relative z-10">
                        {getSourceLogo(event)}
                      </div>
                      {index < arr.length - 1 && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px bg-neutral-200" style={{ height: 'calc(100% + 2rem)' }} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-8">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-neutral-900">
                          {sourceName}
                        </h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${actionInfo.bgColor} ${actionInfo.color}`}>
                          {actionInfo.label}
                        </span>
                      </div>
                      {event.title && (
                        <p className="text-sm font-medium text-neutral-700 mb-1">
                          {event.url ? (
                            <a 
                              href={event.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:text-neutral-900 hover:underline"
                            >
                              {event.title}
                            </a>
                          ) : (
                            event.title
                          )}
                        </p>
                      )}
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
