import { useState } from 'react';
import { Bell, Eye, Shield, Sliders, ToggleLeft, ToggleRight } from 'lucide-react';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="shrink-0">
      {value
        ? <ToggleRight size={26} color="#5b8ee6" />
        : <ToggleLeft size={26} color="#2d4460" />
      }
    </button>
  );
}

function SliderInput({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#6a84a0', flex: 1 }}>{label}</span>
      <div className="flex items-center gap-3">
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-28"
          style={{ accentColor: '#5b8ee6' }}
        />
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5b8ee6', width: 52, textAlign: 'right' }}>
          {value}{unit}
        </span>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#11131c', border: '1px solid #22273c' }}>
      <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid #22273c', paddingBottom: 12 }}>
        <Icon size={14} color="#7a96e8" />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#ccd4ea', letterSpacing: '0.02em' }}>{title}</span>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#8aa4c4' }}>{label}</div>
        {description && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#3a5270', marginTop: 2 }}>{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const [loiterThreshold, setLoiterThreshold] = useState(120);
  const [bagThreshold, setBagThreshold] = useState(90);
  const [motionSensitivity, setMotionSensitivity] = useState(70);
  const [alerts, setAlerts] = useState({ sound: true, flash: true, critical: true, autoflag: false });
  const [display, setDisplay] = useState({ blur: true, bboxes: true, scanlines: true, timestamps: true });

  const toggleAlert = (k: keyof typeof alerts) => setAlerts(p => ({ ...p, [k]: !p[k] }));
  const toggleDisplay = (k: keyof typeof display) => setDisplay(p => ({ ...p, [k]: !p[k] }));

  return (
    <main className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ background: '#0e0f14' }}>
      {/* Header */}
      <div
        className="flex items-center px-6 shrink-0"
        style={{ height: 60, borderBottom: '1px solid #22273c', background: '#11131c' }}
      >
        <div>
          <h2 style={{ fontSize: 16, color: '#ccd4ea', letterSpacing: '0.02em', fontFamily: "'Inter', sans-serif" }}>
            Settings
          </h2>
          <p style={{ fontSize: 12, color: '#48607a', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
            System configuration &amp; alert thresholds
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-4 max-w-2xl">

          {/* Detection thresholds */}
          <Section icon={Sliders} title="Detection Thresholds">
            <SliderInput label="Loitering alert threshold" value={loiterThreshold} min={30} max={300} unit="s" onChange={setLoiterThreshold} />
            <SliderInput label="Unattended bag threshold" value={bagThreshold} min={15} max={180} unit="s" onChange={setBagThreshold} />
            <SliderInput label="Motion sensitivity" value={motionSensitivity} min={10} max={100} unit="%" onChange={setMotionSensitivity} />
          </Section>

          {/* Alert settings */}
          <Section icon={Bell} title="Alerts">
            <Row label="Sound on critical alerts" description="Play an audio chime for Incident-level events">
              <Toggle value={alerts.sound} onChange={() => toggleAlert('sound')} />
            </Row>
            <Row label="Flash camera border on new event" description="Highlight camera feeds when events are detected">
              <Toggle value={alerts.flash} onChange={() => toggleAlert('flash')} />
            </Row>
            <Row label="Critical-only mode" description="Suppress info-level events from the log">
              <Toggle value={alerts.critical} onChange={() => toggleAlert('critical')} />
            </Row>
            <Row label="Auto-flag critical events" description="Automatically flag all Incident-level events">
              <Toggle value={alerts.autoflag} onChange={() => toggleAlert('autoflag')} />
            </Row>
          </Section>

          {/* Display */}
          <Section icon={Eye} title="Display">
            <Row label="Privacy blur on persons" description="Apply anonymization blur to all detected persons">
              <Toggle value={display.blur} onChange={() => toggleDisplay('blur')} />
            </Row>
            <Row label="Show YOLO bounding boxes" description="Display detection boxes from the detector layer">
              <Toggle value={display.bboxes} onChange={() => toggleDisplay('bboxes')} />
            </Row>
            <Row label="Scanline overlay" description="CRT-style scanlines on camera feeds">
              <Toggle value={display.scanlines} onChange={() => toggleDisplay('scanlines')} />
            </Row>
            <Row label="Timestamps on feeds" description="Show live clock on each camera thumbnail">
              <Toggle value={display.timestamps} onChange={() => toggleDisplay('timestamps')} />
            </Row>
          </Section>

          {/* System */}
          <Section icon={Shield} title="System">
            <Row label="AI model" description="VLM used for scene understanding">
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#7a96e8' }}>VLM-3.5-Turbo</span>
            </Row>
            <Row label="Detection pipeline" description="Object detection model">
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#7a96e8' }}>YOLO-v8</span>
            </Row>
            <Row label="System version" description="">
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#48607a' }}>v2.1.4</span>
            </Row>
          </Section>

        </div>
      </div>
    </main>
  );
}