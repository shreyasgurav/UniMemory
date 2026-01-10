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
      await createProject(token, newProjectName.trim());
      setNewProjectName("");
      setShowCreate(false);
      await loadProjects();
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Delete this project?")) return;
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="font-semibold text-xl">UniMemory</div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Projects</h1>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              New project
            </button>
          </div>

          {/* Create project modal */}
          {showCreate && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-lg font-semibold mb-4">Create project</h2>
                <input
                  type="text"
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:border-gray-400"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProject}
                    disabled={creating || !newProjectName.trim()}
                    className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Projects list */}
          {projects.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No projects yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-100 rounded-lg p-4 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="cursor-pointer flex-1"
                      onClick={() => router.push(`/dashboard/${project.id}`)}
                    >
                      <div className="font-medium">{project.name}</div>
                      <div className="text-sm text-gray-400">
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/dashboard/${project.id}`)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        API Keys
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

