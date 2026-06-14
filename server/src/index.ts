import 'dotenv/config'
import express     from 'express'
import cors        from 'cors'
import http        from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { StateMachine }   from './stateMachine.js'
import { parseCommand, commandToReadback } from './services/commandParser.js'
import { scoreRoutes }   from './services/routeScorer.js'
import { speak, getLatestAudio } from './services/ttsService.js'
import { sendBearing, sendSpeed, initServo, testServo } from './services/servoController.js'
import { checkRouteIntersections, NO_FLY_ZONES } from './services/noFlyZones.js'
import { AIRPORTS }       from './data/airports.js'
import type { S2C, C2S, Command, ScoredRoute, LogEntry } from './types.js'

const PORT = parseInt(process.env.PORT ?? '3001')
const app  = express()
const server = http.createServer(app)
const wss    = new WebSocketServer({ server })

app.use(cors())
app.use(express.json())

// ── Shared state ──────────────────────────────────────────────────────────────
const sm = new StateMachine()

let currentLang      = process.env.DEFAULT_LANG ?? 'en'
let pendingCommand:   Command | null      = null
let pendingRoutes:    ScoredRoute[] | null = null
let pendingLogId:     string | null = null
const commandLog:    LogEntry[] = []

// ── Broadcast helpers ─────────────────────────────────────────────────────────
function broadcast(msg: S2C) {
  const data = JSON.stringify(msg)
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  })
}

function logEntry(entry: LogEntry) {
  commandLog.unshift(entry)
  if (commandLog.length > 20) commandLog.pop()
  broadcast({ type: 'log', entry })
}

// ── State machine events ──────────────────────────────────────────────────────
sm.on('state', (state) => broadcast({ type: 'state', state }))

sm.on('confirmation_timeout', () => {
  if (pendingLogId) {
    const entry = commandLog.find(e => e.id === pendingLogId)
    if (entry) { entry.status = 'timeout'; broadcast({ type: 'log', entry }) }
  }
  broadcast({ type: 'state', state: 'IDLE' })
  pendingCommand = null; pendingRoutes = null; pendingLogId = null
})

// ── Live aircraft tracking stepper throttle ───────────────────────────────────
let lastLiveHeadingSend = 0
let lastLiveHeading: number | null = null
const LIVE_HEADING_MIN_INTERVAL_MS = 20

function timestamp(): string {
  return new Date().toLocaleTimeString('en-CA', { hour12: false })
}

// ── Ground operations sequencer ───────────────────────────────────────────────
async function runTakeoffSequence(airport: string, runway: string) {
  const phases: [string, number][] = [
    ['PUSHBACK',        15000],
    ['TAXI_TO_RUNWAY',  20000],
    ['HOLDING_SHORT',    3000],
    ['LINEUP_AND_WAIT',  4000],
    ['TAKEOFF_ROLL',    30000],
    ['ROTATE',           5000],
    ['CLIMBING',        60000],
    ['CRUISE',               0],
  ]

  for (const [phase, duration] of phases) {
    sm.transition(phase as any)
    broadcast({ type: 'ground_phase', phase: phase as any, airport, runway })
    
    // FIXED: Only passing 1 argument to match the stepper hardware service pipeline
    sendBearing(0) 
    if (duration > 0) await delay(duration)
  }
}

