"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";

interface GraphNode {
  id: string;
  content: string;
  sector?: string;
  salience: number;
  created_at: string;
  // Computed position
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface MemoryGraphProps {
  isOpen: boolean;
  onClose: () => void;
}

// Sector colors
const SECTOR_COLORS: Record<string, string> = {
  episodic: "#3B82F6",    // Blue
  semantic: "#10B981",    // Green
  procedural: "#F59E0B",  // Amber
  emotional: "#EC4899",   // Pink
  reflective: "#8B5CF6",  // Purple
  default: "#6B7280",     // Gray
};

export default function MemoryGraph({ isOpen, onClose }: MemoryGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Fetch graph data
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchGraph = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          setError("Not authenticated");
          return;
        }
        
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/consumer/graph?limit=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (!response.ok) {
          throw new Error("Failed to fetch graph data");
        }
        
        const data = await response.json();
        
        // Position nodes in a force-directed layout simulation
        const positionedNodes = layoutNodes(data.nodes, data.edges);
        setNodes(positionedNodes);
        setEdges(data.edges);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        setLoading(false);
      }
    };
    
    fetchGraph();
  }, [isOpen]);

  // Simple force-directed layout
  const layoutNodes = (rawNodes: Omit<GraphNode, 'x' | 'y'>[], edges: GraphEdge[]): GraphNode[] => {
    if (rawNodes.length === 0) return [];
    
    // Initialize positions in a circle
    const nodes: GraphNode[] = rawNodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / rawNodes.length;
      const radius = Math.min(300, rawNodes.length * 20);
      return {
        ...node,
        x: 400 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      };
    });
    
    // Build adjacency map
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Simple force simulation (10 iterations)
    for (let iter = 0; iter < 50; iter++) {
      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);
          
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          
          nodes[i].x -= fx;
          nodes[i].y -= fy;
          nodes[j].x += fx;
          nodes[j].y += fy;
        }
      }
      
      // Attraction along edges
      for (const edge of edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.05 * edge.weight;
        
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        source.x += fx;
        source.y += fy;
        target.x -= fx;
        target.y -= fy;
      }
      
      // Center gravity
      for (const node of nodes) {
        node.x += (400 - node.x) * 0.01;
        node.y += (300 - node.y) * 0.01;
      }
    }
    
    return nodes;
  };

  // Canvas rendering
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Apply transformations
    ctx.save();
    ctx.translate(pan.x + rect.width / 2, pan.y + rect.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-400, -300);
    
    // Draw edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = `rgba(148, 163, 184, ${0.2 + edge.weight * 0.5})`;
      ctx.lineWidth = 1 + edge.weight * 2;
      ctx.stroke();
    }
    
    // Draw nodes
    for (const node of nodes) {
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const radius = 8 + node.salience * 12;
      const color = SECTOR_COLORS[node.sector || "default"] || SECTOR_COLORS.default;
      
      // Glow for hovered/selected
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
      }
      
      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      
      // Border
      ctx.strokeStyle = isSelected ? "#fff" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.stroke();
    }
    
    ctx.restore();
    
  }, [nodes, edges, zoom, pan, hoveredNode, selectedNode, loading]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }
    
    // Hit detection
    const worldX = (mouseX - pan.x - rect.width / 2) / zoom + 400;
    const worldY = (mouseY - pan.y - rect.height / 2) / zoom + 300;
    
    let found: GraphNode | null = null;
    for (const node of nodes) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const radius = 8 + node.salience * 12;
      if (dx * dx + dy * dy < radius * radius) {
        found = node;
        break;
      }
    }
    setHoveredNode(found);
  }, [isDragging, dragStart, pan, zoom, nodes]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (hoveredNode) {
      setSelectedNode(selectedNode?.id === hoveredNode.id ? null : hoveredNode);
    } else {
      setSelectedNode(null);
    }
  }, [hoveredNode, selectedNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.3, z * delta)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-neutral-900 rounded-2xl w-full max-w-6xl h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-800">
          <div>
            <h2 className="text-xl font-semibold text-white">Memory Graph</h2>
            <p className="text-sm text-neutral-400 mt-0.5">
              {nodes.length} memories • {edges.length} connections
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Zoom controls */}
            <button
              onClick={() => setZoom(z => Math.min(3, z * 1.2))}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(z => Math.max(0.3, z * 0.8))}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetView}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
              {error}
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
              No memories to display
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleClick}
              onWheel={handleWheel}
            />
          )}
          
          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-neutral-800/90 rounded-xl p-4 backdrop-blur-sm">
            <div className="text-xs font-medium text-neutral-400 mb-2">Sectors</div>
            <div className="space-y-1.5">
              {Object.entries(SECTOR_COLORS).filter(([k]) => k !== 'default').map(([sector, color]) => (
                <div key={sector} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-neutral-300 capitalize">{sector}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Selected node detail */}
          {selectedNode && (
            <div className="absolute top-4 right-4 w-80 bg-neutral-800/95 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between mb-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium capitalize"
                  style={{ 
                    backgroundColor: `${SECTOR_COLORS[selectedNode.sector || 'default']}33`,
                    color: SECTOR_COLORS[selectedNode.sector || 'default']
                  }}
                >
                  {selectedNode.sector || 'unknown'}
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-neutral-500 hover:text-neutral-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-neutral-200 leading-relaxed">
                {selectedNode.content}
              </p>
              <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
                <span>Salience: {(selectedNode.salience * 100).toFixed(0)}%</span>
                <span>•</span>
                <span>{new Date(selectedNode.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
