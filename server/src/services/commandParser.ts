import type { Command, ParsedCommand } from '../types.js'

// ── Spoken number conversion ─────────────────────────────────────────────────
const WORD_NUMS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, hundred: 100, thousand: 1000,
}

function wordsToNumber(input: string): number | null {
  // Direct digit sequence (e.g. "105", "24R")
  const direct = parseInt(input.replace(/[^0-9]/g, ''), 10)
  if (!isNaN(direct) && /^\d+/.test(input.trim())) return direct

  // Spoken word sequence
  const words = input.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
  let result = 0, current = 0
  for (const w of words) {
    const n = WORD_NUMS[w]
    if (n === undefined) continue
    if (n === 100) {
      current = current === 0 ? 100 : current * 100
    } else if (n === 1000) {
      result += (current === 0 ? 1 : current) * 1000
      current = 0
    } else {
      // Concatenation mode for ATC (e.g. "one zero five" = 105)
      if (n < 10 && current > 0 && current < 100) {
        current = current * 10 + n
      } else {
        current += n
      }
    }
  }
  result += current
  return result > 0 ? result : null
}

// ── Runway identifier normalizer ──────────────────────────────────────────────
function normalizeRunway(raw: string): string {
  // "two four right" → "24R", "six left" → "06L"
  const dir = /left|l\b/i.test(raw) ? 'L' : /right|r\b/i.test(raw) ? 'R' : ''
  const num = wordsToNumber(raw.replace(/left|right|l\b|r\b/ig, '').trim())
  if (num == null) return raw.toUpperCase()
  return String(num).padStart(2, '0') + dir
}

// ── ICAO / city mapping ───────────────────────────────────────────────────────
const AIRPORT_ALIASES: Record<string, string> = {
  toronto: 'CYYZ', pearson: 'CYYZ', yyz: 'CYYZ', cyyz: 'CYYZ',
  montreal: 'CYUL', trudeau: 'CYUL', yul: 'CYUL', cyul: 'CYUL',
  vancouver: 'CYVR', yvr: 'CYVR', cyvr: 'CYVR',
  calgary: 'CYYC', yyc: 'CYYC', cyyc: 'CYYC',
  edmonton: 'CYEG', yeg: 'CYEG', cyeg: 'CYEG',
  jfk: 'KJFK', kjfk: 'KJFK', 'new york': 'KJFK', kennedy: 'KJFK',
  chicago: 'KORD', ohare: 'KORD', ord: 'KORD',
}

// ── Confirm / cancel words ────────────────────────────────────────────────────
const CONFIRM_WORDS = /\b(confirm|confirmed|yes|yeah|yep|affirm|affirmative|approved|approve|go ahead|wilco|roger|correct|proceed)\b/i
const CANCEL_WORDS  = /\b(cancel|negative|no|abort|stop|disregard|never mind|nope|nah)\b/i

