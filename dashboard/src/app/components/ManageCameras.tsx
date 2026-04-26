import { useState, useEffect } from 'react';
import { Camera, Wifi, WifiOff, Plus, Trash2, X } from 'lucide-react';

interface LiveCamera {
  id: string;
  type: 'file' | 'rtsp';
  path?: string;
  url?: string;
  loop?: boolean;
  online: boolean;
}

const EMPTY_FORM = { id: '', type: 'file' as 'file' | 'rtsp', path: '', url: '', loop: true };

export function ManageCameras() {
  const [cameras, setCameras] = useState<LiveCamera[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCameras = async () => {
    try {
      const res = await fetch('/api/cameras');
      if (res.ok) {
        setCameras(await res.json());
        setIsLive(true);
      } else {
        setIsLive(false);
      }
    } catch {
      setIsLive(false);
    }
  };

  useEffect(() => {
    fetchCameras();
    const id = setInterval(fetchCameras, 2000);
    return () => clearInterval(id);
  }, []);

  const addCamera = async () => {
    setAdding(true);
    setError(null);
    try {
      const body = form.type === 'file'
        ? { id: form.id.trim(), type: 'file', path: form.path.trim(), loop: form.loop }
        : { id: form.id.trim(), type: 'rtsp', url: form.url.trim(), loop: false };
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to add camera');
      } else {
        // Optimistically add the camera immediately rather than waiting for the next poll
        const newCam: LiveCamera = form.type === 'file'
          ? { id: form.id.trim(), type: 'file', path: form.path.trim(), loop: form.loop, online: true }
          : { id: form.id.trim(), type: 'rtsp', url: form.url.trim(), loop: false, online: true };
        setCameras(prev => [...prev, newCam]);
        setShowAdd(false);
        setForm(EMPTY_FORM);
        fetchCameras();
      }
    } catch {
      setError('Connection error — is the pipeline running?');
    } finally {
      setAdding(false);
    }
  };

  const removeCamera = async (id: string) => {
    // Optimistically remove from UI
    setCameras(prev => prev.filter(cam => cam.id !== id));
    await fetch(`/api/cameras/${id}`, { method: 'DELETE' });
    fetchCameras();
  };

  const onlineCount = cameras.filter(c => c.online).length;

  return (
    <main className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ background: '#0e0f14' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0 relative"
        style={{ height: 60, borderBottom: '1px solid #22273c', background: '#11131c' }}
      >
        <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: 'linear-gradient(180deg, #c9a84c, #c9a84c44)', boxShadow: '0 0 10px #c9a84c66' }} />
        <div className="pl-3">
          <h2 style={{ fontSize: 16, color: '#ccd4ea', letterSpacing: '0.02em', fontFamily: "'Inter', sans-serif" }}>
            Manage Cameras
          </h2>
          <p style={{ fontSize: 12, color: '#48607a', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
            {isLive
              ? `${cameras.length} configured · ${onlineCount} online`
              : 'Pipeline offline — start test_visualize_pipeline.py'}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setError(null); }}
          className="flex items-center gap-2 px-4 py-2 transition-colors"
          style={{
            clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))',
            background: showAdd ? 'rgba(232,96,122,0.10)' : 'rgba(122,150,232,0.07)',
            border: 'none',
            color: showAdd ? '#e8607a' : '#7a96e8',
            fontSize: 12,
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
          }}
        >
          {showAdd ? <X size={13} /> : <Plus size={13} />}
          {showAdd ? 'Cancel' : 'Add Camera'}
        </button>
      </div>

      {/* Add Camera Form */}
      {showAdd && (
        <div
          className="shrink-0 px-6 py-4"
          style={{ background: '#0d0f1a', borderBottom: '1px solid #c9a84c22' }}
        >
          <div className="flex flex-wrap gap-3 items-end">
            {/* ID */}
            <div className="flex flex-col gap-1">
              <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#48607a', letterSpacing: '0.06em' }}>CAMERA ID</label>
              <input
                value={form.id}
                onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
                placeholder="cam_02"
                style={{ background: '#080910', border: '1px solid #c9a84c22', color: '#ccd4ea', fontFamily: "'DM Mono', monospace", fontSize: 12, padding: '6px 10px', outline: 'none', width: 120 }}
              />
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1">
              <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#48607a', letterSpacing: '0.06em' }}>TYPE</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as 'file' | 'rtsp' }))}
                style={{ background: '#080910', border: '1px solid #c9a84c22', color: '#ccd4ea', fontFamily: "'Inter', sans-serif", fontSize: 12, padding: '6px 10px', outline: 'none' }}
              >
                <option value="file">File (MP4)</option>
                <option value="rtsp">RTSP Stream</option>
              </select>
            </div>

            {/* Path or URL */}
            {form.type === 'file' ? (
              <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 200 }}>
                <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#48607a', letterSpacing: '0.06em' }}>FILE PATH</label>
                <input
                  value={form.path}
                  onChange={e => setForm(p => ({ ...p, path: e.target.value }))}
                  placeholder="footage/clip.mp4"
                  style={{ background: '#080910', border: '1px solid #c9a84c22', color: '#ccd4ea', fontFamily: "'DM Mono', monospace", fontSize: 12, padding: '6px 10px', outline: 'none', width: '100%' }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 240 }}>
                <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#48607a', letterSpacing: '0.06em' }}>RTSP URL</label>
                <input
                  value={form.url}
                  onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                  placeholder="rtsp://192.168.1.100:8080/h264_ulaw.sdp"
                  style={{ background: '#080910', border: '1px solid #c9a84c22', color: '#ccd4ea', fontFamily: "'DM Mono', monospace", fontSize: 12, padding: '6px 10px', outline: 'none', width: '100%' }}
                />
              </div>
            )}

            {/* Loop (file only) */}
            {form.type === 'file' && (
              <div className="flex flex-col gap-1">
                <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#48607a', letterSpacing: '0.06em' }}>LOOP</label>
                <div
                  onClick={() => setForm(p => ({ ...p, loop: !p.loop }))}
                  className="flex items-center gap-2 cursor-pointer px-3 py-1.5"
                  style={{ border: '1px solid #c9a84c22', background: '#080910' }}
                >
                  <div style={{ width: 28, height: 14, borderRadius: 7, background: form.loop ? '#c9a84c33' : '#22273c', border: `1px solid ${form.loop ? '#c9a84c' : '#3e5272'}`, position: 'relative', transition: 'all 0.2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: form.loop ? 14 : 2, width: 8, height: 8, borderRadius: '50%', background: form.loop ? '#c9a84c' : '#3e5272', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: form.loop ? '#c9a84c' : '#48607a' }}>{form.loop ? 'On' : 'Off'}</span>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={addCamera}
              disabled={adding || !form.id.trim() || (form.type === 'file' ? !form.path.trim() : !form.url.trim())}
              className="flex items-center gap-2 px-4 py-2"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))',
                background: (adding || !form.id.trim() || (form.type === 'file' ? !form.path.trim() : !form.url.trim()))
                  ? '#22273c'
                  : 'rgba(201,168,76,0.12)',
                border: 'none',
                color: (adding || !form.id.trim() || (form.type === 'file' ? !form.path.trim() : !form.url.trim()))
                  ? '#888fa8'
                  : '#c9a84c',
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                cursor: adding || !form.id.trim() || (form.type === 'file' ? !form.path.trim() : !form.url.trim()) ? 'not-allowed' : 'pointer',
                opacity: adding ? 0.5 : 1,
              }}
            >
              <Plus size={13} />
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>

          {error && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#e8607a', marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Column headers */}
        <div
          className="grid gap-4 px-4 pb-2 mb-1"
          style={{ gridTemplateColumns: '1fr 80px 1fr 80px 60px', fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#3e5272', letterSpacing: '0.05em', borderBottom: '1px solid #22273c' }}
        >
          <span>Camera ID</span>
          <span>Type</span>
          <span>Source</span>
          <span>Status</span>
          <span></span>
        </div>

        <div className="flex flex-col gap-1.5 mt-2">
          {!isLive && cameras.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#3e5272' }}>
                Pipeline offline — no cameras to show
              </span>
            </div>
          )}

          {cameras.map((cam) => (
            <div
              key={cam.id}
              className="grid gap-4 items-center px-4 py-3 transition-colors"
              style={{
                gridTemplateColumns: '1fr 80px 1fr 80px 60px',
                background: '#11131c',
                border: '1px solid #22273c',
                opacity: cam.online ? 1 : 0.55,
                clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
              }}
            >
              {/* ID */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 32, height: 32, background: cam.online ? 'rgba(122,150,232,0.07)' : '#0c0e13', border: '1px solid #22273c' }}
                >
                  <Camera size={14} color={cam.online ? '#7a96e8' : '#3e5272'} />
                </div>
                <span className="truncate" style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#ccd4ea' }}>
                  {cam.id}
                </span>
              </div>

              {/* Type badge */}
              <span
                className="px-2 py-0.5 text-center"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9.5,
                  color: cam.type === 'rtsp' ? '#7a96e8' : '#c9a84c',
                  background: cam.type === 'rtsp' ? 'rgba(122,150,232,0.10)' : 'rgba(201,168,76,0.10)',
                  clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                  letterSpacing: '0.04em',
                }}
              >
                {cam.type === 'rtsp' ? 'RTSP' : 'FILE'}
              </span>

              {/* Source */}
              <span className="truncate" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#48607a' }}>
                {cam.type === 'file' ? cam.path : cam.url}
              </span>

              {/* Status */}
              <div className="flex items-center gap-1.5">
                {cam.online
                  ? <><Wifi size={10} color="#4cc98a" /><span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#4cc98a' }}>Online</span></>
                  : <><WifiOff size={10} color="#3e5272" /><span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#3e5272' }}>Offline</span></>
                }
              </div>

              {/* Remove */}
              <button
                onClick={() => removeCamera(cam.id)}
                className="flex items-center justify-center transition-opacity opacity-40 hover:opacity-100"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                title="Remove camera"
              >
                <Trash2 size={13} color="#e8607a" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
