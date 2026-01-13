"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { getMemory, updateMemoryTags, deleteMemory, MemoryWithSources } from "@/lib/api";
import { ArrowLeft, Brain, Tag, Clock, FileText, Trash2, X, Plus } from "lucide-react";

export default function MemoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const memoryId = params?.id as string;

  const [memory, setMemory] = useState<MemoryWithSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && memoryId) {
        try {
          const token = await getIdToken();
          if (!token) return;
          const data = await getMemory(token, memoryId);
          setMemory(data);
        } catch (err: any) {
          setError(err.message || "Failed to load memory");
        } finally {
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [memoryId]);

  const handleAddTag = async () => {
    if (!newTag.trim() || !memory) return;
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const updated = await updateMemoryTags(token, memoryId, [...(memory.tags || []), newTag.trim()]);
      setMemory({ ...memory, tags: updated.tags });
      setNewTag("");
    } catch (err) {
      console.error("Failed to add tag:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!memory) return;
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const updated = await updateMemoryTags(token, memoryId, memory.tags.filter(t => t !== tagToRemove));
      setMemory({ ...memory, tags: updated.tags });
    } catch (err) {
      console.error("Failed to remove tag:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      await deleteMemory(token, memoryId);
      router.push("/memories");
    } catch (err) {
      console.error("Failed to delete:", err);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-100 rounded w-1/4" />
          <div className="h-32 bg-neutral-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !memory) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error || "Memory not found"}</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Memories
      </button>

      {/* Memory Content */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Brain className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-lg text-neutral-800">{memory.content}</p>
            <div className="flex items-center gap-3 mt-3 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {new Date(memory.created_at).toLocaleString()}
              </span>
              {memory.sector && (
                <span className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs">{memory.sector}</span>
              )}
              <span className="text-xs">Salience: {(memory.salience * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Tags</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {memory.tags?.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-100 text-neutral-700 text-sm rounded-full group">
              <Tag className="w-3.5 h-3.5" />
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                disabled={saving}
                className="ml-1 text-neutral-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            placeholder="Add a tag..."
            className="input flex-1"
          />
          <button onClick={handleAddTag} disabled={saving || !newTag.trim()} className="btn-secondary flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Linked Sources */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Linked Sources</h2>
        {memory.sources && memory.sources.length > 0 ? (
          <div className="space-y-2">
            {memory.sources.map((source) => (
              <button
                key={source.id}
                onClick={() => router.push(`/sources/${source.id}`)}
                className="w-full flex items-center gap-3 p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-neutral-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-700 truncate">
                    {source.source_metadata?.title || `${source.type} source`}
                  </p>
                  <p className="text-xs text-neutral-400">{new Date(source.created_at).toLocaleDateString()}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No linked sources</p>
        )}
      </div>

      {/* Delete */}
      <div className="bg-white border border-red-100 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-2">Delete Memory</h2>
        <p className="text-sm text-neutral-500 mb-4">This will permanently remove this memory from your account.</p>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} disabled={deleting} className="btn-danger flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="btn-ghost">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-secondary text-red-600 border-red-200 hover:bg-red-50">
            Delete Memory
          </button>
        )}
      </div>
    </div>
  );
}
