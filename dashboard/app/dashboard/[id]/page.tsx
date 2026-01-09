"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, getIdToken } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { listAPIKeys, createAPIKey, revokeAPIKey, APIKey } from "@/lib/api";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      await loadKeys();
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, projectId]);

  const loadKeys = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const data = await listAPIKeys(token, projectId);
      setKeys(data.keys);
    } catch (error) {
      console.error("Failed to load keys:", error);
    }
  };

  const handleCreateKey = async () => {
    setCreating(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const key = await createAPIKey(token, projectId, "API Key", "live");
      setNewKey(key.key);
      await loadKeys();
    } catch (error) {
      console.error("Failed to create key:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key?")) return;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-400 hover:text-gray-600"
          >
            ← Back
          </button>
          <div className="font-semibold text-xl">API Keys</div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {/* New key modal */}
          {newKey && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-lg">
                <h2 className="text-lg font-semibold mb-2">API Key Created</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Copy this key now. You won't be able to see it again.
                </p>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center gap-2">
                  <code className="flex-1 text-sm break-all">{newKey}</code>
                  <button
                    onClick={() => copyToClipboard(newKey)}
                    className="px-3 py-1.5 text-sm bg-black text-white rounded-lg hover:bg-gray-800"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => setNewKey(null)}
                  className="w-full px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Create button */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-medium">Your API Keys</h2>
              <p className="text-sm text-gray-400">
                Use these keys to authenticate with the UniMemory API.
              </p>
            </div>
            <button
              onClick={handleCreateKey}
              disabled={creating}
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create key"}
            </button>
          </div>

          {/* Keys list */}
          {keys.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="border border-gray-100 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-sm">
                        {key.key_prefix}...
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {key.is_active ? (
                          <span className="text-green-600">Active</span>
                        ) : (
                          <span className="text-red-500">Revoked</span>
                        )}
                        {" · "}
                        Created {new Date(key.created_at).toLocaleDateString()}
                        {key.last_used_at && (
                          <>
                            {" · "}
                            Last used {new Date(key.last_used_at).toLocaleDateString()}
                          </>
                        )}
                        {key.usage_count > 0 && (
                          <>
                            {" · "}
                            {key.usage_count} requests
                          </>
                        )}
                      </div>
                    </div>
                    {key.is_active && (
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Usage example */}
          <div className="mt-8 bg-gray-50 rounded-lg p-6 border border-gray-100">
            <div className="text-sm font-medium mb-3">Quick Start</div>
            <pre className="code text-sm overflow-x-auto">
              <code className="text-gray-800">
{`# Install
npm install unimemory

# Set environment variable
export UNIMEMORY_API_KEY="your-api-key-here"

# Use in your code
import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

await client.addMemory({ content: "..." });`}
              </code>
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}

