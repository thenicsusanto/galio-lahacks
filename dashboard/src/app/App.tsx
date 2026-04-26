import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { CameraGrid } from './components/CameraGrid';
import { IntelligencePanel } from './components/IntelligencePanel';
import { ManageCameras } from './components/ManageCameras';
import { SettingsView } from './components/SettingsView';

export type NavTab = 'dashboard' | 'cameras' | 'settings';

export default function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('dashboard');
  const [focusedCamId, setFocusedCamId] = useState<number | null>(null);
  const [focusedLiveCam, setFocusedLiveCam] = useState<string | null>(null);
  const [flaggedEventIds, setFlaggedEventIds] = useState<number[]>([]);
  const [flashingCamIds, setFlashingCamIds] = useState<number[]>([]);

  const handleNewEvent = useCallback((camId: number) => {
    setFlashingCamIds(prev => Array.from(new Set([...prev, camId])));
    setTimeout(() => {
      setFlashingCamIds(prev => prev.filter(id => id !== camId));
    }, 6000);
  }, []);

  const toggleFlag = useCallback((eventId: number) => {
    setFlaggedEventIds(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  }, []);

  const zoomToCamera = useCallback((cameraId: string) => {
    setFocusedLiveCam(cameraId);
  }, []);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: '#0e0f14', fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        @keyframes cam-flash {
          0%   { box-shadow: 0 0 0 2px #e8607a00, inset 0 0 0 1.5px #e8607a00; }
          40%  { box-shadow: 0 0 0 4px #e8607aaa, inset 0 0 0 1.5px #e8607aaa, 0 0 28px #e8607a66; }
          100% { box-shadow: 0 0 0 2px #e8607a00, inset 0 0 0 1.5px #e8607a00; }
        }
        .cam-flashing { animation: cam-flash 0.9s ease-in-out infinite; }

        @keyframes hud-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(400%); opacity: 0; }
        }
        .hud-scanline {
          animation: hud-scan 3.5s linear infinite;
        }

        @keyframes hud-pulse-border {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1; }
        }
        .hud-pulse { animation: hud-pulse-border 2.4s ease-in-out infinite; }

        @keyframes hud-corner-glow {
          0%, 100% { box-shadow: 0 0 6px #c9a84c44; }
          50%       { box-shadow: 0 0 18px #c9a84caa; }
        }
        .hud-corner-glow { animation: hud-corner-glow 2s ease-in-out infinite; }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .spin-slow { animation: spin-slow 8s linear infinite; }

        @keyframes data-stream {
          0%   { background-position: 0% 0%; }
          100% { background-position: 0% 100%; }
        }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c9a84c33; border-radius: 0; }
      `}</style>

      <Sidebar activeNav={activeNav} setActiveNav={setActiveNav} />

      {activeNav === 'dashboard' && (
        <>
          <CameraGrid
            focusedCamId={focusedCamId}
            setFocusedCamId={setFocusedCamId}
            focusedLiveCam={focusedLiveCam}
            setFocusedLiveCam={setFocusedLiveCam}
            flashingCamIds={flashingCamIds}
          />
          <IntelligencePanel
            flaggedEventIds={flaggedEventIds}
            onToggleFlag={toggleFlag}
            onZoomCamera={zoomToCamera}
            onNewEvent={handleNewEvent}
          />
        </>
      )}
      {activeNav === 'cameras' && <ManageCameras />}
      {activeNav === 'settings' && <SettingsView />}
    </div>
  );
}