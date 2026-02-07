"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Loader2, FileText, Brain } from "lucide-react";
import { auth } from "@/lib/firebase";

// ============ Types ============
interface GraphMemory {
  id: string;
  content: string;
  sector?: string;
  memory_type?: string;
  priority?: string;
  salience: number;
  recall_count?: number;
  coactivation_score?: number;
  created_at: string;
}

interface GraphEntity {
  id: string;
  name: string;
  entity_type: string;
  summary?: string;
  mention_count?: number;
}

interface GraphSource {
  id: string;
  type: string;
  title?: string;
  summary?: string;
  created_at: string;
  memory_count: number;
  memories: GraphMemory[];
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  edge_type: string;
}

interface GraphNode {
  id: string;
  type: "document" | "memory" | "entity";
  x: number;
  y: number;
  data: GraphSource | GraphMemory | GraphEntity;
  size: number;
  parentId?: string;
}

interface MemoryGraphProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}

// ============ Constants ============
const COLORS = {
  document: {
    fill: "rgba(255, 255, 255, 0.15)",
    stroke: "rgba(255, 255, 255, 0.6)",
    glow: "rgba(147, 197, 253, 0.4)",
  },
  memory: {
    fill: "rgba(147, 196, 253, 0.2)",
    stroke: "rgba(147, 196, 253, 0.6)",
    glow: "rgba(147, 197, 253, 0.5)",
  },
  entity: {
    fill: "rgba(251, 191, 36, 0.2)",
    stroke: "rgba(251, 191, 36, 0.8)",
    glow: "rgba(251, 191, 36, 0.5)",
  },
  edge: {
    docMemory: "rgba(148, 163, 184, 0.35)",
    memoryMemory: "rgba(35, 189, 255, 0.5)",
    entityMemory: "rgba(251, 191, 36, 0.4)",
  },
  sectors: {
    episodic: "#3B82F6",
    semantic: "#10B981",
    procedural: "#06B6D4",
    emotional: "#EC4899",
    reflective: "#8B5CF6",
    default: "#94A3B8",
  } as Record<string, string>,
  memoryTypes: {
    preference: "#F472B6",
    fact: "#60A5FA",
    event: "#34D399",
    skill: "#FBBF24",
    insight: "#A78BFA",
    default: "#94A3B8",
  } as Record<string, string>,
  entityTypes: {
    person: "#F472B6",
    organization: "#60A5FA",
    concept: "#A78BFA",
    place: "#34D399",
    thing: "#FBBF24",
    default: "#FBBF24",
  } as Record<string, string>,
};

