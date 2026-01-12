"use client";

import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listMemories, deleteMemory, Memory } from "@/lib/api";

export default function MemoriesPage() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [sectorFilter, setSectorFilter] = useState("");
    const [offset, setOffset] = useState(0);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const limit = 20;

    const loadMemories = useCallback(async (isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        try {
            const token = await getIdToken();
            if (!token) return;

            const newOffset = isLoadMore ? offset + limit : 0;
            const data = await listMemories(token, {
                limit,
                offset: newOffset,
                sector: sectorFilter || undefined
            });

            if (isLoadMore) {
                setMemories(prev => [...prev, ...data.memories]);
            } else {
                setMemories(data.memories);
            }
            setTotal(data.total);
            setOffset(newOffset);
        } catch (error) {
            console.error("Failed to load memories:", error);
        } finally {
            setLoading(false);
        }
    }, [offset, sectorFilter]);

    const handleDelete = async (memoryId: string) => {
        if (!confirm("Are you sure you want to delete this memory?")) return;

        setDeletingId(memoryId);
        try {
            const token = await getIdToken();
            if (!token) return;

            await deleteMemory(token, memoryId);
            setMemories(prev => prev.filter(m => m.id !== memoryId));
            setTotal(prev => prev - 1);
        } catch (error) {
            console.error("Failed to delete memory:", error);
            alert("Failed to delete memory. Please try again.");
        } finally {
            setDeletingId(null);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setOffset(0);
                loadMemories(false);
            }
        });

        return () => unsubscribe();
    }, [sectorFilter]);

    return (
        <div className="p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
                <div>
                    <h1 className="text-2xl font-medium text-neutral-900">Memories</h1>
                </div>

            </div>

            {/* Memories List */}
            <div className="space-y-1">
                {loading && memories.length === 0 ? (
                    Array.from({ length: 5 }).map((_, index) => (
                        <div key={`skeleton-${index}`} className="p-4 animate-pulse border-b border-neutral-50">
                            <div className="h-4 bg-neutral-100 rounded w-full mb-2"></div>
                            <div className="h-4 bg-neutral-50 rounded w-2/3"></div>
                        </div>
                    ))
                ) : memories.length === 0 ? (
                    <div className="py-20 text-center">
                        <h3 className="text-neutral-400 font-medium">No memories found</h3>
                    </div>
                ) : (
                    <>
                        {memories.map((memory) => (
                            <div
                                key={memory.id}
                                className="group flex items-center justify-between py-2 px-4 rounded-2xl hover:bg-neutral-100 transition-colors duration-200"
                            >
                                <p className="text-[15px] text-neutral-700 leading-relaxed pr-8">
                                    {memory.content}
                                </p>

                                <button
                                    onClick={() => handleDelete(memory.id)}
                                    disabled={deletingId === memory.id}
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                    title="Delete memory"
                                >
                                    {deletingId === memory.id ? (
                                        <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        ))}

                        {memories.length < total && (
                            <div className="pt-8 flex justify-center">
                                <button
                                    onClick={() => loadMemories(true)}
                                    disabled={loading}
                                    className="px-6 py-2 text-neutral-500 text-sm font-medium hover:text-neutral-900 transition-colors disabled:opacity-50"
                                >
                                    {loading ? "Loading..." : "Load more"}
                                </button>
                            </div>
                        )}

                        <p className="text-center text-[11px] text-neutral-300 mt-10">
                            {memories.length} of {total} memories
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
