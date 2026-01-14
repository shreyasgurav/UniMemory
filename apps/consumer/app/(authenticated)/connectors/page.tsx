"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/firebase";

interface Connector {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  installed: boolean;
  description?: string;
}

interface ConnectorsData {
  extensions: Connector[];
  mcps: Connector[];
}

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorsData>({
    extensions: [],
    mcps: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnectors();
  }, []);

  const loadConnectors = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/connectors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      // Normalize shape to ensure 'mcps' always exists
      const normalized: ConnectorsData = {
        extensions: Array.isArray(data?.extensions) ? data.extensions : [],
        mcps: Array.isArray(data?.mcps)
          ? data.mcps
          : Array.isArray(data?.agents)
          ? data.agents
          : Array.isArray(data?.data_sources)
          ? data.data_sources
          : [],
      };
      setConnectors(normalized);
    } catch (error) {
      console.error("Failed to load connectors:", error);
    } finally {
      setLoading(false);
    }
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

  const ConnectorCard = ({ connector }: { connector: Connector }) => (
    <div className="bg-white rounded-xl p-5 hover:shadow-md transition-all">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {getConnectorLogo(connector.id, connector.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-base font-semibold text-neutral-900">{connector.name}</h3>
            {connector.connected && (
              <span className="text-xs text-green-600">
                Connected
              </span>
            )}
          </div>
          {connector.description && (
            <p className="text-sm text-neutral-600 mb-3">{connector.description}</p>
          )}
          {!connector.connected && (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-all flex items-center gap-2"
            >
              Install
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-neutral-100 px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Connectors</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-neutral-50">
        <div className="max-w-4xl mx-auto space-y-8">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-5">
                  <div className="h-5 bg-neutral-100 rounded w-3/4 animate-pulse mb-2" />
                  <div className="h-4 bg-neutral-100 rounded w-1/2 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Extensions */}
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">Extensions</h2>
                  <p className="text-sm text-neutral-500">
                    Capture content from your browser and desktop
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {connectors.extensions.map((connector) => (
                    <ConnectorCard key={connector.id} connector={connector} />
                  ))}
                </div>
              </div>

              {/* MCPs */}
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">MCPs</h2>
                  <p className="text-sm text-neutral-500">
                    Connect AI assistants via Model Context Protocol
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(connectors.mcps || []).map((connector) => (
                    <ConnectorCard key={connector.id} connector={connector} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
