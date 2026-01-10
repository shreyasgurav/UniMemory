"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, logout, getIdToken } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { listProjects, createProject, deleteProject, Project } from "@/lib/api";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setUser(user);
      await loadProjects();
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const loadProjects = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const data = await listProjects(token);
      setProjects(data);
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      await createProject(token, newProjectName.trim(), newProjectDesc.trim() || undefined);
      setNewProjectName("");
      setNewProjectDesc("");
      setShowCreate(false);
      await loadProjects();
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      await deleteProject(token, projectId);
      await loadProjects();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(90deg, #a6a6a6 0%, #ffffff 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(90deg, #a6a6a6 0%, #ffffff 100%)' }}>
      {/* Header - Liquid Glass Effect */}
      <header className="sticky top-0 z-40 glass-nav">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/Unimemory Name Logo NoBG.png" 
              alt="UniMemory" 
              className="h-8 w-auto"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user?.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || "User"} 
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center">
                  <span className="text-neutral-600 text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm text-neutral-700 hidden sm:block">{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Projects</h1>
            <p className="text-neutral-500 mt-1">Manage your AI memory projects</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCreate(false)}
            />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-1">Create New Project</h2>
                <p className="text-sm text-neutral-500 mb-6">Give your project a name to get started</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Project Name
                    </label>
                    <input
                      type="text"
                      placeholder="My Awesome Project"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Description <span className="text-neutral-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="A brief description of your project"
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all"
                    />
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 rounded-b-xl flex justify-end gap-3">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={creating || !newProjectName.trim()}
                  className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Project"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center animate-fade-in">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-neutral-900 mb-2">No projects yet</h3>
            <p className="text-neutral-500 mb-6">Create your first project to start adding memories</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-all"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className={`group bg-white rounded-xl border border-neutral-200 p-5 hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer animate-fade-in stagger-${Math.min(index + 1, 4)}`}
                onClick={() => router.push(`/dashboard/${project.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center group-hover:bg-neutral-200 transition-colors">
                      <svg className="w-5 h-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-neutral-900 group-hover:text-neutral-700 transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-neutral-500 mt-0.5">{project.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${project.is_active ? 'bg-green-500' : 'bg-neutral-300'}`} />
                          {project.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-xs text-neutral-400">
                          Created {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/${project.id}`);
                      }}
                      className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                    >
                      API Keys
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Start Section */}
        {projects.length > 0 && (
          <div className="mt-8 bg-white rounded-xl border border-neutral-200 p-6 animate-fade-in">
            <h3 className="text-sm font-medium text-neutral-900 mb-4">Quick Start</h3>
            <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono">
{`npm install unimemory

import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Add a memory
await client.addMemory({ 
  content: "User prefers dark mode" 
});

// Search memories
const results = await client.search("preferences");`}
              </code>
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
