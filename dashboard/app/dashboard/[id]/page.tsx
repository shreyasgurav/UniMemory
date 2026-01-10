"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, getIdToken } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { listAPIKeys, createAPIKey, revokeAPIKey, APIKey } from "@/lib/api";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.id as string;
  
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyName, setKeyName] = useState("Production Key");

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
    if (!projectId) {
      router.push("/dashboard");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      await loadKeys();
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, projectId, loadKeys]);

  const handleCreateKey = async () => {
    if (!projectId) return;
    setCreating(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const key = await createAPIKey(token, projectId, keyName || "API Key");
      setNewKey(key.key || null);
      setKeyName("Production Key");
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

  if (!projectId || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(90deg, #a6a6a6 0%, #ffffff 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(90deg, #a6a6a6 0%, #ffffff 100%)' }}>
      {/* Header - Liquid Glass Effect */}
      <header className="sticky top-0 z-40 glass-nav">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Back to Projects</span>
            </button>
          </div>
          <img 
            src="/Unimemory Name Logo NoBG.png" 
            alt="UniMemory" 
            className="h-8 w-auto"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* New Key Modal */}
        {newKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setNewKey(null)}
            />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in overflow-hidden">
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
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
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
              
              <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100">
                <button
                  onClick={() => setNewKey(null)}
                  className="w-full px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-neutral-200 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">API Keys</h1>
              <p className="text-neutral-500">Manage API keys for this project</p>
            </div>
          </div>
        </div>

        {/* Create Key Section */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Key Name
              </label>
              <input
                type="text"
                placeholder="e.g., Production Key"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all"
              />
            </div>
            <button
              onClick={handleCreateKey}
              disabled={creating}
              className="px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 justify-center"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Key
                </>
              )}
            </button>
          </div>
        </div>

        {/* Keys List */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden animate-fade-in">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h3 className="font-medium text-neutral-900">Your API Keys</h3>
            <p className="text-sm text-neutral-500 mt-0.5">Use these keys to authenticate API requests</p>
          </div>
          
          {keys.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <p className="text-neutral-500 mb-1">No API keys yet</p>
              <p className="text-sm text-neutral-400">Create your first key to start using the API</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {keys.map((key, index) => (
                <div
                  key={key.id}
                  className={`px-6 py-4 hover:bg-neutral-50 transition-colors animate-fade-in stagger-${Math.min(index + 1, 4)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${key.is_active ? 'bg-green-500' : 'bg-neutral-300'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-neutral-900">{key.key_prefix}</code>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            key.is_active 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-neutral-100 text-neutral-500'
                          }`}>
                            {key.is_active ? 'Active' : 'Revoked'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                          <span>{key.name}</span>
                          <span>•</span>
                          <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                          {key.last_used_at && (
                            <>
                              <span>•</span>
                              <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                            </>
                          )}
                          {(key.usage_count || 0) > 0 && (
                            <>
                              <span>•</span>
                              <span>{key.usage_count} requests</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {key.is_active && (
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage Example */}
        <div className="mt-8 bg-white rounded-xl border border-neutral-200 overflow-hidden animate-fade-in">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h3 className="font-medium text-neutral-900">Quick Start</h3>
            <p className="text-sm text-neutral-500 mt-0.5">Use your API key in your applications</p>
          </div>
          <div className="p-6">
            <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono">
{`# Set your API key
export UNIMEMORY_API_KEY="your-api-key-here"

# JavaScript/TypeScript
import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Add a memory
await client.addMemory({
  content: "User prefers dark mode",
  metadata: { category: "preferences" }
});

// Search memories
const results = await client.search("user preferences");`}
              </code>
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
