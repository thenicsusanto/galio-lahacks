/**
 * usePipeline — React hook that polls the Galio pipeline backend.
 *
 * Exposes:
 *   - cameras:    list of live camera IDs (e.g. ["cam_01"])
 *   - events:     array of the most recent VLM event per camera (AlertEvent shape)
 *   - isLive:     true if the backend is reachable
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { AlertEvent } from '../components/cameraData';

const POLL_MS = 2000;

interface RawEvent {
  camera_id: string;
  timestamp: number;
  detections: { label: string; confidence: number; bbox: number[] }[];
  description: string;
}

// Parse a JSON description produced by the VLM (which returns a JSON string)
function parseDescription(raw: string): { type: string; details: string; severity: 'critical' | 'warning' | 'info'; score: number } {
  try {
    const obj = JSON.parse(raw);
    const category: string = obj.category ?? 'None';
    const score: number = typeof obj.anomaly_score === 'number' ? obj.anomaly_score : 0;
    const rationale: string = obj.rationale ?? raw;
    const action: string = obj.action_required ?? 'Log';

    let severity: 'critical' | 'warning' | 'info' = 'info';
    if (action === 'Immediate' || score >= 0.7) severity = 'critical';
    else if (action === 'Monitor' || score >= 0.4) severity = 'warning';

    const type = category === 'None' ? 'MOTION_DETECTED' : category.toUpperCase().replace(/\s+/g, '_');

    return { type, details: rationale, severity, score };
  } catch {
    // If VLM output isn't valid JSON, treat as an info detection
    return { type: 'MOTION_DETECTED', details: raw, severity: 'info', score: 0 };
  }
}

let _nextId = 1000;

function rawToAlertEvent(raw: RawEvent): AlertEvent {
  const { type, details, severity } = parseDescription(raw.description);
  const ts = new Date(raw.timestamp * 1000);
  const time = ts.toLocaleTimeString('en-GB', { hour12: false });
  // Extract numeric part from camera id for cam field (cam_01 → 1)
  const camMatch = raw.camera_id.match(/\d+/);
  const cam = camMatch ? parseInt(camMatch[0], 10) : 1;
  return {
    id: _nextId++,
    time,
    cam,
    type,
    details,
    severity,
    // Store camera_id string for video feed URL
    camera_id: raw.camera_id,
  } as AlertEvent & { camera_id: string };
}

export function usePipeline() {
  const [cameras, setCameras] = useState<string[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const seenTimestamps = useRef<Map<string, number>>(new Map());

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('not ok');
      const rawEvents: RawEvent[] = await res.json();

      setIsLive(true);
      if (rawEvents.length === 0) return;

      // Collect camera ids
      setCameras(rawEvents.map(e => e.camera_id));

      // Only add events we haven't seen before (based on timestamp per camera)
      const newAlerts: AlertEvent[] = [];
      for (const raw of rawEvents) {
        const prev = seenTimestamps.current.get(raw.camera_id);
        if (prev !== raw.timestamp) {
          seenTimestamps.current.set(raw.camera_id, raw.timestamp);
          newAlerts.push(rawToAlertEvent(raw));
        }
      }

      if (newAlerts.length > 0) {
        setEvents(prev => [...newAlerts, ...prev].slice(0, 100));
      }
    } catch {
      setIsLive(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  return { cameras, events, isLive };
}
