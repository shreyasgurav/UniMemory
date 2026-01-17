"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/firebase";

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
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-8">Connectors</h1>

        <div className="grid grid-cols-2 gap-6">
          {/* Extensions Section */}
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-3">Extensions</h2>
            <a
              href="https://chromewebstore.google.com/detail/unimemory/your-extension-id"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between bg-white rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <img 
                  src="https://www.google.com/chrome/static/images/chrome-logo.svg" 
                  alt="Chrome"
                  className="w-10 h-10"
                />
                <div>
                  <h3 className="font-medium text-neutral-900">Chrome Extension</h3>
                  <p className="text-sm text-neutral-500">Save memories from any webpage</p>
                </div>
              </div>
              <ExternalLink className="w-5 h-5 text-neutral-400 group-hover:text-neutral-600 transition-colors" />
            </a>
          </div>

          {/* MCP Section */}
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-3">MCP</h2>
            <button
              onClick={handleCursorClick}
              disabled={installing}
              className="group w-full flex items-center justify-between bg-white rounded-lg p-4 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
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
                  <p className="text-sm text-neutral-500">AI-powered code editor</p>
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
