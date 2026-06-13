import React, { useEffect, useRef, useState } from 'react'

const M_TO_FT    = 3.28084
const MS_TO_KMH  = 3.6
const MS_TO_KNOTS = 1.94384

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                  'S','SSW','SW','WSW','W','WNW','NW','NNW']

const compassPoint = (deg) => COMPASS[Math.round((deg % 360) / 22.5) % 16]

const fmtAlt   = (m)   => m == null ? '—' : `${Math.round(m).toLocaleString()} m · ${Math.round(m * M_TO_FT).toLocaleString()} ft`
const fmtSpeed = (ms)  => ms == null ? '—' : `${Math.round(ms * MS_TO_KMH)} km/h · ${Math.round(ms * MS_TO_KNOTS)} kt`
const fmtHead  = (deg) => deg == null ? '—' : `${Math.round(deg)}° ${compassPoint(deg)}`
const fmtCoord = (v, pos, neg) => v == null ? '—' : `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`
const fmtVert  = (r)   => {
  if (r == null) return '—'
  if (Math.abs(r) < 0.3) return 'Level'
  return `${r > 0 ? '↑ Climbing' : '↓ Descending'} ${Math.abs(Math.round(r))} m/s`
}

const Row = ({ label, value }) => (
  <div className="aircraft-card__row">
    <span className="aircraft-card__label">{label}</span>
    <span className="aircraft-card__value">{value}</span>
  </div>
)

export default function AircraftInfoCard({ craft, livePosRef, onClose }) {
  if (!craft) return null

  // Live lat/lon from the marker's dead-reckoning loop
  const [livePos, setLivePos] = useState({ lat: craft.lat, lon: craft.lon })

  useEffect(() => {
    // Reset to the clicked position when a new plane is selected
    setLivePos({ lat: craft.lat, lon: craft.lon })

    let frameId
    const tick = () => {
      if (livePosRef?.current) {
        const p = livePosRef.current
        setLivePos(prev =>
          prev.lat === p.lat && prev.lon === p.lon ? prev : { lat: p.lat, lon: p.lon }
        )
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [craft.icao24]) // restart when a different plane is selected

  const { icao24, callsign, country, baroAlt, geoAlt, velocity, heading, vertRate, squawk } = craft

  return (
    <div className="aircraft-card">
      <button className="aircraft-card__close" onClick={onClose} aria-label="Close">×</button>

      <div className="aircraft-card__header">
        <span className="aircraft-card__plane" style={{ display: 'inline-block', transform: `rotate(${heading ?? 0}deg)` }}>✈</span>
        <div>
          <div className="aircraft-card__title">{callsign}</div>
          <div className="aircraft-card__subtitle">{icao24?.toUpperCase()}</div>
        </div>
      </div>

      <div className="aircraft-card__section">
        <Row label="Speed"      value={fmtSpeed(velocity)} />
        <Row label="Bearing"    value={fmtHead(heading)} />
        <Row label="Vert. rate" value={fmtVert(vertRate)} />
      </div>

      <div className="aircraft-card__section">
        <Row label="Latitude"   value={fmtCoord(livePos.lat, 'N', 'S')} />
        <Row label="Longitude"  value={fmtCoord(livePos.lon, 'E', 'W')} />
        <Row label="Alt (baro)" value={fmtAlt(baroAlt)} />
        <Row label="Alt (geo)"  value={fmtAlt(geoAlt)} />
      </div>

      <div className="aircraft-card__section">
        <Row label="Origin" value={country || '—'} />
        <Row label="Squawk" value={squawk  || '—'} />
      </div>
    </div>
  )
}
