import { RobotCard } from './features/fleet/components/robot-card'
import { sampleData } from './features/fleet/sample-data'

function App() {
  return (
    <>
      <h1 className="text-live font-mono">Hexapod Mission Control</h1>
      <RobotCard robot={sampleData[0]} />
    </>
  )
}

export default App
