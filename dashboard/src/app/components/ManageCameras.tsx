import { useState } from 'react';
import { Camera, Wifi, WifiOff, Plus, Edit2, Check } from 'lucide-react';
import { cameras, CameraData } from './cameraData';

const FLOOR_LABEL: Record<number, string> = { 0: 'Parking / B1', 1: 'Floor 1', 2: 'Floor 2' };
const STATUS_COLOR: Record<string, string> = { green: '#34d399', yellow: '#fbbf24', red: '#f87171' };
const STATUS_LABEL: Record<string, string> = { green: 'Normal', yellow: 'Review', red: 'Incident' };

export function ManageCameras() {
  const [onlineMap, setOnlineMap] = useState<Record<number, boolean>>(
    cameras.reduce((a, c) => ({ ...a, [c.id]: true }), {} as Record<number, boolean>)
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [names, setNames] = useState<Record<number, string>>(
    cameras.reduce((a, c) => ({ ...a, [c.id]: c.name }), {} as Record<number, string>)
  );

  const toggle = (id: number) => setOnlineMap(p => ({ ...p, [id]: !p[id] }));

  return (
    <main className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ background: '#0e0f14' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 60, borderBottom: '1px solid #22273c', background: '#11131c' }}
      >
        <div>
          <h2 style={{ fontSize: 16, color: '#ccd4ea', letterSpacing: '0.02em', fontFamily: "'Inter', sans-serif" }}>
            Manage Cameras
          </h2>
          <p style={{ fontSize: 12, color: '#48607a', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
            {cameras.length} cameras configured · {Object.values(onlineMap).filter(Boolean).length} online
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors"
          style={{ background: 'rgba(122,150,232,0.07)', border: '1px solid rgba(122,150,232,0.2)', color: '#7a96e8', fontSize: 12, fontFamily: "'Inter', sans-serif" }}
        >
          <Plus size={13} />
          Add Camera
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Column headers */}
        <div
          className="grid gap-4 px-4 pb-2 mb-1"
          style={{ gridTemplateColumns: '1fr 120px 80px 80px 80px', fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#3e5272', letterSpacing: '0.05em', borderBottom: '1px solid #22273c' }}
        >
          <span>Camera Name</span>
          <span>Location</span>
          <span>Status</span>
          <span>Bitrate</span>
          <span>Online</span>
        </div>

        <div className="flex flex-col gap-1.5 mt-2">
          {cameras.map((cam: CameraData) => {
            const online = onlineMap[cam.id];
            const isEditing = editingId === cam.id;
            const statusColor = STATUS_COLOR[cam.status];

            return (
              <div
                key={cam.id}
                className="grid gap-4 items-center px-4 py-3 rounded-xl transition-colors"
                style={{
                  gridTemplateColumns: '1fr 120px 80px 80px 80px',
                  background: '#11131c',
                  border: '1px solid #22273c',
                  opacity: online ? 1 : 0.5,
                }}
              >
                {/* Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex items-center justify-center rounded-lg shrink-0"
                    style={{ width: 32, height: 32, background: online ? 'rgba(122,150,232,0.07)' : '#0c0e13', border: '1px solid #22273c' }}
                  >
                    <Camera size={14} color={online ? '#7a96e8' : '#3e5272'} />
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={names[cam.id]}
                        onChange={e => setNames(p => ({ ...p, [cam.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && setEditingId(null)}
                        className="flex-1 rounded-lg px-2 py-1 outline-none min-w-0"
                        style={{ background: '#0c0e18', border: '1px solid rgba(122,150,232,0.3)', fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#ccd4ea' }}
                      />
                      <button onClick={() => setEditingId(null)}>
                        <Check size={13} color="#4cc98a" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#ccd4ea' }}>
                        {names[cam.id]}
                      </span>
                      <button onClick={() => setEditingId(cam.id)} className="shrink-0 opacity-0 hover:opacity-100 transition-opacity">
                        <Edit2 size={10} color="#48607a" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Floor */}
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#48607a' }}>
                  {FLOOR_LABEL[cam.floor]}
                </span>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: statusColor }}>
                    {STATUS_LABEL[cam.status]}
                  </span>
                </div>

                {/* Bitrate */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#48607a' }}>
                  {cam.bitrate}
                </span>

                {/* Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle(cam.id)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all"
                    style={{
                      background: online ? 'rgba(76,201,138,0.08)' : 'rgba(45,68,96,0.15)',
                      border: online ? '1px solid rgba(76,201,138,0.25)' : '1px solid #22273c',
                      color: online ? '#4cc98a' : '#3e5272',
                      fontSize: 10, fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {online ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {online ? 'Online' : 'Offline'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}