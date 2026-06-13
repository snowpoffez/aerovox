import React, { useEffect, useRef } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'

const EARTH_RADIUS_M = 6371000
const CORRECTION_MS  = 1500

// Build the icon ONCE per marker (or when isSelected changes).
// Rotation and color are updated by directly mutating the SVG element's style —
// never via setIcon — so the DOM node stays stable and click events always fire.
const makePlaneIcon = (isSelected) => {
  const color  = isSelected ? '#ff7a18' : '#e0f0ff'
  const shadow = isSelected
    ? 'drop-shadow(0 0 6px #ff7a18)'
    : 'drop-shadow(0 0 2px rgba(0,180,255,0.6))'

  const svg = `<svg id="plane-svg" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
    style="transform:rotate(0deg);filter:${shadow};transition:filter 0.2s;">
    <path fill="${color}" d="M12,2A1.5,1.5,0,0,0,10.5,3.5V8.5L2,14v2l8.5-2.5V19L8,21v1l4-1,4,1V21l-2.5-2V13.5L22,16V14L13.5,8.5V3.5A1.5,1.5,0,0,0,12,2Z"/>
  </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
  })
}

const movePosition = (lat, lon, headingDeg, distanceM) => {
  const latRad     = (lat * Math.PI) / 180
  const lonRad     = (lon * Math.PI) / 180
  const bearingRad = (headingDeg * Math.PI) / 180
  const angDist    = distanceM / EARTH_RADIUS_M
  const newLatRad  = Math.asin(
    Math.sin(latRad) * Math.cos(angDist) +
    Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearingRad)
  )
  const newLonRad = lonRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angDist) * Math.cos(latRad),
    Math.cos(angDist) - Math.sin(latRad) * Math.sin(newLatRad)
  )
  return { lat: (newLatRad * 180) / Math.PI, lon: (newLonRad * 180) / Math.PI }
}

const lerp      = (a, b, t) => a + (b - a) * t
const easeOut   = (t) => 1 - (1 - t) ** 2
const distM     = (lat1, lon1, lat2, lon2) =>
  Math.hypot(
    (lat2 - lat1) * 111320,
    (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180)
  )
const lerpAngle = (from, to, t) => {
  if (from == null) return to ?? 0
  if (to == null)   return from
  const diff = ((to - from + 540) % 360) - 180
  return from + diff * t
}

const extrapolate = (state, now) => {
  const elapsed = Math.max(0, (now - state.updatedAt) / 1000)
  if (!state.velocity || !state.heading || elapsed === 0)
    return { lat: state.lat, lon: state.lon }
  return movePosition(state.lat, state.lon, state.heading, state.velocity * elapsed)
}

const getDisplayPosition = (state, now) => {
  if (!state.correcting) return extrapolate(state, now)
  const t     = Math.min(1, (now - state.corrStart) / CORRECTION_MS)
  const eased = easeOut(t)
  const pos   = {
    lat: lerp(state.corrFrom.lat, state.corrTo.lat, eased),
    lon: lerp(state.corrFrom.lon, state.corrTo.lon, eased),
  }
  if (t >= 1) {
    state.correcting = false
    state.lat        = state.corrTo.lat
    state.lon        = state.corrTo.lon
    state.updatedAt  = now
  }
  return pos
}

export default function AnimatedAircraftMarker({ craft, isSelected, livePosRef, onSelect }) {
  const markerRef   = useRef(null)
  const onSelectRef = useRef(onSelect)
  const craftRef    = useRef(craft)

  // Always-current refs so the stable click handler reads fresh data
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { craftRef.current    = craft    }, [craft])

  // Created once — never recreated, so Leaflet never re-binds events
  const handleClick = useRef(() => onSelectRef.current?.(craftRef.current)).current

  const stateRef = useRef({
    lat:          craft.lat,
    lon:          craft.lon,
    heading:      craft.heading,
    velocity:     craft.velocity,
    displayHeading: craft.heading ?? 0,
    updatedAt:    Date.now(),
    correcting:   false,
    corrFrom:     { lat: craft.lat, lon: craft.lon },
    corrTo:       { lat: craft.lat, lon: craft.lon },
    corrStart:    0,
  })

  // Update dead-reckoning state when new telemetry arrives
  useEffect(() => {
    const state = stateRef.current
    const now   = Date.now()
    const cur   = getDisplayPosition(state, now)
    const d     = distM(cur.lat, cur.lon, craft.lat, craft.lon)
    if (d > 15) {
      state.correcting = true
      state.corrFrom   = cur
      state.corrTo     = { lat: craft.lat, lon: craft.lon }
      state.corrStart  = now
    } else {
      state.correcting = false
      state.lat        = craft.lat
      state.lon        = craft.lon
      state.updatedAt  = now
    }
    state.heading  = craft.heading
    state.velocity = craft.velocity
  }, [craft.lat, craft.lon, craft.heading, craft.velocity])

  const livePosRefRef = useRef(livePosRef)
  useEffect(() => { livePosRefRef.current = livePosRef }, [livePosRef])

  // rAF loop: update position + rotation WITHOUT replacing the icon DOM node
  useEffect(() => {
    let frameId
    const tick = () => {
      const marker = markerRef.current
      if (marker) {
        const state   = stateRef.current
        const now     = Date.now()
        const pos     = getDisplayPosition(state, now)
        const heading = lerpAngle(state.displayHeading, state.heading ?? state.displayHeading, 0.08)
        state.displayHeading = heading

        marker.setLatLng([pos.lat, pos.lon])

        // Push live dead-reckoned position to card if this plane is selected
        if (livePosRefRef.current) {
          livePosRefRef.current.current = pos
        }

        // Rotate by mutating the existing SVG element — no setIcon call
        const el = marker.getElement()
        if (el) {
          const svg = el.querySelector('svg')
          if (svg) svg.style.transform = `rotate(${heading}deg)`
        }
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, []) // run once — heading/position come from stateRef

  // Rebuild icon only when selection state changes (color swap)
  useEffect(() => {
    const marker = markerRef.current
    if (marker) marker.setIcon(makePlaneIcon(isSelected))
  }, [isSelected])

  return (
    <Marker
      ref={markerRef}
      position={[craft.lat, craft.lon]}
      icon={makePlaneIcon(isSelected)}
      zIndexOffset={isSelected ? 1000 : 0}
      eventHandlers={{ click: handleClick }}
    />
  )
}
