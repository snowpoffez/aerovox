import React, { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Polyline } from 'react-leaflet'
import L from 'leaflet'
import Airports        from '../components/Airports.jsx'
import Aircraft        from '../components/Aircraft.jsx'
import AirportInfoCard from '../components/AirportInfoCard.jsx'
import WindLayer, { WIND_LEVELS } from '../components/WindLayer.jsx'
import NoFlyZones from '../components/NoFlyZones.jsx'
import CommandLog      from '../components/CommandLog.jsx'
import RoutePreview    from '../components/RoutePreview.jsx'
import RouteMarkers    from '../components/RouteMarkers.jsx'
import { on, send, setPTTActive } from '../services/wsClient.js'
import { startListening, stopListening, isSupported } from '../services/voiceInput.js'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const DEFAULT_CENTER = [43.677, -79.6305]

const CONFIRM_RE = /\b(confirm|confirmed|yes|yeah|affirm|affirmative|approved|approve|wilco|roger|correct|proceed|go ahead)\b/i
const CANCEL_RE  = /\b(cancel|negative|no|abort|stop|nope|nah|disregard)\b/i
const LAND_RE    = /\b(land|approach|cleared to land)\b/i

const AIRPORT_COORDS = {
  CYYZ: { lat: 43.6777, lon: -79.6248 },
  KJFK: { lat: 40.6413, lon: -73.7781 },
  KORD: { lat: 41.9742, lon: -87.9073 },
  CYUL: { lat: 45.4706, lon: -73.7408 },
  CYVR: { lat: 49.1967, lon: -123.1815 },
  CYYC: { lat: 51.1315, lon: -114.0106 },
  CYEG: { lat: 53.3097, lon: -113.5797 },
}
const AIRPORT_ALIASES = {
  toronto: 'CYYZ', pearson: 'CYYZ', yyz: 'CYYZ',
  jfk: 'KJFK', 'new york': 'KJFK', kennedy: 'KJFK',
  chicago: 'KORD', ohare: 'KORD', ord: 'KORD',
  montreal: 'CYUL', yul: 'CYUL',
  vancouver: 'CYVR', yvr: 'CYVR',
  calgary: 'CYYC', yyc: 'CYYC',
  edmonton: 'CYEG', yeg: 'CYEG',
}
function normRwy(raw) {
  const dir = /left|l\b/i.test(raw) ? 'L' : /right|r\b/i.test(raw) ? 'R' : ''
  const cl = raw.replace(/left|right|l\b|r\b/ig, '').trim()
  const dm = cl.match(/\d+/)
  if (dm) return String(parseInt(dm[0], 10)).padStart(2, '0') + dir
  const ws = ['zero','one','two','three','four','five','six','seven','eight','nine']
  const pts = cl.toLowerCase().split(/\s+/).filter(Boolean)
  let n = 0
  for (const p of pts) { const i = ws.indexOf(p); if (i >= 0) n = n * 10 + i }
  return n > 0 ? String(n).padStart(2, '0') + dir : raw.toUpperCase()
}

function parseLandTarget(text) {
  const t = text.toLowerCase()
  const rwy = (t.match(/runway\s+([a-z0-9\s]+(?:left|right|l|r)?)/i) ?? [])[1]
  const rwyId = rwy ? normRwy(rwy) : undefined
  for (const [alias, icao] of Object.entries(AIRPORT_ALIASES)) {
    if (t.includes(alias)) return { airport: icao, runway: rwyId, ...AIRPORT_COORDS[icao] }
  }
  return null
}

