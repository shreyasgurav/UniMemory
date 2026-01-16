"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Loader2, FileText, Brain } from "lucide-react";
import { auth } from "@/lib/firebase";

// ============ Types ============
interface GraphMemory {
  id: string;
  content: string;
  sector?: string;
  salience: number;
  created_at: string;
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
  type: "document" | "memory";
  x: number;
  y: number;
  vx: number;
  vy: number;
  data: GraphSource | GraphMemory;
  size: number;
  parentId?: string; // For memories, points to parent document
}

interface MemoryGraphProps {
  isOpen: boolean;
  onClose: () => void;
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
  edge: {
    docMemory: "rgba(148, 163, 184, 0.35)",
    memoryMemory: "rgba(35, 189, 255, 0.5)",
  },
  sectors: {
    episodic: "#3B82F6",
    semantic: "#10B981",
    procedural: "#F59E0B",
    emotional: "#EC4899",
    reflective: "#8B5CF6",
    default: "#94A3B8",
  } as Record<string, string>,
};

const FORCE = {
  repulsion: -600,
  linkDistance: 120,
  linkStrengthDocMem: 0.9,
  linkStrengthMemMem: 0.4,
  centerGravity: 0.01,
  velocityDecay: 0.8,  // Higher = more damping, less movement
  collisionDoc: 60,
  collisionMem: 25,
};

