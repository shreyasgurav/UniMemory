"use client";

import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { listAPIKeys, createAPIKey, revokeAPIKey, APIKey } from "@/lib/api";

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<APIKey | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      
      const data = await listAPIKeys(token);
      setKeys(data);
    } catch (error) {
      console.error("Failed to load API keys:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadKeys();
      }
    });

    return () => unsubscribe();
  }, [loadKeys]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      
      const key = await createAPIKey(token, newKeyName.trim());
      setNewKey(key.key);
      setShowCreateModal(false);
      setShowKeyModal(true);
      setNewKeyName("");
      await loadKeys();
    } catch (error) {
      console.error("Failed to create API key:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to create API key: ${errorMessage}`);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = (key: APIKey) => {
    setKeyToDelete(key);
    setShowDeleteModal(true);
  };

  const confirmDeleteKey = async () => {
    if (!keyToDelete) return;
    setDeleting(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      
      await revokeAPIKey(token, keyToDelete.id);
      setShowDeleteModal(false);
      setKeyToDelete(null);
      await loadKeys();
    } catch (error) {
      console.error("Failed to delete API key:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to delete API key: ${errorMessage}`);
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">API Keys</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create API Key
        </button>
      </div>

      {/* Keys Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <th className="px-6 py-4 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Key</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Created At</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Last Used</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              // Skeleton Loader
              Array.from({ length: 3 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="h-4 bg-neutral-200 rounded w-24"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-neutral-200 rounded w-32"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-neutral-200 rounded w-20"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-neutral-200 rounded w-20"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-6 bg-neutral-200 rounded-full w-16"></div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="h-5 w-5 bg-neutral-200 rounded ml-auto"></div>
                  </td>
                </tr>
              ))
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-neutral-400">
                  No API keys yet. Create one to get started.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-neutral-900">{key.name}</td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-neutral-500 font-mono">{key.key_prefix}</code>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    {new Date(key.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    {key.last_used_at 
                      ? new Date(key.last_used_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Never'
                    }
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      key.is_active 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-neutral-100 text-neutral-500'
                    }`}>
                      {key.is_active ? 'Active' : 'Deleted'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {key.is_active && (
                      <button
                        onClick={() => handleRevokeKey(key)}
                        className="text-neutral-400 hover:text-red-500 transition-colors"
                        title="Delete key"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Create API Key</h2>
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production Key"
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName("");
                }}
                className="flex-1 px-4 py-2.5 text-neutral-700 bg-neutral-100 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={creating || !newKeyName.trim()}
                className="flex-1 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Key"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Key Modal */}
      {showKeyModal && newKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg animate-fade-in">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">API Key Created</h2>
            <p className="text-sm text-neutral-500 mb-4">
              Make sure to copy your API key now. You won't be able to see it again!
            </p>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                <code className="text-sm font-mono text-neutral-900 break-all flex-1">
                  {newKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newKey)}
                  className="shrink-0 p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
                  title={copied ? "Copied!" : "Copy to clipboard"}
                >
                  {copied ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
              onClick={() => {
                setShowKeyModal(false);
                setNewKey(null);
                setCopied(false);
              }}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && keyToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">Delete API Key?</h2>
            <p className="text-sm text-neutral-500 mb-4">
              Are you sure you want to delete <span className="font-medium text-neutral-900">"{keyToDelete.name}"</span>? This action cannot be undone and any applications using this key will stop working immediately.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setKeyToDelete(null);
                }}
                disabled={deleting}
                className="px-4 py-2 text-neutral-700 bg-neutral-100 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteKey}
                disabled={deleting}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Key"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
