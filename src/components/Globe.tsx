import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { BackSide, MeshStandardMaterial, Group } from 'three'

export function Globe() {
  const groupRef = useRef<Group>(null)
  const glowRef = useRef<MeshStandardMaterial>(null)

  const [colorMap, bumpMap] = useTexture([
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
  ])

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.05
    }
    if (glowRef.current) {
      glowRef.current.opacity = 0.12 + 0.04 * Math.sin(clock.elapsedTime * 0.2)
    }
  })

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[5, 64, 64]} />
        <meshStandardMaterial
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={0.04}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[5.15, 32, 32]} />
        <meshStandardMaterial
          ref={glowRef}
          color="#4488ff"
          transparent
          opacity={0.12}
          side={BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
