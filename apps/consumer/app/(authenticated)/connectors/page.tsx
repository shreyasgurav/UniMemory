"use client";

import { useState, useEffect } from "react";
import { PlugZap, Chrome, Zap, Code, Database, CheckCircle2, Circle, ExternalLink } from "lucide-react";
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
  agents: Connector[];
  data_sources: Connector[];
}

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorsData>({
    extensions: [],
    agents: [],
    data_sources: [],
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
      setConnectors(data);
    } catch (error) {
      console.error("Failed to load connectors:", error);
    } finally {
      setLoading(false);
    }
  };

  const getConnectorIcon = (id: string) => {
    if (id === "chrome") return <Chrome className="w-5 h-5" />;
    if (id === "raycast") return <Zap className="w-5 h-5" />;
    if (id === "cursor" || id === "claude") return <Code className="w-5 h-5" />;
    return <Database className="w-5 h-5" />;
  };

  const ConnectorCard = ({ connector }: { connector: Connector }) => (
    <div className="bg-white border border-gray-100 rounded-xl p-5 hover:border-neutral-200 transition-all">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${connector.connected ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-600"
          }`}>
          {getConnectorIcon(connector.id)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-neutral-900">{connector.name}</h3>
            {connector.connected ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-600 text-xs rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-500 text-xs rounded-full">
                <Circle className="w-3 h-3" />
                Not Connected
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-600 mb-3">{connector.description}</p>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${connector.connected
                ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                : "bg-neutral-900 text-white hover:bg-neutral-800"
              }`}
          >
            {connector.connected ? "Disconnect" : "Install"}
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-neutral-900">Connectors</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
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
                <div className="space-y-3">
                  {connectors.extensions.map((connector) => (
                    <ConnectorCard key={connector.id} connector={connector} />
                  ))}
                </div>
              </div>

              {/* AI Agents */}
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">AI Agents</h2>
                  <p className="text-sm text-neutral-500">
                    Give AI assistants access to your memories via MCP
                  </p>
                </div>
                <div className="space-y-3">
                  {connectors.agents.map((connector) => (
                    <ConnectorCard key={connector.id} connector={connector} />
                  ))}
                </div>
              </div>

              {/* Data Sources */}
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-neutral-900 mb-1">Data Sources</h2>
                  <p className="text-sm text-neutral-500">
                    Sync documents and content from cloud services
                  </p>
                </div>
                <div className="space-y-3">
                  {connectors.data_sources.map((connector) => (
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
