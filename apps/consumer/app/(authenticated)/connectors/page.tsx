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
  { id: "cursor", name: "Cursor", icon: "⚡", hasOneClick: true },
  { id: "windsurf", name: "Windsurf", icon: "🏄", hasOneClick: false },
  { id: "claude", name: "Claude Desktop", icon: "🤖", hasOneClick: false },
  { id: "vscode", name: "VS Code", icon: "💻", hasOneClick: false },
  { id: "cline", name: "Cline", icon: "🔷", hasOneClick: false },
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
          <div className="max-w-2xl">
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
          <div className="max-w-2xl">
            <h2 className="text-sm font-medium text-neutral-500 mb-3">MCP</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
              {MCP_CLIENTS.map((client) => (
                <button
                  key={client.id}
                  onClick={() => openMcpModal(client.id)}
                  className="group flex items-center justify-between bg-white rounded-lg p-4 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{client.icon}</span>
                    <div>
                      <h3 className="font-medium text-neutral-900">{client.name}</h3>
                      <p className="text-xs text-neutral-500">Connect via MCP</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MCP Setup Modal */}
      {mcpModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-2xl w-full max-w-xl text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4">
              <div>
                <h2 className="text-xl font-semibold">Connect UniMemory to Your AI</h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Access your memories directly using MCP
                </p>
              </div>
              <button
                onClick={() => setMcpModalOpen(false)}
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Select Client */}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                <span className="text-sm font-medium">Select Your AI Client</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MCP_CLIENTS.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client.id);
                      setConfigMode(client.id === "cursor" ? "oneclick" : "manual");
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                      selectedClient === client.id
                        ? "bg-white text-neutral-900"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <span>{client.icon}</span>
                    {client.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Install */}
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                  <span className="text-sm font-medium">Install UniMemory MCP</span>
                </div>
                {selectedClientInfo?.hasOneClick && (
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <span>Having trouble?</span>
                    <button
                      onClick={() => setConfigMode(configMode === "oneclick" ? "manual" : "oneclick")}
                      className={`px-2 py-1 rounded ${configMode === "oneclick" ? "bg-neutral-800" : "bg-white text-neutral-900"}`}
                    >
                      One Click Install
                    </button>
                    <button
                      onClick={() => setConfigMode(configMode === "manual" ? "oneclick" : "manual")}
                      className={`px-2 py-1 rounded ${configMode === "manual" ? "bg-neutral-800" : "text-neutral-400"}`}
                    >
                      Manual Config
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="bg-neutral-800/50 rounded-xl p-8 border border-neutral-700">
                  <div className="space-y-3">
                    <div className="h-4 bg-neutral-700 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-neutral-700 rounded animate-pulse w-1/2" />
                    <div className="h-10 bg-neutral-700 rounded animate-pulse w-full mt-4" />
                  </div>
                </div>
              ) : configMode === "oneclick" && selectedClientInfo?.hasOneClick ? (
                <div className="bg-neutral-800/50 rounded-xl p-6 border border-neutral-700 text-center">
                  <p className="text-sm text-neutral-400 mb-4">
                    Click the button below to automatically install and configure UniMemory in {selectedClientInfo.name}
                  </p>
                  <button
                    onClick={handleOneClickInstall}
                    disabled={installing || !mcpToken}
                    className="px-6 py-3 bg-white text-neutral-900 rounded-lg font-medium hover:bg-neutral-100 disabled:opacity-50 transition-colors flex items-center gap-2 mx-auto"
                  >
                    <span>{selectedClientInfo.icon}</span>
                    {installing ? "Opening..." : `Add to ${selectedClientInfo.name}`}
                  </button>
                </div>
              ) : (
                <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500">
                      Add to <code className="bg-neutral-700 px-1.5 py-0.5 rounded">{getConfigPath()}</code>
                    </span>
                    <button
                      onClick={() => copyToClipboard(getConfigJson(), "config")}
                      className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                    >
                      {copied === "config" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === "config" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-xs text-green-400 overflow-x-auto bg-neutral-900 rounded-lg p-3 max-h-40">
                    {getConfigJson()}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
              <a
                href="https://docs.unimemory.app/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-neutral-400 hover:text-white flex items-center gap-1"
              >
                <ExternalLink className="w-4 h-4" />
                Learn More
              </a>
              <button
                onClick={() => setMcpModalOpen(false)}
                className="px-4 py-2 text-sm font-medium hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
