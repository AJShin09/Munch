// src/components/AutomatonGraph.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Automaton } from '../types';
import { EPSILON } from '../engine/automaton';

interface Props {
  automaton?: Automaton | null;
  activeStates?: Set<string> | string[];
  activeTransition?: { from: string; to: string } | null;
  interactive?: boolean;
  onSelectState?: (state: string) => void;
}

interface Pos { x: number; y: number; }

export const AutomatonGraph: React.FC<Props> = ({
  automaton, activeStates = new Set(), activeTransition = null, interactive = true, onSelectState,
}) => {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Pos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Pos>({ x: 0, y: 0 });
  const [svgSize, setSvgSize] = useState({ w: 600, h: 280 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeSet = new Set(Array.isArray(activeStates) ? activeStates : Array.from(activeStates));
  const acceptingSet = new Set(automaton?.acceptingStates ?? []);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSvgSize({ w: Math.max(200, width), h: Math.max(150, height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Place nodes whenever the automaton changes
  useEffect(() => {
    if (!automaton) return;
    if (automaton.layout && Object.keys(automaton.layout).length > 0) {
      setPositions({ ...automaton.layout });
      return;
    }
    const states = automaton.states;
    const n = states.length;
    const cx = svgSize.w / 2;
    const cy = svgSize.h / 2;
    const r = Math.min(cx - 60, cy - 50, 40 * n, 200);
    const pos: Record<string, Pos> = {};

    states.forEach((s, i) => {
      if (s === automaton.startState && n > 2) {
        pos[s] = { x: 80, y: svgSize.h / 2 };
      } else {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        pos[s] = { x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * 0.75 * Math.sin(angle)) };
      }
    });
    setPositions(pos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaton?.id, svgSize]);

  const toSvgCoords = useCallback((clientX: number, clientY: number): Pos => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top  - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const onNodeMouseDown = (e: React.MouseEvent, state: string) => {
    e.stopPropagation();
    if (!interactive) return;
    const svgPos = toSvgCoords(e.clientX, e.clientY);
    const nodePos = positions[state] ?? { x: 100, y: 100 };
    setDragging(state);
    setDragOffset({ x: svgPos.x - nodePos.x, y: svgPos.y - nodePos.y });
    onSelectState?.(state);
  };

  const onSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || dragging) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const svgPos = toSvgCoords(e.clientX, e.clientY);
      setPositions(prev => ({
        ...prev,
        [dragging]: { x: svgPos.x - dragOffset.x, y: svgPos.y - dragOffset.y },
      }));
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const onMouseUp = () => { setDragging(null); setIsPanning(false); };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  };

  if (!automaton || automaton.states.length === 0) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-dim)', fontSize: 13 }}>
        No automaton — select a token rule or compile a regex.
      </div>
    );
  }

  // Group transitions: (from,to) → symbols[]
  const edgeMap = new Map<string, string[]>();
  for (const t of automaton.transitions) {
    const key = `${t.from}||${t.to}`;
    const sym = !t.symbol || t.symbol === '' ? EPSILON : t.symbol;
    const existing = edgeMap.get(key) ?? [];
    if (!existing.includes(sym)) existing.push(sym);
    edgeMap.set(key, existing);
  }

  const NODE_R = 22;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#070b12', overflow: 'hidden' }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
        {[['＋', 0.2], ['−', -0.2]].map(([label, delta]) => (
          <button key={String(label)} className="btn-icon"
            onClick={() => setZoom(z => Math.max(0.3, Math.min(3, z + Number(delta))))}
            style={{ width: 28, height: 28, fontSize: 14, padding: 0 }}>
            {label}
          </button>
        ))}
        <button className="btn-icon" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          style={{ width: 28, height: 28, fontSize: 12, padding: 0 }} title="Reset view">
          ⟲
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', userSelect: 'none' }}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
      >
        <defs>
          <marker id="ag-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#66b2ff"/>
          </marker>
          <marker id="ag-arrow-start" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" style={{ fill: 'var(--emerald)' }}/>
          </marker>
          <filter id="ag-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* Start arrow */}
          {positions[automaton.startState] && (() => {
            const sp = positions[automaton.startState];
            return (
              <>
                <line x1={sp.x - 55} y1={sp.y} x2={sp.x - NODE_R - 4} y2={sp.y}
                  style={{ stroke: 'var(--emerald)' }} strokeWidth="2" markerEnd="url(#ag-arrow-start)"/>
                <text x={sp.x - 58} y={sp.y - 7} style={{ fill: 'var(--emerald)' }} fontSize="10"
                  fontWeight="700" fontFamily="monospace" textAnchor="end">START</text>
              </>
            );
          })()}

          {/* Edges */}
          {Array.from(edgeMap.entries()).map(([key, syms]) => {
            const [from, to] = key.split('||');
            const pF = positions[from] ?? { x: 50, y: 50 };
            const pT = positions[to] ?? { x: 200, y: 200 };
            const label = syms.join(', ');
            const hasReverse = edgeMap.has(`${to}||${from}`);

            if (from === to) {
              // Self-loop above node
              const lh = 52;
              const pathD = `M ${pF.x - 11} ${pF.y - NODE_R} C ${pF.x - 40} ${pF.y - NODE_R - lh}, ${pF.x + 40} ${pF.y - NODE_R - lh}, ${pF.x + 11} ${pF.y - NODE_R}`;
              const lx = pF.x, ly = pF.y - NODE_R - lh - 4;
              const labelWidth = label.length * 6.2 + 12;
              const loopActive = !!activeTransition && activeTransition.from === from && activeTransition.to === to;
              return (
                <g key={key}>
                  <path d={pathD} fill="none" stroke={loopActive ? '#ffcc66' : '#262626'} strokeWidth={loopActive ? 2.6 : 1.6} markerEnd="url(#ag-arrow)"/>
                  <rect x={lx - labelWidth/2} y={ly - 8} width={labelWidth} height={16} rx="4" fill={loopActive ? '#2a2010' : '#0f0f0f'} stroke={loopActive ? '#ffcc66' : '#262626'}/>
                  <text x={lx} y={ly + 4} fill={loopActive ? '#ffd98a' : '#66ff99'} fontSize="10" fontFamily="monospace" fontWeight="700" textAnchor="middle">{label}</text>
                </g>
              );
            }

            const dx = pT.x - pF.x, dy = pT.y - pF.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / dist, uy = dy / dist;

            let pathD: string, lx: number, ly: number;
            if (hasReverse) {
              const px = -uy * 42, py = ux * 42;
              const mx = (pF.x + pT.x) / 2 + px, my = (pF.y + pT.y) / 2 + py;
              const sx = pF.x + ux * NODE_R, sy = pF.y + uy * NODE_R;
              const ex = pT.x - ux * (NODE_R + 6), ey = pT.y - uy * (NODE_R + 6);
              pathD = `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
              lx = mx; ly = my;
            } else {
              const sx = pF.x + ux * NODE_R, sy = pF.y + uy * NODE_R;
              const ex = pT.x - ux * (NODE_R + 6), ey = pT.y - uy * (NODE_R + 6);
              pathD = `M ${sx} ${sy} L ${ex} ${ey}`;
              lx = (sx + ex) / 2 - uy * 12;
              ly = (sy + ey) / 2 + ux * 12;
            }

            const labelWidth = label.length * 6.2 + 12;
            const labelHeight = 16;
            const edgeActive = !!activeTransition && activeTransition.from === from && activeTransition.to === to;
            return (
              <g key={key}>
                <path d={pathD} fill="none" stroke={edgeActive ? '#ffcc66' : '#262626'} strokeWidth={edgeActive ? 2.6 : 1.6} markerEnd="url(#ag-arrow)"/>
                <rect x={lx - labelWidth/2} y={ly - labelHeight/2} width={labelWidth} height={labelHeight} rx="4" fill={edgeActive ? '#2a2010' : '#0f0f0f'} stroke={edgeActive ? '#ffcc66' : '#262626'}/>
                <text x={lx} y={ly + 4} fill={edgeActive ? '#ffd98a' : '#66ff99'} fontSize="10" fontFamily="monospace" fontWeight="700" textAnchor="middle" style={{ whiteSpace: 'nowrap' }}>{label}</text>
              </g>
            );
          })}

          {/* Nodes */}
          {automaton.states.map(state => {
            const pos = positions[state] ?? { x: 100, y: 100 };
            const isActive = activeSet.has(state);
            const isAcc = acceptingSet.has(state);
            const isStart = state === automaton.startState;

            const nodeFill = isActive ? '#0e2c47' : '#0f0f0f';
            const nodeStroke = isActive ? '#ffcc66' : isStart ? '#66ff99' : isAcc ? '#66b2ff' : '#262626';
            const textFill = '#ffffff';

            return (
              <g key={state} transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: interactive ? 'move' : 'default' }}
                onMouseDown={e => onNodeMouseDown(e, state)}>

                {/* Active glow ring */}
                {isActive && (
                  <circle r={NODE_R + 9} fill="rgba(255,204,102,0.18)" className="animate-pulse-ring"/>
                )}

                {/* Background + border */}
                <circle r={NODE_R} fill={nodeFill} stroke={nodeStroke} strokeWidth={isActive ? 2.5 : 2}
                  filter={isActive ? 'url(#ag-glow)' : undefined}/>

                {/* Accepting double ring */}
                {isAcc && (
                  <circle r={NODE_R - 4} fill="none" stroke={isActive ? '#ffdd88' : '#66ff99'} strokeWidth="1.6"/>
                )}

                {/* Label */}
                <text textAnchor="middle" dy="4" fontSize="12" fontWeight="700"
                  fontFamily="monospace" fill={textFill} pointerEvents="none">
                  {state}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 8, left: 10,
        display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)',
        background: 'rgba(13,17,32,0.85)', padding: '4px 10px',
        borderRadius: 6, border: '1px solid var(--border-color)', pointerEvents: 'none',
      }}>
        {[
          { color: 'var(--emerald)', label: 'Start' },
          { color: 'var(--sapphire)', label: 'Accepting', double: true },
          { color: 'var(--topaz)', label: 'Active' },
        ].map(item => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: item.double ? 'transparent' : item.color,
              border: item.double ? `2px solid ${item.color}` : 'none',
              boxShadow: item.double ? `inset 0 0 0 2px ${item.color}` : 'none',
            }}/>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};
