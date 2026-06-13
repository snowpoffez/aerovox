import React, { useRef, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import Airports from '../components/Airports.jsx'
import Aircraft from '../components/Aircraft.jsx'
import AircraftInfoCard from '../components/AircraftInfoCard.jsx'
import WindLayer, { WIND_LEVELS } from '../components/WindLayer.jsx'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const DEFAULT_CENTER = [43.677, -79.6305]

export default function App() {
  const [loading, setLoading]             = useState(true)
  const [selectedAirport, setSelectedAirport] = useState(null)
  const [selectedAircraft, setSelectedAircraft] = useState(null)
  const [windVisible, setWindVisible]     = useState(false)
  const livePosRef = useRef(null)

  const handleAirportsLoaded = (airportList) => {
    const cyyz = airportList.find((a) => a.ident === 'CYYZ')
    setSelectedAirport(cyyz ?? airportList[0] ?? null)
    setLoading(false)
  }

  const center = selectedAirport
    ? [selectedAirport.lat, selectedAirport.lon]
    : DEFAULT_CENTER

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute', top: 16, left: '50%',
          transform: 'translateX(-50%)', zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', color: '#fff',
          padding: '8px 16px', borderRadius: 20, fontSize: 13,
          pointerEvents: 'none',
        }}>
          Loading airport data…
        </div>
      )}

      <MapContainer
        center={center} zoom={10} minZoom={4}
        scrollWheelZoom dragging doubleClickZoom touchZoom
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        <Airports
          onLoad={handleAirportsLoaded}
          selectedIdent={selectedAirport?.ident}
          onSelectAirport={(airport) => {
            setSelectedAirport(airport)
            setSelectedAircraft(null)
          }}
        />

        <Aircraft
          selectedCallsign={selectedAircraft?.callsign}
          livePosRef={livePosRef}
          onSelectAircraft={(craft) => {
            setSelectedAircraft(craft)
            setSelectedAirport(null)
          }}
        />

        <WindLayer visible={windVisible} />
      </MapContainer>

      {/* ── wind toggle + legend ──────────────────────────────────── */}
      <div className="wind-controls">
        <button
          className={`wind-toggle${windVisible ? ' wind-toggle--active' : ''}`}
          onClick={() => setWindVisible(v => !v)}
        >
          <span className="wind-toggle__icon">〜</span>
          Wind {windVisible ? 'On' : 'Off'}
        </button>

        {windVisible && (
          <div className="wind-legend">
            <div className="wind-legend__title">Wind Speed</div>
            {WIND_LEVELS.map(({ label, max, rgb }) => (
              <div key={label} className="wind-legend__row">
                <span
                  className="wind-legend__swatch"
                  style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }}
                />
                <span className="wind-legend__label">{label}</span>
                <span className="wind-legend__range">
                  {max === Infinity
                    ? '> 79 km/h'
                    : `< ${Math.round(max * 3.6)} km/h`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AircraftInfoCard
        craft={selectedAircraft}
        livePosRef={livePosRef}
        onClose={() => setSelectedAircraft(null)}
      />
    </div>
  )
}
