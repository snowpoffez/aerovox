import React, { useEffect, useRef, useState } from 'react'
import AnimatedAircraftMarker from './AnimatedAircraftMarker.jsx'

const POLL_INTERVAL_MS = 15000
const CENTER_LAT = 43.6759
const CENTER_LON = -79.6294
const RADIUS_NM  = 350

const buildUrl = () => `/api/adsb/v2/lat/${CENTER_LAT}/lon/${CENTER_LON}/dist/${RADIUS_NM}`

// Conversion utilities
const ftMinToMs = (v) => (v == null ? null : v * 0.00508)
const ftToM     = (ft) => (ft == null ? null : ft * 0.3048)
const mToFt     = (m)  => (m == null ? null : m * 3.28084)
const ktsToMs   = (kts) => (kts == null ? null : kts * 0.51444)
const msToKnotes = (ms) => (ms == null ? null : ms * 1.94384)

const isLargeAircraft = (ac) => {
  const gs  = ac.gs  ?? 0
  const alt = ac.alt_baro ?? 0
  const cat = ac.category ?? ''
  if (cat && !['', 'A0', 'A3', 'A4', 'A5'].includes(cat)) return false
  if (gs < 80 && alt < 1000) return false
  return true
}

const overlayStyle = (bg, fg) => ({
  position: 'fixed', bottom: 24, right: 16, zIndex: 1000,
  background: bg, color: fg, border: `1px solid ${fg}44`,
  padding: '6px 14px', borderRadius: 16, fontSize: 12, pointerEvents: 'none',
})

