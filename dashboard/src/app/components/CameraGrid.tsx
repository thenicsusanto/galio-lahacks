import { useState, useCallback, useRef } from 'react';
import { Search, SlidersHorizontal, Minimize2 } from 'lucide-react';
import { cameras } from './cameraData';
import { CameraFeed } from './CameraFeed';
import { usePipeline } from '../hooks/usePipeline';

const FLOORS = ['All', 'Floor 1', 'Floor 2', 'Parking'];
const FLOOR_MAP: Record<string, number | null> = {
  'All': null, 'Floor 1': 1, 'Floor 2': 2, 'Parking': 0,
};


// ── Real pipeline video tile ────────────────────────────────────────────────
function PipelineCamTile({
  cameraId,
  flashing = false,
  selected = false,
  onSelect,
  onDoubleClick,
}: {
  cameraId: string;
  flashing?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
}) {
  const scoreCol = '#34d399'; // green — live means healthy
  const clipNormal = 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))';
  const [feedSrc, setFeedSrc] = useState(`/video_feed/${cameraId}?raw=1`);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleError = useCallback(() => {
    if (retryTimer.current) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setFeedSrc(`/video_feed/${cameraId}?raw=1&t=${Date.now()}`);
    }, 1500);
  }, [cameraId]);

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className={`relative overflow-hidden cursor-pointer group ${flashing ? 'cam-flashing' : ''}`}
      style={{
        background: '#07090e',
        clipPath: clipNormal,
        border: selected
          ? `1.5px solid ${scoreCol}`
          : flashing
          ? '1.5px solid #e8607a88'
          : '1.5px solid #c9a84c22',
        boxShadow: selected
          ? `0 0 0 1px ${scoreCol}44, 0 0 20px ${scoreCol}22`
          : '0 0 0 1px #c9a84c11',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Real MJPEG stream */}
      <img
        src={feedSrc}
        className="block w-full aspect-video object-cover"
        alt={cameraId}
        style={{ imageRendering: 'auto', background: '#07090e' }}
        onError={handleError}
      />

      {/* Top header overlay */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-2.5 py-1.5"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="animate-pulse"
            style={{
              display: 'inline-block',
              width: 6, height: 6,
              clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
              background: '#f87171',
              boxShadow: '0 0 6px #f87171',
            }}
          />
          <span className="text-[11px] text-white/90" style={{ fontFamily: "'Inter', sans-serif" }}>
            {cameraId.toUpperCase().replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Hover highlight */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at center, ${scoreCol}08, transparent 70%)` }}
      />
    </div>
  );
}

export function CameraGrid({
  focusedCamId,
  setFocusedCamId,
  focusedLiveCam,
  setFocusedLiveCam,
  flashingCamIds,
}: {
  focusedCamId: number | null;
  setFocusedCamId: (id: number | null) => void;
  focusedLiveCam: string | null;
  setFocusedLiveCam: (id: string | null) => void;
  flashingCamIds: number[];
}) {
  const [search, setSearch] = useState('');
  const [floor, setFloor] = useState('All');
  const [selectedCam, setSelectedCam] = useState<number | null>(null);
  const { cameras: liveCamIds } = usePipeline();

  const filtered = cameras.filter((c) => {
    const matchFloor = FLOOR_MAP[floor] === null || c.floor === FLOOR_MAP[floor];
    const matchSearch = search === '' || c.name.toLowerCase().includes(search.toLowerCase());
    return matchFloor && matchSearch;
  });

  const focusedCamera = focusedCamId !== null ? cameras.find(c => c.id === focusedCamId) : null;
  const otherCameras = focusedCamId !== null ? cameras.filter(c => c.id !== focusedCamId) : [];

  // ── Speaker / Focus View ────────────────────────────────────────────────
  if (focusedCamera) {
    return (
      <main className="flex flex-col flex-1 min-w-0" style={{ background: '#0b0c14' }}>
        {/* Focus header */}
        <div
          className="flex items-center gap-3 px-4 shrink-0 relative"
          style={{
            height: 48,
            borderBottom: '1px solid #c9a84c22',
            background: 'linear-gradient(90deg, #0f1120 0%, #0d0f1a 100%)',
          }}
        >
          {/* Accent left edge */}
          <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: 'linear-gradient(180deg, #c9a84c, #c9a84c44)', boxShadow: '0 0 10px #c9a84c66' }} />
          <span className="inline-block animate-pulse" style={{ width: 7, height: 7, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', background: '#f87171', boxShadow: '0 0 8px #f87171' }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#ccd4ea', letterSpacing: '0.02em' }}>
            {focusedCamera.name}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c9a84c88' }}>
            — Focused View
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setFocusedCamId(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 transition-colors"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                background: 'rgba(201,168,76,0.08)',
                border: 'none',
                color: '#c9a84c88',
                fontSize: 11,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <Minimize2 size={11} />
              <span>Exit Focus</span>
            </button>
          </div>
        </div>

        {/* Big focused feed */}
        <div className="flex-1 p-3 min-h-0" onDoubleClick={() => setFocusedCamId(null)}>
          <div className="h-full">
            <CameraFeed
              camera={focusedCamera}
              selected={false}
              onSelect={() => {}}
              flashing={flashingCamIds.includes(focusedCamera.id)}
              size="focused"
            />
          </div>
        </div>

        {/* Thumbnail strip */}
        <div
          className="flex gap-2 px-3 pb-3 shrink-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {otherCameras.map(cam => (
            <div
              key={cam.id}
              className="shrink-0 cursor-pointer"
              style={{ width: 160 }}
              onDoubleClick={() => setFocusedCamId(cam.id)}
            >
              <CameraFeed
                camera={cam}
                selected={selectedCam === cam.id}
                onSelect={() => setSelectedCam(selectedCam === cam.id ? null : cam.id)}
                onDoubleClick={() => setFocusedCamId(cam.id)}
                flashing={flashingCamIds.includes(cam.id)}
                size="thumb"
              />
            </div>
          ))}
        </div>
      </main>
    );
  }

  // ── Live Camera Focus View ──────────────────────────────────────────────
  if (focusedLiveCam) {
    const otherLiveCams = liveCamIds.filter(id => id !== focusedLiveCam);
    return (
      <main className="flex flex-col flex-1 min-w-0" style={{ background: '#0b0c14' }}>
        <div
          className="flex items-center gap-3 px-4 shrink-0 relative"
          style={{ height: 48, borderBottom: '1px solid #c9a84c22', background: 'linear-gradient(90deg, #0f1120 0%, #0d0f1a 100%)' }}
        >
          <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: 'linear-gradient(180deg, #c9a84c, #c9a84c44)', boxShadow: '0 0 10px #c9a84c66' }} />
          <span className="inline-block animate-pulse" style={{ width: 7, height: 7, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', background: '#f87171', boxShadow: '0 0 8px #f87171' }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#ccd4ea', letterSpacing: '0.02em' }}>
            {focusedLiveCam.toUpperCase().replace(/_/g, ' ')}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c9a84c88' }}>— Focused View</span>
          <div className="ml-auto">
            <button
              onClick={() => setFocusedLiveCam(null)}
              className="flex items-center gap-1.5 px-3 py-1.5"
              style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))', background: 'rgba(201,168,76,0.08)', border: 'none', color: '#c9a84c88', fontSize: 11, fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}
            >
              <Minimize2 size={11} />
              <span>Exit Focus</span>
            </button>
          </div>
        </div>

        <div className="flex-1 p-3 min-h-0" onDoubleClick={() => setFocusedLiveCam(null)}>
          <div className="h-full overflow-hidden" style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))', border: '1.5px solid #34d39944' }}>
            <img
              src={`/video_feed/${focusedLiveCam}?raw=0`}
              className="block w-full h-full object-cover"
              alt={focusedLiveCam}
              style={{ background: '#07090e' }}
              onError={(e) => {
                const img = e.currentTarget;
                setTimeout(() => { img.src = `/video_feed/${focusedLiveCam}?raw=0&t=${Date.now()}`; }, 1500);
              }}
            />
          </div>
        </div>

        {otherLiveCams.length > 0 && (
          <div className="flex gap-2 px-3 pb-3 shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {otherLiveCams.map(camId => (
              <div key={camId} className="shrink-0" style={{ width: 160 }}>
                <PipelineCamTile cameraId={camId} selected={false} onSelect={() => setFocusedLiveCam(camId)} />
              </div>
            ))}
          </div>
        )}
      </main>
    );
  }

  // ── Normal Grid View ────────────────────────────────────────────────────
  return (
    <main className="flex flex-col flex-1 min-w-0" style={{ background: '#0b0c14' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 shrink-0 relative"
        style={{
          height: 48,
          borderBottom: '1px solid #c9a84c22',
          background: 'linear-gradient(90deg, #0f1120 0%, #0d0f1a 100%)',
        }}
      >
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: 'linear-gradient(180deg, #c9a84c, #c9a84c44)', boxShadow: '0 0 10px #c9a84c66' }} />

        <div className="flex items-center gap-2 mr-1 pl-2">
          {/* Angular accent */}
          <div style={{ width: 3, height: 18, background: '#7a96e8', clipPath: 'polygon(0 0, 100% 10%, 100% 90%, 0 100%)', boxShadow: '0 0 8px #7a96e8' }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, letterSpacing: '0.04em', color: '#ccd4ea' }}>
            Live Feeds
          </span>
          <span
            className="flex items-center gap-1 px-2 py-0.5"
            style={{
              clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
              background: 'rgba(122,150,232,0.12)',
              border: 'none',
              fontFamily: "'DM Mono', monospace",
              fontSize: 10.5,
              color: '#7a96e8',
              textShadow: '0 0 8px #7a96e8',
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            {liveCamIds.length > 0 ? liveCamIds.length : cameras.length} active
          </span>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 flex-1 max-w-[200px]"
          style={{
            background: '#080910',
            border: '1px solid #c9a84c22',
            clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)',
          }}
        >
          <Search size={11} color="#c9a84c66" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cameras…"
            className="flex-1 bg-transparent outline-none"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#8a9fc0' }}
          />
        </div>

        {/* Floor filter */}
        <div className="flex items-center gap-1">
          <SlidersHorizontal size={14} color="#c9a84c99" />
        </div>


        {/* Bottom glow line */}
        <div className="absolute bottom-0 left-0 right-0" style={{ height: 1, background: 'linear-gradient(90deg, #c9a84c66, transparent 60%)' }} />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 && liveCamIds.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#3e5272' }}>
              No cameras match filter
            </span>
          </div>
        ) : (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: (() => { const n = liveCamIds.length > 0 ? liveCamIds.length : filtered.length; return `repeat(${n <= 4 ? 2 : 3}, 1fr)`; })() }}>
            {/* Real pipeline cameras first */}
            {liveCamIds.map((camId) => (
              <PipelineCamTile
                key={camId}
                cameraId={camId}
                flashing={false}
                selected={false}
                onSelect={() => setFocusedLiveCam(camId)}
              />
            ))}
            {/* Demo animated tiles only shown when no live cameras */}
            {liveCamIds.length === 0 && filtered.map((cam) => (
              <CameraFeed
                key={cam.id}
                camera={cam}
                selected={selectedCam === cam.id}
                onSelect={() => setSelectedCam(selectedCam === cam.id ? null : cam.id)}
                onDoubleClick={() => setFocusedCamId(cam.id)}
                flashing={flashingCamIds.includes(cam.id)}
                size="normal"
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}