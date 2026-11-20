export type RobotStatus =
  'idle' | 'on-mission' | 'holding' | 'returning' | 'charging' | 'fault' | 'offline'
export type Tone = 'idle' | 'live' | 'caution' | 'ok' | 'danger'

export type RobotModel = 'HX-6 Heavy' | 'HX-6 Scout'
export type Gait = 'tripod' | 'wave' | 'ripple'
export interface LatLng {
  lat: number
  lng: number
}

export type Robot = {
  status: RobotStatus
  battery: number
  position: LatLng
  heading: number // 0-360, 0 = North
  speed: number
  gait: Gait
  firmware: string
  maxPayloadKg: number
  payloadKg: number
  missionId: string | null
  faultReason: string | null
  notes: string
  lastSeen: number
  id: string
  callsign: string
  serial: string
  model: RobotModel
  home: LatLng
}