export default function Aircraft({ 
  selectedCallsign, landingTarget, runwaysMap, livePosRef, 
  onSelectAircraft, onLandingComplete, targetAltitude, targetSpeed, targetHeading, throttleActive,
  diversionRoute, onDiversionComplete,
}) {
  const [aircraft, setAircraft] = useState([])
  const [status, setStatus]     = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const timerRef = useRef(null)

  // Track dynamic simulated overrides for the selected airplane
  const [simAltM, setSimAltM] = useState(null)
  const [simSpeedMs, setSimSpeedMs] = useState(null)

  // Per-aircraft command store — commands persist after deselection
  const activeCommands = useRef({})

  // 1. ADSB Fetch Loop
  useEffect(() => {
    let cancelled = false
    const fetchAircraft = async () => {
      try {
        const res = await fetch(buildUrl())
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return

        const planes = (data.ac ?? []).filter(isLargeAircraft)
        planes.push({
          hex: 'C07ABC', flight: 'ACA973 ',
          lat: 44.5667, lon: -80.9333,
          alt_baro: 1000, alt_geom: 1050,
          gs: 250, track: 100, baro_rate: 0,
          squawk: '6503', r: 'CANADA', category: 'A4',
        })
        setAircraft(planes)
        setStatus('ok')
      } catch (err) {
        if (cancelled) return
        console.error('Aircraft fetch failed:', err)
        setErrorMsg(err.message)
        setStatus('error')
      }
      if (!cancelled) {
        timerRef.current = setTimeout(fetchAircraft, POLL_INTERVAL_MS)
      }
    }
    fetchAircraft()
    return () => { cancelled = true; clearTimeout(timerRef.current) }
  }, [])

  // 2. Initialize tracking overrides if the selected aircraft changes
  useEffect(() => {
    const activeCraft = aircraft.find(ac => (ac.flight ?? '').trim() === selectedCallsign)
    if (activeCraft) {
      setSimAltM(ftToM(activeCraft.alt_baro))
      setSimSpeedMs(ktsToMs(activeCraft.gs))
    }
  }, [selectedCallsign, aircraft])

  // 2b. Store commands per-aircraft so they persist after deselection
  useEffect(() => {
    if (selectedCallsign && targetHeading != null) {
      activeCommands.current[selectedCallsign] = { ...activeCommands.current[selectedCallsign], heading: targetHeading }
    }
  }, [targetHeading])
  useEffect(() => {
    if (selectedCallsign && targetAltitude != null) {
      activeCommands.current[selectedCallsign] = { ...activeCommands.current[selectedCallsign], altitude: targetAltitude }
    }
  }, [targetAltitude])
  useEffect(() => {
    if (selectedCallsign && targetSpeed != null) {
      activeCommands.current[selectedCallsign] = { ...activeCommands.current[selectedCallsign], speed: targetSpeed }
    }
  }, [targetSpeed])
  useEffect(() => {
    if (selectedCallsign && landingTarget != null) {
      activeCommands.current[selectedCallsign] = { ...activeCommands.current[selectedCallsign], landing: landingTarget }
    }
  }, [landingTarget])

  // 3. Telemetry Linear Step Interpolation Engine Loop
  useEffect(() => {
    if (!selectedCallsign) return
    let rafId

    const stepTelemetry = () => {
      let updated = false
      let nextAltM = simAltM
      let nextSpeedMs = simSpeedMs

      // Smoothly step Altitude (Delta shift factor ~45ft per frame tick)
      if (targetAltitude !== null && simAltM !== null) {
        const currentAltFt = mToFt(simAltM)
        const diff = targetAltitude - currentAltFt
        if (Math.abs(diff) > 5) {
          const step = Math.sign(diff) * Math.min(45, Math.abs(diff))
          nextAltM = ftToM(currentAltFt + step)
          updated = true
        }
      }

      // Smoothly step Speed (Delta shift factor ~1.2 knots per frame tick)
      if (targetSpeed !== null && simSpeedMs !== null) {
        const currentSpdKts = msToKnotes(simSpeedMs)
        const diff = targetSpeed - currentSpdKts
        if (Math.abs(diff) > 0.5) {
          const step = Math.sign(diff) * Math.min(1.2, Math.abs(diff))
          nextSpeedMs = ktsToMs(currentSpdKts + step)
          updated = true
        }
      }

      if (updated) {
        setSimAltM(nextAltM)
        setSimSpeedMs(nextSpeedMs)

        // Write directly into live share reference so side panels re-render text layout metrics
        if (livePosRef?.current) {
          livePosRef.current.alt = nextAltM
          livePosRef.current.velocity = nextSpeedMs
          livePosRef.current.phase = 
            targetAltitude !== null && mToFt(nextAltM) < targetAltitude ? 'CLIMBING' :
            targetAltitude !== null && mToFt(nextAltM) > targetAltitude ? 'DESCENDING' : null
        }
      }
      rafId = requestAnimationFrame(stepTelemetry)
    }

    rafId = requestAnimationFrame(stepTelemetry)
    return () => cancelAnimationFrame(rafId)
  }, [targetAltitude, targetSpeed, simAltM, simSpeedMs, selectedCallsign, livePosRef])

  return (
    <>
      {status === 'loading' && <div style={overlayStyle('#1a1a2e', '#7eb8f7')}>✈ Loading aircraft…</div>}
      {status === 'error' && <div style={overlayStyle('#2a1010', '#f77e7e')}>✈ Aircraft unavailable — {errorMsg}</div>}
      {status === 'ok' && aircraft.length === 0 && <div style={overlayStyle('#1a1a2e', '#7eb8f7')}>✈ No aircraft in range</div>}

      {aircraft.map((ac) => {
        const icao24   = ac.hex ?? ''
        const callsign = (ac.flight ?? '').trim() || icao24
        const lat      = ac.lat
        const lon      = ac.lon
        if (lat == null || lon == null) return null

        const isSelected = selectedCallsign === callsign
        const cmd = activeCommands.current[callsign] || {}

        return (
            <AnimatedAircraftMarker
              key={icao24}
              craft={{
                icao24,
                callsign,
                country:  ac.r ?? '—',
                lat,
                lon,
                baroAlt:  ftToM(ac.alt_baro),
                geoAlt:   ftToM(ac.alt_geom),
                velocity: ktsToMs(ac.gs),
                heading:  ac.track,
                vertRate: ftMinToMs(ac.baro_rate),
                squawk:   ac.squawk ?? '—',
              }}
              isSelected={isSelected}
              landingTarget={cmd.landing ?? null}
              targetAltitude={cmd.altitude ?? null}
              targetSpeed={cmd.speed ?? null}
              targetHeading={cmd.heading ?? null}
              throttleActive={throttleActive}
              runwaysMap={runwaysMap}
              livePosRef={isSelected ? livePosRef : null}
              onSelect={onSelectAircraft}
              onLandingComplete={isSelected ? () => { delete activeCommands.current[callsign]?.landing; onLandingComplete?.() } : null}
              diversionRoute={isSelected ? diversionRoute : null}
              onDiversionComplete={isSelected ? onDiversionComplete : null}
            />
        )
      })}
    </>
  )
}