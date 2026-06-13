import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

export default function AircraftMarker({
  position,
  heading = 0,
  callSign = '',
  altitude,
  speed,
  color = '#00ccff',
  size = 28,
}) {
  if (!position) return null

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="0.4">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>`

  const icon = L.divIcon({
    className: 'aircraft-marker',
    html: `<div class="aircraft-marker__rotator" style="transform:rotate(${heading}deg)">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })

  return (
    <Marker position={position} icon={icon}>
      {(callSign || altitude != null || speed != null || heading != null) && (
        <Popup>
          <div style={{ minWidth: 120, fontSize: 12, lineHeight: '1.6' }}>
            {callSign && <div><strong>{callSign}</strong></div>}
            {altitude != null && <div>ALT {Math.round(altitude).toLocaleString()} ft</div>}
            {speed != null && <div>SPD {Math.round(speed)} kn</div>}
            {heading != null && <div>HDG {Math.round(heading)}°</div>}
          </div>
        </Popup>
      )}
    </Marker>
  )
}
