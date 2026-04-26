import { useEffect, useRef, useState } from 'react';
import { CameraData, DetectionData, PersonData } from './cameraData';
import { HudCorners } from './HudCorners';

const CANVAS_W = 640;
const CANVAS_H = 360;

// ─── Background ────────────────────────────────────────────────────────────
function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, scene: string) {
  const colorMap: Record<string, [string, string]> = {
    lobby:     ['#141820', '#0e1218'],
    corridor:  ['#111620', '#0b1016'],
    exit:      ['#0d1218', '#09101a'],
    parking:   ['#09090f', '#060810'],
    stairwell: ['#0e1218', '#080c14'],
  };
  const [top, bot] = colorMap[scene] ?? ['#111822', '#0d1318'];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawPerspGrid(ctx: CanvasRenderingContext2D, w: number, h: number, vx: number, vy: number, floorY: number) {
  const fg = ctx.createLinearGradient(0, floorY, 0, h);
  fg.addColorStop(0, 'rgba(30,42,58,0.45)');
  fg.addColorStop(1, 'rgba(12,18,28,0.25)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.strokeStyle = 'rgba(50,72,105,0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(w, floorY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(38,56,82,0.38)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 10; i++) {
    const fx = (i / 10) * w;
    const tx = vx + (fx - vx) * (vy / h);
    ctx.beginPath();
    ctx.moveTo(fx, h);
    ctx.lineTo(tx, vy);
    ctx.stroke();
  }
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const fy = floorY + t * (h - floorY);
    const sp = (fy - vy) / (h - vy);
    const lx = Math.max(0, vx - sp * w * 0.6);
    const rx = Math.min(w, vx + sp * w * 0.6);
    if (fy >= floorY) {
      ctx.beginPath();
      ctx.moveTo(lx, fy);
      ctx.lineTo(rx, fy);
      ctx.stroke();
    }
  }
}

function drawLobby(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const vx = w * 0.5, vy = h * 0.32, floorY = h * 0.62;
  drawPerspGrid(ctx, w, h, vx, vy, floorY);
  const cg = ctx.createLinearGradient(0, 0, 0, vy);
  cg.addColorStop(0, 'rgba(22,30,46,0.7)');
  cg.addColorStop(1, 'rgba(15,22,36,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, w, vy);
  for (let i = 0; i < 3; i++) {
    const lx = w * (0.22 + i * 0.28);
    const lg = ctx.createRadialGradient(lx, 0, 0, lx, 0, h * 0.38);
    lg.addColorStop(0, 'rgba(200,220,255,0.07)');
    lg.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h * 0.5);
  }
  ctx.strokeStyle = 'rgba(42,60,88,0.5)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(vx, vy);
  ctx.moveTo(w, 0); ctx.lineTo(vx, vy);
  ctx.stroke();
}

function drawCorridor(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const vx = w * 0.5, vy = h * 0.35, floorY = h * 0.65;
  const ceilY = h * 0.1;
  drawPerspGrid(ctx, w, h, vx, vy, floorY);
  const cg = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  cg.addColorStop(0, 'rgba(20,28,44,0.65)');
  cg.addColorStop(1, 'rgba(14,20,34,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, w, h * 0.4);
  ctx.strokeStyle = 'rgba(40,60,90,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, ceilY); ctx.lineTo(vx, vy);
  ctx.moveTo(w, ceilY); ctx.lineTo(vx, vy);
  ctx.moveTo(0, floorY); ctx.lineTo(vx, vy);
  ctx.moveTo(w, floorY); ctx.lineTo(vx, vy);
  ctx.stroke();
  const lg = ctx.createLinearGradient(vx, vy, vx, 0);
  lg.addColorStop(0, 'rgba(200,220,255,0.04)');
  lg.addColorStop(1, 'rgba(200,220,255,0.01)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(w * 0.38, 0); ctx.lineTo(w * 0.62, 0);
  ctx.lineTo(vx + 2, vy); ctx.lineTo(vx - 2, vy);
  ctx.closePath();
  ctx.fill();
}

function drawExit(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  const floorY = h * 0.68;
  const vx = w * 0.5, vy = h * 0.28;
  const doorX = w * 0.34, doorW = w * 0.32;
  const doorY = h * 0.05, doorH = h * 0.73;
  const dg = ctx.createLinearGradient(doorX, 0, doorX + doorW, 0);
  dg.addColorStop(0, 'rgba(40,60,90,0.2)');
  dg.addColorStop(0.5, 'rgba(60,100,160,0.28)');
  dg.addColorStop(1, 'rgba(40,60,90,0.2)');
  ctx.fillStyle = dg;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  drawPerspGrid(ctx, w, h, vx, vy, floorY);
  ctx.strokeStyle = 'rgba(65,95,138,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX, doorY, doorW, doorH);
  const pulse = 0.65 + 0.35 * Math.sin(tick * 0.04);
  ctx.fillStyle = `rgba(0,220,100,${0.8 * pulse})`;
  ctx.fillRect(w * 0.43, h * 0.01, w * 0.14, h * 0.04);
  ctx.fillStyle = `rgba(255,255,255,${0.92 * pulse})`;
  ctx.font = `bold ${Math.floor(h * 0.026)}px 'DM Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', w * 0.5, h * 0.038);
  ctx.textAlign = 'left';
}

function drawParking(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, w, h);
  for (const lx of [w * 0.25, w * 0.75]) {
    const lg = ctx.createRadialGradient(lx, 0, 0, lx, 0, h * 0.65);
    lg.addColorStop(0, 'rgba(200,210,240,0.07)');
    lg.addColorStop(1, 'rgba(200,210,240,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
  }
  const fg = ctx.createLinearGradient(0, h * 0.5, 0, h);
  fg.addColorStop(0, 'rgba(22,32,48,0.5)');
  fg.addColorStop(1, 'rgba(10,14,22,0.5)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
  ctx.strokeStyle = 'rgba(48,68,100,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.76); ctx.lineTo(w, h * 0.76);
  ctx.stroke();
  for (let i = 0; i <= 5; i++) {
    const sx = (i / 5) * w;
    ctx.beginPath();
    ctx.moveTo(sx, h * 0.52); ctx.lineTo(sx, h * 0.76);
    ctx.stroke();
  }
}

function drawStairwell(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, 0);
  bg.addColorStop(0, '#0a0c14');
  bg.addColorStop(0.5, '#11151f');
  bg.addColorStop(1, '#0a0c14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const sy = h - (i + 1) * (h / (n + 1));
    const inset = (i / n) * w * 0.28;
    ctx.fillStyle = `rgba(20,30,46,${0.4 + i * 0.04})`;
    ctx.fillRect(inset, sy, w - inset * 2, h / (n + 1) - 1);
    ctx.strokeStyle = `rgba(38,58,90,0.55)`;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(inset, sy, w - inset * 2, h / (n + 1) - 1);
  }
  ctx.strokeStyle = 'rgba(48,72,112,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h * 0.88);
  ctx.lineTo(w * 0.86, h * 0.08);
  ctx.stroke();
  const lg = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, h * 0.55);
  lg.addColorStop(0, 'rgba(200,215,255,0.08)');
  lg.addColorStop(1, 'rgba(200,215,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
}

function drawBlurredPerson(ctx: CanvasRenderingContext2D, cx: number, cy: number, pw: number, ph: number, loitering: boolean, tick: number) {
  if (loitering) {
    const pulse = 0.35 + 0.3 * Math.sin(tick * 0.055);
    const glow = ctx.createRadialGradient(cx, cy, pw * 0.2, cx, cy, pw * 2.8);
    glow.addColorStop(0, `rgba(255,50,72,${0.28 * pulse})`);
    glow.addColorStop(1, 'rgba(255,50,72,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - pw * 3, cy - ph * 0.8, pw * 6, ph * 1.6);
  }
  ctx.save();
  ctx.filter = 'blur(13px)';
  const torsoY = cy + ph * 0.08;
  const bg = ctx.createRadialGradient(cx, torsoY, 0, cx, torsoY, pw * 0.95);
  bg.addColorStop(0, 'rgba(192,178,165,0.84)');
  bg.addColorStop(0.45, 'rgba(145,132,120,0.54)');
  bg.addColorStop(1, 'rgba(80,70,62,0.04)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(cx, torsoY, pw * 0.5, ph * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const headY = cy - ph * 0.37;
  const hr = pw * 0.36;
  const hg = ctx.createRadialGradient(cx, headY, 0, cx, headY, hr * 1.7);
  hg.addColorStop(0, 'rgba(202,190,178,0.90)');
  hg.addColorStop(0.5, 'rgba(162,150,138,0.56)');
  hg.addColorStop(1, 'rgba(88,78,68,0.04)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, headY, hr * 1.85, 0, Math.PI * 2);
  ctx.fill();
  const legY = cy + ph * 0.40;
  const leg = ctx.createRadialGradient(cx, legY, 0, cx, legY, pw * 0.52);
  leg.addColorStop(0, 'rgba(150,138,126,0.56)');
  leg.addColorStop(1, 'rgba(70,62,54,0.04)');
  ctx.fillStyle = leg;
  ctx.beginPath();
  ctx.ellipse(cx, legY, pw * 0.36, ph * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();
}

function drawDetection(ctx: CanvasRenderingContext2D, det: DetectionData, w: number, h: number) {
  const dx = det.x * w, dy = det.y * h;
  const dw = det.w * w, dh = det.h * h;
  ctx.strokeStyle = det.color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(dx, dy, dw, dh);
  const cs = Math.min(13, dw * 0.14, dh * 0.1);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = det.color;
  const corners: [number, number, number, number][] = [
    [dx, dy, 1, 1], [dx + dw, dy, -1, 1],
    [dx, dy + dh, 1, -1], [dx + dw, dy + dh, -1, -1],
  ];
  for (const [cx2, cy2, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx2, cy2 + sy * cs);
    ctx.lineTo(cx2, cy2);
    ctx.lineTo(cx2 + sx * cs, cy2);
    ctx.stroke();
  }
  ctx.font = `500 9.5px 'DM Mono', monospace`;
  const txt = `${det.label}  ${Math.round(det.conf * 100)}%`;
  const tw = ctx.measureText(txt).width;
  const lh = 16, lw = tw + 10;
  const ly = dy - lh - 2;
  ctx.fillStyle = det.color + 'cc';
  ctx.beginPath();
  ctx.roundRect(dx, ly, lw, lh, 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, dx + 5, ly + lh / 2);
  ctx.textBaseline = 'alphabetic';
}

function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  for (let y = 0; y < h; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.fillRect(0, y, w, 1);
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.14, w / 2, h / 2, h * 0.88);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawScene(ctx: CanvasRenderingContext2D, camera: CameraData, tick: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  drawBackground(ctx, w, h, camera.scene);
  switch (camera.scene) {
    case 'lobby':     drawLobby(ctx, w, h); break;
    case 'corridor':  drawCorridor(ctx, w, h); break;
    case 'exit':      drawExit(ctx, w, h, tick); break;
    case 'parking':   drawParking(ctx, w, h); break;
    case 'stairwell': drawStairwell(ctx, w, h); break;
  }
  for (const p of camera.people) {
    const px = p.x * w + Math.sin(tick * 0.007 + p.phase) * 2.2;
    const py = p.y * h;
    drawBlurredPerson(ctx, px, py, p.w * w, p.h * h, !!p.loitering, tick);
  }
  for (const det of camera.detections) {
    drawDetection(ctx, det, w, h);
  }
  drawScanlines(ctx, w, h);
  drawVignette(ctx, w, h);
}

const SCORE_COLOR: Record<string, string> = {
  green:  '#34d399',
  yellow: '#fbbf24',
  red:    '#f87171',
};

export function CameraFeed({
  camera,
  selected,
  onSelect,
  onDoubleClick,
  flashing = false,
  size = 'normal',
}: {
  camera: CameraData;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
  flashing?: boolean;
  size?: 'normal' | 'focused' | 'thumb';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tickRef = useRef(0);
  const [time, setTime] = useState(() => new Date());
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    function loop() {
      tickRef.current++;
      drawScene(ctx!, camera, tickRef.current);
      frameCount.current++;
      const now = Date.now();
      if (now - lastFpsUpdate.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsUpdate.current = now;
      }
      animRef.current = requestAnimationFrame(loop);
    }
    loop();
    return () => cancelAnimationFrame(animRef.current);
  }, [camera]);

  const ts = time.toLocaleTimeString('en-GB', { hour12: false });
  const scoreCol = SCORE_COLOR[camera.status];

  const isThumb = size === 'thumb';

  const clipNormal = 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))';

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className={`relative overflow-hidden cursor-pointer group ${flashing ? 'cam-flashing' : ''}`}
      style={{
        background: '#07090e',
        clipPath: isThumb ? undefined : clipNormal,
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
      <canvas
        ref={canvasRef}
        className="block w-full aspect-video"
        style={{ imageRendering: 'auto' }}
      />

      {/* HUD Corner brackets */}
      {!isThumb && (
        <HudCorners
          color={selected ? scoreCol : flashing ? '#e8607a' : '#c9a84c'}
          size={14}
          thickness={2}
          opacity={selected || flashing ? 0.9 : 0.5}
        />
      )}

      {/* Scanning line sweep */}
      {!isThumb && (
        <div
          className="hud-scanline absolute left-0 right-0 pointer-events-none"
          style={{
            height: '25%',
            background: 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.04) 40%, rgba(201,168,76,0.08) 50%, rgba(201,168,76,0.04) 60%, transparent)',
            top: 0,
          }}
        />
      )}

      {/* Top header overlay */}
      {!isThumb && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between px-2.5 py-1.5"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center animate-pulse">
              {/* FPS indicator */}
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#7a96e8', marginRight: 8 }}>
                {fps} FPS
              </span>
              
              {/* Red Diamond Indicator */}
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                  background: '#f87171',
                  boxShadow: '0 0 6px #f87171',
                }}
              />
            </div>

            <span 
              className="text-[11px] text-white/90 truncate max-w-[160px]" 
              style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.01em' }}
            >
              {camera.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span 
              className="text-[10.5px] tabular-nums" 
              style={{ 
                fontFamily: "'DM Mono', monospace", 
                color: '#c9a84caa', 
                textShadow: '0 0 8px #c9a84c66' 
              }}
            >
              {ts}
            </span>
          </div>
        </div>
      )}

      {/* Thumb label */}
      {isThumb && (
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <span className="text-[9.5px] text-white/70 truncate block" style={{ fontFamily: "'Inter', sans-serif" }}>{camera.name}</span>
        </div>
      )}

      {/* Hover highlight */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at center, ${scoreCol}08, transparent 70%)` }}
      />
    </div>
  );
}
