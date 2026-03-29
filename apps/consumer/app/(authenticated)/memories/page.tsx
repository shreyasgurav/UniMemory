"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, X, Loader2, Workflow, ChevronDown, Plus, FolderOpen } from "lucide-react";
import { auth } from "@/lib/firebase";
import MemoryGraph from "@/components/MemoryGraph";

interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  color: string;
  status: string;
  status_note?: string;
  is_default: boolean;
  is_pinned: boolean;
  memory_count: number;
  source_count: number;
  created_at: string;
  updated_at: string;
}

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
  memory_type?: string;
  priority?: string;
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
  // Removed graphPrefetched state - no longer needed after removing prefetch

  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const loadData = useCallback(async (projectId?: string) => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      // Build query params with optional project filter
      const projectParam = projectId ? `&project_id=${projectId}` : '';

      const [sourcesRes, memoriesRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/sources?limit=50${projectParam}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store', // Prevent caching
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/memories?limit=50${projectParam}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store', // Prevent caching
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
  }, []); // Empty deps - function is stable

  // Load projects (separate from loadData to avoid dependency issues)
  const loadProjects = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      // Fire-and-forget: ensure default project exists (don't block on it)
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/projects/default/ensure`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});

      // Fetch projects immediately (don't wait for ensure)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProjects(data);

      // Don't auto-select any project - let user choose
      // They can select "All Projects" or a specific project
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  };

  // Create new project
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      const project = await res.json();
      setProjects(prev => [...prev, project]);
      setSelectedProject(project);
      setShowNewProjectModal(false);
      setNewProjectName("");
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreatingProject(false);
    }
  };

  useEffect(() => {
    loadData();
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Removed auto-reload on visibility change - it was causing graph to re-fetch and change data
  // If needed, user can manually refresh by switching projects or clicking a refresh button

  // Removed graph prefetch - it was causing double-fetch with different project filters:
  // 1st fetch (prefetch): no project_id filter → shows all 8 docs
  // 2nd fetch (graph open): with project_id filter → shows only 6 docs from that project
  // This caused the visual bug where graph changed after a few seconds

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
      console.log('Source detail from API:', data);
      console.log('Source detail title:', data.title);
      setSelectedSource(data);
    } catch (error) {
      console.error("Failed to load source detail:", error);
      setSelectedSource(null);
    } finally {
      setLoadingSourceDetail(false);
    }
  };

  const getSourceTitle = (source: Source) => {
    // Use generated title only, no fallback to tab name
    if (source.title) return source.title;

    // Fallback to generic label (not tab name from metadata)
    if (source.type === "chat") return "Untitled Chat";
    return "Untitled " + source.type.charAt(0).toUpperCase() + source.type.slice(1);
  };

  const getPlatformName = (source: Source) => {
    const metadata = (source as any).source_metadata || {};

    // For MCP sources, show the client type nicely formatted
    if (source.source_app === "mcp") {
      const clientType = metadata.client_type || metadata.mcp_client || "";
      const mcpClientNames: Record<string, string> = {
        cursor: "Cursor",
        windsurf: "Windsurf",
        claude: "Claude Desktop",
        "claude-code": "Claude Code",
        vscode: "VS Code",
        cline: "Cline",
        antigravity: "Antigravity",
      };
      return mcpClientNames[clientType.toLowerCase()] || "MCP";
    }

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
      } catch { }
    }

    return source.source_app || "Unknown";
  };

  const getPlatformFavicon = (source: Source) => {
    const metadata = (source as any).source_metadata || {};

    // Use Google Favicon API with the source URL for reliable favicon fetching
    if (metadata.url) {
      try {
        const urlObj = new URL(metadata.url);
        // Google's favicon service - reliable and fast
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
      } catch (e) {
        console.error('Invalid URL for favicon:', metadata.url);
      }
    }

    // Fallback: if no URL in metadata, return null
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
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-neutral-900">Memories</h1>

          {/* Project Selector */}
          <div className="relative">
            {projects.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-neutral-200">
                <div className="h-4 w-24 bg-neutral-200 rounded animate-pulse"></div>
                <div className="w-4 h-4 bg-neutral-200 rounded animate-pulse"></div>
              </div>
            ) : (
              <button
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium hover:border-neutral-300 hover:bg-neutral-50 transition-all"
              >
                <span className="text-neutral-900 truncate">
                  {selectedProject?.name || 'All Projects'}
                </span>
                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
              </button>
            )}

            {/* Dropdown Menu */}
            {showProjectDropdown && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1 max-h-80 overflow-y-auto">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setSelectedProject(project);
                      setShowProjectDropdown(false);
                      loadData(project.id);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-neutral-50 transition-colors ${selectedProject?.id === project.id ? 'bg-blue-50 text-blue-700' : 'text-neutral-700'
                      }`}
                  >
                    <span className="flex-1 text-left text-sm font-medium truncate">{project.name}</span>
                    <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                      {project.memory_count}
                    </span>
                  </button>
                ))}
                <div className="border-t border-neutral-100 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setShowProjectDropdown(false);
                      setShowNewProjectModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-blue-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">New Project</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowGraph(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-all"
        >
          <Workflow className="w-4 h-4 text-white/90" />
          <span>Memory Graph</span>
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
                    const title = getSourceTitle(source);
                    const metadata = (source as any).source_metadata || {};
                    const sourceUrl = metadata.url;

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
                            <h3 className="text-neutral-900 font-semibold text-base pr-8 mb-2">
                              {title}
                            </h3>
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
                              {sourceUrl ? (
                                <>
                                  <span>•</span>
                                  <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-blue-500 hover:text-blue-600 hover:underline"
                                  >
                                    {(() => {
                                      try {
                                        return new URL(sourceUrl).hostname.replace('www.', '');
                                      } catch {
                                        return 'source';
                                      }
                                    })()}
                                  </a>
                                </>
                              ) : source.source_app === "mcp" ? (
                                <>
                                  <span>•</span>
                                  <span className="text-neutral-500">{getPlatformName(source)}</span>
                                </>
                              ) : null}
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
                          {memory.memory_type && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{memory.memory_type}</span>
                            </>
                          )}
                          {memory.priority === 'core' && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 font-medium">Core</span>
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
                      {selectedSource.type === "chat" && selectedSource.raw_content?.messages ? (
                        <div className="text-neutral-700 leading-relaxed whitespace-pre-wrap text-sm">
                          {selectedSource.raw_content.messages.map((msg: any) => msg.content).join('\n\n')}
                        </div>
                      ) : typeof selectedSource.raw_content === "string" ? (
                        <div className="text-neutral-700 leading-relaxed whitespace-pre-wrap text-sm">
                          {selectedSource.raw_content}
                        </div>
                      ) : selectedSource.raw_content?.content ? (
                        <div className="text-neutral-700 leading-relaxed whitespace-pre-wrap text-sm">
                          {selectedSource.raw_content.content}
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
      <MemoryGraph isOpen={showGraph} onClose={() => setShowGraph(false)} projectId={selectedProject?.id} />

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">New Project</h3>
            <input
              type="text"
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              className="w-full px-4 py-3 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewProjectModal(false);
                  setNewProjectName("");
                }}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={!newProjectName.trim() || creatingProject}
                className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingProject && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close project dropdown */}
      {showProjectDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowProjectDropdown(false)}
        />
      )}
    </div>
  );
}
