import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

// ── grid covering Ontario + surroundings ────────────────────────────
const ROWS = 6, COLS = 7
const LAT_MIN = 40.5, LAT_MAX = 47.0
const LON_MIN = -86.5, LON_MAX = -72.5

const LATS = Array.from({ length: ROWS }, (_, i) =>
  LAT_MIN + (i / (ROWS - 1)) * (LAT_MAX - LAT_MIN))
const LONS = Array.from({ length: COLS }, (_, i) =>
  LON_MIN + (i / (COLS - 1)) * (LON_MAX - LON_MIN))
const GRID_PTS = LATS.flatMap(lat => LONS.map(lon => ({ lat, lon })))  // 42 pts

const N_PARTICLES = 700
const MAX_AGE     = 160
const SPEED_SCALE = 0.00038   // m/s → degrees per frame

// ── wind-speed → RGB ────────────────────────────────────────────────
// Thresholds in m/s:  8 = ~29 km/h,  15 = ~54 km/h,  22 = ~79 km/h
export const WIND_LEVELS = [
  { label: 'Calm',       max: 8,   rgb: [70,  210, 255] },
  { label: 'Moderate',   max: 15,  rgb: [90,  255, 140] },
  { label: 'Strong',     max: 22,  rgb: [255, 175,  30] },
  { label: 'Dangerous',  max: Infinity, rgb: [255, 55, 55] },
]

const speedRGB = (s) => {
  for (const lvl of WIND_LEVELS) if (s < lvl.max) return lvl.rgb
  return WIND_LEVELS[WIND_LEVELS.length - 1].rgb
}

// ── helpers ─────────────────────────────────────────────────────────
const dirToUV = (spd, dir) => {
  const r = (dir * Math.PI) / 180
  // meteorological: dir = FROM; u = eastward, v = northward
  return { u: -Math.sin(r) * spd, v: -Math.cos(r) * spd }
}

const bilerp = (grid, lat, lon) => {
  const tr = ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (ROWS - 1)
  const tc = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (COLS - 1)
  const r0 = Math.max(0, Math.min(ROWS - 2, Math.floor(tr)))
  const c0 = Math.max(0, Math.min(COLS - 2, Math.floor(tc)))
  const ft = tr - r0, fc = tc - c0
  const w  = (r, c) => grid[r * COLS + c] ?? { u: 0, v: 0, speed: 0 }
  const [a, b, c, d] = [w(r0, c0), w(r0, c0+1), w(r0+1, c0), w(r0+1, c0+1)]
  const mix = (p, q, t) => p + (q - p) * t
  const u   = mix(mix(a.u, b.u, fc), mix(c.u, d.u, fc), ft)
  const v   = mix(mix(a.v, b.v, fc), mix(c.v, d.v, fc), ft)
  return { u, v, speed: Math.sqrt(u * u + v * v) }
}

const rand  = (lo, hi) => Math.random() * (hi - lo) + lo
const mkPtc = ()       => ({
  lat: rand(LAT_MIN, LAT_MAX),
  lon: rand(LON_MIN, LON_MAX),
  age: Math.floor(Math.random() * MAX_AGE),
})

// ── component ────────────────────────────────────────────────────────
export default function WindLayer({ visible }) {
  const map     = useMap()
  const windRef = useRef(null)   // flat array [ROWS*COLS] of {u,v,speed}
  const visRef  = useRef(visible)
  useEffect(() => { visRef.current = visible }, [visible])

  // ── fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const latStr = GRID_PTS.map(p => p.lat).join(',')
      const lonStr = GRID_PTS.map(p => p.lon).join(',')
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${latStr}&longitude=${lonStr}` +
          `&current=wind_speed_10m,wind_direction_10m` +
          `&wind_speed_unit=ms&timezone=UTC`
        )
        const data = await res.json()
        const arr  = Array.isArray(data) ? data : [data]
        windRef.current = arr.map(d => {
          const spd = d.current?.wind_speed_10m     ?? 0
          const dir = d.current?.wind_direction_10m ?? 0
          return { ...dirToUV(spd, dir), speed: spd }
        })
      } catch (e) {
        console.error('Wind fetch:', e)
      }
    }
    load()
    const id = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── canvas + rAF ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const container = map.getContainer()
    const canvas    = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450;'
    container.appendChild(canvas)

    const resize = () => {
      canvas.width  = container.clientWidth
      canvas.height = container.clientHeight
    }
    resize()

    const particles = Array.from({ length: N_PARTICLES }, mkPtc)
    const ctx       = canvas.getContext('2d')
    let frameId
    let opacity = 0   // animated canvas opacity for smooth toggle

    const tick = () => {
      // ── smooth fade in/out ───────────────────────────────────────
      const target = visRef.current ? 1 : 0
      opacity += (target - opacity) * 0.055
      canvas.style.opacity = opacity.toFixed(3)

      if (opacity < 0.01) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        frameId = requestAnimationFrame(tick)
        return
      }

      // ── trail: erase existing pixels gradually ───────────────────
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,0.055)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'

      const grid = windRef.current
      if (!grid) { frameId = requestAnimationFrame(tick); return }

      for (const p of particles) {
        p.age++

        if (p.age > MAX_AGE) {
          Object.assign(p, mkPtc())
          continue
        }

        const { u, v, speed } = bilerp(grid, p.lat, p.lon)
        const pLat = p.lat, pLon = p.lon

        const cosLat = Math.cos(p.lat * Math.PI / 180)
        p.lat += v * SPEED_SCALE
        p.lon += (u * SPEED_SCALE) / cosLat

        if (p.lat < LAT_MIN || p.lat > LAT_MAX || p.lon < LON_MIN || p.lon > LON_MAX) {
          Object.assign(p, mkPtc())
          continue
        }

        const from = map.latLngToContainerPoint([pLat, pLon])
        const to   = map.latLngToContainerPoint([p.lat, p.lon])

        // Fade in at birth, fade out near end of life
        const fadeIn  = Math.min(1, p.age / 22)
        const fadeOut = 1 - Math.max(0, (p.age / MAX_AGE - 0.68) / 0.32)
        const a       = fadeIn * fadeOut * 0.88

        const [r, g, b] = speedRGB(speed)

        ctx.beginPath()
        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`
        ctx.lineWidth   = speed > 22 ? 2.2 : speed > 15 ? 1.8 : 1.4
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    map.on('resize', resize)

    return () => {
      cancelAnimationFrame(frameId)
      map.off('resize', resize)
      canvas.parentNode?.removeChild(canvas)
    }
  }, [map])

  return null
}
