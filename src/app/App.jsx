import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import AircraftMarker from '../components/AircraftMarker'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export default function App() {
  const [airports, setAirports] = useState([])
  const [cyyzRunways, setCyyzRunways] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAirport, setSelectedAirport] = useState(null)

  const parseCSVLine = (line) => {
    const result = []
    let current = ''
    let insideQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          current += '"'
          i++
        } else {
          insideQuotes = !insideQuotes
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }

    result.push(current)
    return result
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const airportResponse = await fetch('/data/airports.csv')
        const airportText = await airportResponse.text()
        const airportLines = airportText.split('\n')
        const airportList = []

        for (let i = 1; i < airportLines.length; i++) {
          if (airportLines[i].trim() === '') continue

          const row = parseCSVLine(airportLines[i])
          if (row.length >= 12) {
            const ident = row[1]?.trim()
            const name = row[3]?.trim()
            const type = row[2]?.trim()
            const lat = parseFloat(row[4])
            const lon = parseFloat(row[5])
            const country = row[8]?.trim()
            const region = row[9]?.trim()
            const scheduledService = row[11]?.trim()
            const isLargeAirport = type === 'large_airport'
            const isOntarioServiceAirport = country === 'CA' && region === 'CA-ON' && scheduledService === 'yes'

            if (!isNaN(lat) && !isNaN(lon) && ident && name && (isLargeAirport || isOntarioServiceAirport)) {
              airportList.push({ ident, name, lat, lon })
            }
          }
        }

        setAirports(airportList)
        setSelectedAirport(airportList.find((airport) => airport.ident === 'CYYZ') ?? airportList[0] ?? null)

        const runwayResponse = await fetch('/data/runways.csv')
        const runwayText = await runwayResponse.text()
        const runwayLines = runwayText.split('\n')
        const runways = []

        for (let i = 1; i < runwayLines.length; i++) {
          if (runwayLines[i].trim() === '') continue

          const row = parseCSVLine(runwayLines[i])
          const airportIdent = row[2]?.trim()

          if (airportIdent === 'CYYZ' && row.length >= 20) {
            runways.push({
              airport_ident: airportIdent,
              length_ft: row[3]?.trim() || '',
              width_ft: row[4]?.trim() || '',
              surface: row[5]?.trim() || '',
              le_ident: row[8]?.trim() || '',
              le_latitude_deg: parseFloat(row[9]) || 0,
              le_longitude_deg: parseFloat(row[10]) || 0,
              he_ident: row[14]?.trim() || '',
              he_latitude_deg: parseFloat(row[15]) || 0,
              he_longitude_deg: parseFloat(row[16]) || 0,
              le_heading_degT: parseFloat(row[12]) || 0
            })
          }
        }

        setCyyzRunways(runways)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const cyyzAirport = airports.find((airport) => airport.ident === 'CYYZ')
  const activeAirport = selectedAirport ?? cyyzAirport ?? airports[0] ?? null
  const center = activeAirport ? [activeAirport.lat, activeAirport.lon] : [43.677, -79.6305]

  const visibleAirports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    const filtered = query
      ? airports.filter((airport) => {
          return (
            airport.ident.toLowerCase().includes(query) ||
            airport.name.toLowerCase().includes(query) ||
            (airport.municipality ?? '').toLowerCase().includes(query)
          )
        })
      : airports

    return filtered.slice(0, 250)
  }, [airports, searchTerm])

  const runwayLines = () => {
    if (!cyyzAirport || cyyzRunways.length === 0) return null

    return cyyzRunways.map((runway, idx) => {
      let startLat = runway.le_latitude_deg
      let startLon = runway.le_longitude_deg
      let endLat = runway.he_latitude_deg
      let endLon = runway.he_longitude_deg

      if (!startLat || !startLon) {
        startLat = cyyzAirport.lat
        startLon = cyyzAirport.lon
      }
      if (!endLat || !endLon) {
        endLat = cyyzAirport.lat
        endLon = cyyzAirport.lon
      }

      return (
        <Polyline
          key={`runway-${idx}`}
          positions={[[startLat, startLon], [endLat, endLon]]}
          color="#00ff00"
          weight={4}
          opacity={0.8}
        >
          <Popup>
            <div style={{ fontSize: '12px' }}>
              Runway {runway.le_ident}/{runway.he_ident}<br />
              Length: {runway.length_ft} ft<br />
              Width: {runway.width_ft} ft<br />
              Surface: {runway.surface}
            </div>
          </Popup>
        </Polyline>
      )
    })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__header">
          <p className="sidebar__eyebrow">AeroVox</p>
          <h1>Airport map</h1>
          <p className="sidebar__description">
            Airports are loaded from <strong>public/data/airports.csv</strong> and rendered on the map and in the list below.
          </p>
        </div>

        <div className="sidebar__summary">
          <div>
            <span className="sidebar__label">Loaded</span>
            <strong>{airports.length.toLocaleString()}</strong>
          </div>
          <div>
            <span className="sidebar__label">Visible</span>
            <strong>{visibleAirports.length.toLocaleString()}</strong>
          </div>
        </div>

        <label className="sidebar__search">
          <span>Search airports</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by code, name, or city"
          />
        </label>

        {activeAirport && (
          <div className="sidebar__active-card">
            <span className="sidebar__label">Selected airport</span>
            <h2>{activeAirport.ident}</h2>
            <p>{activeAirport.name}</p>
            <p>
              {activeAirport.municipality || 'Unknown city'} · {activeAirport.lat.toFixed(4)}, {activeAirport.lon.toFixed(4)}
            </p>
          </div>
        )}

        <div className="airport-list" aria-label="Airport list">
          {visibleAirports.map((airport) => {
            const isSelected = activeAirport?.ident === airport.ident

            return (
              <button
                key={`${airport.ident}-${airport.lat}-${airport.lon}`}
                type="button"
                className={`airport-list__item ${isSelected ? 'airport-list__item--selected' : ''}`}
                onClick={() => setSelectedAirport(airport)}
              >
                <strong>{airport.ident}</strong>
                <span>{airport.name}</span>
                <small>
                  {airport.municipality || 'Unknown city'} · {airport.lat.toFixed(2)}, {airport.lon.toFixed(2)}
                </small>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="map-panel">
        {loading && <div className="loading-pill">Loading airport data...</div>}

        <MapContainer
          center={center}
          zoom={10}
          scrollWheelZoom
          dragging
          doubleClickZoom
          touchZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            maxZoom={19}
          />

          {airports.map((airport, idx) => (
            <CircleMarker
              key={`airport-${idx}`}
              center={[airport.lat, airport.lon]}
              radius={5}
              fillColor={activeAirport?.ident === airport.ident ? '#ff7a18' : '#00ccff'}
              color={activeAirport?.ident === airport.ident ? '#ff7a18' : '#00ccff'}
              weight={1}
              opacity={0.85}
              fillOpacity={0.65}
              eventHandlers={{
                click: () => setSelectedAirport(airport),
              }}
            >
              <Popup>
                <div style={{ fontSize: '12px' }}>
                  <strong>{airport.ident}</strong>
                  <br />
                  {airport.name}
                  <br />
                  {airport.municipality || 'Unknown city'}
                  <br />
                  Lat: {airport.lat.toFixed(4)}, Lon: {airport.lon.toFixed(4)}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {cyyzAirport && (
            <>
              <CircleMarker
                center={[cyyzAirport.lat, cyyzAirport.lon]}
                radius={8}
                fillColor="#ff6600"
                color="#ff6600"
                weight={2}
                opacity={1}
                fillOpacity={0.8}
                eventHandlers={{
                  click: () => setSelectedAirport(cyyzAirport),
                }}
              >
                <Popup>
                  <div style={{ fontSize: '12px' }}>
                    <strong>{cyyzAirport.ident}</strong>
                    <br />
                    {cyyzAirport.name}
                    <br />
                    Runways: {cyyzRunways.length}
                  </div>
                </Popup>
              </CircleMarker>
              {runwayLines()}
            </>
          )}

          <AircraftMarker
            position={[43.68, -79.42]}
            heading={270}
            altitude={35000}
            speed={475}
            callSign="ACA104"
            color="#00ccff"
          />
        </MapContainer>
      </main>
    </div>
  )
}