const toRad = d => d * Math.PI / 180
const calcBearing = (la1, lo1, la2, lo2) => {
  const φ1 = toRad(la1), φ2 = toRad(la2), Δλ = toRad(lo2 - lo1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
const DIST_KM = (la1, lo1, la2, lo2) => {
  const dLat = toRad(la2 - la1), dLon = toRad(lo2 - lo1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon/2)**2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

const STORM_CX = 44.475, STORM_CY = -80.308
const STORM_BUF_NM = 14
const generateDiversionRoute = (startLat, startLon) => {
  const kmPerDeg = 111.32
  const lonScale = Math.cos(STORM_CX * Math.PI / 180)
  const rLat = STORM_BUF_NM * 1.852 / kmPerDeg
  const rLon = STORM_BUF_NM * 1.852 / (kmPerDeg * lonScale)

  const dLat = (startLat - STORM_CX) / rLat
  const dLon = (startLon - STORM_CY) / rLon
  const startAngle = Math.atan2(dLon, dLat) * 180 / Math.PI
  const startDist  = Math.sqrt(dLat * dLat + dLon * dLon)

  const ENTRY = 18, EXIT = 18
  const arcStart = startAngle
  const arcEnd   = startAngle + 180

  const wps = []
  for (let d = arcStart; d <= arcEnd + EXIT; d += 1.2) {
    const a = d * Math.PI / 180
    const entryEnd = arcStart + ENTRY
    const exitStart = arcEnd

    let radius
    if (d <= entryEnd) {
      const t = (d - arcStart) / ENTRY
      const s = t * t * (3 - 2 * t)
      radius = startDist + (1 - startDist) * s
    } else if (d >= exitStart) {
      const t = (d - exitStart) / EXIT
      const s = t * t * (3 - 2 * t)
      radius = 1 + 0.7 * s
    } else {
      radius = 1
    }

    wps.push([STORM_CX + radius * rLat * Math.cos(a), STORM_CY + radius * rLon * Math.sin(a)])
  }
  return wps
}

const LANGUAGES = [
  { code: 'en', label: 'English'   },
  { code: 'fr', label: 'Français'  },
  { code: 'es', label: 'Español'   },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文'      },
  { code: 'ar', label: 'العربية'  },
]

export default function App() {
  const [loading,          setLoading]          = useState(true)
  const [selectedAirport,  setSelectedAirport]  = useState(null)
  const [selectedAircraft, setSelectedAircraft] = useState(null)
  const [windVisible,      setWindVisible]      = useState(true)
  const [runwaysMap,       setRunwaysMap]       = useState({})
  const livePosRef = useRef(null)

  const [wsConnected, setWsConnected] = useState(false)
  const [appState,    setAppState]    = useState('IDLE')
  const [lang,        setLang]        = useState('')
  const [transcript,  setTranscript]  = useState('')
  const [readback,    setReadback]    = useState(null)
  const [routes,      setRoutes]      = useState([])
  const [commandLog,  setCommandLog]  = useState([])
  const [isListening,    setIsListening]    = useState(false)
  const [pttHeld,        setPttHeld]        = useState(false)
  const [landingTarget,  setLandingTarget]  = useState(null)
  const [approved,       setApproved]       = useState(false)
  const [throttleActive, setThrottleActive] = useState(false)
  const [turbulenceAlert, setTurbulenceAlert] = useState(null)
  const [diversionRoute, setDiversionRoute] = useState(null)
  const diversionRef = useRef({ active: false, wpIdx: 0, waypoints: null })
  const diversionPendingRef = useRef(false)
  const pendingLandMeta  = useRef(null)
  const pendingHeadingRef = useRef(null)
  const selectedAircraftRef = useRef(null)

  // Client-side targeted simulator values
  const [targetAltitude, setTargetAltitude] = useState(null) 
  const [targetSpeed,    setTargetSpeed]    = useState(null) 
  const [targetHeading,  setTargetHeading]  = useState(null) 

  // Reset targets if the user manually changes or deselects an aircraft
  const handleSelectAircraft = (aircraft) => {
    setSelectedAircraft(aircraft)
    selectedAircraftRef.current = aircraft
    setTargetAltitude(null)
    setTargetSpeed(null)
    setTargetHeading(null)
    pendingHeadingRef.current = null
    pendingLandMeta.current = null
    setDiversionRoute(null)
    diversionRef.current = { active: false }
    diversionPendingRef.current = aircraft?.callsign === 'ACA973'
    if (aircraft?.callsign === 'ACA973') {
      setTurbulenceAlert('⚠ SEVERE TURBULENCE REPORTED IN GEORGIAN BAY STORM AHEAD — SAY AFFIRMATIVE TO DIVERT')
      const msg = new SpeechSynthesisUtterance('Severe turbulence reported in Georgian Bay storm ahead. Say affirmative to divert around the storm.')
      speechSynthesis.speak(msg)
    } else {
      setTurbulenceAlert(null)
    }
  }

  // ── WebSocket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      on('_connected',    () => setWsConnected(true)),
      on('_disconnected', () => setWsConnected(false)),
      on('state', (msg) => {
        setAppState(msg.state)
        if (msg.state === 'EXECUTING') {
          if (pendingHeadingRef.current != null) {
            setTargetHeading(pendingHeadingRef.current)
            pendingHeadingRef.current = null
          }
          if (pendingLandMeta.current) {
            setLandingTarget(pendingLandMeta.current)
            pendingLandMeta.current = null
            setApproved(true)
            setTimeout(() => setApproved(false), 3000)
          }
        } else if (msg.state === 'IDLE') {
          pendingHeadingRef.current = null
        }
      }),
      on('readback', (msg) => {
        setReadback({ english: msg.english, translated: msg.translated })
        
        const text = (msg.english || '').toLowerCase()

        // 1. Intercept Heading Changes (store pending, apply on EXECUTING)
        if (text.includes('heading') || text.includes('fly') || text.includes('turn')) {
          const digits = text.match(/\d+/)
          if (digits) {
            const parsedHdg = parseInt(digits[0], 10)
            if (parsedHdg >= 0 && parsedHdg <= 360) {
              pendingHeadingRef.current = parsedHdg
            }
          }
        }

        // 2. Intercept Altitude Changes
        if (text.includes('climb') || text.includes('descend') || text.includes('altitude') || text.includes('flight level')) {
          const digits = text.match(/\d[\d,.]*/g)
          if (digits) {
            let parsedAlt = parseInt(digits[0].replace(/,/g, ''), 10)
            if (text.includes('flight level') && parsedAlt < 1000) {
              parsedAlt = parsedAlt * 100
            }
            setTargetAltitude(parsedAlt)
          }
        }

        // 3. Intercept Speed Changes
        if (text.includes('speed') || text.includes('knots') || text.includes('reduce') || text.includes('increase')) {
          const digits = text.match(/\d+/)
          if (digits) {
            const parsedSpeed = parseInt(digits[0], 10)
            setTargetSpeed(parsedSpeed)
          }
        }

        if (msg.meta?.command === 'land') {
          pendingLandMeta.current = { lat: msg.meta.lat, lon: msg.meta.lon, airport: msg.meta.airport, runway: msg.meta.runway }
        } else {
          pendingLandMeta.current = null
        }
      }),
      on('routes',  (msg) => setRoutes(msg.routes ?? [])),
      on('land_execute', (msg) => {
        setLandingTarget({ lat: msg.lat, lon: msg.lon, airport: msg.airport, runway: msg.runway })
        setApproved(true)
        setTimeout(() => setApproved(false), 3000)
      }),
      on('log', (msg) => {
        setCommandLog(prev => {
          const idx = prev.findIndex(e => e.id === msg.entry.id)
          if (idx >= 0) { const n = [...prev]; n[idx] = msg.entry; return n }
          return [msg.entry, ...prev].slice(0, 20)
        })
      }),
      on('throttle_execute', (msg) => setThrottleActive(msg.active)),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  // ── Space bar PTT ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !e.target.matches('input,select,textarea') && !pttHeld) {
        e.preventDefault(); setPttHeld(true); handlePTTStart()
      }
    }
    const up = (e) => { if (e.code === 'Space') { setPttHeld(false); handlePTTEnd() } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [pttHeld])

  const handlePTTStart = useCallback(() => {
    if (!isSupported()) return

    const craft = selectedAircraftRef.current
    if (craft && craft.baroAlt != null && craft.baroAlt < 50) {
      setTurbulenceAlert('⚠ AIRCRAFT ON GROUND — NO CLEARANCE AVAILABLE')
      setTimeout(() => { if (selectedAircraftRef.current === craft) setTurbulenceAlert(null) }, 4000)
      return
    }

    if (diversionPendingRef.current && !diversionRef.current.active) {
      setTurbulenceAlert('⚠ SEVERE TURBULENCE REPORTED IN GEORGIAN BAY STORM AHEAD — SAY AFFIRMATIVE TO DIVERT')
    }

    setPTTActive(true)
    setIsListening(true)
    setTranscript('')
    startListening({
      onListenStart: () => setIsListening(true),
      onTranscript:  (text) => {
        setTranscript(text)
        setPTTActive(false)

        if (LAND_RE.test(text)) {
          const target = parseLandTarget(text)
          if (target) pendingLandMeta.current = target
        } else if (CONFIRM_RE.test(text) && diversionPendingRef.current && !diversionRef.current.active) {
          const pos = livePosRef.current?.current || selectedAircraftRef.current
          if (!pos || pos.lat == null) return
          const wps = generateDiversionRoute(pos.lat, pos.lon)
          setDiversionRoute(wps)
          diversionRef.current = { active: true }
          setTurbulenceAlert('✓ DIVERTING NORTH AROUND GEORGIAN BAY STORM')
          const msg = new SpeechSynthesisUtterance('Diverting north around Georgian Bay storm')
          speechSynthesis.speak(msg)
          setTimeout(() => setTurbulenceAlert(null), 5000)
        } else if (CONFIRM_RE.test(text) && pendingLandMeta.current) {
          setLandingTarget(pendingLandMeta.current)
          pendingLandMeta.current = null
          setApproved(true)
          setTimeout(() => setApproved(false), 3000)
        } else if (CANCEL_RE.test(text)) {
          pendingLandMeta.current = null
          pendingHeadingRef.current = null
          setLandingTarget(null)
          setTargetAltitude(null)
          setTargetSpeed(null)
          setTargetHeading(null)
        }

        send({ type: 'transcript', text })
        setIsListening(false)
      },
      onListenEnd: () => { setPTTActive(false); setIsListening(false) },
    })
  }, [])

  const handlePTTEnd = useCallback(() => {
    stopListening()
    setPTTActive(false)
    setIsListening(false)
  }, [])

  const handleLangChange = (newLang) => { setLang(newLang); send({ type: 'language', lang: newLang }) }

  return (
    <div className="cockpit">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar__left">
          <span className="topbar__logo">AeroVox</span>
          {!wsConnected && <span className="topbar__offline">⚡ offline</span>}
        </div>

        <div className="topbar__center">
          {transcript && (
            <div className="topbar__transcript">
              <span className="topbar__transcript-label">HEARD</span>
              <span className="topbar__transcript-text">"{transcript}"</span>
            </div>
          )}
          {readback && (
            <div className="topbar__readback">
              <span className="topbar__readback-fr">{readback.translated}</span>
            </div>
          )}
          {approved && (
            <div className="topbar__approved">✓ APPROVED</div>
          )}
          {turbulenceAlert && (
            <div className="topbar__turbulence">{turbulenceAlert}</div>
          )}
        </div>

        <div className="topbar__right">
          <select className="topbar__lang" value={lang} onChange={e => handleLangChange(e.target.value)}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          {appState === 'AWAITING_CONFIRMATION' && !approved && (
            <div className="topbar__awaiting">Say "confirm" or "cancel"</div>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="cockpit__body">
        <div className="cockpit__map">
          {loading && <div className="loading-pill">Loading airport data…</div>}

          <MapContainer
            center={DEFAULT_CENTER} zoom={10} minZoom={2}
            scrollWheelZoom dragging doubleClickZoom touchZoom
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap contributors &copy; CARTO'
              maxZoom={19}
            />
            <Airports
              onLoad={() => setLoading(false)}
              onRunwaysLoaded={setRunwaysMap}
              selectedIdent={selectedAirport?.ident}
              onSelectAirport={(airport) =>
                setSelectedAirport(prev => prev?.ident === airport.ident ? null : airport)
              }
            />

            {/* 🔴 RED MARKERS ADDED HERE */}
            <RouteMarkers routes={routes} targetHeading={targetHeading} />

            <Aircraft
              selectedCallsign={selectedAircraft?.callsign}
              landingTarget={landingTarget}
              targetAltitude={targetAltitude}
              targetSpeed={targetSpeed}
              targetHeading={targetHeading}
              throttleActive={throttleActive}
              runwaysMap={runwaysMap}
              livePosRef={livePosRef}
              onSelectAircraft={handleSelectAircraft}
              onLandingComplete={() => {
                setLandingTarget(null)
                setTargetAltitude(null)
                setTargetSpeed(null)
                setTargetHeading(null)
              }}
              diversionRoute={diversionRoute}
              onDiversionComplete={() => {
                setDiversionRoute(null)
                diversionRef.current = { active: false }
                setTurbulenceAlert('✓ STORM AVERTED — CONTINUE NORMAL NAVIGATION')
                setTimeout(() => setTurbulenceAlert(null), 4000)
                const msg = new SpeechSynthesisUtterance('Storm averted. Continue normal navigation.')
                speechSynthesis.speak(msg)
              }}
            />
            <WindLayer visible={windVisible} />
            <NoFlyZones zones={[
              { name: 'Georgian Bay Storm',  lat: 44.4750, lon: -80.3080, radiusNm: 12 },
            ]} />
            <RoutePreview routes={routes} appState={appState} />
            {diversionRoute && (
              <Polyline
                positions={diversionRoute}
                pathOptions={{ color: '#3b82f6', weight: 2.5, dashArray: '10 6', opacity: 0.85 }}
                interactive={false}
              />
            )}
          </MapContainer>

          <AirportInfoCard
            airport={selectedAirport}
            runwaysMap={runwaysMap}
            onClose={() => setSelectedAirport(null)}
          />
        </div>

        <div className="cockpit__sidebar">
          <CommandLog
            entries={commandLog}
            craft={selectedAircraft}
            livePosRef={livePosRef}
            onCloseAircraft={() => handleSelectAircraft(null)}
          />
        </div>
      </div>

      <div className="bottombar">
        <button
          className={`streak-toggle${windVisible ? ' streak-toggle--active' : ''}`}
          onClick={() => setWindVisible(v => !v)}
        >
          <span>Wind</span>
        </button>
        <button
          className={`ptt-btn${isListening ? ' ptt-btn--active' : ''}`}
          onMouseDown={handlePTTStart} onMouseUp={handlePTTEnd}
          onTouchStart={handlePTTStart} onTouchEnd={handlePTTEnd}
        >
                    {isListening ? 'Listening…' : 'Push to Talk'}
          <span className="ptt-btn__hint">[Space]</span>
        </button>
      </div>
    </div>
  )
}