import type { ScoredRoute } from '../types.js'

export interface NoFlyZone {
  name:     string
  lat:      number
  lon:      number
  radiusNm: number
}

export const NO_FLY_ZONES: NoFlyZone[] = [
  { name: 'Georgian Bay Storm',          lat: 44.4750, lon: -80.3080, radiusNm: 12 },
]

const NM_TO_KM = 1.852
const EARTH_R  = 6371

function distKm(la1: number, lo1: number, la2: number, lo2: number) {
  const dLat = (la2-la1)*Math.PI/180, dLon = (lo2-lo1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function segmentNearPoint(
  lat1: number, lon1: number, lat2: number, lon2: number,
  pLat: number, pLon: number, thresholdKm: number
): boolean {
  // Check several points along the segment
  for (let t = 0; t <= 1; t += 0.1) {
    const lat = lat1 + (lat2 - lat1) * t
    const lon = lon1 + (lon2 - lon1) * t
    if (distKm(lat, lon, pLat, pLon) < thresholdKm) return true
  }
  return false
}

export function checkRouteIntersections(route: ScoredRoute): NoFlyZone[] {
  const hit: NoFlyZone[] = []
  for (const zone of NO_FLY_ZONES) {
    const threshKm = zone.radiusNm * NM_TO_KM
    const wps = route.waypoints
    for (let i = 0; i < wps.length - 1; i++) {
      if (segmentNearPoint(wps[i][0], wps[i][1], wps[i+1][0], wps[i+1][1], zone.lat, zone.lon, threshKm)) {
        hit.push(zone)
        break
      }
    }
  }
  return hit
}
