"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { getMemories, getMemoriesCount, Memory } from "@/lib/api";
import { Brain, Tag, Clock, ChevronRight } from "lucide-react";

export default function MemoriesPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const [data, count] = await Promise.all([
        getMemories(token, limit, offset),
        getMemoriesCount(token),
      ]);
      setMemories(data);
      setTotal(count.total);
    } catch (error) {
      console.error("Failed to load memories:", error);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) loadMemories();
    });
    return () => unsubscribe();
  }, [loadMemories]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Memories</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Long-term facts UniMemory has extracted and stored
        </p>
      </div>

      <div className="mb-6">
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 inline-block">
          <p className="text-xs text-neutral-500">Total Memories</p>
          <p className="text-lg font-semibold text-neutral-900">{total}</p>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="h-5 bg-neutral-100 rounded w-3/4 animate-pulse mb-2" />
              <div className="h-4 bg-neutral-100 rounded w-1/2 animate-pulse" />
            </div>
          ))
        ) : memories.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
            <Brain className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
            <p className="text-neutral-600 font-medium">No memories yet</p>
            <p className="text-sm text-neutral-400 mt-1">
              Memories will appear as UniMemory extracts facts from your sources
            </p>
          </div>
        ) : (
          memories.map((memory) => (
            <button
              key={memory.id}
              onClick={() => router.push(`/memories/${memory.id}`)}
              className="w-full bg-white border border-gray-100 rounded-2xl p-5 hover:border-neutral-200 hover:shadow-sm transition-all text-left group"
            >
              <p className="text-neutral-800 mb-3">{memory.content}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {memory.tags?.slice(0, 3).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-50 text-neutral-600 text-xs rounded-full">
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
                {memory.tags?.length > 3 && (
                  <span className="text-xs text-neutral-400">+{memory.tags.length - 3} more</span>
                )}
                <span className="text-xs text-neutral-400 ml-auto flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(memory.created_at).toLocaleDateString()}
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500" />
              </div>
            </button>
          ))
        )}
      </div>

      {total > limit && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-500">
            {Math.floor(offset / limit) + 1} / {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
