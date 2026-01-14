"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, X, Copy, Check } from "lucide-react";
import { auth } from "@/lib/firebase";

interface MCPToken {
  id: string;
  name: string;
  client_type: string;
  is_active: boolean;
  last_used_at?: string;
  usage_count: number;
  created_at: string;
}

interface MCPClient {
  id: string;
  name: string;
  description: string;
}

const MCP_CLIENTS: MCPClient[] = [
  { id: "cursor", name: "Cursor", description: "AI-powered code editor" },
  { id: "claude", name: "Claude Desktop", description: "Anthropic's Claude assistant" },
  { id: "vscode", name: "VS Code", description: "Visual Studio Code with MCP" },
  { id: "windsurf", name: "Windsurf", description: "Codeium's AI IDE" },
  { id: "cline", name: "Cline", description: "Terminal-based AI assistant" },
  { id: "gemini", name: "Gemini CLI", description: "Google's Gemini in terminal" },
];

export default function ConnectorsPage() {
  const [tokens, setTokens] = useState<MCPToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<{ 
    token: string; 
    install_command: string;
    cursor_deep_link?: string;
    npx_command?: string;
    mcp_url: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [installMethod, setInstallMethod] = useState<"one-click" | "manual">("one-click");

  const loadTokens = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens || []);
      }
    } catch (error) {
      console.error("Failed to load MCP tokens:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const createToken = async (clientType: string) => {
    setCreating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_type: clientType }),
      });

      if (response.ok) {
        const data = await response.json();
        setCreatedToken({
          token: data.token,
          install_command: data.install_command,
          cursor_deep_link: data.cursor_deep_link,
          npx_command: data.npx_command,
          mcp_url: data.mcp_url,
        });
        loadTokens();
      }
    } catch (error) {
      console.error("Failed to create MCP token:", error);
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (tokenId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens/${tokenId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      loadTokens();
    } catch (error) {
      console.error("Failed to revoke token:", error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isClientConnected = (clientId: string) => {
    return tokens.some((t) => t.client_type === clientId && t.is_active);
  };

  const getConnectorLogo = (id: string, name: string) => {
    const idLower = id.toLowerCase();
    
    if (idLower.includes("chrome")) {
      return (
        <img 
          src="https://www.google.com/chrome/static/images/chrome-logo.svg" 
          alt="Chrome"
          className="w-10 h-10"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234285F4'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    
    if (idLower.includes("vscode")) {
      return (
        <img 
          src="https://code.visualstudio.com/favicon.ico" 
          alt="VS Code"
          className="w-10 h-10"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23007ACC'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    
    if (idLower.includes("cursor")) {
      return (
        <img 
          src="https://cursor.sh/favicon.ico" 
          alt="Cursor"
          className="w-10 h-10"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23000000'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    
    if (idLower.includes("claude")) {
      return (
        <img 
          src="https://claude.ai/favicon.ico" 
          alt="Claude"
          className="w-10 h-10"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23CC9B7A'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    
    if (idLower.includes("cline")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center text-white font-semibold text-sm">
          CLI
        </div>
      );
    }
    
    if (idLower.includes("gemini")) {
      return (
        <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
          G
        </div>
      );
    }
    
    return (
      <div className="w-10 h-10 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-sm">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const getClientToken = (clientId: string) => {
    return tokens.find((t) => t.client_type === clientId && t.is_active);
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-neutral-100 px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Connectors</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Connect UniMemory to your AI assistants
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Connected Agents */}
          {tokens.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">Connected</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tokens.map((token) => (
                  <div key={token.id} className="bg-white rounded-xl p-5 hover:shadow-md transition-all relative group">
                    <button
                      onClick={() => revokeToken(token.id)}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        {getConnectorLogo(token.client_type, token.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <h3 className="text-base font-semibold text-neutral-900">{token.name}</h3>
                          <span className="text-xs text-green-600">Connected</span>
                        </div>
                        <p className="text-sm text-neutral-500">
                          {token.usage_count} {token.usage_count === 1 ? "call" : "calls"}
                          {token.last_used_at && ` · Last used ${new Date(token.last_used_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available MCP Clients */}
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-1">
              {tokens.length > 0 ? "Add More" : "Connect Your AI"}
            </h2>
            <p className="text-sm text-neutral-500 mb-4">
              Click to generate a one-time setup for each AI client
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {MCP_CLIENTS.map((client) => {
                const connected = isClientConnected(client.id);
                return (
                  <button
                    key={client.id}
                    onClick={() => {
                      if (!connected) {
                        setSelectedClient(client.id);
                        createToken(client.id);
                      }
                    }}
                    disabled={connected || creating}
                    className={`bg-white rounded-xl p-5 text-left hover:shadow-md transition-all ${
                      connected ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        {getConnectorLogo(client.id, client.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-neutral-900 mb-1">
                          {client.name}
                        </h3>
                        <p className="text-sm text-neutral-500">{client.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Token Created Modal */}
      {createdToken && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Connect UniMemory to Your AI
                </h2>
                <button
                  onClick={() => {
                    setCreatedToken(null);
                    setSelectedClient(null);
                    setInstallMethod("one-click");
                  }}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-neutral-600 mb-4">
                Enable your AI assistant to create, search, and access your memories directly using the Model Context Protocol (MCP).
              </p>

              {/* Install Method Tabs */}
              <div className="flex gap-2 mb-6 border-b border-neutral-200">
                <button
                  onClick={() => setInstallMethod("one-click")}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    installMethod === "one-click"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  One Click Install
                </button>
                <button
                  onClick={() => setInstallMethod("manual")}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    installMethod === "manual"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Manual Config
                </button>
              </div>

              {/* One Click Install */}
              {installMethod === "one-click" && (
                <div className="space-y-4">
                  {selectedClient === "cursor" && createdToken.cursor_deep_link && (
                    <div className="bg-neutral-50 rounded-lg p-6 text-center">
                      <p className="text-sm text-neutral-600 mb-4">
                        Click the button below to automatically install and configure UniMemory in Cursor
                      </p>
                      <a
                        href={createdToken.cursor_deep_link}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                        </svg>
                        Add to Cursor
                      </a>
                    </div>
                  )}

                  {createdToken.npx_command && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 mb-2">Installation Command</h3>
                      <p className="text-sm text-neutral-600 mb-3">
                        Copy and run this command in your terminal to install the MCP server
                      </p>
                      <div className="bg-neutral-900 rounded-lg p-4 relative">
                        <button
                          onClick={() => copyToClipboard(createdToken.npx_command!)}
                          className="absolute top-3 right-3 text-neutral-400 hover:text-white"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <pre className="text-sm text-neutral-300 whitespace-pre-wrap overflow-x-auto font-mono pr-10">
                          {createdToken.npx_command}
                        </pre>
                      </div>
                    </div>
                  )}

                  {!createdToken.cursor_deep_link && !createdToken.npx_command && (
                    <div className="bg-neutral-50 rounded-lg p-6 text-center">
                      <p className="text-sm text-neutral-600">
                        One-click install not available for this client. Please use Manual Config.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Config */}
              {installMethod === "manual" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-2">Configuration</h3>
                    <p className="text-sm text-neutral-600 mb-3">
                      {createdToken.install_command.split('\n')[0]}
                    </p>
                    <div className="bg-neutral-900 rounded-lg p-4 relative">
                      <button
                        onClick={() => copyToClipboard(createdToken.install_command.split('\n').slice(1).join('\n'))}
                        className="absolute top-3 right-3 text-neutral-400 hover:text-white"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <pre className="text-sm text-neutral-300 whitespace-pre-wrap overflow-x-auto font-mono pr-10">
                        {createdToken.install_command.split('\n').slice(1).join('\n')}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setCreatedToken(null);
                    setSelectedClient(null);
                    setInstallMethod("one-click");
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Creating Spinner */}
      {creating && !createdToken && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <div className="animate-spin w-8 h-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full mx-auto mb-4" />
            <p className="text-neutral-600">Creating token...</p>
          </div>
        </div>
      )}
    </div>
  );
}
