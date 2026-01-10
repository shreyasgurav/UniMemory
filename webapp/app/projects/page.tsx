"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, logout, getIdToken } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { listProjects, createProject, Project } from "@/lib/api";
import Header from "@/components/shared/Header";
import ProjectsList from "@/components/projects/ProjectsList";
import CreateProjectModal from "@/components/projects/CreateProjectModal";

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

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

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <Header 
        user={user}
        showProfileDropdown={showProfileDropdown}
        setShowProfileDropdown={setShowProfileDropdown}
        onLogout={handleLogout}
      />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Projects</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 text-white text-sm font-medium rounded-full active:scale-[0.98] transition-all flex items-center gap-2 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        <CreateProjectModal
          show={showCreate}
          onClose={() => setShowCreate(false)}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          newProjectDesc={newProjectDesc}
          setNewProjectDesc={setNewProjectDesc}
          creating={creating}
          onCreate={handleCreateProject}
        />

        <ProjectsList 
          projects={projects}
          onCreateClick={() => setShowCreate(true)}
        />
      </main>
    </div>
  );
}
