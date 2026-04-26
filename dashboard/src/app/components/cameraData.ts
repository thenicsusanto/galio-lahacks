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

export interface Detection {
  label: string;
  confidence: number;
  bbox: number[];
}

export interface AlertEvent {
  id: number;
  time: string;
  timestamp: number;
  cam: number;
  camera_id?: string;
  type: string;
  details: string;
  severity: 'critical' | 'warning' | 'info';
  score: number;
  action_required: 'Immediate' | 'Monitor' | 'Log';
  detections: Detection[];
}

export const INITIAL_EVENTS: AlertEvent[] = [
  { 
    id: 10, time: '14:23:22', timestamp: Date.now() / 1000 - 40, cam: 3, camera_id: 'cam_03', 
    type: 'LOITERING_ALERT', details: 'duration=4m28s zone=EXIT threshold=120s', severity: 'critical', 
    score: 0.92, action_required: 'Immediate', detections: [] 
  },
  { 
    id: 9, time: '14:23:19', timestamp: Date.now() / 1000 - 80, cam: 5, camera_id: 'cam_05', 
    type: 'BAG_UNATTENDED', details: 'duration=2m01s threshold_exceeded=true', severity: 'critical', 
    score: 0.88, action_required: 'Immediate', detections: [] 
  },
  { 
    id: 8, time: '14:23:17', timestamp: Date.now() / 1000 - 120, cam: 4, camera_id: 'cam_04', 
    type: 'VEHICLE_DETECTED', details: 'bbox=[352,151,243,115] conf=0.94', severity: 'info', 
    score: 0.35, action_required: 'Log', detections: [] 
  },
  { 
    id: 7, time: '14:23:15', timestamp: Date.now() / 1000 - 150, cam: 4, camera_id: 'cam_04', 
    type: 'VEHICLE_DETECTED', details: 'bbox=[51,137,269,137] conf=0.99', severity: 'info', 
    score: 0.42, action_required: 'Log', detections: [] 
  },
  { 
    id: 6, time: '14:23:13', timestamp: Date.now() / 1000 - 180, cam: 2, camera_id: 'cam_02', 
    type: 'PERSON_DETECTED', details: 'bbox=[307,135,58,115] conf=0.93', severity: 'info', 
    score: 0.28, action_required: 'Log', detections: [] 
  },
  { 
    id: 5, time: '14:23:11', timestamp: Date.now() / 1000 - 210, cam: 1, camera_id: 'cam_01', 
    type: 'PERSON_DETECTED', details: 'bbox=[224,132,77,136] conf=0.97', severity: 'info', 
    score: 0.31, action_required: 'Log', detections: [] 
  },
  { 
    id: 4, time: '14:23:09', timestamp: Date.now() / 1000 - 240, cam: 7, camera_id: 'cam_07', 
    type: 'PERSON_DETECTED', details: 'bbox=[256,72,168,237] conf=0.88', severity: 'info', 
    score: 0.25, action_required: 'Log', detections: [] 
  },
  { 
    id: 3, time: '14:23:07', timestamp: Date.now() / 1000 - 270, cam: 3, camera_id: 'cam_03', 
    type: 'PERSON_DETECTED', details: 'bbox=[212,102,154,207] conf=0.96', severity: 'info', 
    score: 0.33, action_required: 'Log', detections: [] 
  },
  { 
    id: 2, time: '14:23:05', timestamp: Date.now() / 1000 - 300, cam: 5, camera_id: 'cam_05', 
    type: 'BAG_UNATTENDED', details: 'bbox=[334,223,115,79] conf=0.91', severity: 'warning', 
    score: 0.65, action_required: 'Monitor', detections: [] 
  },
  { 
    id: 1, time: '14:23:01', timestamp: Date.now() / 1000 - 360, cam: 3, camera_id: 'cam_03', 
    type: 'LOITERING_ALERT', details: 'duration=4m12s zone=EXIT', severity: 'critical', 
    score: 0.95, action_required: 'Immediate', detections: [] 
  },
];
