import {startHeartbeat} from './heartbeat.ts'
const monitor=startHeartbeat('data')
monitor.ready()
setInterval(()=>{},60000)
