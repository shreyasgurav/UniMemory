"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";
import { Copy, Check, ExternalLink, Zap, Terminal, Settings } from "lucide-react";

const MCP_URL = "https://unimemory.up.railway.app/api/v1/mcp";

interface MCPToken {
  id: string;
  name: string;
  client_type: string;
  token: string;
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export default function MCPSetupPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<MCPToken[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("cursor");
  const [copied, setCopied] = useState<string | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setIsAuthenticated(true);
      await fetchTokens();
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const fetchTokens = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens || []);
      }
    } catch (error) {
      console.error("Failed to fetch tokens:", error);
    }
  };

  const createToken = async (clientType: string) => {
    setCreatingToken(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_type: clientType }),
      });
      if (response.ok) {
        await fetchTokens();
      }
    } catch (error) {
      console.error("Failed to create token:", error);
    }
    setCreatingToken(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getActiveToken = () => {
    return tokens.find(t => t.is_active && (t.client_type === selectedClient || t.client_type === "custom")) || tokens[0];
  };

  const getConfig = (tokenValue: string) => {
    const configs: Record<string, string> = {
      cursor: JSON.stringify({
        mcpServers: {
          unimemory: {
            url: MCP_URL,
            headers: {
              Authorization: `Bearer ${tokenValue}`
            }
          }
        }
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          unimemory: {
            url: MCP_URL,
            headers: {
              Authorization: `Bearer ${tokenValue}`
            }
          }
        }
      }, null, 2),
      windsurf: JSON.stringify({
        mcpServers: {
          unimemory: {
            url: MCP_URL,
            headers: {
              Authorization: `Bearer ${tokenValue}`
            }
          }
        }
      }, null, 2),
      vscode: JSON.stringify({
        mcpServers: {
          unimemory: {
            url: MCP_URL,
            headers: {
              Authorization: `Bearer ${tokenValue}`
            }
          }
        }
      }, null, 2),
    };
    return configs[selectedClient] || configs.cursor;
  };

  const clients = [
    { id: "cursor", name: "Cursor", icon: "⚡" },
    { id: "claude", name: "Claude Desktop", icon: "🤖" },
    { id: "windsurf", name: "Windsurf", icon: "🏄" },
    { id: "vscode", name: "VS Code", icon: "💻" },
  ];

  const getConfigPath = () => {
    const paths: Record<string, string> = {
      cursor: "~/.cursor/mcp.json",
      claude: "~/Library/Application Support/Claude/claude_desktop_config.json",
      windsurf: "Settings → MCP Servers → Add URL",
      vscode: "Settings → MCP Configuration",
    };
    return paths[selectedClient] || paths.cursor;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  const activeToken = getActiveToken();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <Image
            src="/Unimemory Name Logo NoBG.png"
            alt="UniMemory"
            width={200}
            height={60}
            className="mx-auto mb-6"
            priority
          />
          <h1 className="text-3xl font-semibold text-neutral-900 mb-3">
            Connect Your AI Assistant
          </h1>
          <p className="text-lg text-neutral-500 max-w-xl mx-auto">
            Give your AI assistant access to your memories with MCP (Model Context Protocol)
          </p>
        </div>

        {/* Quick Install */}
        <div className="bg-neutral-50 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">Quick Install</h2>
              <p className="text-sm text-neutral-500">One command to connect</p>
            </div>
          </div>

          {!activeToken ? (
            <div className="text-center py-8">
              <p className="text-neutral-600 mb-4">Create a token to get started</p>
              <button
                onClick={() => createToken(selectedClient)}
                disabled={creatingToken}
                className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50"
              >
                {creatingToken ? "Creating..." : "Create MCP Token"}
              </button>
            </div>
          ) : (
            <>
              <div className="bg-neutral-900 rounded-xl p-4 mb-4">
                <code className="text-green-400 text-sm break-all">
                  npx -y install-mcp@latest {MCP_URL} --client {selectedClient} --oauth=yes
                </code>
              </div>
              <button
                onClick={() => copyToClipboard(`npx -y install-mcp@latest ${MCP_URL} --client ${selectedClient} --oauth=yes`, "quick-install")}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium hover:bg-neutral-50"
              >
                {copied === "quick-install" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied === "quick-install" ? "Copied!" : "Copy Command"}
              </button>
            </>
          )}
        </div>

        {/* Manual Configuration */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-neutral-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">Manual Configuration</h2>
              <p className="text-sm text-neutral-500">For advanced users</p>
            </div>
          </div>

          {/* Client Selector */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedClient === client.id
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                <span className="mr-2">{client.icon}</span>
                {client.name}
              </button>
            ))}
          </div>

          {activeToken ? (
            <>
              {/* Config Path */}
              <div className="mb-4">
                <p className="text-sm text-neutral-500 mb-2">
                  Add to <code className="bg-neutral-100 px-2 py-1 rounded text-neutral-700">{getConfigPath()}</code>
                </p>
              </div>

              {/* Config JSON */}
              <div className="relative">
                <pre className="bg-neutral-900 text-neutral-100 rounded-xl p-4 overflow-x-auto text-sm">
                  {getConfig(activeToken.token)}
                </pre>
                <button
                  onClick={() => copyToClipboard(getConfig(activeToken.token), "config")}
                  className="absolute top-3 right-3 p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700"
                >
                  {copied === "config" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                </button>
              </div>

              {/* Token Info */}
              <div className="mt-6 p-4 bg-neutral-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Your MCP Token</p>
                    <p className="text-xs text-neutral-500 font-mono mt-1">{activeToken.token.substring(0, 20)}...</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(activeToken.token, "token")}
                    className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm hover:bg-neutral-50"
                  >
                    {copied === "token" ? "Copied!" : "Copy Token"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-neutral-500">
              Create a token above to see configuration
            </div>
          )}
        </div>

        {/* Your Tokens */}
        {tokens.length > 0 && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-8">
            <h2 className="text-xl font-semibold text-neutral-900 mb-6">Your MCP Tokens</h2>
            <div className="space-y-3">
              {tokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                  <div>
                    <p className="font-medium text-neutral-900">{token.name}</p>
                    <p className="text-sm text-neutral-500">
                      {token.usage_count} uses • Created {new Date(token.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      token.is_active ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"
                    }`}>
                      {token.is_active ? "Active" : "Revoked"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back to Dashboard */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push("/")}
            className="text-neutral-500 hover:text-neutral-700 text-sm"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
