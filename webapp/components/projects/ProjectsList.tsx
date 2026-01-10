"use client";

import { useRouter } from "next/navigation";
import { Project } from "@/lib/api";

interface ProjectsListProps {
  projects: Project[];
  onCreateClick: () => void;
}

export default function ProjectsList({ projects, onCreateClick }: ProjectsListProps) {
  const router = useRouter();

  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center animate-fade-in">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-neutral-900 mb-2">No projects yet</h3>
        <p className="text-neutral-500 mb-6">Create your first project to start adding memories</p>
        <button
          onClick={onCreateClick}
          className="px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
        >
          Create Your First Project
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {projects.map((project, index) => (
        <div
          key={project.id}
          className={`group relative min-h-[180px] sm:min-h-[200px] rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white border border-gray-100 hover:border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer animate-fade-in stagger-${Math.min(index + 1, 4)} flex flex-col`}
          onClick={() => router.push(`/projects/${project.id}/dashboard`)}
        >
          {/* Arrow icon in top-right */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 group-hover:scale-110 transition-transform duration-200">
            <svg 
              className="w-5 h-5 text-neutral-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-200" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          
          {/* Project name at top-left */}
          <h3 className="font-medium text-neutral-900 group-hover:text-neutral-700 transition-colors duration-200 text-base leading-tight">
            {project.name}
          </h3>
        </div>
      ))}
    </div>
  );
}
