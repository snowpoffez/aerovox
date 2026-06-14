// ── Command types ────────────────────────────────────────────────────────────
export type Command =
  | { type: 'heading';       value: number }
  | { type: 'airport';       value: string }
  | { type: 'altitude';      value: number; unit: 'ft' | 'm' }
  | { type: 'route_request'; intent: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'unknown';       raw: string }
  | { type: 'takeoff';       runway: string; airport: string }
  | { type: 'land';          runway: string; airport: string }
  | { type: 'taxi_to_gate';  gate: string }
  | { type: 'select_runway'; runway: string }
  | { type: 'throttle_up' }
  | { type: 'throttle_down' }

export interface ParsedCommand {
  command: Command
  confidence: number
  raw: string
}

// ── App state machine ────────────────────────────────────────────────────────
export type AppState =
  | 'IDLE'
  | 'LISTENING'
  | 'COMMAND_RECEIVED'
  | 'ANALYZING'
  | 'RECOMMENDING'
  | 'AWAITING_CONFIRMATION'
  | 'EXECUTING'
  | 'STABILIZED'
  // Ground ops
  | 'PARKED_AT_GATE'
  | 'PUSHBACK'
  | 'TAXI_TO_RUNWAY'
  | 'HOLDING_SHORT'
  | 'LINEUP_AND_WAIT'
  | 'TAKEOFF_ROLL'
  | 'ROTATE'
  | 'CLIMBING'
  | 'CRUISE'
  | 'DESCENDING'
  | 'APPROACH'
  | 'FINAL'
  | 'TOUCHDOWN'
  | 'LANDING_ROLL'
  | 'VACATE_RUNWAY'
  | 'TAXI_TO_GATE'

// ── Route scoring ────────────────────────────────────────────────────────────
export interface ScoredRoute {
  id:             string
  name:           string
  score:          number        // lower = better
  turbulenceRisk: number
  weatherRisk:    number
  fuelCost:       number
  distancePenalty: number
  waypoints:      [number, number][]  // [lat, lon]
  recommended:    boolean
  headingOffset:  number        // degrees from direct
}

// ── Command log ──────────────────────────────────────────────────────────────
export interface LogEntry {
  id:          string
  timestamp:   string
  commandType: string
  display:     string
  status:      'confirmed' | 'cancelled' | 'pending' | 'responded' | 'timeout'
  confidence:  number | null
}

// ── WebSocket messages ───────────────────────────────────────────────────────
export type S2C =
  | { type: 'state';          state: AppState }
  | { type: 'command_parsed'; command: Command; confidence: number; raw: string }
  | { type: 'readback';       english: string; translated: string; lang: string; meta?: { command: string; airport?: string; lat?: number; lon?: number; runway?: string } }
  | { type: 'routes';         routes: ScoredRoute[]; pendingCommand: Command }
  | { type: 'log';            entry: LogEntry }
  | { type: 'tts_ready' }
  | { type: 'land_execute';   airport: string; runway: string; lat: number; lon: number }
  | { type: 'ground_phase';   phase: AppState; airport: string; runway?: string; gate?: string }
  | { type: 'no_fly_alert';   zoneName: string; alternateRoute: ScoredRoute }
  | { type: 'error';          message: string }
  | { type: 'throttle_execute'; active: boolean; callsign?: string }

export type C2S =
  | { type: 'transcript'; text: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'language'; lang: string }
  | { type: 'ground_command'; cmd: { type: string; runway?: string; airport?: string; gate?: string } }
  | { type: 'ping' }
  | { type: 'heading_update'; heading: number }