async function runLandingSequence(airport: string, runway: string) {
  const phases: [string, number][] = [
    ['DESCENDING',  120000],
    ['APPROACH',     60000],
    ['FINAL',        30000],
    ['TOUCHDOWN',    20000],
    ['LANDING_ROLL', 20000],
    ['VACATE_RUNWAY', 8000],
    ['TAXI_TO_GATE', 20000],
    ['PARKED_AT_GATE',   0],
  ]

  for (const [phase, duration] of phases) {
    sm.transition(phase as any)
    broadcast({ type: 'ground_phase', phase: phase as any, airport, runway })
    
    // FIXED: Only passing 1 argument to match the stepper hardware service pipeline
    sendBearing(0)
    if (duration > 0) await delay(duration)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Main command processing ───────────────────────────────────────────────────
async function processTranscript(text: string) {
  sm.transition('COMMAND_RECEIVED')

  const parsed = parseCommand(text)
  broadcast({ type: 'command_parsed', command: parsed.command, confidence: parsed.confidence, raw: text })

  if (parsed.confidence < 0.75) {
    const msg = `Did you say: ${commandToReadback(parsed.command)} Please confirm or repeat.`
    const { translated } = await speak(msg, currentLang)
    broadcast({ type: 'readback', english: msg, translated, lang: currentLang })
    broadcast({ type: 'tts_ready' })
    sm.transition('AWAITING_CONFIRMATION')
    pendingCommand = parsed.command
    return
  }

  const cmd = parsed.command

  if (cmd.type === 'confirm') { handleConfirm(); return }
  if (cmd.type === 'cancel')  { handleCancel();  return }

  if (cmd.type === 'route_request' || cmd.type === 'airport') {
    sm.transition('ANALYZING')
    const toLat = 43.6777, toLon = -79.6248
    const routes = await scoreRoutes(43.8561, -79.3370, toLat, toLon, 0.4)
    pendingRoutes = routes
    sm.transition('RECOMMENDING')

    const best = routes.find(r => r.recommended)!
    const nfz  = checkRouteIntersections(best)
    let safeRoute = best
    if (nfz.length > 0) {
      const alt = routes.find(r => !r.recommended && checkRouteIntersections(r).length === 0)
      if (alt) {
        safeRoute = alt
        broadcast({ type: 'no_fly_alert', zoneName: nfz[0].name, alternateRoute: alt })
        const warn = `Warning. Proposed route enters ${nfz[0].name}. Alternate route calculated.`
        const { translated } = await speak(warn, currentLang)
        broadcast({ type: 'readback', english: warn, translated, lang: currentLang })
        broadcast({ type: 'tts_ready' })
      }
    }

    broadcast({ type: 'routes', routes, pendingCommand: cmd })

    const fuelImpact = (safeRoute.fuelCost * 100).toFixed(1)
    const readbackEn = `Route recommendation available. Fuel impact plus ${fuelImpact} percent. Say confirm to proceed.`
    const { translated } = await speak(readbackEn, currentLang)
    broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
    broadcast({ type: 'tts_ready' })

    pendingCommand = cmd
    const logId = Date.now().toString()
    pendingLogId = logId
    logEntry({ id: logId, timestamp: timestamp(), commandType: 'ROUTE REQUEST', display: 'Route Request', status: 'pending', confidence: parsed.confidence })
    sm.transition('AWAITING_CONFIRMATION')
    return
  }

  if (cmd.type === 'takeoff') {
    const readbackEn = `Takeoff runway ${cmd.runway} at ${cmd.airport} confirmed. Say confirm to proceed.`
    const { translated } = await speak(readbackEn, currentLang)
    broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
    broadcast({ type: 'tts_ready' })
    pendingCommand = cmd
    const logId = Date.now().toString(); pendingLogId = logId
    logEntry({ id: logId, timestamp: timestamp(), commandType: 'TAKEOFF', display: `Takeoff ${cmd.runway}`, status: 'pending', confidence: parsed.confidence })
    sm.transition('AWAITING_CONFIRMATION')
    return
  }

  if (cmd.type === 'land') {
    const apData = AIRPORTS.find(a => a.icao === cmd.airport)
    const readbackEn = `Cleared to land runway ${cmd.runway} at ${cmd.airport}. Confirm to proceed.`
    const { translated } = await speak(readbackEn, currentLang)
    broadcast({
      type: 'readback', english: readbackEn, translated, lang: currentLang,
      meta: { command: 'land', airport: cmd.airport, runway: cmd.runway, lat: apData?.lat ?? 43.6777, lon: apData?.lon ?? -79.6248 },
    })
    broadcast({ type: 'tts_ready' })
    pendingCommand = cmd
    const logId = Date.now().toString(); pendingLogId = logId
    logEntry({ id: logId, timestamp: timestamp(), commandType: 'LAND', display: `Land ${cmd.runway}`, status: 'pending', confidence: parsed.confidence })
    sm.transition('AWAITING_CONFIRMATION')
    return
  }

  if (cmd.type === 'heading') {
    const readbackEn = `Turning to heading ${cmd.value}. Say confirm to proceed.`
    const { translated } = await speak(readbackEn, currentLang)
    broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
    broadcast({ type: 'tts_ready' })
    pendingCommand = cmd
    const logId = Date.now().toString(); pendingLogId = logId
    
    // FIXED: Changed 'id: id = logId' to 'id: logId'
    logEntry({ id: logId, timestamp: timestamp(), commandType: 'HEADING', display: `Heading ${cmd.value}°`, status: 'pending', confidence: parsed.confidence })
    
    sm.transition('AWAITING_CONFIRMATION')
    return
  }

  if (cmd.type === 'altitude') {
    const readbackEn = `${cmd.value > 10000 ? 'Climbing' : 'Descending'} to ${cmd.value.toLocaleString()} ${cmd.unit}. Say confirm to proceed.`
    const { translated } = await speak(readbackEn, currentLang)
    broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
    broadcast({ type: 'tts_ready' })
    pendingCommand = cmd
    const logId = Date.now().toString(); pendingLogId = logId
    logEntry({ id: logId, timestamp: timestamp(), commandType: 'ALTITUDE', display: `Altitude ${cmd.value.toLocaleString()} ${cmd.unit}`, status: 'pending', confidence: parsed.confidence })
    sm.transition('AWAITING_CONFIRMATION')
    return
  }

  if (cmd.type === 'throttle_up' || cmd.type === 'throttle_down') {
    const label = cmd.type === 'throttle_up' ? 'Throttle up' : 'Throttle down'
    const readbackEn = `${label}. Confirm to proceed.`
    const { translated } = await speak(readbackEn, currentLang)
    broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
    broadcast({ type: 'tts_ready' })
    pendingCommand = cmd
    const logId = Date.now().toString(); pendingLogId = logId
    logEntry({ id: logId, timestamp: timestamp(), commandType: label.toUpperCase().replace(' ', '_'), display: label, status: 'pending', confidence: parsed.confidence })
    sm.transition('AWAITING_CONFIRMATION')
    return
  }

  const { translated } = await speak('Command not understood. Please repeat.', currentLang)
  broadcast({ type: 'readback', english: 'Command not understood. Please repeat.', translated, lang: currentLang })
  broadcast({ type: 'tts_ready' })
  sm.transition('IDLE')
}

async function handleConfirm() {
  if (!pendingCommand) {
    sm.transition('IDLE'); return
  }
  sm.transition('EXECUTING')
  const cmd = pendingCommand
  pendingCommand = null

  if (pendingLogId) {
    const entry = commandLog.find(e => e.id === pendingLogId)
    if (entry) { entry.status = 'confirmed'; broadcast({ type: 'log', entry }) }
    pendingLogId = null
  }

  if (cmd.type === 'heading') {
    await delay(2000)
    sm.transition('STABILIZED')
    await delay(1000)
    sm.transition('IDLE')
  } else if (cmd.type === 'takeoff') {
    runTakeoffSequence(cmd.airport, cmd.runway).catch(console.error)
  } else if (cmd.type === 'land') {
    const apData = AIRPORTS.find(a => a.icao === cmd.airport)
    broadcast({
      type: 'land_execute',
      airport: cmd.airport,
      runway: cmd.runway,
      lat: apData?.lat ?? 43.6777,
      lon: apData?.lon ?? -79.6248,
    })
    runLandingSequence(cmd.airport, cmd.runway).catch(console.error)
  } else if (cmd.type === 'throttle_up') {
    sendSpeed(255)
    broadcast({ type: 'throttle_execute', active: true })
    await delay(500)
    sm.transition('IDLE')
  } else if (cmd.type === 'throttle_down') {
    sendSpeed(0)
    broadcast({ type: 'throttle_execute', active: false })
    await delay(500)
    sm.transition('IDLE')
  } else {
    // FIXED: Pitch argument removed
    sendBearing(0)
    await delay(2000)
    sm.transition('STABILIZED')
    await delay(1000)
    sm.transition('IDLE')
  }
}

function handleCancel() {
  if (pendingLogId) {
    const entry = commandLog.find(e => e.id === pendingLogId)
    if (entry) { entry.status = 'cancelled'; broadcast({ type: 'log', entry }) }
    pendingLogId = null
  }
  pendingCommand = null
  speak('Command cancelled.', currentLang).then(() => broadcast({ type: 'tts_ready' }))
  sm.transition('IDLE')
}

// ── WebSocket handler ─────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Client connected')

  ws.send(JSON.stringify({ type: 'state', state: sm.state } satisfies S2C))
  commandLog.slice(0, 20).reverse().forEach(entry => {
    ws.send(JSON.stringify({ type: 'log', entry } satisfies S2C))
  })

  ws.on('message', async (raw) => {
    let msg: C2S
    try { msg = JSON.parse(raw.toString()) } catch { return }

    switch (msg.type) {
      case 'transcript': {
        const quickParse = parseCommand(msg.text)
        if (quickParse.command.type === 'confirm') { await handleConfirm(); break }
        if (quickParse.command.type === 'cancel')  { handleCancel();         break }
        sm.transition('LISTENING')
        await delay(300)
        await processTranscript(msg.text)
        break
      }

      case 'confirm':
        await handleConfirm()
        break

      case 'cancel':
        handleCancel()
        break

      case 'language':
        currentLang = msg.lang
        console.log('[Lang] Changed to', currentLang)
        break

      case 'ground_command': {
        const { cmd } = msg
        if (cmd.type === 'takeoff' && cmd.runway && cmd.airport) {
          pendingCommand = { type: 'takeoff', runway: cmd.runway, airport: cmd.airport }
          const readbackEn = `Takeoff runway ${cmd.runway} at ${cmd.airport}. Say confirm to proceed.`
          const { translated } = await speak(readbackEn, currentLang)
          broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
          broadcast({ type: 'tts_ready' })
          sm.transition('AWAITING_CONFIRMATION')
        } else if (cmd.type === 'land' && cmd.runway && cmd.airport) {
          pendingCommand = { type: 'land', runway: cmd.runway, airport: cmd.airport }
          const readbackEn = `Cleared to land runway ${cmd.runway} at ${cmd.airport}. Say confirm to proceed.`
          const { translated } = await speak(readbackEn, currentLang)
          broadcast({ type: 'readback', english: readbackEn, translated, lang: currentLang })
          broadcast({ type: 'tts_ready' })
          sm.transition('AWAITING_CONFIRMATION')
        }
        break
      }

      // ── Live aircraft tracking — drive stepper directly ──
      case 'heading_update': {
        if (typeof msg.heading === 'number') {
          const now = Date.now()
          if (now - lastLiveHeadingSend >= LIVE_HEADING_MIN_INTERVAL_MS) {
            sendBearing(msg.heading)
            lastLiveHeadingSend = now

            if (lastLiveHeading !== null) {
              const delta = ((msg.heading - lastLiveHeading + 540) % 360) - 180
              if (Math.abs(delta) >= 0.5) {
                const dir = delta > 0 ? 'right' : 'left'
                console.log(`[Stepper] Rotating ${dir} → ${Math.round(msg.heading)}°`)
              }
            }
            lastLiveHeading = msg.heading
          }
        }
        break
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'state', state: sm.state }))
        break
    }
  })

  ws.on('close', () => console.log('[WS] Client disconnected'))
})

// ── HTTP routes ───────────────────────────────────────────────────────────────
app.get('/api/tts/latest', (req, res) => {
  const audio = getLatestAudio()
  if (!audio) { res.status(204).end(); return }
  res.set('Content-Type', 'audio/mpeg')
  res.set('Content-Length', String(audio.length))
  res.end(audio)
})

app.post('/api/servo/test', (req, res) => {
  res.json(testServo())
})

app.get('/api/airports', (req, res) => {
  res.json(AIRPORTS)
})

app.get('/api/zones', (req, res) => {
  res.json(NO_FLY_ZONES)
})

app.get('/api/status', (req, res) => {
  res.json({ state: sm.state, lang: currentLang, clients: wss.clients.size })
})

// ── Startup ───────────────────────────────────────────────────────────────────
initServo().catch(console.error)

server.listen(PORT, () => {
  console.log(`[AeroVox] Server ready on http://localhost:${PORT}`)
  console.log(`[AeroVox] Default language: ${currentLang}`)
})