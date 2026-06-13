import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'

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
          if (row.length >= 6) {
            const ident = row[1]?.trim()
            const name = row[3]?.trim()
            const lat = parseFloat(row[4])
            const lon = parseFloat(row[5])

            if (!isNaN(lat) && !isNaN(lon) && ident && name) {
              airportList.push({ ident, name, lat, lon })
            }
          }
        }

        setAirports(airportList)

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

  const cyyzAirport = airports.find(a => a.ident === 'CYYZ')
  const center = cyyzAirport ? [cyyzAirport.lat, cyyzAirport.lon] : [43.677, -79.6305]

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
    <div style={{ width: '100vw', height: '100vh' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px'
        }}>
          Loading airport data...
        </div>
      )}

      <MapContainer center={center} zoom={10} style={{ width: '100%', height: '100%' }}>
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
            fillColor="#00ccff"
            color="#00ccff"
            weight={1}
            opacity={0.8}
            fillOpacity={0.6}
          >
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>{airport.ident}</strong>
                <br />
                {airport.name}
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
      </MapContainer>
    </div>
  )
}