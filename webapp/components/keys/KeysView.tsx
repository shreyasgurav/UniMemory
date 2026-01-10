"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getIdToken } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { listAPIKeys, createAPIKey, revokeAPIKey, APIKey } from "@/lib/api";

interface KeysViewProps {
  projectId: string;
}

export default function KeysView({ projectId }: KeysViewProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyName, setKeyName] = useState("");

  const loadKeys = useCallback(async () => {
    if (!projectId) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      const data = await listAPIKeys(token, projectId);
      setKeys(data);
    } catch (error) {
      console.error("Failed to load keys:", error);
    }
  }, [projectId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user && projectId) {
        await loadKeys();
      }
    });
    return () => unsubscribe();
  }, [projectId, loadKeys]);

  const handleCreateKey = async () => {
    if (!projectId) return;
    setCreating(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const key = await createAPIKey(token, projectId, keyName || "API Key");
      setNewKey(key.key || null);
      setKeyName("");
      setShowCreateModal(false);
      await loadKeys();
    } catch (error) {
      console.error("Failed to create key:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      await revokeAPIKey(token, keyId);
      await loadKeys();
    } catch (error) {
      console.error("Failed to revoke key:", error);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate random placeholder name
  const generatePlaceholderName = () => {
    const adjectives = ['quick', 'lazy', 'happy', 'bright', 'calm', 'bold', 'swift', 'clever'];
    const nouns = ['fox', 'bear', 'wolf', 'hawk', 'lion', 'tiger', 'eagle', 'raven'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}-${noun}-${num}`;
  };

  const [placeholderName] = useState(generatePlaceholderName());

  return (
    <div className="p-8">
      {/* New Key Created Modal */}
      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setNewKey(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in">
            <div className="p-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-neutral-900 mb-1">API Key Created</h2>
              <p className="text-sm text-neutral-500 mb-6">
                Make sure to copy your API key now. You won't be able to see it again!
              </p>
              
              <div className="bg-neutral-900 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-sm text-neutral-100 font-mono break-all flex-1">
                    {newKey}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newKey)}
                    className="flex-shrink-0 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {copied ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-amber-800">
                    Store this key securely. For security reasons, we can't show it again.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setNewKey(null)}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
                style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold text-neutral-900">New API Key</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-neutral-500 mb-6">
                Create new API key for your organization.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Name <span className="text-neutral-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder={placeholderName}
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all"
                    autoFocus
                  />
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={creating}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">API Keys</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 text-white text-sm font-medium rounded-full transition-all flex items-center gap-2 hover:opacity-90"
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
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-neutral-400">
                  No results.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-neutral-900">{key.name}</td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-neutral-500 font-mono">{key.key_prefix}...{key.key_prefix.slice(-4)}</code>
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
                      {key.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {key.is_active && (
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        className="text-neutral-400 hover:text-red-500 transition-colors"
                        title="Revoke key"
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
    </div>
  );
}
