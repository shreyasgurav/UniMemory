"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/firebase";

// Chrome extension API types
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

export default function ConnectorsPage() {
  const [installing, setInstalling] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);

  // Check extension connection status on mount and when window regains focus
  useEffect(() => {
    const checkExtensionStatus = async () => {
      try {
        // Try to communicate with extension
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

    // Re-check when window regains focus (user returns from login)
    const handleFocus = () => {
      checkExtensionStatus();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleCursorClick = async () => {
    setInstalling(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        alert("Please log in first");
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        let clientToken = (data.tokens || []).find(
          (t: MCPToken) => t.client_type === "cursor" && t.is_active
        );
        
        if (!clientToken) {
          const createResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/mcp/tokens`, {
            method: "POST",
            headers: { 
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ client_type: "cursor" })
          });
          
          if (createResponse.ok) {
            const createData = await createResponse.json();
            clientToken = createData;
          }
        }
        
        if (clientToken && clientToken.token && clientToken.mcp_url) {
          const config = JSON.stringify({ 
            url: clientToken.mcp_url, 
            headers: { Authorization: `Bearer ${clientToken.token}` } 
          });
          const deepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=unimemory&config=${btoa(config)}`;
          window.location.href = deepLink;
        }
      }
    } catch (error) {
      console.error("Failed to install Cursor:", error);
      alert("Failed to install. Please try again.");
    } finally {
      setInstalling(false);
    }
  };

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
            <button
              onClick={handleCursorClick}
              disabled={installing}
              className="group w-full flex items-center justify-between bg-white rounded-lg p-4 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left max-w-md"
            >
              <div className="flex items-center gap-3">
                <img 
                  src="https://cursor.sh/favicon.ico" 
                  alt="Cursor"
                  className="w-10 h-10"
                  onError={(e) => {
                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23000000'%3E%3Crect width='24' height='24' rx='4'/%3E%3C/svg%3E";
                  }}
                />
                <div>
                  <h3 className="font-medium text-neutral-900">Cursor</h3>
                  <p className="text-sm text-neutral-500">Recall long-term memories in Cursor.</p>
                </div>
              </div>
              <div className="text-sm font-medium text-neutral-900">
                {installing ? "Installing..." : "Install"}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
