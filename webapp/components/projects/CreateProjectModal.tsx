"use client";

interface CreateProjectModalProps {
  show: boolean;
  onClose: () => void;
  newProjectName: string;
  setNewProjectName: (name: string) => void;
  newProjectDesc: string;
  setNewProjectDesc: (desc: string) => void;
  creating: boolean;
  onCreate: () => void;
}

export default function CreateProjectModal({
  show,
  onClose,
  newProjectName,
  setNewProjectName,
  newProjectDesc,
  setNewProjectDesc,
  creating,
  onCreate,
}: CreateProjectModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
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
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={creating || !newProjectName.trim()}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
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
  );
}
