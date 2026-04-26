import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Bookmark, BookmarkCheck, X, Maximize2 } from 'lucide-react';
import { AlertEvent } from './cameraData';
import { usePipeline } from '../hooks/usePipeline';


// ─── Priority helpers ──────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  critical: '#e8607a',
  warning:  '#e8a840',
  info:     '#7a96e8',
};

const PRIORITY_LABEL: Record<string, string> = {
  Immediate: 'IMMEDIATE',
  Monitor:   'MONITOR',
  Log:       'LOG',
};

function getPriorityLabel(ev: AlertEvent): string {
  return PRIORITY_LABEL[ev.action_required] ?? PRIORITY_LABEL.Log;
}

function getScore(ev: AlertEvent): number {
  // Use real VLM score (0–1) scaled to /10, fall back to severity estimate
  if (ev.score > 0) return ev.score * 10;
  return ev.severity === 'critical' ? 8.5 : ev.severity === 'warning' ? 6.0 : 3.0;
}

// Humanise event type: LOITERING_ALERT → Loitering Alert
function fmtType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtRelative(timestamp: number, now: number): string {
  const diff = Math.floor(now / 1000 - timestamp);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

type LogTab = 'alerts' | 'flagged';

// ─── Event row ────────────────────────────────────────────────────────────
function EventRow({
  ev,
  flagged,
  now,
  onToggleFlag,
  onExpand,
}: {
  ev: AlertEvent;
  flagged: boolean;
  now: number;
  onToggleFlag: () => void;
  onExpand: () => void;
}) {
  const col   = SEV_COLOR[ev.severity];
  const score = getScore(ev);

  // Score bar fill %
  const barPct = (score / 10) * 100;

  return (
    <div
      onClick={onExpand}
      className="flex flex-col gap-2 px-4 py-3 cursor-pointer transition-colors group relative"
      style={{
        borderBottom: '1px solid #0e1018',
        borderLeft: `3px solid ${col}`,
        background: flagged
          ? 'rgba(201,168,76,0.04)'
          : ev.severity === 'critical'
          ? 'rgba(232,96,122,0.04)'
          : 'transparent',
        boxShadow: flagged ? `inset 3px 0 12px ${col}22` : undefined,
      }}
      title="Click to expand"
    >
      {/* Row 1: Time + Camera + Flag button */}
      <div className="flex items-center justify-between">
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: '#4a6080',
            letterSpacing: '0.06em',
          }}
        >
          {ev.timestamp ? fmtRelative(ev.timestamp, now) : ev.time}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#7a96e8',
              background: 'rgba(122,150,232,0.10)',
              clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
              letterSpacing: '0.04em',
              textShadow: '0 0 8px #7a96e844',
            }}
          >
            {(ev.camera_id || `cam_${ev.cam}`).toUpperCase().replace(/_/g, '-')}
          </span>
          {/* Flag button — always visible, stops row click propagating */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFlag(); }}
            title={flagged ? 'Unflag' : 'Flag'}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {flagged
              ? <BookmarkCheck size={14} color="#e8a840" />
              : <Bookmark size={14} color="#48607a" />
            }
          </button>
        </div>
      </div>

      {/* Row 2: Event type */}
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          color: '#c8d8f0',
          letterSpacing: '0.01em',
          lineHeight: 1,
        }}
      >
        {fmtType(ev.type)}
      </div>

      {/* Row 3: Rationale */}
      {ev.details && (
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11.5,
            color: '#6a7f9a',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {ev.details}
        </div>
      )}

      {/* Row 4: Severity label + Score bar */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="px-1.5 py-0.5"
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9.5,
            color: col,
            background: `${col}15`,
            clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
            letterSpacing: '0.06em',
            textShadow: `0 0 8px ${col}66`,
          }}
        >
          {getPriorityLabel(ev)}
        </span>

        {/* Severity bar */}
        <div className="flex-1 overflow-hidden" style={{ height: 3, background: '#111520', clipPath: 'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}>
          <div
            className="h-full transition-all"
            style={{
              width: `${barPct}%`,
              background: `linear-gradient(90deg, ${col}88, ${col})`,
              boxShadow: `0 0 6px ${col}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export function IntelligencePanel({
  flaggedEventIds,
  onToggleFlag,
  onZoomCamera,
  onNewEvent,
}: {
  flaggedEventIds: number[];
  onToggleFlag: (id: number) => void;
  onZoomCamera: (cameraId: string) => void;
  onNewEvent: (camId: number) => void;
}) {
  const [query, setQuery]             = useState('');
  const [queryResult, setQueryResult] = useState<{ text: string; query: string } | null>(null);
  const [logTab, setLogTab]           = useState<LogTab>('alerts');
  const [now, setNow]                 = useState(Date.now());
  const [expandedEvent, setExpandedEvent] = useState<AlertEvent | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const logRef  = useRef<HTMLDivElement>(null);

  // Real pipeline data
  const { events: pipelineEvents } = usePipeline();

  // Merge real pipeline events on top of initial seed events
  const [localEvents, setLocalEvents] = useState<AlertEvent[]>([]);

  // When pipeline events arrive, add only ones not already in localEvents
  useEffect(() => {
    if (pipelineEvents.length === 0) return;
    setLocalEvents(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const newOnly = pipelineEvents.filter(e => !existingIds.has(e.id));
      if (newOnly.length === 0) return prev;
      for (const ev of newOnly) {
        if (ev.severity === 'critical' || ev.severity === 'warning') {
          onNewEvent(ev.cam);
        }
      }
      return [...newOnly, ...prev].slice(0, 100);
    });
  }, [pipelineEvents, onNewEvent]);

  const events = localEvents;
  const flaggedRef = useRef(flaggedEventIds);
  flaggedRef.current = flaggedEventIds;

  const [isQuerying, setIsQuerying] = useState(false);

  const submitQuery = useCallback(async () => {
    const q = query.trim();
    if (!q || isQuerying) return;
    setIsQuerying(true);
    setQueryResult({ query: q, text: '' });
    setQuery('');
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setQueryResult({ query: q, text: data.answer ?? '(no response)' });
    } catch (e) {
      setQueryResult({ query: q, text: 'Agent unavailable — check that the backend is running.' });
    } finally {
      setIsQuerying(false);
    }
  }, [query, isQuerying]);

  const displayedEvents = (() => {
    switch (logTab) {
      case 'flagged': return events.filter(e => flaggedEventIds.includes(e.id));
      default:        return events; // 'alerts' — Log-level events already filtered in usePipeline
    }
  })();

  return (
    <aside
      className="flex flex-col shrink-0 relative"
      style={{
        width: 360,
        background: 'linear-gradient(180deg, #0d0f1a 0%, #0b0c14 100%)',
        borderLeft: '1px solid #c9a84c22',
        boxShadow: '-2px 0 24px rgba(0,0,0,0.5)',
      }}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 hud-pulse" style={{ height: 2, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)', zIndex: 10 }} />

      {/* ── Natural Language Query ─────────────────────────────── */}
      <div
        className="px-4 py-3 shrink-0 relative"
        style={{ borderBottom: '1px solid #c9a84c22', background: 'linear-gradient(90deg, #0f1120, #0d0f1a)' }}
      >
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: 'linear-gradient(180deg, #c9a84c, #c9a84c44)', boxShadow: '0 0 10px #c9a84c66' }} />
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{
            background: '#080910',
            border: '1px solid #c9a84c22',
            clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
          }}
        >
          <Bot size={13} color="#c9a84c" strokeWidth={1.6} style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitQuery()}
            placeholder="Ask the AI… e.g. 'Any suspicious activity in the last 10 mins?'"
            disabled={isQuerying}
            className="flex-1 bg-transparent outline-none min-w-0"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#8a9fc0' }}
          />
          <button
            onClick={submitQuery}
            className="flex items-center justify-center shrink-0 transition-all"
            style={{
              width: 24, height: 24,
              clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))',
              background: query.trim() ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <Send size={10} color={query.trim() ? '#c9a84c' : '#3e5272'} />
          </button>
        </div>

        {(queryResult || isQuerying) && (
          <div
            className="mt-2.5 p-3"
            style={{
              background: 'rgba(201,168,76,0.04)',
              border: '1px solid #c9a84c22',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
            }}
          >
            {queryResult && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#c9a84c88', fontStyle: 'italic', marginBottom: 6 }}>
                "{queryResult.query}"
              </p>
            )}
            {isQuerying ? (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c9a84c66', lineHeight: 1.55 }}>
                Thinking…
              </p>
            ) : queryResult?.text ? (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#c8d8f0', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {queryResult.text}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Event Log ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Tabs */}
        <div
          className="flex items-center shrink-0"
          style={{ borderBottom: '1px solid #c9a84c22', background: '#0a0b14' }}
        >
          {(['alerts', 'flagged'] as LogTab[]).map(tab => {
            const isActive = logTab === tab;
            const count = tab === 'flagged' ? flaggedEventIds.length : events.length;
            const tabAccent = tab === 'flagged' ? '#e8a840' : '#e8607a';
            return (
              <button
                key={tab}
                onClick={() => setLogTab(tab)}
                className="flex items-center gap-1.5 px-4 py-3 transition-all relative"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: isActive ? '#ccd4ea' : '#48607a',
                  background: isActive ? `${tabAccent}0d` : 'transparent',
                  letterSpacing: '0.01em',
                  clipPath: isActive ? 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)' : 'none',
                }}
              >
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 2, background: tabAccent, boxShadow: `0 0 8px ${tabAccent}` }}
                  />
                )}
                {tab === 'alerts' ? 'Alerts' : 'Flagged'}
                <span
                  className="px-1.5 py-0"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    clipPath: 'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)',
                    background: isActive ? `${tabAccent}22` : 'rgba(255,255,255,0.04)',
                    color: isActive ? tabAccent : '#3e5272',
                    textShadow: isActive ? `0 0 8px ${tabAccent}` : 'none',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}

        </div>

        {/* Log list */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          {displayedEvents.length === 0 ? (
            <div className="flex items-center justify-center h-20">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#3e5272' }}>
                {logTab === 'flagged' ? 'No flagged events' : 'No suspicious activity detected'}
              </span>
            </div>
          ) : (
            displayedEvents.map(ev => (
              <EventRow
                key={`${ev.camera_id || 'static'}-${ev.id}-${ev.timestamp}`}
                ev={ev}
                flagged={flaggedEventIds.includes(ev.id)}
                now={now}
                onToggleFlag={() => onToggleFlag(ev.id)}
                onExpand={() => setExpandedEvent(ev)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Expanded event detail overlay ─────────────────────── */}
      {expandedEvent && (() => {
        const ev = expandedEvent;
        const col = SEV_COLOR[ev.severity];
        return (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 z-20"
              style={{ background: 'rgba(7,9,14,0.7)', backdropFilter: 'blur(2px)' }}
              onClick={() => setExpandedEvent(null)}
            />
            {/* Panel */}
            <div
              className="absolute left-0 right-0 bottom-0 z-30 flex flex-col"
              style={{
                background: 'linear-gradient(180deg, #0f1120 0%, #0b0c14 100%)',
                borderTop: `2px solid ${col}`,
                boxShadow: `0 -8px 40px rgba(0,0,0,0.8), 0 0 0 1px ${col}22`,
                maxHeight: '70%',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1a1e2e' }}>
                <div className="flex items-center gap-2">
                  <div style={{ width: 3, height: 16, background: col, boxShadow: `0 0 8px ${col}` }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#ccd4ea', letterSpacing: '0.02em' }}>
                    {fmtType(ev.type)}
                  </span>
                  <span
                    className="px-2 py-0.5"
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 10,
                      color: '#7a96e8',
                      background: 'rgba(122,150,232,0.10)',
                      clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                    }}
                  >
                    {(ev.camera_id || `cam_${ev.cam}`).toUpperCase().replace(/_/g, '-')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Flag */}
                  <button
                    onClick={() => onToggleFlag(ev.id)}
                    style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
                  >
                    {flaggedEventIds.includes(ev.id)
                      ? <BookmarkCheck size={15} color="#e8a840" />
                      : <Bookmark size={15} color="#48607a" />}
                  </button>
                  {/* Zoom to camera */}
                  <button
                    onClick={() => { onZoomCamera(ev.camera_id || `cam_${ev.cam}`); setExpandedEvent(null); }}
                    title="Focus camera"
                    style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
                  >
                    <Maximize2 size={14} color="#48607a" />
                  </button>
                  {/* Close */}
                  <button
                    onClick={() => setExpandedEvent(null)}
                    style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
                  >
                    <X size={15} color="#48607a" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="overflow-y-auto p-4 flex flex-col gap-3" style={{ scrollbarWidth: 'thin' }}>
                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4a6080' }}>
                    {ev.timestamp ? fmtRelative(ev.timestamp, now) : ev.time}
                  </span>
                  <span
                    className="px-1.5 py-0.5"
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 9.5,
                      color: col,
                      background: `${col}15`,
                      clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {getPriorityLabel(ev)}
                  </span>
                </div>

                {/* Full rationale */}
                {ev.details && (
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#9ab0cc', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {ev.details}
                  </p>
                )}

                {/* Detections */}
                {ev.detections && ev.detections.length > 0 && (
                  <div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#3e5272', marginBottom: 6, letterSpacing: '0.06em' }}>
                      DETECTIONS
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ev.detections.map((d, i) => (
                        <span
                          key={i}
                          style={{
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 10.5,
                            color: '#7a96e8',
                            background: 'rgba(122,150,232,0.08)',
                            border: '1px solid rgba(122,150,232,0.15)',
                            padding: '2px 7px',
                          }}
                        >
                          {d.label} {(d.confidence * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </aside>
  );
}