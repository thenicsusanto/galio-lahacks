export type SceneType = 'lobby' | 'corridor' | 'exit' | 'parking' | 'stairwell';
export type StatusType = 'green' | 'yellow' | 'red';

export interface PersonData {
  x: number;
  y: number;
  w: number;
  h: number;
  phase: number;
  loitering?: boolean;
}

export interface DetectionData {
  label: string;
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface CameraData {
  id: number;
  name: string;
  floor: number;
  status: StatusType;
  score: number;
  bitrate: string;
  scene: SceneType;
  people: PersonData[];
  detections: DetectionData[];
}

export const cameras: CameraData[] = [
  {
    id: 1,
    name: 'Camera 1 — Lobby Entrance',
    floor: 1,
    status: 'green',
    score: 97,
    bitrate: '2.4 Mbps',
    scene: 'lobby',
    people: [
      { x: 0.30, y: 0.64, w: 0.10, h: 0.34, phase: 0 },
      { x: 0.64, y: 0.60, w: 0.09, h: 0.30, phase: 2.1 },
    ],
    detections: [],
  },
  {
    id: 2,
    name: 'Camera 2 — Main Corridor',
    floor: 1,
    status: 'green',
    score: 94,
    bitrate: '1.8 Mbps',
    scene: 'corridor',
    people: [
      { x: 0.51, y: 0.62, w: 0.08, h: 0.28, phase: 1.3 },
    ],
    detections: [],
  },
  {
    id: 3,
    name: 'Camera 3 — North Exit',
    floor: 1,
    status: 'red',
    score: 23,
    bitrate: '3.1 Mbps',
    scene: 'exit',
    people: [
      { x: 0.44, y: 0.54, w: 0.12, h: 0.42, phase: 0.7, loitering: true },
    ],
    detections: [
      { label: 'PERSON', conf: 0.96, x: 0.33, y: 0.24, w: 0.23, h: 0.62, color: '#ff3649' },
    ],
  },
  {
    id: 4,
    name: 'Camera 4 — Parking Zone B',
    floor: 0,
    status: 'green',
    score: 88,
    bitrate: '2.2 Mbps',
    scene: 'parking',
    people: [],
    detections: [
      { label: 'VEHICLE', conf: 0.99, x: 0.07, y: 0.36, w: 0.42, h: 0.40, color: '#00d4f5' },
      { label: 'VEHICLE', conf: 0.94, x: 0.56, y: 0.40, w: 0.38, h: 0.34, color: '#00d4f5' },
    ],
  },
  {
    id: 5,
    name: 'Camera 5 — East Wing',
    floor: 2,
    status: 'yellow',
    score: 58,
    bitrate: '1.9 Mbps',
    scene: 'corridor',
    people: [
      { x: 0.26, y: 0.60, w: 0.09, h: 0.32, phase: 3.2 },
    ],
    detections: [
      { label: 'BAG', conf: 0.91, x: 0.50, y: 0.65, w: 0.17, h: 0.20, color: '#f5a623' },
    ],
  },
  {
    id: 7,
    name: 'Camera 7 — Stairwell B',
    floor: 1,
    status: 'yellow',
    score: 61,
    bitrate: '1.7 Mbps',
    scene: 'stairwell',
    people: [
      { x: 0.52, y: 0.48, w: 0.13, h: 0.44, phase: 1.8 },
    ],
    detections: [
      { label: 'PERSON', conf: 0.88, x: 0.40, y: 0.18, w: 0.25, h: 0.65, color: '#f5a623' },
    ],
  },
];

export interface AlertEvent {
  id: number;
  time: string;
  cam: number;
  camera_id?: string;   // real camera id string from pipeline e.g. "cam_01"
  type: string;
  details: string;
  severity: 'critical' | 'warning' | 'info';
}

export const INITIAL_EVENTS: AlertEvent[] = [
  { id: 10, time: '14:23:22', cam: 3, type: 'LOITERING_ALERT', details: 'duration=4m28s zone=EXIT threshold=120s', severity: 'critical' },
  { id: 9, time: '14:23:19', cam: 5, type: 'BAG_UNATTENDED', details: 'duration=2m01s threshold_exceeded=true', severity: 'critical' },
  { id: 8, time: '14:23:17', cam: 4, type: 'VEHICLE_DETECTED', details: 'bbox=[352,151,243,115] conf=0.94', severity: 'info' },
  { id: 7, time: '14:23:15', cam: 4, type: 'VEHICLE_DETECTED', details: 'bbox=[51,137,269,137] conf=0.99', severity: 'info' },
  { id: 6, time: '14:23:13', cam: 2, type: 'PERSON_DETECTED', details: 'bbox=[307,135,58,115] conf=0.93', severity: 'info' },
  { id: 5, time: '14:23:11', cam: 1, type: 'PERSON_DETECTED', details: 'bbox=[224,132,77,136] conf=0.97', severity: 'info' },
  { id: 4, time: '14:23:09', cam: 7, type: 'PERSON_DETECTED', details: 'bbox=[256,72,168,237] conf=0.88', severity: 'info' },
  { id: 3, time: '14:23:07', cam: 3, type: 'PERSON_DETECTED', details: 'bbox=[212,102,154,207] conf=0.96', severity: 'info' },
  { id: 2, time: '14:23:05', cam: 5, type: 'BAG_UNATTENDED', details: 'bbox=[334,223,115,79] conf=0.91', severity: 'warning' },
  { id: 1, time: '14:23:01', cam: 3, type: 'LOITERING_ALERT', details: 'duration=4m12s zone=EXIT', severity: 'critical' },
];
