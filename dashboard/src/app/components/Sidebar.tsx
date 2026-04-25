import { LayoutDashboard, Camera, Settings, Wind, Wifi, Cpu } from 'lucide-react';
import type { NavTab } from '../App';

const NAV_ITEMS: { icon: typeof LayoutDashboard; label: string; id: NavTab }[] = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
  { icon: Camera,          label: 'Cameras',   id: 'cameras'   },
  { icon: Settings,        label: 'Settings',  id: 'settings'  },
];

// Notched clip-path for angular HUD button shape
const CLIP_NOTCHED = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))';
const CLIP_HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

export function Sidebar({
  activeNav,
  setActiveNav,
}: {
  activeNav: NavTab;
  setActiveNav: (t: NavTab) => void;
}) {
  return (
    <aside
      className="flex flex-col items-center py-4 shrink-0 z-10 relative"
      style={{
        width: 80,
        background: 'linear-gradient(180deg, #0d0f1a 0%, #0b0c14 100%)',
        borderRight: '1px solid #c9a84c22',
        boxShadow: '2px 0 24px rgba(0,0,0,0.6), inset -1px 0 0 #c9a84c11',
      }}
    >
      {/* Subtle vertical grid line */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 28px, #c9a84c08 28px, #c9a84c08 29px)',
        }}
      />

      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 hud-pulse"
        style={{ height: 2, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }}
      />

      {/* Logo */}
      <div className="flex flex-col items-center gap-1.5 mb-7 relative z-10">
        <div
          className="flex items-center justify-center relative hud-corner-glow"
          style={{
            width: 44,
            height: 44,
            clipPath: CLIP_HEX,
            background: 'linear-gradient(135deg, #1a1e38 0%, #0e1028 100%)',
            border: 'none',
          }}
        >
          {/* Inner hex ring */}
          <div
            className="absolute inset-0 spin-slow"
            style={{
              clipPath: CLIP_HEX,
              background: 'conic-gradient(from 0deg, #c9a84c44, transparent 60%, #c9a84c44)',
            }}
          />
          <Wind size={18} color="#c9a84c" strokeWidth={1.8} style={{ position: 'relative', zIndex: 1 }} />
        </div>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          letterSpacing: '0.22em',
          color: '#c9a84c',
          textAlign: 'center',
          lineHeight: 1.3,
          textShadow: '0 0 12px #c9a84c88',
        }}>
          GALIO
        </span>
      </div>

      {/* Angled divider */}
      <div className="w-full mb-5 relative" style={{ height: 12 }}>
        <div
          style={{
            position: 'absolute',
            left: 8, right: 8, top: 5,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #c9a84c66, transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 2,
            transform: 'translateX(-50%) rotate(45deg)',
            width: 6, height: 6,
            border: '1px solid #c9a84c88',
            background: '#c9a84c33',
          }}
        />
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-2 flex-1 relative z-10">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              title={item.label}
              className="flex flex-col items-center gap-1.5 relative transition-all duration-150"
              style={{
                width: 66,
                padding: '10px 4px',
                clipPath: CLIP_NOTCHED,
                background: isActive
                  ? 'linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.06) 100%)'
                  : 'rgba(255,255,255,0.02)',
                color: isActive ? '#c9a84c' : '#4a5e7a',
                boxShadow: isActive ? '0 0 16px #c9a84c33, inset 0 1px 0 #c9a84c44' : 'none',
              }}
            >
              {/* Active left edge glow */}
              {isActive && (
                <div
                  className="absolute left-0 top-2 bottom-2"
                  style={{ width: 2, background: '#c9a84c', boxShadow: '0 0 8px #c9a84c' }}
                />
              )}
              <Icon size={20} strokeWidth={isActive ? 1.8 : 1.5} />
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                letterSpacing: '0.02em',
                color: isActive ? '#c9a84c' : '#3e5272',
                textShadow: isActive ? '0 0 10px #c9a84c88' : 'none',
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom divider */}
      <div className="w-full mb-4 relative" style={{ height: 12 }}>
        <div
          style={{
            position: 'absolute',
            left: 8, right: 8, top: 5,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #22273c, transparent)',
          }}
        />
      </div>

      {/* System status */}
      <div className="flex flex-col items-center gap-3 relative z-10">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <span
              className="inline-block animate-pulse"
              style={{
                width: 7, height: 7,
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                background: '#4cc98a',
                boxShadow: '0 0 8px #4cc98a',
              }}
            />
            <Cpu size={9} color="#4cc98a" />
          </div>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, letterSpacing: '0.04em', color: '#4cc98a', textAlign: 'center', lineHeight: 1.5 }}>
            VLM<br />Online
          </span>
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <Wifi size={11} color="#3e5272" />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#7a96e8', textShadow: '0 0 8px #7a96e866' }}>45ms</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, letterSpacing: '0.04em', color: '#3e5272' }}>Latency</span>
        </div>
      </div>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: 1, background: 'linear-gradient(90deg, transparent, #c9a84c44, transparent)' }}
      />
    </aside>
  );
}
