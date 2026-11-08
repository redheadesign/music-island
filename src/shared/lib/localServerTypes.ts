export interface LocalServer {
  id: string
  pid: number
  processName: string
  host: string
  port: number
  canStop: boolean
}
