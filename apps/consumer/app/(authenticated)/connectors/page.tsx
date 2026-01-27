"use client";

import { useState, useEffect } from "react";
import { ExternalLink, X, Copy, Check } from "lucide-react";
import { auth } from "@/lib/firebase";

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (extensionId: string, message: any, callback: (response: any) => void) => void;
        lastError?: { message: string };
      };
    };
  }
}

interface MCPToken {
  id: string;
  name: string;
  client_type: string;
  is_active: boolean;
  token?: string;
  mcp_url?: string;
}

const MCP_URL = "https://unimemory.up.railway.app/api/v1/mcp";

const MCP_CLIENTS = [
  { 
    id: "cursor", 
    name: "Cursor", 
    logo: "https://cursor.sh/favicon.ico",
    hasOneClick: true 
  },
  { 
    id: "windsurf", 
    name: "Windsurf", 
    logo: "https://www.codeium.com/favicon.ico",
    hasOneClick: false 
  },
  { 
    id: "claude", 
    name: "Claude Desktop", 
    logo: "https://claude.ai/favicon.ico",
    hasOneClick: false 
  },
  { 
    id: "vscode", 
    name: "VS Code", 
    logo: "https://code.visualstudio.com/favicon.ico",
    hasOneClick: false 
  },
  { 
    id: "cline", 
    name: "Cline", 
    logo: "https://raw.githubusercontent.com/cline/cline/main/assets/icon.png",
    hasOneClick: false 
  },
];

