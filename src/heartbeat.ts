import {mkdirSync, renameSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// The Windows console can read this small snapshot without opening jobs.db.
export function startHeartbeat(directory: string, scanStatus:()=>object = ()=>({})) {
  mkdirSync(directory, {recursive: true})
  const target = join(directory, 'worker.json')
  const temporary = target + '.' + process.pid + '.tmp'
  const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString()
  let phase = 'starting'
  function publish() {
    try {
      const snapshot = {pid: process.pid, startedAt, updatedAt: new Date().toISOString(), phase, scan:scanStatus()}
      writeFileSync(temporary, JSON.stringify(snapshot))
      renameSync(temporary, target)
    } catch {
      console.error('Gagal menulis status worker')
    }
  }
  publish()
  const interval = setInterval(publish, 5000)
  interval.unref()
  return {
    ready() { phase = 'ready'; publish() },
    stop() { clearInterval(interval); phase = 'stopped'; publish() }
  }
}
