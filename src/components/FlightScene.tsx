import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Globe } from './Globe'

export function FlightScene() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault position={[12, 8, 12]} />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          autoRotate
          autoRotateSpeed={0.5}
          minDistance={7}
          maxDistance={30}
        />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        <directionalLight position={[-10, -5, -10]} intensity={0.3} />
        <Suspense fallback={null}>
          <Globe />
        </Suspense>
      </Canvas>
    </div>
  )
}
