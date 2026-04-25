import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Bookmark, BookmarkCheck, Maximize2, Wifi, WifiOff } from 'lucide-react';
import { AlertEvent, INITIAL_EVENTS } from './cameraData';
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

// ─── Severity helpers ──────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  critical: '#e8607a',
  warning:  '#e8a840',
  info:     '#7a96e8',
};

const SEV_LABEL: Record<string, string> = {
  critical: 'Critical',
  warning:  'Warning',
  info:     'Info',
};

// Per-event-type severity scores
const TYPE_SCORE: Record<string, number> = {
  LOITERING_ALERT:   9.2,
  BAG_UNATTENDED:    8.7,
  MOTION_DETECTED:   2.6,
  PERSON_DETECTED:   3.1,
  VEHICLE_DETECTED:  3.4,
  VEHICLE_MOVING:    3.4,
};
function getScore(ev: AlertEvent): number {
  return TYPE_SCORE[ev.type] ?? (ev.severity === 'critical' ? 8.5 : ev.severity === 'warning' ? 6.0 : 3.0);
}

// Humanise event type: LOITERING_ALERT → Loitering Alert
function fmtType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

type LogTab = 'all' | 'warnings' | 'flagged';

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
  onToggleFlag,
  onZoom,
}: {
  ev: AlertEvent;
  flagged: boolean;
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
          {ev.time}
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

      {/* Row 3: Severity label + Score bar */}
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
          {SEV_LABEL[ev.severity].toUpperCase()}
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
  const [logTab, setLogTab]           = useState<LogTab>('all');
  const logRef  = useRef<HTMLDivElement>(null);

  // Real pipeline data
  const { events: pipelineEvents, isLive } = usePipeline();

  // Merge real pipeline events on top of initial seed events
  const [localEvents, setLocalEvents] = useState<AlertEvent[]>(INITIAL_EVENTS);
  const nextId  = useRef(INITIAL_EVENTS[0].id + 1);

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

  const submitQuery = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setQueryResult({ query: q, text: getResponse(q) });
    setQuery('');
  }, [query]);

  const displayedEvents = (() => {
    switch (logTab) {
      case 'warnings': return events.filter(e => e.severity === 'critical' || e.severity === 'warning');
      case 'flagged':  return events.filter(e => flaggedEventIds.includes(e.id));
      default:         return events;
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
          {(['all', 'warnings', 'flagged'] as LogTab[]).map(tab => {
            const isActive = logTab === tab;
            const count =
              tab === 'warnings' ? events.filter(e => e.severity === 'critical' || e.severity === 'warning').length
              : tab === 'flagged' ? flaggedEventIds.length
              : events.length;
            const tabAccent = tab === 'warnings' ? '#e8607a' : tab === 'flagged' ? '#e8a840' : '#c9a84c';
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
                {/* Active bottom accent */}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 2, background: tabAccent, boxShadow: `0 0 8px ${tabAccent}` }}
                  />
                )}
                {tab === 'all' ? 'All' : tab === 'warnings' ? 'Warnings' : 'Flagged'}
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

          <div className="ml-auto flex items-center gap-1.5 pr-3">
            {isLive ? (
              <>
                <Wifi size={11} color="#34d399" />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 8.5, color: '#34d399', letterSpacing: '0.04em' }}>Pipeline Live</span>
              </>
            ) : (
              <>
                <WifiOff size={11} color="#4a6080" />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 8.5, color: '#4a6080', letterSpacing: '0.04em' }}>Demo Mode</span>
              </>
            )}
            <span
              className="animate-pulse ml-1"
              style={{
                display: 'inline-block',
                width: 6, height: 6,
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                background: isLive ? '#34d399' : '#f87171',
                boxShadow: isLive ? '0 0 6px #34d399' : '0 0 6px #f87171',
              }}
            />
          </div>
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
                {logTab === 'flagged' ? 'No flagged events' : 'No events'}
              </span>
            </div>
          ) : (
            displayedEvents.map(ev => (
              <EventRow
                key={ev.id}
                ev={ev}
                flagged={flaggedEventIds.includes(ev.id)}
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