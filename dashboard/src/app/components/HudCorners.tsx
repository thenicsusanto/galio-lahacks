import React from 'react';

/** Renders four corner-bracket decorations inside a relative-positioned parent. */
export function HudCorners({
  color = '#c9a84c',
  size = 10,
  thickness = 1.5,
  opacity = 0.7,
}: {
  color?: string;
  size?: number;
  thickness?: number;
  opacity?: number;
}) {
  const s = `${size}px`;
  const t = `${thickness}px`;
  const corners: React.CSSProperties[] = [
    { top: 0,    left: 0,   borderTop:    `${t} solid ${color}`, borderLeft:   `${t} solid ${color}` },
    { top: 0,    right: 0,  borderTop:    `${t} solid ${color}`, borderRight:  `${t} solid ${color}` },
    { bottom: 0, left: 0,   borderBottom: `${t} solid ${color}`, borderLeft:   `${t} solid ${color}` },
    { bottom: 0, right: 0,  borderBottom: `${t} solid ${color}`, borderRight:  `${t} solid ${color}` },
  ];

  return (
    <>
      {corners.map((style, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: s,
            height: s,
            opacity,
            pointerEvents: 'none',
            ...style,
          }}
        />
      ))}
    </>
  );
}
