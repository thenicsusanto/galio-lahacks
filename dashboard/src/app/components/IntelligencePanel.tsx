import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Bookmark, BookmarkCheck, Maximize2 } from 'lucide-react';
import { AlertEvent } from './cameraData';
import { usePipeline } from '../hooks/usePipeline';

// ─── Query responses ───────────────────────────────────────────────────────
const CANNED: Record<string, string> = {
  'back door':  '→ Cam 3: 1 entry at 14:18:44. Person detected, conf 96%. No tailgating.',
  'loitering':  '→ Cam 3: Active alert since 14:19:02. Duration 4m 28s. EXIT zone. Threshold +248s.',
  'bag':        '→ Cam 5: Unattended bag at [334,223]. Stationary 2m 01s. Flagged.',
  'vehicle':    '→ Cam 4: 2 vehicles in Zone B. Last movement 14:21:30. Plates: AUTH-221, AUTH-304.',
  'person':     '→ Cams 1,2,3,7: 4 detections in last 10 min. No unauthorized access.',
};
function getResponse(q: string) {
  const lower = q.toLowerCase();
  for (const [k, v] of Object.entries(CANNED)) {
    if (lower.includes(k)) return v;
  }
  return '→ No matching events found in the last 10 minutes.';
}

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

// ─── Single-vs-double click helper ────────────────────────────────────────
function useClickHandler(onSingle: () => void, onDouble: () => void, delay = 220) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      onDouble();
    } else {
      timer.current = setTimeout(() => {
        timer.current = null;
        onSingle();
      }, delay);
    }
  };
}

// ─── Event row ────────────────────────────────────────────────────────────
function EventRow({
  ev,
  flagged,
  now,
  onToggleFlag,
  onZoom,
}: {
  ev: AlertEvent;
  flagged: boolean;
  now: number;
  onToggleFlag: () => void;
  onZoom: () => void;
}) {
  const col   = SEV_COLOR[ev.severity];
  const score = getScore(ev);
  const handleClick = useClickHandler(onToggleFlag, onZoom);

  // Score bar fill %
  const barPct = (score / 10) * 100;

  return (
    <div
      onClick={handleClick}
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
      title="Click to flag · Double-click to focus camera"
    >
      {/* Row 1: Time + Camera */}
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
            CAM-{String(ev.cam).padStart(2, '0')}
          </span>
          {/* Flag / zoom icons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 size={11} color="#48607a" />
            {flagged
              ? <BookmarkCheck size={13} color="#e8a840" />
              : <Bookmark size={13} color="#48607a" />
            }
          </div>
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

        {/* Score */}
        <div className="flex items-center gap-2 flex-1">
          {/* Bar */}
          <div
            className="flex-1 overflow-hidden"
            style={{ height: 3, background: '#111520', clipPath: 'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${barPct}%`,
                background: `linear-gradient(90deg, ${col}88, ${col})`,
                boxShadow: `0 0 6px ${col}`,
              }}
            />
          </div>
          {/* Number */}
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 13,
              color: col,
              letterSpacing: '0.02em',
              minWidth: 28,
              textAlign: 'right',
              textShadow: `0 0 10px ${col}66`,
            }}
          >
            {score.toFixed(1)}
          </span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              color: '#3e5272',
            }}
          >
            /10
          </span>
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
  onZoomCamera: (camId: number) => void;
  onNewEvent: (camId: number) => void;
}) {
  const [query, setQuery]             = useState('');
  const [queryResult, setQueryResult] = useState<{ text: string; query: string } | null>(null);
  const [logTab, setLogTab]           = useState<LogTab>('alerts');
  const [now, setNow]                 = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const logRef  = useRef<HTMLDivElement>(null);

  // Real pipeline data
  const { events: pipelineEvents } = usePipeline();

  // Merge real pipeline events on top of initial seed events
  const [localEvents, setLocalEvents] = useState<AlertEvent[]>([]);

  // When pipeline events arrive, prepend them to localEvents
  useEffect(() => {
    if (pipelineEvents.length > 0) {
      // pipelineEvents already de-duped and new-only from usePipeline
      setLocalEvents(prev => [...pipelineEvents, ...prev].slice(0, 100));
      // Notify parent about new high-severity events
      for (const ev of pipelineEvents) {
        if (ev.severity === 'critical' || ev.severity === 'warning') {
          onNewEvent(ev.cam);
        }
      }
    }
  }, [pipelineEvents, onNewEvent]);

  const events = localEvents;
  const flaggedRef = useRef(flaggedEventIds);
  flaggedRef.current = flaggedEventIds;

  const submitQuery = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    
    setQueryResult({ query: q, text: 'Scanning AI archives...' });
    setQuery('');
    
    try {
      const res = await fetch(`http://localhost:5001/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      
      if (data && data.length > 0) {
        const top = data[0];
        const date = new Date(top.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        let text = `→ ${top.camera_id.toUpperCase()} @ ${date}:\n${top.description}`;
        
        if (data.length > 1) {
             text += `\n\n(+ ${data.length - 1} other semantic matches found)`;
        }
        setQueryResult({ query: q, text });
      } else {
        setQueryResult({ query: q, text: '→ No matching events found in the recent archives.' });
      }
    } catch (e) {
      console.error("Search API failed, falling back to offline demo data:", e);
      setQueryResult({ query: q, text: getResponse(q) });
    }
  }, [query]);

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
            placeholder="Ask the archive… e.g. 'loitering in last 10 mins?'"
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

        {queryResult && (
          <div
            className="mt-2.5 p-3"
            style={{
              background: 'rgba(201,168,76,0.04)',
              border: '1px solid #c9a84c22',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
            }}
          >
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#c9a84c88', fontStyle: 'italic', marginBottom: 4 }}>
              "{queryResult.query}"
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c9a84c', lineHeight: 1.55, textShadow: '0 0 10px #c9a84c44' }}>
              {queryResult.text}
            </p>
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
                key={`${ev.camera_id}-${ev.timestamp}`}
                ev={ev}
                flagged={flaggedEventIds.includes(ev.id)}
                now={now}
                onToggleFlag={() => onToggleFlag(ev.id)}
                onZoom={() => onZoomCamera(ev.cam)}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}