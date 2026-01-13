"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { getSources, getSourcesCount, Source } from "@/lib/api";
import { MessageSquare, FileText, Code, Globe, ChevronRight, Clock } from "lucide-react";

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  chat: <MessageSquare className="w-5 h-5" />,
  document: <FileText className="w-5 h-5" />,
  code: <Code className="w-5 h-5" />,
  text: <FileText className="w-5 h-5" />,
  web: <Globe className="w-5 h-5" />,
};

const SOURCE_COLORS: Record<string, string> = {
  chat: "bg-blue-50 text-blue-600",
  document: "bg-amber-50 text-amber-600",
  code: "bg-purple-50 text-purple-600",
  text: "bg-green-50 text-green-600",
  web: "bg-cyan-50 text-cyan-600",
};

function getSourceTitle(source: Source): string {
  if (source.source_metadata?.title) return source.source_metadata.title;
  if (source.source_metadata?.filename) return source.source_metadata.filename;
  if (source.type === "chat") return "Chat Conversation";
  if (source.type === "document") return "Document";
  if (source.type === "code") return "Code Snippet";
  return `${source.type.charAt(0).toUpperCase() + source.type.slice(1)} Source`;
}

export default function TimelinePage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;

      const [sourcesData, countData] = await Promise.all([
        getSources(token, limit, offset),
        getSourcesCount(token),
      ]);

      setSources(sourcesData);
      setTotal(countData.total);
    } catch (error) {
      console.error("Failed to load sources:", error);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadSources();
      }
    });
    return () => unsubscribe();
  }, [loadSources]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffHours < 48) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Timeline</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Everything UniMemory has captured and remembered
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 flex items-center gap-4">
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-xs text-neutral-500">Total Sources</p>
          <p className="text-lg font-semibold text-neutral-900">{total}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-neutral-100 rounded-xl animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-neutral-100 rounded w-1/3 animate-pulse" />
                  <div className="h-4 bg-neutral-100 rounded w-2/3 animate-pulse" />
                </div>
              </div>
            </div>
          ))
        ) : sources.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
            <p className="text-neutral-600 font-medium">No sources yet</p>
            <p className="text-sm text-neutral-400 mt-1">
              Sources will appear here when you start using UniMemory
            </p>
          </div>
        ) : (
          sources.map((source) => (
            <button
              key={source.id}
              onClick={() => router.push(`/sources/${source.id}`)}
              className="w-full bg-white border border-gray-100 rounded-2xl p-5 hover:border-neutral-200 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${SOURCE_COLORS[source.type] || "bg-neutral-100 text-neutral-600"}`}>
                  {SOURCE_ICONS[source.type] || <FileText className="w-5 h-5" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-neutral-900 truncate">
                      {getSourceTitle(source)}
                    </h3>
                    <span className="text-xs text-neutral-400 px-2 py-0.5 bg-neutral-50 rounded-full">
                      {source.type}
                    </span>
                  </div>
                  
                  {source.summary ? (
                    <p className="text-sm text-neutral-500 line-clamp-2">
                      {source.summary}
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-400 italic">
                      No summary available
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(source.created_at)}
                    </span>
                    {source.end_user_id && (
                      <span className="px-2 py-0.5 bg-neutral-50 rounded">
                        {source.end_user_id}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-500">
            {Math.floor(offset / limit) + 1} / {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
