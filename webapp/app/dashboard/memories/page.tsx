"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listMemories, deleteMemory, Memory } from "@/lib/api";
import {
    Users,
    Search,
    Trash2,
    User,
    Clock,
    Tag,
    ChevronRight,
    MoreVertical,
    Plus
} from "lucide-react";

export default function MemoriesPage() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const limit = 50;

    const loadMemories = useCallback(async (isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        try {
            const token = await getIdToken();
            if (!token) return;

            const newOffset = isLoadMore ? offset + limit : 0;
            const data = await listMemories(token, {
                limit,
                offset: newOffset
            });

            if (isLoadMore) {
                setMemories(prev => [...prev, ...data.memories]);
            } else {
                setMemories(data.memories);
            }
            setTotal(data.total);
            setOffset(newOffset);

            // Auto-select first user if none selected
            if (!selectedUserId && data.memories.length > 0) {
                setSelectedUserId(data.memories[0].user_id);
            }
        } catch (error) {
            console.error("Failed to load memories:", error);
        } finally {
            setLoading(false);
        }
    }, [offset, selectedUserId]);

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
    }, []);

    // Extract unique users from memories
    const uniqueUsers = useMemo(() => {
        const users = Array.from(new Set(memories.map(m => m.user_id)));
        return users.filter(id =>
            id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [memories, searchTerm]);

    // Filter memories by selected user
    const filteredMemories = useMemo(() => {
        if (!selectedUserId) return [];
        return memories.filter(m => m.user_id === selectedUserId);
    }, [memories, selectedUserId]);

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
            {/* Left Sidebar - User List */}
            <div className="w-80 border-r border-neutral-100 flex flex-col bg-neutral-50/10">
                <div className="p-6 pb-4">
                    <h1 className="text-xl font-semibold text-neutral-900 mb-4 px-1">Users</h1>
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-neutral-900 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by User ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 focus:border-neutral-300 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                    {loading && (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-14 bg-neutral-100/50 rounded-xl animate-pulse mx-3 mb-2" />
                        ))
                    )}

                    {!loading && uniqueUsers.length === 0 ? (
                        <div className="pt-10 text-center text-neutral-400">
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No users found</p>
                        </div>
                    ) : (
                        uniqueUsers.map((userId) => (
                            <button
                                key={userId}
                                onClick={() => setSelectedUserId(userId)}
                                className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 group ${selectedUserId === userId
                                        ? "bg-neutral-100 text-neutral-900"
                                        : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{userId}</p>
                                        <p className="text-[11px] opacity-60 flex items-center gap-1 mt-0.5">
                                            {memories.filter(m => m.user_id === userId).length} memories
                                        </p>
                                    </div>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-all ${selectedUserId === userId
                                            ? "translate-x-0 opacity-100 text-neutral-900"
                                            : "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
                                        }`} />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Right Content - User Memories */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                {selectedUserId ? (
                    <>
                        {/* Header */}
                        <div className="p-8 pb-4 flex items-center justify-between border-b border-neutral-50">
                            <div>
                                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1 uppercase tracking-wider font-semibold">
                                    <User className="w-3 h-3" />
                                    User Intelligence
                                </div>
                                <h2 className="text-xl font-semibold text-neutral-900">{selectedUserId}</h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-medium text-neutral-500 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5" />
                                    Last activity {new Date(filteredMemories[0]?.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-1 [&::-webkit-scrollbar]:hidden">
                            {filteredMemories.map((memory) => (
                                <div
                                    key={memory.id}
                                    className="group flex items-center justify-between py-3 px-4 rounded-2xl hover:bg-neutral-50 transition-all duration-200"
                                >
                                    <div className="flex-1 pr-8">
                                        <p className="text-[15px] text-neutral-700 leading-relaxed">
                                            {memory.content}
                                        </p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                                                <Clock className="w-3 h-3" />
                                                {new Date(memory.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                            </span>
                                            {memory.sector && (
                                                <span className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                                                    <Tag className="w-3 h-3" />
                                                    {memory.sector}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDelete(memory.id)}
                                        disabled={deletingId === memory.id}
                                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title="Delete memory"
                                    >
                                        {deletingId === memory.id ? (
                                            <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            ))}

                            {memories.length < total && (
                                <div className="pt-8 flex justify-center pb-12">
                                    <button
                                        onClick={() => loadMemories(true)}
                                        disabled={loading}
                                        className="px-6 py-2 bg-neutral-50 border border-neutral-100 rounded-xl text-neutral-600 text-sm font-medium hover:bg-neutral-100 hover:text-neutral-900 transition-all disabled:opacity-50"
                                    >
                                        {loading ? "Loading..." : "Load more user data"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                        <div className="text-center max-w-sm">
                            <div className="w-16 h-16 bg-neutral-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-neutral-200">
                                <Users className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Select a User</h3>
                            <p className="text-sm text-neutral-500">
                                Browse semantic memories extracted from your AI's interactions with specific users.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
