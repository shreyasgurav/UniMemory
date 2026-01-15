"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { auth } from "@/lib/firebase";

interface MCPToken {
  id: string;
  name: string;
  client_type: string;
  is_active: boolean;
  last_used_at?: string;
  usage_count: number;
  created_at: string;
  token?: string;  // The actual token value
  mcp_url?: string;  // MCP endpoint URL
}

interface MCPClient {
  id: string;
  name: string;
  description: string;
}

const MCP_CLIENTS: MCPClient[] = [
  { id: "cursor", name: "Cursor", description: "AI-powered code editor" },
  { id: "claude", name: "Claude Desktop", description: "Anthropic's Claude assistant" },
  { id: "windsurf", name: "Windsurf", description: "Codeium's AI IDE" },
  { id: "cline", name: "Cline", description: "Terminal-based AI assistant" },
];

const EXTENSIONS = [
  { 
    id: "chrome", 
    name: "Chrome Extension", 
    description: "Save memories from any webpage",
    url: "https://chromewebstore.google.com/detail/unimemory/your-extension-id"
  },
  { 
    id: "vscode", 
    name: "VS Code Extension", 
    description: "Save code snippets and context",
    url: "https://marketplace.visualstudio.com/items?itemName=unimemory.vscode"
  },
];

export default function ConnectorsPage() {
  const [tokens, setTokens] = useState<MCPToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<MCPToken | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getTerminalCommand = (clientType: string, token: string, mcpUrl: string) => {
    const jsonConfig = `{"mcpServers": {"unimemory": {"url": "${mcpUrl}", "headers": {"Authorization": "Bearer ${token}"}}}}`;
    
    if (clientType === "windsurf") {
      return `mkdir -p ~/Library/Application\\ Support/Windsurf/User && echo '${jsonConfig}' > "$HOME/Library/Application Support/Windsurf/User/mcp_config.json"`;
    } else if (clientType === "claude") {
      return `mkdir -p ~/Library/Application\\ Support/Claude && echo '${jsonConfig}' > "$HOME/Library/Application Support/Claude/claude_desktop_config.json"`;
    }
    return jsonConfig;
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
    
    if (idLower.includes("windsurf")) {
      return (
        <img 
          src="https://www.codeium.com/favicon.ico" 
          alt="Windsurf"
          className="w-10 h-10"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2309B6A2'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
          }}
        />
      );
    }
    
    return (
      <div className="w-10 h-10 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-sm">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const getClientToken = (clientId: string): MCPToken | undefined => {
    return tokens.find((t) => t.client_type === clientId && t.is_active);
  };

  const getJsonConfig = (token: string, mcpUrl: string) => {
    return JSON.stringify({
      mcpServers: {
        unimemory: {
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    }, null, 2);
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-neutral-50">
        <div className="px-8 py-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Connectors</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Extensions Skeleton */}
            <div>
              <div className="h-6 w-32 bg-neutral-200 rounded mb-4 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-neutral-200 rounded-xl h-20 animate-pulse" />
                ))}
              </div>
            </div>
            {/* MCP Connectors Skeleton */}
            <div>
              <div className="h-6 w-40 bg-neutral-200 rounded mb-4 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-neutral-200 rounded-xl h-28 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-50">
      {/* Header */}
      <div className="px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Connectors</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Extensions Section */}
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Extensions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXTENSIONS.map((extension) => (
                <a
                  key={extension.id}
                  href={extension.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-xl p-5 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      {getConnectorLogo(extension.id, extension.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-neutral-900 mb-0.5">
                        {extension.name}
                      </h3>
                      <p className="text-sm text-neutral-500">{extension.description}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors flex-shrink-0" />
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* MCP Connectors Section */}
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">MCP Connectors</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {MCP_CLIENTS.map((client) => {
                const clientToken = getClientToken(client.id);
                
                return (
                  <button
                    key={client.id}
                    onClick={() => clientToken && setSelectedClient(clientToken)}
                    className="bg-white rounded-xl p-5 hover:shadow-md transition-all text-left"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        {getConnectorLogo(client.id, client.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-neutral-900 mb-0.5">
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

      {/* Configuration Modal */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Connect {selectedClient.name}
                </h2>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-neutral-600 mb-6">
                Use the configuration below to connect {selectedClient.name} to your UniMemory account.
              </p>

              {/* Cursor One-Click Install */}
              {selectedClient.client_type === "cursor" && selectedClient.token && selectedClient.mcp_url && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">One-Click Install</h3>
                  <div className="bg-neutral-50 rounded-lg p-6 text-center">
                    <p className="text-sm text-neutral-600 mb-4">
                      Click the button below to automatically install and configure UniMemory in Cursor
                    </p>
                    <a
                      href={`cursor://anysphere.cursor-deeplink/mcp/install?name=unimemory&config=${btoa(JSON.stringify({ url: selectedClient.mcp_url, headers: { Authorization: `Bearer ${selectedClient.token}` } }))}`}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                      </svg>
                      Add to Cursor
                    </a>
                  </div>
                  <div className="my-6 flex items-center gap-4">
                    <div className="flex-1 h-px bg-neutral-200" />
                    <span className="text-xs text-neutral-500">OR</span>
                    <div className="flex-1 h-px bg-neutral-200" />
                  </div>
                </div>
              )}

              {/* Configuration */}
              {selectedClient.token && selectedClient.mcp_url && (
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                    {selectedClient.client_type === "windsurf" || selectedClient.client_type === "claude" 
                      ? "Terminal Command" 
                      : "Manual Configuration"}
                  </h3>
                  <p className="text-sm text-neutral-600 mb-3">
                    {selectedClient.client_type === "windsurf" || selectedClient.client_type === "claude"
                      ? `Copy and run this command in your terminal, then restart ${selectedClient.name}`
                      : `Copy this JSON configuration and add it to your ${selectedClient.name} MCP config file`
                    }
                  </p>
                  <div className="bg-neutral-900 rounded-lg p-4 relative">
                    <button
                      onClick={() => {
                        const config = selectedClient.client_type === "windsurf" || selectedClient.client_type === "claude"
                          ? getTerminalCommand(selectedClient.client_type, selectedClient.token!, selectedClient.mcp_url!)
                          : getJsonConfig(selectedClient.token!, selectedClient.mcp_url!);
                        copyToClipboard(config, selectedClient.id);
                      }}
                      className="absolute top-3 right-3 text-neutral-400 hover:text-white"
                    >
                      {copied === selectedClient.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre className="text-sm text-neutral-300 whitespace-pre-wrap overflow-x-auto font-mono pr-10">
                      {selectedClient.client_type === "windsurf" || selectedClient.client_type === "claude"
                        ? getTerminalCommand(selectedClient.client_type, selectedClient.token!, selectedClient.mcp_url!)
                        : getJsonConfig(selectedClient.token!, selectedClient.mcp_url!)
                      }
                    </pre>
                  </div>
                </div>
              )}

              {(!selectedClient.token || !selectedClient.mcp_url) && (
                <div className="text-center py-8">
                  <p className="text-sm text-neutral-500">
                    Configuration not available. Please refresh the page and try again.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <button
                  onClick={() => setSelectedClient(null)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
