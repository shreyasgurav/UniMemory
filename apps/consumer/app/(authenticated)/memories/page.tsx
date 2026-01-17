"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, X, Loader2, Workflow } from "lucide-react";
import { auth } from "@/lib/firebase";
import MemoryGraph from "@/components/MemoryGraph";

interface Source {
  id: string;
  type: string;
  title?: string;
  summary?: string;
  raw_content: any;
  created_at: string;
  memory_count?: number;
  source_app?: string;
  source_metadata?: any;
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
  const [loadingSourceDetail, setLoadingSourceDetail] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'source' | 'memory', id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

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
      
      console.log('Sources data from API:', sourcesData);
      console.log('First source title:', sourcesData[0]?.title);
      
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
    // Set loading state immediately to show popup with skeleton
    const loadingSource = sources.find(s => s.id === sourceId);
    if (loadingSource) {
      setSelectedSource({
        ...loadingSource,
        memories: []
      } as SourceDetail);
      setLoadingSourceDetail(true);
    }
    
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
      setSelectedSource(null);
    } finally {
      setLoadingSourceDetail(false);
    }
  };

  const getSourceTitle = (source: Source) => {
    // Prioritize actual title from source or metadata
    if (source.title) return source.title;
    
    const metadata = source.source_metadata || {};
    if (metadata.title) return metadata.title;
    
    // Fallback to generic label (not platform name)
    if (source.type === "chat") return "Untitled Chat";
    return "Untitled " + source.type.charAt(0).toUpperCase() + source.type.slice(1);
  };

  const getPlatformName = (source: Source) => {
    const metadata = (source as any).source_metadata || {};
    
    // Use platform from metadata if available
    if (metadata.platform) return metadata.platform;
    
    // Use domain from metadata if available
    if (metadata.domain) return metadata.domain;
    
    // Extract from URL if available
    if (metadata.url) {
      try {
        const hostname = new URL(metadata.url).hostname;
        const parts = hostname.split('.');
        const domain = parts.length > 1 ? parts[parts.length - 2] : parts[0];
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      } catch {}
    }
    
    return source.source_app || "Unknown";
  };

  const getPlatformFavicon = (source: Source) => {
    const metadata = (source as any).source_metadata || {};
    
    // First, try to use favicon from source_metadata
    if (metadata.favicon) {
      return metadata.favicon;
    }
    
    // Second, try to construct favicon URL from metadata URL
    if (metadata.url) {
      try {
        const urlObj = new URL(metadata.url);
        return `${urlObj.origin}/favicon.ico`;
      } catch {}
    }
    
    // Fallback to hardcoded favicons for known platforms
    const platformName = getPlatformName(source);
    const name = platformName.toLowerCase();
    
    const knownFavicons: Record<string, string> = {
      chatgpt: "https://chat.openai.com/favicon.ico",
      openai: "https://chat.openai.com/favicon.ico",
      claude: "https://claude.ai/favicon.ico",
      gemini: "https://gemini.google.com/favicon.ico",
      bard: "https://gemini.google.com/favicon.ico",
      perplexity: "https://www.perplexity.ai/favicon.ico",
      "you.com": "https://you.com/favicon.ico",
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
        return url;
      }
    }
    
    return null;
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      setDeleting(true);
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
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-50">
      {/* Header */}
      <div className="px-8 py-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Memories</h1>
        <button
          onClick={() => setShowGraph(true)}
          className="group flex items-center gap-2 pl-2 pr-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium shadow-sm hover:bg-neutral-800 active:scale-[0.98] transition-all duration-150"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors">
            <Workflow className="w-4 h-4 text-white/90" />
          </span>
          Memory Graph
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="break-inside-avoid mb-4">
                  <div className="bg-neutral-200 rounded-xl animate-pulse" style={{ height: `${120 + Math.random() * 80}px` }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
              {sources.length === 0 && memories.length === 0 ? (
                <div className="h-[60vh] w-full flex items-center justify-center text-neutral-500">
                  No memories available.
                </div>
              ) : (
                <>
                  {sources.map((source) => {
                    const platformName = getPlatformName(source);
                    const favicon = getPlatformFavicon(source);
                    const title = getSourceTitle(source);
                    
                    return (
                      <div key={source.id} className="break-inside-avoid mb-4">
                        <div className="bg-white rounded-xl p-5 hover:shadow-lg transition-all relative group border border-neutral-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ type: 'source', id: source.id });
                            }}
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-500 z-10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => loadSourceDetail(source.id)}
                            className="text-left w-full"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {favicon ? (
                                <img 
                                  src={favicon} 
                                  alt={platformName}
                                  className="w-5 h-5 rounded"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-5 h-5 rounded bg-neutral-200 flex items-center justify-center text-neutral-600 text-xs font-semibold">
                                  {platformName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <h3 className="text-neutral-900 font-semibold text-base pr-8 flex-1">
                                {title}
                              </h3>
                            </div>
                            <p className="text-neutral-600 text-sm mb-3 leading-relaxed line-clamp-4">
                              {source.summary || "No summary available"}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                              <span>{new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              {source.memory_count !== undefined && (
                                <>
                                  <span>•</span>
                                  <span>{source.memory_count} {source.memory_count === 1 ? 'memory' : 'memories'}</span>
                                </>
                              )}
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {memories.map((memory) => (
                    <div key={memory.id} className="break-inside-avoid mb-4">
                      <div className="bg-white rounded-xl p-5 hover:shadow-lg transition-all relative group border border-neutral-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ type: 'memory', id: memory.id });
                          }}
                          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-500 z-10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <p className="text-neutral-900 text-sm font-medium mb-3 leading-relaxed pr-8 line-clamp-6">
                          {memory.content}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                          <span>{new Date(memory.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {memory.sector && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{memory.sector}</span>
                            </>
                          )}
                        </div>
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
              {loadingSourceDetail ? (
                // Skeleton Loading State
                <>
                  {/* Left: Raw Content Skeleton */}
                  <div className="w-1/2 overflow-y-auto bg-white">
                    <div className="p-6 space-y-6">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx}>
                          <div className="h-3 w-16 bg-neutral-200 rounded animate-pulse mb-2"></div>
                          <div className="space-y-2">
                            <div className="h-4 bg-neutral-200 rounded animate-pulse w-full"></div>
                            <div className="h-4 bg-neutral-200 rounded animate-pulse w-5/6"></div>
                            <div className="h-4 bg-neutral-200 rounded animate-pulse w-4/6"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Summary + Memories Skeleton */}
                  <div className="w-1/2 overflow-y-auto bg-white">
                    <div className="p-6 space-y-6">
                      {/* Summary Skeleton */}
                      <div>
                        <div className="h-4 w-20 bg-neutral-200 rounded animate-pulse mb-3"></div>
                        <div className="bg-neutral-100 rounded-xl p-4 space-y-2">
                          <div className="h-3 bg-neutral-300 rounded animate-pulse w-full"></div>
                          <div className="h-3 bg-neutral-300 rounded animate-pulse w-full"></div>
                          <div className="h-3 bg-neutral-300 rounded animate-pulse w-4/5"></div>
                        </div>
                      </div>

                      {/* Memories Skeleton */}
                      <div>
                        <div className="h-4 w-32 bg-neutral-200 rounded animate-pulse mb-3"></div>
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <div key={idx} className="bg-neutral-100 rounded-xl p-4 space-y-2">
                              <div className="h-3 bg-neutral-300 rounded animate-pulse w-full"></div>
                              <div className="h-3 bg-neutral-300 rounded animate-pulse w-5/6"></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                // Actual Content
                <>
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
                  <div className="w-1/2 overflow-y-auto bg-white">
                    <div className="p-6 space-y-6">
                      {/* Summary */}
                      {selectedSource.summary && (
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                            Summary
                          </h3>
                          <div className="bg-neutral-100 rounded-xl p-4">
                            <p className="text-sm text-neutral-700 leading-relaxed">
                              {selectedSource.summary}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Extracted Memories */}
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                          Memories ({selectedSource.memories.length})
                        </h3>
                        <div className="space-y-3">
                          {selectedSource.memories.length === 0 ? (
                            <p className="text-sm text-neutral-500">No memories extracted</p>
                          ) : (
                            selectedSource.memories.map((memory) => (
                              <div key={memory.id} className="bg-neutral-100 rounded-xl p-4">
                                <p className="text-sm text-neutral-700 leading-relaxed">
                                  {memory.content}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
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
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (<>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>) : (
                  <>Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory Graph Modal */}
      <MemoryGraph isOpen={showGraph} onClose={() => setShowGraph(false)} />
    </div>
  );
}
