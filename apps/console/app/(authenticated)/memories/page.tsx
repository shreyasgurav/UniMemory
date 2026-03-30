"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listMemories, deleteMemory, updateMemory, Memory, APIKey, listAPIKeys } from "@/lib/api";
import {
    Users,
    Trash2,
    User,
    Clock,
    Tag,
    ChevronRight,
    MoreVertical,
    Plus,
    Pencil,
    Check,
    X,
    Key,
    ChevronDown
} from "lucide-react";

export default function MemoriesPage() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
    const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("all");
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingKeys, setLoadingKeys] = useState(true);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const limit = 50;

    const loadMemories = useCallback(async (isLoadMore = false, apiKeyId?: string) => {
        if (!isLoadMore) setLoading(true);
        try {
            const token = await getIdToken();
            if (!token) return;

            const currentApiKeyId = apiKeyId ?? selectedApiKeyId;
            const newOffset = isLoadMore ? offset + limit : 0;
            const data = await listMemories(token, {
                limit,
                offset: newOffset,
                api_key_id: currentApiKeyId === "all" ? undefined : currentApiKeyId
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

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTags, setEditTags] = useState("");
    const [savingId, setSavingId] = useState<string | null>(null);

    const handleEditStart = (memory: Memory) => {
        setEditingId(memory.id);
        setEditTags((memory.tags || []).join(", "));
    };

    const handleEditSave = async (memoryId: string) => {
        setSavingId(memoryId);
        try {
            const token = await getIdToken();
            if (!token) return;

            const newTags = editTags.split(",").map(t => t.trim()).filter(Boolean);
            await updateMemory(token, memoryId, { tags: newTags });
            setMemories(prev => prev.map(m =>
                m.id === memoryId ? { ...m, tags: newTags } : m
            ));
            setEditingId(null);
        } catch (error) {
            console.error("Failed to update memory:", error);
            alert("Failed to save changes. Please try again.");
        } finally {
            setSavingId(null);
        }
    };

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
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setLoadingKeys(true);
                try {
                    const token = await getIdToken();
                    if (token) {
                        const keys = await listAPIKeys(token);
                        setApiKeys(keys);
                    }
                } catch (error) {
                    console.error("Failed to load API keys:", error);
                } finally {
                    setLoadingKeys(false);
                }

                setOffset(0);
                loadMemories(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const handleApiKeyChange = (newKeyId: string) => {
        setSelectedApiKeyId(newKeyId);
        setSelectedUserId(null);
        setOffset(0);
        loadMemories(false, newKeyId);
    };

    // Extract unique users from memories
    const uniqueUsers = useMemo(() => {
        return Array.from(new Set(memories.map(m => m.user_id)));
    }, [memories]);

    // Filter memories by selected user
    const filteredMemories = useMemo(() => {
        if (!selectedUserId) return [];
        return memories.filter(m => m.user_id === selectedUserId);
    }, [memories, selectedUserId]);

    return (
        <div className="flex min-h-full overflow-hidden bg-gray-50">
            {/* Left Sidebar - User List */}
            <div className="w-80 border-r border-neutral-100 flex flex-col bg-neutral-50/10">
                <div className="p-6 border-b border-neutral-100 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-2xl font-semibold text-neutral-900">Memories</h1>

                        {/* API Key Filter */}
                        <div className="relative min-w-[140px]">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                            <select
                                value={selectedApiKeyId}
                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                disabled={loadingKeys}
                                className="w-full pl-9 pr-8 py-2 text-xs font-medium text-neutral-600 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 focus:border-neutral-300 transition-all appearance-none disabled:opacity-50"
                            >
                                <option value="all">All</option>
                                {apiKeys.map(key => (
                                    <option key={key.id} value={key.id}>
                                        {key.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                        </div>
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
            <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
                {selectedUserId ? (
                    <>
                        {/* Header */}
                        <div className="p-8 pb-4 flex items-center justify-between border-b border-neutral-50">
                            <div>
                                <h2 className="text-xl font-semibold text-neutral-900">{selectedUserId}</h2>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-1 [&::-webkit-scrollbar]:hidden">
                            {filteredMemories.map((memory) => (
                                <div
                                    key={memory.id}
                                    className={`group flex items-start justify-between py-3 px-4 rounded-2xl transition-all duration-200 ${editingId === memory.id ? "bg-neutral-50 shadow-sm ring-1 ring-neutral-100" : "hover:bg-neutral-50"
                                        }`}
                                >
                                    <div className="flex-1 pr-8">
                                        {editingId === memory.id ? (
                                            <div className="space-y-3">
                                                <p className="text-[15px] text-neutral-700 leading-relaxed">
                                                    {memory.content}
                                                </p>
                                                <div>
                                                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5 block">Tags (comma-separated)</label>
                                                    <input
                                                        type="text"
                                                        value={editTags}
                                                        onChange={(e) => setEditTags(e.target.value)}
                                                        placeholder="e.g. important, work, personal"
                                                        className="w-full px-3 py-2 text-sm text-neutral-700 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 focus:border-neutral-300 transition-all"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleEditSave(memory.id)}
                                                        disabled={savingId === memory.id}
                                                        className="px-3 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        {savingId === memory.id ? (
                                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <Check className="w-3.5 h-3.5" />
                                                        )}
                                                        Save Tags
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        disabled={savingId === memory.id}
                                                        className="px-3 py-1.5 bg-white border border-neutral-200 text-neutral-600 text-xs font-medium rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
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
                                            </>
                                        )}
                                    </div>

                                    {!editingId && (
                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditStart(memory)}
                                                className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                                                title="Edit memory"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(memory.id)}
                                                disabled={deletingId === memory.id}
                                                className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete memory"
                                            >
                                                {deletingId === memory.id ? (
                                                    <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    )}
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