export default function ConnectorsPage() {
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("cursor");
  const [mcpToken, setMcpToken] = useState<MCPToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [configMode, setConfigMode] = useState<"oneclick" | "manual">("oneclick");

  useEffect(() => {
    const checkExtensionStatus = async () => {
      try {
        if (window.chrome?.runtime?.sendMessage) {
          window.chrome.runtime.sendMessage(
            process.env.NEXT_PUBLIC_EXTENSION_ID || 'your-extension-id',
            { type: 'GET_AUTH_STATUS' },
            (response: any) => {
              if (window.chrome?.runtime?.lastError) {
                setExtensionConnected(false);
              } else {
                setExtensionConnected(response?.authenticated || false);
              }
            }
          );
        }
      } catch (error) {
        setExtensionConnected(false);
      }
    };

    checkExtensionStatus();
    const handleFocus = () => checkExtensionStatus();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const openMcpModal = async (clientId: string) => {
    setSelectedClient(clientId);
    setMcpModalOpen(true);
    setConfigMode(clientId === "cursor" ? "oneclick" : "manual");
    await fetchOrCreateToken(clientId);
  };

  const fetchOrCreateToken = async (clientId: string) => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        let clientToken = (data.tokens || []).find(
          (t: MCPToken) => t.is_active
        );

        if (!clientToken) {
          const createResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ client_type: clientId }),
          });

          if (createResponse.ok) {
            clientToken = await createResponse.json();
          }
        }

        setMcpToken(clientToken);
      }
    } catch (error) {
      console.error("Failed to fetch token:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOneClickInstall = async () => {
    if (!mcpToken?.token) return;
    setInstalling(true);
    try {
      const config = JSON.stringify({
        url: mcpToken.mcp_url || MCP_URL,
        headers: { Authorization: `Bearer ${mcpToken.token}` },
      });
      const deepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=unimemory&config=${btoa(config)}`;
      window.location.href = deepLink;
    } finally {
      setTimeout(() => setInstalling(false), 2000);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getConfigJson = () => {
    if (!mcpToken?.token) return "";
    return JSON.stringify(
      {
        mcpServers: {
          unimemory: {
            url: mcpToken.mcp_url || MCP_URL,
            headers: { Authorization: `Bearer ${mcpToken.token}` },
          },
        },
      },
      null,
      2
    );
  };

  const getConfigPath = () => {
    const paths: Record<string, string> = {
      cursor: "~/.cursor/mcp.json",
      claude: "~/Library/Application Support/Claude/claude_desktop_config.json",
      windsurf: "MCP Marketplace or ~/.codeium/windsurf/mcp_config.json",
      vscode: "Settings → MCP Configuration",
      cline: "Cline Settings → MCP Servers",
    };
    return paths[selectedClient] || "";
  };

  const selectedClientInfo = MCP_CLIENTS.find((c) => c.id === selectedClient);

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-8">Connectors</h1>

        <div className="space-y-8">
          {/* Extensions Section */}
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-3">Extensions</h2>
            <a
              href="https://chromewebstore.google.com/detail/unimemory/your-extension-id"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between bg-white rounded-lg p-4 hover:shadow-md transition-all cursor-pointer max-w-md"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src="https://www.google.com/chrome/static/images/chrome-logo.svg"
                    alt="Chrome"
                    className="w-10 h-10"
                  />
                  {extensionConnected && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-neutral-900">Chrome Extension</h3>
                    {extensionConnected && (
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500">Save and recall memories across any AI agent.</p>
                </div>
              </div>
              <ExternalLink className="w-5 h-5 text-neutral-400 group-hover:text-neutral-600 transition-colors" />
            </a>
          </div>

          {/* MCP Section */}
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-3">MCP</h2>
            
            {/* Client Selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {MCP_CLIENTS.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setSelectedClient(client.id);
                    setConfigMode(client.id === "cursor" ? "oneclick" : "manual");
                    if (!mcpToken) fetchOrCreateToken(client.id);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selectedClient === client.id
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <img 
                    src={client.logo} 
                    alt={client.name}
                    className="w-4 h-4"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  {client.name}
                </button>
              ))}
            </div>

            {/* Installation Section */}
            <div className="bg-white rounded-lg p-6 max-w-2xl">
              {loading ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-4 bg-neutral-100 rounded animate-pulse w-48" />
                    <div className="h-8 bg-neutral-100 rounded-full animate-pulse w-48" />
                  </div>
                  <div className="h-32 bg-neutral-100 rounded-lg animate-pulse" />
                </div>
              ) : (
                <>
                  {/* Header with title and toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-neutral-600">
                      {selectedClientInfo?.hasOneClick && configMode === "oneclick" 
                        ? `Click to automatically install UniMemory in ${selectedClientInfo.name}`
                        : <>Add to <code className="bg-neutral-100 px-2 py-1 rounded text-xs">{getConfigPath()}</code></>
                      }
                    </p>
                    
                    {/* Toggle for Cursor */}
                    {selectedClientInfo?.hasOneClick && (
                      <div className="inline-flex rounded-full bg-neutral-100 p-0.5">
                        <button
                          onClick={() => setConfigMode("oneclick")}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            configMode === "oneclick"
                              ? "bg-white text-neutral-900 shadow-sm"
                              : "text-neutral-600 hover:text-neutral-900"
                          }`}
                        >
                          Quick Setup
                        </button>
                        <button
                          onClick={() => setConfigMode("manual")}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            configMode === "manual"
                              ? "bg-white text-neutral-900 shadow-sm"
                              : "text-neutral-600 hover:text-neutral-900"
                          }`}
                        >
                          Manual Config
                        </button>
                      </div>
                    )}
                  </div>

                  {/* One-Click Install for Cursor */}
                  {selectedClientInfo?.hasOneClick && configMode === "oneclick" ? (
                    <div className="text-center">
                      <button
                        onClick={handleOneClickInstall}
                        disabled={installing || !mcpToken}
                        className="px-6 py-3 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                      >
                        <img 
                          src={selectedClientInfo.logo} 
                          alt={selectedClientInfo.name}
                          className="w-4 h-4"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        {installing ? "Opening..." : `Add to ${selectedClientInfo.name}`}
                      </button>
                    </div>
                  ) : (
                    /* Manual Config */
                    <div className="relative">
                      <pre className="text-xs text-green-400 overflow-x-auto bg-neutral-900 rounded-lg p-4 pr-12">
                        {getConfigJson()}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(getConfigJson(), "config")}
                        className="absolute top-3 right-3 p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                      >
                        {copied === "config" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
