"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { auth } from "@/lib/firebase";

interface Source {
  id: string;
  type: string;
  title?: string;
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
  const [sources, setSources] = useState<Source[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'source' | 'memory', id: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const [sourcesRes, memoriesRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/sources?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/memories?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ]);
      
      const [sourcesData, memoriesData] = await Promise.all([
        sourcesRes.json(),
        memoriesRes.json()
      ]);
      
      setSources(sourcesData);
      setMemories(memoriesData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const getSourceTitle = (source: Source) => {
    if (source.title) return source.title;
    if (source.type === "chat") return "ChatGPT";
    return source.type.charAt(0).toUpperCase() + source.type.slice(1);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const endpoint = deleteConfirm.type === 'source' 
        ? `${process.env.NEXT_PUBLIC_API_URL}/consumer/sources/${deleteConfirm.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/consumer/memories/${deleteConfirm.id}`;

      await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (deleteConfirm.type === 'source') {
        setSources(sources.filter(s => s.id !== deleteConfirm.id));
        if (selectedSource?.id === deleteConfirm.id) {
          setSelectedSource(null);
        }
      } else {
        setMemories(memories.filter(m => m.id !== deleteConfirm.id));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-neutral-100 px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Memories</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-5">
                  <div className="h-5 bg-neutral-100 rounded w-3/4 animate-pulse mb-3" />
                  <div className="h-4 bg-neutral-100 rounded w-full animate-pulse mb-2" />
                  <div className="h-4 bg-neutral-100 rounded w-2/3 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sources.length === 0 && memories.length === 0 ? (
                <div className="col-span-full bg-white rounded-xl p-16 text-center">
                  <p className="text-neutral-700 font-medium text-lg">No memories yet</p>
                  <p className="text-sm text-neutral-500 mt-2">
                    Memories will appear when you capture chats or documents
                  </p>
                </div>
              ) : (
                <>
                  {sources.map((source) => (
                    <div key={source.id} className="bg-white rounded-xl p-5 hover:shadow-md transition-all relative group">
                      <button
                        onClick={() => setDeleteConfirm({ type: 'source', id: source.id })}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => loadSourceDetail(source.id)}
                        className="text-left w-full"
                      >
                        <h3 className="text-neutral-900 font-semibold mb-2 text-base">
                          {getSourceTitle(source)}
                        </h3>
                        <p className="text-neutral-600 text-sm mb-2 line-clamp-3 leading-relaxed">
                          {source.summary || "No summary available"}
                        </p>
                        <div className="text-xs text-neutral-400">
                          {new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </button>
                    </div>
                  ))}
                  {memories.map((memory) => (
                    <div
                      key={memory.id}
                      className="bg-white rounded-xl p-5 hover:shadow-md transition-all relative group"
                    >
                      <button
                        onClick={() => setDeleteConfirm({ type: 'memory', id: memory.id })}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <p className="text-neutral-900 text-sm font-medium mb-3 leading-relaxed pr-6">
                        {memory.content}
                      </p>
                      <div className="text-xs text-neutral-400">
                        {new Date(memory.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </>
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
            <div className="px-6 py-5 flex items-center justify-between bg-white">
              <h2 className="text-xl font-semibold text-neutral-900">
                {getSourceTitle(selectedSource)}
              </h2>
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
              <div className="w-1/2 overflow-y-auto bg-white">
                <div className="p-6">
                  {selectedSource.type === "chat" && selectedSource.raw_content.messages ? (
                    <div className="space-y-6">
                      {selectedSource.raw_content.messages.map((msg: any, idx: number) => (
                        <div key={idx}>
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

              {/* Right: Summary + Memories */}
              <div className="w-1/2 overflow-y-auto bg-neutral-100">
                <div className="p-6 space-y-6">
                  {/* Summary */}
                  {selectedSource.summary && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                        Summary
                      </h3>
                      <p className="text-sm text-neutral-700 leading-relaxed">
                        {selectedSource.summary}
                      </p>
                    </div>
                  )}

                  {/* Extracted Memories */}
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                      Memories ({selectedSource.memories.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedSource.memories.length === 0 ? (
                        <p className="text-sm text-neutral-500">No memories extracted</p>
                      ) : (
                        selectedSource.memories.map((memory) => (
                          <p key={memory.id} className="text-sm text-neutral-700 leading-relaxed">
                            {memory.content}
                          </p>
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

      {/* Delete Confirmation Popup */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              Delete {deleteConfirm.type === 'source' ? 'Source' : 'Memory'}?
            </h3>
            <p className="text-sm text-neutral-600 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
