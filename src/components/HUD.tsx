export function HUD() {
  return (
    <div style={styles.container}>
      <div style={styles.title}>VoxFly</div>
      <div style={styles.hint}>Scroll to zoom &middot; Drag to rotate</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 16,
    left: 16,
    color: '#c0d0ff',
    fontFamily: 'monospace',
    fontSize: 13,
    userSelect: 'none',
    pointerEvents: 'none',
    zIndex: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    opacity: 0.4,
  },
}
