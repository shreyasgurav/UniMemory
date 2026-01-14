"use client";

import { useState, useEffect } from "react";
import { Brain, FileText, MessageSquare, File, X, Tag, Clock, Sparkles } from "lucide-react";
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

  useEffect(() => {
    loadData();
  }, [view]);

  const loadData = async () => {
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
  };

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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Memories</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Browse sources and extracted memories</p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setView("sources")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === "sources"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Sources
          </button>
          <button
            onClick={() => setView("memories")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === "memories"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            <Brain className="w-4 h-4 inline mr-2" />
            Atomic Memories
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
                  <div className="h-5 bg-neutral-100 rounded w-3/4 animate-pulse mb-2" />
                  <div className="h-4 bg-neutral-100 rounded w-1/2 animate-pulse" />
                </div>
              ))}
            </div>
          ) : view === "sources" ? (
            <div className="space-y-3">
              {sources.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
                  <FileText className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
                  <p className="text-neutral-600 font-medium">No sources yet</p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Sources will appear when you capture chats, documents, or web content
                  </p>
                </div>
              ) : (
                sources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => loadSourceDetail(source.id)}
                    className="w-full bg-white border border-gray-100 rounded-xl p-5 hover:border-neutral-200 hover:shadow-sm transition-all text-left group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600 flex-shrink-0">
                        {getSourceIcon(source.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-neutral-500 uppercase">
                            {source.type}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {new Date(source.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-neutral-800 text-sm line-clamp-2">
                          {source.summary || "No summary available"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {memories.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
                  <Brain className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
                  <p className="text-neutral-600 font-medium">No memories yet</p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Memories will be extracted from your sources automatically
                  </p>
                </div>
              ) : (
                memories.map((memory) => (
                  <div
                    key={memory.id}
                    className="bg-white border border-gray-100 rounded-xl p-5"
                  >
                    <p className="text-neutral-800 mb-3">{memory.content}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {memory.sector && (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-xs rounded-full flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {memory.sector}
                        </span>
                      )}
                      {memory.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-neutral-50 text-neutral-600 text-xs rounded-full flex items-center gap-1"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                      <span className="text-xs text-neutral-400 ml-auto flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(memory.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Source Detail Modal */}
      {selectedSource && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600">
                  {getSourceIcon(selectedSource.type)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 capitalize">
                    {selectedSource.type} Source
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {new Date(selectedSource.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSource(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Summary */}
                {selectedSource.summary && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      AI Summary
                    </h3>
                    <p className="text-sm text-neutral-700 bg-purple-50 rounded-lg p-4">
                      {selectedSource.summary}
                    </p>
                  </div>
                )}

                {/* Raw Content */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Raw Content
                  </h3>
                  <div className="bg-neutral-50 rounded-lg p-4 text-sm text-neutral-700 max-h-64 overflow-y-auto">
                    {selectedSource.type === "chat" && selectedSource.raw_content.messages ? (
                      <div className="space-y-3">
                        {selectedSource.raw_content.messages.map((msg: any, idx: number) => (
                          <div key={idx} className="flex gap-2">
                            <span className="font-semibold text-neutral-900 min-w-[80px]">
                              {msg.role}:
                            </span>
                            <span>{msg.content}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {JSON.stringify(selectedSource.raw_content, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>

                {/* Extracted Memories */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-500" />
                    Extracted Memories ({selectedSource.memories.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedSource.memories.length === 0 ? (
                      <p className="text-sm text-neutral-500 italic">No memories extracted</p>
                    ) : (
                      selectedSource.memories.map((memory) => (
                        <div
                          key={memory.id}
                          className="bg-white border border-neutral-200 rounded-lg p-3"
                        >
                          <p className="text-sm text-neutral-800">{memory.content}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {memory.sector && (
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-xs rounded-full">
                                {memory.sector}
                              </span>
                            )}
                            {memory.tags?.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
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
      )}
    </div>
  );
}