// ============ Component ============
export default function MemoryGraph({ isOpen, onClose, projectId }: MemoryGraphProps) {
  const [sources, setSources] = useState<GraphSource[]>([]);
  const [atomicMemories, setAtomicMemories] = useState<GraphMemory[]>([]);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState({ sources: 0, memories: 0, atomic: 0, entities: 0, connections: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Graph state - completely static, no animation
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const nodesRef = useRef<GraphNode[]>([]);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [draggingNode, setDraggingNode] = useState<GraphNode | null>(null);

  // Center coordinates
  const centerX = 800;
  const centerY = 500;

  // ============ Prevent Browser Zoom ============
  useEffect(() => {
    if (!isOpen) return;

    // Prevent browser zoom with Ctrl+wheel and pinch gestures
    const preventZoom = (e: WheelEvent | TouchEvent) => {
      if (e.ctrlKey || (e as TouchEvent).touches?.length > 1) {
        e.preventDefault();
      }
    };

    // Prevent keyboard zoom shortcuts
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });
    document.addEventListener('keydown', preventKeyboardZoom);

    return () => {
      document.removeEventListener('wheel', preventZoom);
      document.removeEventListener('touchmove', preventZoom);
      document.removeEventListener('keydown', preventKeyboardZoom);
    };
  }, [isOpen]);

  // ============ Fetch Data ============
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
          `${process.env.NEXT_PUBLIC_API_URL}/consumer/graph?limit=50${projectId ? `&project_id=${projectId}` : ''}`,
          { 
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store' // Always fetch fresh data
          }
        );

        if (!response.ok) throw new Error("Failed to fetch graph data");

        const data = await response.json();
        setSources(data.sources || []);
        setAtomicMemories(data.atomic_memories || []);
        setEntities(data.entities || []);
        setEdges(data.edges || []);
        setStats(data.stats || { sources: 0, memories: 0, atomic: 0, entities: 0, connections: 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [isOpen, projectId]);

  // ============ Build Graph Nodes (Static Layout - No Animation) ============
  useEffect(() => {
    if (sources.length === 0 && atomicMemories.length === 0 && entities.length === 0) {
      nodesRef.current = [];
      setNodes([]);
      return;
    }

    const allNodes: GraphNode[] = [];

    // 1. Create document nodes in a grid on the LEFT side
    const docGridSize = Math.ceil(Math.sqrt(sources.length)) || 1;
    const docSpacing = 300;
    const docStartX = 300;
    const docStartY = centerY;

    sources.forEach((source, i) => {
      const row = Math.floor(i / docGridSize);
      const col = i % docGridSize;
      const x = docStartX + (col - docGridSize / 2 + 0.5) * docSpacing;
      const y = docStartY + (row - Math.ceil(sources.length / docGridSize) / 2 + 0.5) * docSpacing;

      // Document node
      allNodes.push({
        id: source.id,
        type: "document",
        x,
        y,
        data: source,
        size: 45,
      });

      // Memory nodes around document in a circle
      const memCount = source.memories.length;
      source.memories.forEach((mem, memIdx) => {
        const angle = (2 * Math.PI * memIdx) / Math.max(memCount, 1);
        const distance = 90 + Math.min(memCount * 3, 30);
        allNodes.push({
          id: mem.id,
          type: "memory",
          x: x + Math.cos(angle) * distance,
          y: y + Math.sin(angle) * distance,
          data: mem,
          size: 18 + (mem.salience || 0.5) * 10,
          parentId: source.id,
        });
      });
    });

    // 2. Create atomic memory nodes on the RIGHT side - clustered by sector
    if (atomicMemories.length > 0) {
      // Group by sector
      const sectorGroups: Record<string, GraphMemory[]> = {};
      atomicMemories.forEach((mem) => {
        const sector = mem.sector || "default";
        if (!sectorGroups[sector]) sectorGroups[sector] = [];
        sectorGroups[sector].push(mem);
      });

      const sectors = Object.keys(sectorGroups);
      const atomicStartX = sources.length > 0 ? centerX + 400 : centerX;
      const sectorSpacing = 250;

      sectors.forEach((sector, sectorIdx) => {
        const mems = sectorGroups[sector];
        const sectorAngle = (2 * Math.PI * sectorIdx) / Math.max(sectors.length, 1);
        const sectorCenterX = atomicStartX + Math.cos(sectorAngle) * sectorSpacing * 0.8;
        const sectorCenterY = centerY + Math.sin(sectorAngle) * sectorSpacing * 0.8;

        // Place memories in cluster around sector center
        const memGridSize = Math.ceil(Math.sqrt(mems.length));
        const memSpacing = 50;

        mems.forEach((mem, memIdx) => {
          const row = Math.floor(memIdx / memGridSize);
          const col = memIdx % memGridSize;
          const x = sectorCenterX + (col - memGridSize / 2 + 0.5) * memSpacing;
          const y = sectorCenterY + (row - Math.ceil(mems.length / memGridSize) / 2 + 0.5) * memSpacing;

          allNodes.push({
            id: mem.id,
            type: "memory",
            x,
            y,
            data: mem,
            size: 18 + (mem.salience || 0.5) * 10,
          });
        });
      });
    }

    // 3. Create entity nodes at the TOP - clustered by type (Mem0 style)
    if (entities.length > 0) {
      const entityStartY = centerY - 350;
      const entitySpacing = 80;
      const entityRowSize = Math.min(entities.length, 8);
      
      entities.forEach((entity, i) => {
        const row = Math.floor(i / entityRowSize);
        const col = i % entityRowSize;
        const x = centerX + (col - entityRowSize / 2 + 0.5) * entitySpacing;
        const y = entityStartY + row * entitySpacing;
        
        // Size based on mention count (more mentions = larger)
        const baseSize = 22;
        const mentionBoost = Math.min((entity.mention_count || 0) * 2, 15);
        
        allNodes.push({
          id: entity.id,
          type: "entity",
          x,
          y,
          data: entity,
          size: baseSize + mentionBoost,
        });
      });
    }

    nodesRef.current = allNodes;
    setNodes([...allNodes]);
  }, [sources, atomicMemories, entities, edges]);

  // ============ Canvas Rendering ============
  useEffect(() => {
    if (!canvasRef.current || loading) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear with dark background
    ctx.fillStyle = "#0f1419";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.03)";
    ctx.lineWidth = 1;
    const gridSpacing = 100 * zoom;
    const offsetX = (pan.x + rect.width / 2) % gridSpacing;
    const offsetY = (pan.y + rect.height / 2) % gridSpacing;
    for (let x = offsetX; x < rect.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < rect.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(pan.x + rect.width / 2, pan.y + rect.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-centerX, -centerY);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Draw edges
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);

      // Curved lines for memory-memory and entity-memory
      if (edge.edge_type === "memory-memory" || edge.edge_type === "entity-memory") {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.min(30, dist * 0.2);
        ctx.quadraticCurveTo(midX + offset * (dy / dist), midY - offset * (dx / dist), target.x, target.y);
        ctx.strokeStyle = edge.edge_type === "entity-memory" ? COLORS.edge.entityMemory : COLORS.edge.memoryMemory;
        ctx.lineWidth = 1 + edge.weight * 0.5;
      } else {
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = COLORS.edge.docMemory;
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;

      if (node.type === "document") {
        // Document: Rounded rectangle
        const w = node.size * 1.6;
        const h = node.size;
        const r = 8;

        // Glow
        if (isHovered || isSelected) {
          ctx.shadowColor = COLORS.document.glow;
          ctx.shadowBlur = 20;
        }

        ctx.beginPath();
        ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, r);
        ctx.fillStyle = isHovered ? "rgba(255,255,255,0.25)" : COLORS.document.fill;
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#fff" : COLORS.document.stroke;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        ctx.shadowBlur = 0;
      } else if (node.type === "entity") {
        // Entity: Circle (Mem0 style)
        const entity = node.data as GraphEntity;
        const color = COLORS.entityTypes[entity.entity_type] || COLORS.entityTypes.default;
        const size = node.size;

        // Glow
        if (isHovered || isSelected) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
        }

        // Draw circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? `${color}50` : `${color}25`;
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#fff" : color;
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.stroke();

        // Draw entity name inside (if large enough)
        if (size > 20) {
          ctx.fillStyle = "#fff";
          ctx.font = `${Math.min(12, size * 0.5)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const name = entity.name.length > 8 ? entity.name.slice(0, 7) + "…" : entity.name;
          ctx.fillText(name, node.x, node.y);
        }

        ctx.shadowBlur = 0;
      } else {
        // Memory: Hexagon
        const mem = node.data as GraphMemory;
        const color = mem.priority === "core" 
          ? "#F59E0B"  // Amber for core memories
          : COLORS.sectors[mem.sector || "default"] || COLORS.sectors.default;
        const size = node.size;

        // Glow - stronger for core memories
        if (isHovered || isSelected || mem.priority === "core") {
          ctx.shadowColor = color;
          ctx.shadowBlur = mem.priority === "core" ? 25 : 15;
        }

        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const x = node.x + size * Math.cos(angle);
          const y = node.y + size * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = isHovered ? `${color}50` : `${color}30`;
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#fff" : color;
        ctx.lineWidth = isSelected ? 2 : (mem.priority === "core" ? 2 : 1);
        ctx.stroke();

        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }, [nodes, edges, zoom, pan, hoveredNode, selectedNode, loading]);

  // ============ Mouse Handlers ============
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (clientX - rect.left - pan.x - rect.width / 2) / zoom + centerX;
      const y = (clientY - rect.top - pan.y - rect.height / 2) / zoom + centerY;
      return { x, y };
    },
    [pan, zoom]
  );

  const getNodeAt = useCallback(
    (worldX: number, worldY: number): GraphNode | null => {
      for (const node of [...nodes].reverse()) {
        const size = node.type === "document" ? node.size * 0.8 : node.size;
        const dx = node.x - worldX;
        const dy = node.y - worldY;
        if (dx * dx + dy * dy < size * size) return node;
      }
      return null;
    },
    [nodes]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);
      const node = getNodeAt(world.x, world.y);

      if (node) {
        setDraggingNode(node);
      } else {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [screenToWorld, getNodeAt, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);

      if (draggingNode) {
        const node = nodesRef.current.find((n) => n.id === draggingNode.id);
        if (node) {
          node.x = world.x;
          node.y = world.y;
          setNodes([...nodesRef.current]);
        }
        return;
      }

      if (isDragging) {
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        return;
      }

      setHoveredNode(getNodeAt(world.x, world.y));
    },
    [screenToWorld, draggingNode, isDragging, dragStart, getNodeAt]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (hoveredNode && !draggingNode) {
      setSelectedNode(selectedNode?.id === hoveredNode.id ? null : hoveredNode);
    } else if (!hoveredNode) {
      setSelectedNode(null);
    }
  }, [hoveredNode, selectedNode, draggingNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (!canvasRef.current) return;
    
    // Smooth zoom factor (reduced from 0.9/1.1 to 0.95/1.05 for smoother zooming)
    const zoomIntensity = 0.05; // 5% per scroll tick (was 10%)
    const delta = e.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
    
    // Get mouse position relative to canvas
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world position before zoom
    const worldX = (mouseX - pan.x - rect.width / 2) / zoom + centerX;
    const worldY = (mouseY - pan.y - rect.height / 2) / zoom + centerY;
    
    // Apply zoom
    const newZoom = Math.min(3, Math.max(0.2, zoom * delta));
    
    // Calculate new pan to keep mouse position fixed
    const newPanX = mouseX - (worldX - centerX) * newZoom - rect.width / 2;
    const newPanY = mouseY - (worldY - centerY) * newZoom - rect.height / 2;
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan]);

  const resetView = useCallback(() => {
    setZoom(0.6);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  }, []);

  if (!isOpen) return null;

  const totalMemories = nodes.filter((n) => n.type === "memory").length;
  const totalDocs = nodes.filter((n) => n.type === "document").length;
  const totalEntities = nodes.filter((n) => n.type === "entity").length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" style={{ touchAction: 'none' }}>
      <div className="bg-[#0f1419] rounded-2xl w-full h-full max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col min-h-0 shadow-2xl border border-neutral-800" style={{ touchAction: 'none' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-800/50">
          <div>
            <h2 className="text-xl font-semibold text-white">Memory Graph</h2>
            <p className="text-sm text-neutral-400 mt-0.5">
              {totalDocs} documents • {totalMemories} memories • {totalEntities > 0 ? `${totalEntities} entities • ` : ''}{edges.length} connections
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom((z) => Math.min(3, z * 1.15))} className="p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300 transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.85))} className="p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300 transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={resetView} className="p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300 ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0f1419]">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500 bg-[#0f1419]">{error}</div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500 bg-[#0f1419]">No memories to display</div>
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

          {/* Legend - Always visible */}
          {!loading && !error && (
            <div className="absolute bottom-4 right-4 bg-neutral-900/95 rounded-xl p-4 backdrop-blur-sm border border-neutral-800 z-10">
            <div className="text-xs font-medium text-neutral-400 mb-3">Guide</div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-neutral-500 mb-1.5">NODES</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-3 rounded bg-white/15 border border-white/60" />
                    <span className="text-xs text-neutral-300">Document</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-400/30 border border-blue-400" style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
                    <span className="text-xs text-neutral-300">Memory</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-amber-500/30 border border-amber-500" style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
                    <span className="text-xs text-neutral-300">Core Memory</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 mb-1.5">CONNECTIONS</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-px bg-slate-500/35" />
                    <span className="text-xs text-neutral-400">Doc-Memory</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="16" height="8" className="flex-shrink-0">
                      <path d="M 0 4 Q 8 0, 16 4" stroke="rgba(35, 189, 255, 0.5)" strokeWidth="1.5" fill="none" />
                    </svg>
                    <span className="text-xs text-neutral-400">Waypoint</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 mb-1.5">MEMORY SECTORS</div>
                <div className="space-y-1">
                  {Object.entries(COLORS.sectors)
                    .filter(([k]) => k !== "default")
                    .map(([sector, color]) => (
                      <div key={sector} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[11px] text-neutral-400 capitalize">{sector}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Selected Node Detail */}
          {selectedNode && (
            <div className="absolute top-4 right-4 w-80 bg-neutral-900/95 rounded-xl p-5 backdrop-blur-sm border border-neutral-800">
              <div className="flex items-center gap-2 mb-3">
                {selectedNode.type === "document" ? (
                  <FileText className="w-5 h-5 text-white/70" />
                ) : selectedNode.type === "entity" ? (
                  <div className="w-5 h-5 rounded-full bg-amber-500/30 border border-amber-500" />
                ) : (
                  <Brain className="w-5 h-5 text-blue-400" />
                )}
                <span className="text-sm font-medium text-white capitalize">{selectedNode.type}</span>
                <button onClick={() => setSelectedNode(null)} className="ml-auto text-neutral-500 hover:text-neutral-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedNode.type === "document" ? (
                <>
                  <div className="text-[10px] text-neutral-500 mb-1">TITLE</div>
                  <p className="text-sm text-white mb-3">{(selectedNode.data as GraphSource).title || "Untitled"}</p>
                  {(selectedNode.data as GraphSource).summary && (
                    <>
                      <div className="text-[10px] text-neutral-500 mb-1">SUMMARY</div>
                      <p className="text-xs text-neutral-300 leading-relaxed mb-3">{(selectedNode.data as GraphSource).summary}</p>
                    </>
                  )}
                  <div className="text-[10px] text-neutral-500 mb-1">MEMORY COUNT</div>
                  <p className="text-sm text-white">{(selectedNode.data as GraphSource).memory_count} memories</p>
                  <div className="mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500">
                    {new Date((selectedNode.data as GraphSource).created_at).toLocaleDateString()}
                  </div>
                </>
              ) : selectedNode.type === "entity" ? (
                <>
                  <div className="text-[10px] text-neutral-500 mb-1">NAME</div>
                  <p className="text-sm text-white mb-3">{(selectedNode.data as GraphEntity).name}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium capitalize"
                      style={{
                        backgroundColor: `${COLORS.entityTypes[(selectedNode.data as GraphEntity).entity_type] || COLORS.entityTypes.default}33`,
                        color: COLORS.entityTypes[(selectedNode.data as GraphEntity).entity_type] || COLORS.entityTypes.default,
                      }}
                    >
                      {(selectedNode.data as GraphEntity).entity_type}
                    </span>
                  </div>
                  {(selectedNode.data as GraphEntity).summary && (
                    <>
                      <div className="text-[10px] text-neutral-500 mb-1">SUMMARY</div>
                      <p className="text-xs text-neutral-300 leading-relaxed mb-3">{(selectedNode.data as GraphEntity).summary}</p>
                    </>
                  )}
                  <div className="text-xs text-neutral-500">
                    Mentioned {(selectedNode.data as GraphEntity).mention_count || 0} times
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium capitalize"
                      style={{
                        backgroundColor: `${COLORS.sectors[(selectedNode.data as GraphMemory).sector || "default"]}33`,
                        color: COLORS.sectors[(selectedNode.data as GraphMemory).sector || "default"],
                      }}
                    >
                      {(selectedNode.data as GraphMemory).sector || "unknown"}
                    </span>
                    {(selectedNode.data as GraphMemory).memory_type && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium capitalize bg-neutral-700 text-neutral-300">
                        {(selectedNode.data as GraphMemory).memory_type}
                      </span>
                    )}
                    {(selectedNode.data as GraphMemory).priority === "core" && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                        Core
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-200 leading-relaxed">{(selectedNode.data as GraphMemory).content}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
                    <span>Salience: {((selectedNode.data as GraphMemory).salience * 100).toFixed(0)}%</span>
                    {((selectedNode.data as GraphMemory).recall_count || 0) > 0 && (
                      <span>Recalled: {(selectedNode.data as GraphMemory).recall_count}×</span>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500">
                    {new Date((selectedNode.data as GraphMemory).created_at).toLocaleDateString()}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
