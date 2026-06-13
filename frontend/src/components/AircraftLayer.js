import * as THREE from 'three'
import { lngLatToMercator } from '../utils/mercator'

export function createAircraftLayer(initial = {}) {
  const state = {
    lng: initial.longitude ?? -79.63,
    lat: initial.latitude ?? 43.68,
    headingRad: ((initial.heading ?? 0) * Math.PI) / 180,
    turbulenceActive: !!initial.turbulence,
    turbIntensity: 1,
  }

  const layer = {
    id: 'aircraft-arrow',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      this.map = map
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      this.renderer.autoClear = false

      this.scene = new THREE.Scene()
      this.camera = new THREE.Camera()

      const bodyMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee })
      const accentMat = new THREE.MeshBasicMaterial({ color: 0x3366ff })
      const darkMat = new THREE.MeshBasicMaterial({ color: 0x555555 })
      const noseMat = new THREE.MeshBasicMaterial({ color: 0x777777 })

      this.material = bodyMat
      this._accentMat = accentMat
      this._noseMat = noseMat

      const group = new THREE.Group()

      // Fuselage
      const fuseGeom = new THREE.CylinderGeometry(0.000035, 0.00005, 0.0002, 8)
      fuseGeom.rotateZ(-Math.PI / 2)
      group.add(new THREE.Mesh(fuseGeom, bodyMat))

      // Nose cone
      const noseGeom = new THREE.ConeGeometry(0.00005, 0.00005, 8)
      noseGeom.rotateZ(-Math.PI / 2)
      const noseMesh = new THREE.Mesh(noseGeom, noseMat)
      noseMesh.position.x = 0.000125
      group.add(noseMesh)

      // Main wings
      const wingGeom = new THREE.BoxGeometry(0.00006, 0.00018, 0.000008)
      group.add(new THREE.Mesh(wingGeom, bodyMat))

      // Wing tips (colored)
      const tipGeom = new THREE.BoxGeometry(0.000015, 0.000035, 0.00001)
      const tipL = new THREE.Mesh(tipGeom, accentMat)
      tipL.position.set(0, 0.00009, 0)
      const tipR = new THREE.Mesh(tipGeom, accentMat)
      tipR.position.set(0, -0.00009, 0)
      group.add(tipL, tipR)

      // Tail vertical stabilizer
      const tailVGeom = new THREE.BoxGeometry(0.00004, 0.000005, 0.00006)
      const tailVMesh = new THREE.Mesh(tailVGeom, darkMat)
      tailVMesh.position.set(-0.000105, 0, 0.00004)
      group.add(tailVMesh)

      // Tail horizontal stabilizers
      const tailHGeom = new THREE.BoxGeometry(0.000025, 0.00006, 0.000005)
      const tailHL = new THREE.Mesh(tailHGeom, darkMat)
      tailHL.position.set(-0.000105, 0.000035, 0)
      const tailHR = new THREE.Mesh(tailHGeom, darkMat)
      tailHR.position.set(-0.000105, -0.000035, 0)
      group.add(tailHL, tailHR)

      this.arrow = group
      this.scene.add(this.arrow)
    },

    render(gl, matrix) {
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix)

      const merc = lngLatToMercator(state.lng, state.lat, 0)
      this.arrow.position.set(merc.x, merc.y, merc.z)
      this.arrow.rotation.z = -state.headingRad

      if (state.turbulenceActive) {
        this.arrow.position.x += (Math.random() - 0.5) * 0.000004 * state.turbIntensity
        this.arrow.position.y += (Math.random() - 0.5) * 0.000004 * state.turbIntensity
      }

      const isTurb = state.turbulenceActive
      this.material.color.setHex(isTurb ? 0xff4422 : 0xeeeeee)
      this._accentMat.color.setHex(isTurb ? 0xff8844 : 0x3366ff)
      this._noseMat.color.setHex(isTurb ? 0xcc3333 : 0x777777)

      this.renderer.resetState()
      this.renderer.render(this.scene, this.camera)
      this.map.triggerRepaint()
    },
  }

  function update(next = {}) {
    if (next.longitude != null) state.lng = next.longitude
    if (next.latitude != null) state.lat = next.latitude
    if (next.heading != null) state.headingRad = (next.heading * Math.PI) / 180
    if (next.turbulence != null) state.turbulenceActive = next.turbulence
  }

  return { layer, update }
}
