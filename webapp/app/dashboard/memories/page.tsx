"use client";

import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listMemories, Memory } from "@/lib/api";

export default function MemoriesPage() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [sectorFilter, setSectorFilter] = useState("");
    const [offset, setOffset] = useState(0);
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

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setOffset(0);
                loadMemories(false);
            }
        });

        return () => unsubscribe();
    }, [sectorFilter]); // Reload when filter changes

    return (
        <div className="p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-neutral-900">Memories</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Browse and manage all stored semantic memories.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select
                            value={sectorFilter}
                            onChange={(e) => setSectorFilter(e.target.value)}
                            className="appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-2.5 pr-10 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all cursor-pointer"
                        >
                            <option value="">All Sectors</option>
                            <option value="personal">Personal</option>
                            <option value="professional">Professional</option>
                            <option value="technical">Technical</option>
                            <option value="preferences">Preferences</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Memories Grid/List */}
            <div className="space-y-4">
                {loading && memories.length === 0 ? (
                    // Skeleton Loader
                    Array.from({ length: 5 }).map((_, index) => (
                        <div key={`skeleton-${index}`} className="bg-white border border-neutral-100 rounded-2xl p-6 animate-pulse">
                            <div className="h-4 bg-neutral-200 rounded w-3/4 mb-4"></div>
                            <div className="flex gap-2">
                                <div className="h-6 bg-neutral-100 rounded-full w-20"></div>
                                <div className="h-6 bg-neutral-100 rounded-full w-16"></div>
                            </div>
                        </div>
                    ))
                ) : memories.length === 0 ? (
                    <div className="bg-white border border-dashed border-neutral-200 rounded-2xl p-12 text-center">
                        <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.274A11.003 11.003 0 0112 21a11.003 11.003 0 01-4.817-1.191l-.548-.274z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900">No memories found</h3>
                        <p className="text-sm text-neutral-500 mt-1 max-w-xs mx-auto">
                            {sectorFilter
                                ? `No memories found in the "${sectorFilter}" sector.`
                                : "When your AI agents store information, it will appear here."}
                        </p>
                    </div>
                ) : (
                    <>
                        {memories.map((memory) => (
                            <div
                                key={memory.id}
                                className="group bg-white border border-neutral-100 rounded-2xl p-6 hover:shadow-sm hover:border-neutral-200 transition-all duration-200"
                            >
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <p className="text-neutral-800 leading-relaxed overflow-hidden break-words">
                                            {memory.content}
                                        </p>
                                        <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-neutral-50 rounded-lg text-xs font-medium text-neutral-500">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            {Math.round(memory.salience * 100)}%
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {memory.sector && (
                                            <span className="px-2.5 py-1 bg-neutral-900 text-white text-[10px] uppercase tracking-wider font-bold rounded-md">
                                                {memory.sector}
                                            </span>
                                        )}
                                        {memory.tags.map((tag, i) => (
                                            <span key={i} className="px-2.5 py-1 bg-neutral-50 border border-neutral-100 text-neutral-600 text-[11px] rounded-lg">
                                                #{tag}
                                            </span>
                                        ))}
                                        <div className="ml-auto text-xs text-neutral-400">
                                            {new Date(memory.created_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {memories.length < total && (
                            <div className="pt-4 flex justify-center">
                                <button
                                    onClick={() => loadMemories(true)}
                                    disabled={loading}
                                    className="px-6 py-2.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-xl hover:bg-neutral-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {loading && <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />}
                                    Load More
                                </button>
                            </div>
                        )}

                        <p className="text-center text-xs text-neutral-400 mt-4">
                            Showing {memories.length} of {total} memories
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
