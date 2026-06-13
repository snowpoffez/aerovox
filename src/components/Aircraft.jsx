import React, { useEffect, useRef, useState } from 'react'
import AnimatedAircraftMarker from './AnimatedAircraftMarker.jsx'

const POLL_INTERVAL_MS = 15000
const CENTER_LAT = 43.6759
const CENTER_LON = -79.6294
const RADIUS_NM  = 250   // nautical miles

// ADSB.lol free API — no auth, no hard rate limit
const buildUrl = () =>
  `/api/adsb/v2/lat/${CENTER_LAT}/lon/${CENTER_LON}/dist/${RADIUS_NM}`

// ft/min → m/s
const ftMinToMs = (v) => (v == null ? null : v * 0.00508)
// feet → metres
const ftToM = (ft) => (ft == null ? null : ft * 0.3048)
// knots → m/s
const ktsToMs = (kts) => (kts == null ? null : kts * 0.51444)

// Keep only plausible airliners / large aircraft
const isLargeAircraft = (ac) => {
  const gs  = ac.gs  ?? 0
  const alt = ac.alt_baro ?? 0
  // category A3-A5 = large/heavy/high-performance; allow A0 (unknown) too
  const cat = ac.category ?? ''
  if (cat && !['', 'A0', 'A3', 'A4', 'A5'].includes(cat)) return false
  // Must be moving and not on the ground
  if (gs < 80 && alt < 1000) return false
  return true
}

const overlayStyle = (bg, fg) => ({
  position: 'fixed',
  bottom: 24,
  right: 16,
  zIndex: 1000,
  background: bg,
  color: fg,
  border: `1px solid ${fg}44`,
  padding: '6px 14px',
  borderRadius: 16,
  fontSize: 12,
  pointerEvents: 'none',
})

export default function Aircraft({ selectedCallsign, livePosRef, onSelectAircraft }) {
  const [aircraft, setAircraft] = useState([])
  const [status, setStatus]     = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const fetchAircraft = async () => {
      try {
        const res = await fetch(buildUrl())
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return

        const planes = (data.ac ?? []).filter(isLargeAircraft)
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
    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <>
      {status === 'loading' && (
        <div style={overlayStyle('#1a1a2e', '#7eb8f7')}>✈ Loading aircraft…</div>
      )}
      {status === 'error' && (
        <div style={overlayStyle('#2a1010', '#f77e7e')}>✈ Aircraft unavailable — {errorMsg}</div>
      )}
      {status === 'ok' && aircraft.length === 0 && (
        <div style={overlayStyle('#1a1a2e', '#7eb8f7')}>✈ No aircraft in range</div>
      )}

      {aircraft.map((ac) => {
        const icao24   = ac.hex ?? ''
        const callsign = (ac.flight ?? '').trim() || icao24
        const lat      = ac.lat
        const lon      = ac.lon
        if (lat == null || lon == null) return null

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
            isSelected={selectedCallsign === callsign}
            livePosRef={selectedCallsign === callsign ? livePosRef : null}
            onSelect={onSelectAircraft}
          />
        )
      })}
    </>
  )
}