// ============ Component ============
export default function MemoryGraph({ isOpen, onClose }: MemoryGraphProps) {
  const [sources, setSources] = useState<GraphSource[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState({ sources: 0, memories: 0, connections: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Graph state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animationRef = useRef<number>(0);
  const isSimulating = useRef(false);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [draggingNode, setDraggingNode] = useState<GraphNode | null>(null);

  // Center coordinates
  const centerX = 600;
  const centerY = 400;

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
          `${process.env.NEXT_PUBLIC_API_URL}/consumer/graph?limit=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error("Failed to fetch graph data");

        const data = await response.json();
        setSources(data.sources);
        setEdges(data.edges);
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [isOpen]);

  // ============ Build Graph Nodes ============
  useEffect(() => {
    if (sources.length === 0) {
      nodesRef.current = [];
      edgesRef.current = [];
      setNodes([]);
      return;
    }

    const allNodes: GraphNode[] = [];

    // Create document nodes in a grid
    const gridSize = Math.ceil(Math.sqrt(sources.length));
    const spacing = 350;

    sources.forEach((source, i) => {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      const x = centerX + (col - gridSize / 2) * spacing + (Math.random() - 0.5) * 50;
      const y = centerY + (row - gridSize / 2) * spacing + (Math.random() - 0.5) * 50;

      // Document node
      const docNode: GraphNode = {
        id: source.id,
        type: "document",
        x,
        y,
        vx: 0,
        vy: 0,
        data: source,
        size: 50,
      };
      allNodes.push(docNode);

      // Memory nodes around document
      source.memories.forEach((mem, memIdx) => {
        const angle = (2 * Math.PI * memIdx) / Math.max(source.memories.length, 1);
        const distance = 80 + Math.random() * 40;
        const memNode: GraphNode = {
          id: mem.id,
          type: "memory",
          x: x + Math.cos(angle) * distance,
          y: y + Math.sin(angle) * distance,
          vx: 0,
          vy: 0,
          data: mem,
          size: 20 + (mem.salience || 0.5) * 15,
          parentId: source.id,
        };
        allNodes.push(memNode);
      });
    });

    nodesRef.current = allNodes;
    edgesRef.current = edges;
    setNodes([...allNodes]);

    // Start simulation
    startSimulation();

    return () => {
      isSimulating.current = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [sources, edges]);

  // ============ Force Simulation ============
  const startSimulation = useCallback(() => {
    if (isSimulating.current) return;
    isSimulating.current = true;

    const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    let alpha = 1;
    let tickCount = 0;
    const maxTicks = 300; // Stop after 300 iterations regardless

    const tick = () => {
      tickCount++;
      
      // Stop conditions: alpha too low, max ticks reached, or velocities are very small
      if (!isSimulating.current || alpha < 0.005 || tickCount > maxTicks) {
        isSimulating.current = false;
        // Zero out all velocities to fully stop
        for (const node of nodesRef.current) {
          node.vx = 0;
          node.vy = 0;
        }
        setNodes([...nodesRef.current]);
        return;
      }

      const nodes = nodesRef.current;

      // 1. Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const ni = nodes[i];
          const nj = nodes[j];
          const dx = nj.x - ni.x;
          const dy = nj.y - ni.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (FORCE.repulsion * alpha) / (dist * dist);

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          ni.vx -= fx;
          ni.vy -= fy;
          nj.vx += fx;
          nj.vy += fy;
        }
      }

      // 2. Link forces
      for (const edge of edgesRef.current) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const strength =
          edge.edge_type === "doc-memory"
            ? FORCE.linkStrengthDocMem
            : FORCE.linkStrengthMemMem * edge.weight;

        const force = (dist - FORCE.linkDistance) * strength * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }

      // 3. Center gravity
      for (const node of nodes) {
        node.vx += (centerX - node.x) * FORCE.centerGravity * alpha;
        node.vy += (centerY - node.y) * FORCE.centerGravity * alpha;
      }

      // 4. Collision detection
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const ni = nodes[i];
          const nj = nodes[j];
          const ri = ni.type === "document" ? FORCE.collisionDoc : FORCE.collisionMem;
          const rj = nj.type === "document" ? FORCE.collisionDoc : FORCE.collisionMem;
          const minDist = ri + rj;

          const dx = nj.x - ni.x;
          const dy = nj.y - ni.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const ox = (dx / dist) * overlap;
            const oy = (dy / dist) * overlap;
            ni.x -= ox;
            ni.y -= oy;
            nj.x += ox;
            nj.y += oy;
          }
        }
      }

      // 5. Apply velocities with damping
      for (const node of nodes) {
        if (draggingNode?.id === node.id) continue;
        node.vx *= FORCE.velocityDecay;
        node.vy *= FORCE.velocityDecay;
        node.x += node.vx;
        node.y += node.vy;
      }

      // Faster alpha decay for quicker settling
      alpha *= 0.96;
      
      // Only update state every 3 frames for better performance
      if (tickCount % 3 === 0) {
        setNodes([...nodesRef.current]);
      }
      
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }, [draggingNode]);

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

      // Curved lines for memory-memory
      if (edge.edge_type === "memory-memory") {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.min(30, dist * 0.2);
        ctx.quadraticCurveTo(midX + offset * (dy / dist), midY - offset * (dx / dist), target.x, target.y);
        ctx.strokeStyle = COLORS.edge.memoryMemory;
        ctx.lineWidth = 1 + edge.weight;
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

        // Icon
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📄", node.x, node.y);

        ctx.shadowBlur = 0;
      } else {
        // Memory: Hexagon
        const mem = node.data as GraphMemory;
        const color = COLORS.sectors[mem.sector || "default"] || COLORS.sectors.default;
        const size = node.size;

        // Glow
        if (isHovered || isSelected) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
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
        ctx.lineWidth = isSelected ? 2 : 1;
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
          node.vx = 0;
          node.vy = 0;
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
    if (draggingNode) {
      setDraggingNode(null);
      // Restart simulation
      isSimulating.current = false;
      setTimeout(() => startSimulation(), 50);
    }
    setIsDragging(false);
  }, [draggingNode, startSimulation]);

  const handleClick = useCallback(() => {
    if (hoveredNode && !draggingNode) {
      setSelectedNode(selectedNode?.id === hoveredNode.id ? null : hoveredNode);
    } else if (!hoveredNode) {
      setSelectedNode(null);
    }
  }, [hoveredNode, selectedNode, draggingNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(3, Math.max(0.2, z * delta)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  }, []);

  if (!isOpen) return null;

  const totalMemories = nodes.filter((n) => n.type === "memory").length;
  const totalDocs = nodes.filter((n) => n.type === "document").length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0f1419] rounded-2xl w-full h-full max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-800">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-800/50">
          <div>
            <h2 className="text-xl font-semibold text-white">Memory Graph</h2>
            <p className="text-sm text-neutral-400 mt-0.5">
              {totalDocs} documents • {totalMemories} memories • {edges.length} connections
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))} className="p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300">
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
        <div className="flex-1 relative">
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

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-neutral-900/95 rounded-xl p-4 backdrop-blur-sm border border-neutral-800">
            <div className="text-xs font-medium text-neutral-400 mb-3">LEGEND</div>
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
                </div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 mb-1.5">SECTORS</div>
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

          {/* Selected Node Detail */}
          {selectedNode && (
            <div className="absolute top-4 right-4 w-80 bg-neutral-900/95 rounded-xl p-5 backdrop-blur-sm border border-neutral-800">
              <div className="flex items-center gap-2 mb-3">
                {selectedNode.type === "document" ? <FileText className="w-5 h-5 text-white/70" /> : <Brain className="w-5 h-5 text-blue-400" />}
                <span className="text-sm font-medium text-white">{selectedNode.type === "document" ? "Document" : "Memory"}</span>
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
                  </div>
                  <p className="text-sm text-neutral-200 leading-relaxed">{(selectedNode.data as GraphMemory).content}</p>
                  <div className="mt-3 text-xs text-neutral-500">
                    Salience: {((selectedNode.data as GraphMemory).salience * 100).toFixed(0)}%
                  </div>
                </>
              )}

              <div className="mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500">
                {new Date(selectedNode.data.created_at).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
