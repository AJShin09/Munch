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
  /** Set once the user pans/zooms/drags, so a container resize does not yank
   *  the viewport back to the fitted position under their fingers. */
  const userMoved = useRef(false);
  const fitted = useRef<{ id: string; w: number; h: number } | null>(null);

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

  /** Scale + centre the automaton inside the available canvas. The layout is
   *  authored in a fixed 640×360 space, so without this a phone-sized panel
   *  shows only the left half of the graph. */
  const fitToView = useCallback((pos: Record<string, Pos>, w: number, h: number) => {
    const points = Object.values(pos);
    if (points.length === 0) return;
    // Extra room on the left for the start-state arrow and label.
    const minX = Math.min(...points.map(p => p.x)) - 78;
    const maxX = Math.max(...points.map(p => p.x)) + 30;
    const minY = Math.min(...points.map(p => p.y)) - 30;
    const maxY = Math.max(...points.map(p => p.y)) + 30;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const z = Math.max(0.3, Math.min(1.4, Math.min(w / bw, h / bh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(z);
    setPan({ x: w / 2 - cx * z, y: h / 2 - cy * z });
  }, []);

  // Place nodes and fit the view whenever the automaton changes. A size change
  // re-fits only while the user has not taken over the viewport.
  useEffect(() => {
    if (!automaton) {
      setPositions({});
      fitted.current = null;
      return;
    }
    const states = automaton.states;
    const n = states.length;
    const cx = svgSize.w / 2;
    const cy = svgSize.h / 2;
    const r = Math.min(cx - 60, cy - 50, 40 * n, 200);
    let pos: Record<string, Pos>;
    if (automaton.layout && Object.keys(automaton.layout).length > 0) {
      pos = { ...automaton.layout };
    } else {
      pos = {};
      states.forEach((s, i) => {
        if (s === automaton.startState && n > 2) {
          pos[s] = { x: 80, y: svgSize.h / 2 };
        } else {
          const angle = (2 * Math.PI * i) / n - Math.PI / 2;
          pos[s] = { x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * 0.75 * Math.sin(angle)) };
        }
      });
    }
    setPositions(pos);

    const last = fitted.current;
    const automatonChanged = !last || last.id !== automaton.id;
    const sizeChanged = !last || Math.abs(last.w - svgSize.w) > 2 || Math.abs(last.h - svgSize.h) > 2;
    if (automatonChanged) userMoved.current = false;
    if (automatonChanged || (!userMoved.current && sizeChanged)) {
      fitted.current = { id: automaton.id, w: svgSize.w, h: svgSize.h };
      fitToView(pos, svgSize.w, svgSize.h);
    }
  }, [automaton?.id, svgSize.w, svgSize.h, fitToView]);

  // Wheel zoom must be a non-passive listener: React registers wheel handlers
  // passively, so `preventDefault()` there is ignored and the page scrolls.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      userMoved.current = true;
      setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const toSvgCoords = useCallback((clientX: number, clientY: number): Pos => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top  - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // Pointer events cover mouse, pen and touch. A press that starts on a node
  // drags it; anywhere else pans the canvas.
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const nodeEl = (e.target as Element).closest?.('[data-node-state]');
    const state = nodeEl?.getAttribute('data-node-state') ?? null;
    userMoved.current = true;
    if (state && interactive) {
      const svgPos = toSvgCoords(e.clientX, e.clientY);
      const nodePos = positions[state] ?? { x: 100, y: 100 };
      setDragging(state);
      setDragOffset({ x: svgPos.x - nodePos.x, y: svgPos.y - nodePos.y });
      onSelectState?.(state);
    } else {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is best-effort (synthetic events / stale pointer ids).
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
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

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setDragging(null);
    setIsPanning(false);
    try {
      if (svgRef.current?.hasPointerCapture(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore capture release failures
    }
  };

  if (!automaton || automaton.states.length === 0) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-dim)', fontSize: 13, padding: 16, textAlign: 'center' }}>
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
    <div ref={containerRef} className="automaton-graph" style={{ width: '100%', height: '100%', position: 'relative', background: '#070b12', overflow: 'hidden' }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
        {[['＋', 0.2], ['−', -0.2]].map(([label, delta]) => (
          <button key={String(label)} className="btn-icon ag-zoom"
            aria-label={Number(delta) > 0 ? 'Zoom in' : 'Zoom out'}
            onClick={() => { userMoved.current = true; setZoom(z => Math.max(0.3, Math.min(3, z + Number(delta)))); }}
            style={{ width: 28, height: 28, fontSize: 14, padding: 0 }}>
            {label}
          </button>
        ))}
        <button className="btn-icon ag-zoom"
          onClick={() => {
            userMoved.current = false;
            fitted.current = { id: automaton.id, w: svgSize.w, h: svgSize.h };
            fitToView(positions, svgSize.w, svgSize.h);
          }}
          style={{ width: 28, height: 28, fontSize: 12, padding: 0 }} title="Fit automaton to view" aria-label="Fit automaton to view">
          ⟲
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ cursor: isPanning ? 'grabbing' : dragging ? 'move' : 'grab', userSelect: 'none', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
                data-node-state={state}
                style={{ cursor: interactive ? 'move' : 'default', touchAction: 'none' }}>

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