// ── Main parser ───────────────────────────────────────────────────────────────
export function parseCommand(raw: string): ParsedCommand {
  const text = raw.trim().toLowerCase()

  // Confirm / cancel first (highest priority)
  if (CONFIRM_WORDS.test(text)) return { command: { type: 'confirm' }, confidence: 0.97, raw }
  if (CANCEL_WORDS.test(text))  return { command: { type: 'cancel'  }, confidence: 0.97, raw }

  // Takeoff
  const takeoffMatch = text.match(/(?:takeoff|take off|depart|cleared for takeoff|cleared to depart).*?(?:runway\s*)?([a-z0-9\s]+(?:left|right|l|r)?)/i)
  if (takeoffMatch && /takeoff|take off|depart/i.test(text)) {
    const airportMatch = text.match(/(?:at|from|cyyz|cyvr|cyul|cyyc|cyeg|toronto|vancouver|montreal|calgary|edmonton)/)
    const airportRaw   = airportMatch ? airportMatch[0] : 'CYYZ'
    const airport      = AIRPORT_ALIASES[airportRaw.toLowerCase()] ?? airportRaw.toUpperCase()
    const runway       = normalizeRunway(takeoffMatch[1])
    if (runway) return { command: { type: 'takeoff', runway, airport }, confidence: 0.88, raw }
  }

  // Landing
  if (/\b(?:land|approach|end|cleared to land|cleared for approach)\b/i.test(text)) {
    const airportMatch = text.match(/\b(cyyz|cyul|cyvr|cyyc|cyeg|kjfk|kord|jfk|ord|yyz|yul|yvr|yyc|yeg|toronto|vancouver|montreal|calgary|edmonton|chicago|new york)\b/i)
    const airportRaw   = airportMatch ? airportMatch[1] : 'CYYZ'
    const airport      = AIRPORT_ALIASES[airportRaw.toLowerCase()] ?? airportRaw.toUpperCase()
    const runwayMatch  = text.match(/runway\s+([a-z0-9\s]+(?:left|right|l|r)?)/i)
    const runway       = runwayMatch ? normalizeRunway(runwayMatch[1]) : ''
    return { command: { type: 'land', runway, airport }, confidence: 0.90, raw }
  }

  // Taxi to gate
  const taxiMatch = text.match(/taxi.*?(?:gate\s*|to\s+gate\s*)([a-z0-9\s]+)/i)
  if (taxiMatch) {
    return { command: { type: 'taxi_to_gate', gate: taxiMatch[1].trim().toUpperCase() }, confidence: 0.85, raw }
  }

  // Heading
  const headingMatch = text.match(/(?:fly|turn|heading|bear(?:ing)?|track|set heading)[\s\w]*?(\d+(?:\s+\d+)*|(?:[a-z\s]+ ){1,3}degrees?)/i)
    ?? text.match(/(?:one|two|three|four|five|six|seven|eight|nine|zero|oh)[\s](?:one|two|three|four|five|six|seven|eight|nine|zero|oh|hundred)/i)
  if (headingMatch && /heading|bearing|turn|track|bear/i.test(text)) {
    const value = wordsToNumber(headingMatch[1] ?? headingMatch[0])
    if (value !== null && value >= 0 && value <= 360) {
      return { command: { type: 'heading', value }, confidence: 0.90, raw }
    }
  }

  // Altitude
  const altMatch = text.match(/(?:climb|descend|altitude|flight level|fl)[\s\w]*?(\d[\d\s]*|\w[\w\s]+?)(?:\s*(?:feet|foot|ft|meters?|m|fl))?/i)
  if (altMatch && /climb|descend|altitude|flight level/i.test(text)) {
    const value = wordsToNumber(altMatch[1])
    const unit: 'ft' | 'm' = /meters?|^m$/i.test(text) ? 'm' : 'ft'
    if (value !== null && value > 0) {
      return { command: { type: 'altitude', value, unit }, confidence: 0.87, raw }
    }
  }

  // Airport / fly to
  const airportMatch = text.match(/(?:fly to|direct to|navigate to|go to|divert to)\s+([a-z0-9\s]+)/i)
  if (airportMatch) {
    const name = airportMatch[1].trim()
    const icao = AIRPORT_ALIASES[name.toLowerCase()]
    if (icao) return { command: { type: 'airport', value: icao }, confidence: 0.92, raw }
    return { command: { type: 'airport', value: name.toUpperCase() }, confidence: 0.75, raw }
  }

  // Route request / turbulence avoidance
  if (/route|smoother|turbulence|avoid|alternate|reroute|weather|storm/i.test(text)) {
    return { command: { type: 'route_request', intent: text }, confidence: 0.82, raw }
  }

  // Throttle
  if (/\b(?:throttle|level|speed|engines|engine|power|motor)\s+(?:up|on|increase|start)\b/i.test(text)) {
    return { command: { type: 'throttle_up' }, confidence: 0.90, raw }
  }
  if (/\b(?:throttle|level|speed|engines|engine|power|motor)\s+(?:down|off|decrease|stop|reduce)\b/i.test(text)) {
    return { command: { type: 'throttle_down' }, confidence: 0.90, raw }
  }

  return { command: { type: 'unknown', raw }, confidence: 0.3, raw }
}

export function commandToReadback(cmd: Command): string {
  switch (cmd.type) {
    case 'heading':
      return `Turning to heading ${cmd.value.toString().split('').join(' ')}. Say confirm to proceed.`
    case 'altitude':
      return `${cmd.value > 0 ? 'Climbing' : 'Descending'} to ${cmd.value.toLocaleString()} ${cmd.unit}. Say confirm to proceed.`
    case 'airport':
      return `Routing to ${cmd.value}. Say confirm to proceed.`
    case 'route_request':
      return `Route analysis complete. Three options computed. Recommend optimal route. Say confirm to proceed.`
    case 'takeoff':
      return `Cleared for takeoff runway ${cmd.runway} at ${cmd.airport}. Say confirm to proceed.`
    case 'land':
      return `Cleared to land runway ${cmd.runway} at ${cmd.airport}. Say confirm to proceed.`
    case 'taxi_to_gate':
      return `Taxi to ${cmd.gate}. Say confirm to proceed.`
    case 'throttle_up':
      return 'Throttle up. Confirm to proceed.'
    case 'throttle_down':
      return 'Throttle down. Confirm to proceed.'
    default:
      return 'Command not understood. Please repeat.'
  }
}
