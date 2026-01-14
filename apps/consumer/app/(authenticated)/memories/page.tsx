"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, FileText, MessageSquare, File, X, Tag, Clock, Sparkles, Calendar } from "lucide-react";
import { auth } from "@/lib/firebase";

interface Source {
  id: string;
  type: string;
  summary?: string;
  raw_content: any;
  created_at: string;
  memory_count?: number;
}

interface Memory {
  id: string;
  content: string;
  sector?: string;
  salience: number;
  tags: string[];
  created_at: string;
}

interface SourceDetail extends Source {
  memories: Memory[];
}

export default function MemoriesPage() {
  const [view, setView] = useState<"sources" | "memories">("sources");
  const [sources, setSources] = useState<Source[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      if (view === "sources") {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/sources?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        setSources(data);
      } else {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/memories?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        setMemories(data);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadSourceDetail = async (sourceId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/sources/${sourceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setSelectedSource(data);
    } catch (error) {
      console.error("Failed to load source detail:", error);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "chat":
        return <MessageSquare className="w-4 h-4" />;
      case "document":
        return <File className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-neutral-100 px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-6">Memories</h1>

        {/* View Toggle */}
        <div className="flex gap-3">
          <button
            onClick={() => setView("sources")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${view === "sources"
                ? "bg-neutral-900 text-white shadow-sm"
                : "bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200"
              }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Sources
          </button>
          <button
            onClick={() => setView("memories")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${view === "memories"
                ? "bg-neutral-900 text-white shadow-sm"
                : "bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200"
              }`}
          >
            <Brain className="w-4 h-4 inline mr-2" />
            Memories
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-neutral-200 rounded-xl p-5">
                  <div className="h-5 bg-neutral-100 rounded w-3/4 animate-pulse mb-3" />
                  <div className="h-4 bg-neutral-100 rounded w-full animate-pulse mb-2" />
                  <div className="h-4 bg-neutral-100 rounded w-2/3 animate-pulse" />
                </div>
              ))}
            </div>
          ) : view === "sources" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sources.length === 0 ? (
                <div className="col-span-full bg-white border border-neutral-200 rounded-xl p-16 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-neutral-300" />
                  <p className="text-neutral-700 font-medium text-lg">No sources yet</p>
                  <p className="text-sm text-neutral-500 mt-2">
                    Sources will appear when you capture chats or documents
                  </p>
                </div>
              ) : (
                sources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => loadSourceDetail(source.id)}
                    className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600 flex-shrink-0">
                        {getSourceIcon(source.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                          {source.type}
                        </span>
                      </div>
                    </div>
                    <p className="text-neutral-900 text-sm font-medium mb-2 line-clamp-3 leading-relaxed">
                      {source.summary || "No summary available"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {source.memory_count !== undefined && (
                        <>
                          <span>•</span>
                          <Brain className="w-3.5 h-3.5" />
                          <span>{source.memory_count} memories</span>
                        </>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {memories.length === 0 ? (
                <div className="col-span-full bg-white border border-neutral-200 rounded-xl p-16 text-center">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-neutral-300" />
                  <p className="text-neutral-700 font-medium text-lg">No memories yet</p>
                  <p className="text-sm text-neutral-500 mt-2">
                    Memories will be extracted from your sources automatically
                  </p>
                </div>
              ) : (
                memories.map((memory) => (
                  <div
                    key={memory.id}
                    className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 hover:shadow-md transition-all"
                  >
                    <p className="text-neutral-900 text-sm font-medium mb-3 leading-relaxed">
                      {memory.content}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {memory.sector && (
                        <span className="px-2.5 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-md font-medium">
                          {memory.sector}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500 ml-auto flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(memory.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Source Detail Modal - Split View */}
      {selectedSource && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl max-w-7xl w-full h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600">
                  {getSourceIcon(selectedSource.type)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 capitalize">
                    {selectedSource.type} Source
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {new Date(selectedSource.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSource(null)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Modal Content - Split View */}
            <div className="flex-1 overflow-hidden flex">
              {/* Left: Raw Content */}
              <div className="w-1/2 border-r border-neutral-200 overflow-y-auto bg-neutral-50">
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Raw Content
                  </h3>
                  <div className="bg-white border border-neutral-200 rounded-xl p-5 text-sm text-neutral-700">
                    {selectedSource.type === "chat" && selectedSource.raw_content.messages ? (
                      <div className="space-y-4">
                        {selectedSource.raw_content.messages.map((msg: any, idx: number) => (
                          <div key={idx} className="pb-4 border-b border-neutral-100 last:border-0 last:pb-0">
                            <div className="font-semibold text-neutral-900 mb-2 text-xs uppercase tracking-wide">
                              {msg.role}
                            </div>
                            <div className="text-neutral-700 leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-600">
                        {JSON.stringify(selectedSource.raw_content, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Summary + Memories */}
              <div className="w-1/2 overflow-y-auto bg-white">
                <div className="p-6 space-y-6">
                  {/* Summary */}
                  {selectedSource.summary && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Summary
                      </h3>
                      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                        <p className="text-sm text-neutral-700 leading-relaxed">
                          {selectedSource.summary}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Extracted Memories */}
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      Memories ({selectedSource.memories.length})
                    </h3>
                    <div className="space-y-3">
                      {selectedSource.memories.length === 0 ? (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-8 text-center">
                          <Brain className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                          <p className="text-sm text-neutral-500">No memories extracted</p>
                        </div>
                      ) : (
                        selectedSource.memories.map((memory) => (
                          <div
                            key={memory.id}
                            className="bg-white border border-neutral-200 rounded-xl p-4 hover:border-neutral-300 transition-colors"
                          >
                            <p className="text-sm text-neutral-900 leading-relaxed mb-3">
                              {memory.content}
                            </p>
                            <div className="flex items-center gap-2">
                              {memory.sector && (
                                <span className="px-2.5 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-md font-medium">
                                  {memory.sector}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
