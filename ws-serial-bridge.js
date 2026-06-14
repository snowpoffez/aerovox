import { WebSocketServer } from 'ws'
import { SerialPort } from 'serialport'

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SERIAL_PORT = 'COM5'
const BAUD_RATE   = 115200
const WS_PORT     = 8080
// ──────────────────────────────────────────────────────────────────────────────

const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE })

port.on('open', () => console.log(`[serial] Connected to ${SERIAL_PORT}`))
port.on('error', err => console.error('[serial] Error:', err.message))
port.on('data', data => process.stdout.write('[arduino] ' + data.toString()))

const wss = new WebSocketServer({ port: WS_PORT })
console.log(`[ws] Listening on ws://localhost:${WS_PORT}`)

wss.on('connection', ws => {
  console.log('[ws] Client connected')

  ws.on('message', raw => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'heading_update' && typeof msg.heading === 'number') {
      const line = Math.round(msg.heading) + '\n'
      port.write(line, err => {
        if (err) console.error('[serial] Write error:', err.message)
      })
    }

    if (msg.type === 'heading_update' && typeof msg.speed === 'number') {
      port.write(`SPEED:${msg.speed}\n`, err => {
        if (err) console.error('[serial] Write error:', err.message)
      })
    }
  })

  ws.on('close', () => console.log('[ws] Client disconnected'))
})