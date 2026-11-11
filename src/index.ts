import {mkdirSync} from 'node:fs'
import {rmSync,writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import cron from 'node-cron'
import {Store} from './db/sqlite.ts'
import {Scanner,sources} from './scrapers/index.ts'
import {commands,deliver,setup} from './bot/bot.ts'
import type {Group} from './scrapers/feeds.ts'
import {startHeartbeat} from './heartbeat.ts'
import {IntervalClock} from './interval.ts'
const env=process.env
const token=env.TELEGRAM_BOT_TOKEN, chat=env.TELEGRAM_CHAT_ID
if(!token || (chat && !/^\d+$/.test(chat)))throw Error('Token wajib diisi. Chat ID opsional harus berupa angka.')
mkdirSync('data',{recursive:true})
const store=new Store(new DatabaseSync('data/jobs.db'),(env.DEFAULT_LOCAL_CITIES||'ambon,maluku').split(',').map(c=>c.trim()).filter(Boolean))
const scanner=new Scanner(store,sources)
const ownerKey='telegram_owner_'+token.split(':')[0]
if(chat)store.set(ownerKey,chat)
const owner=()=>store.get(ownerKey)
const pairingFile='data/pairing.txt'
rmSync(pairingFile,{force:true})
const code=owner()?undefined:randomBytes(16).toString('hex')
if(code){
  writeFileSync(pairingFile,'/start '+code,{mode:0o600})
  console.log('Hubungkan Telegram menggunakan perintah di data/pairing.txt')
}
const bot=setup(token,owner,store,scanner,(text,id)=>{
  if(owner() || !code || text!=='/start '+code)return false
  store.set(ownerKey,id)
  rmSync(pairingFile,{force:true})
  return true
})
const schedules:Record<Group,string>={remote:env.CRON_REMOTE_SCHEDULE||'*/30 * * * *',local:env.CRON_LOCAL_SCHEDULE||'0 */2 * * *',freelance:env.CRON_FREELANCE_SCHEDULE||'*/20 * * * *'}
for(const expr of Object.values(schedules))if(!cron.validate(expr))throw Error('Ekspresi cron tidak valid: '+expr)
await bot.api.setMyCommands(Object.entries(commands).map(([command,description])=>({command,description})))
const groups=Object.keys(schedules) as Group[]
const timers=groups.map(group=>{
  const clock=new IntervalClock()
  const tick=()=>{if(clock.tick(store.get('interval_'+group),Date.now()))scanner.enqueue([group])}
  tick()
  const task=cron.schedule(schedules[group],()=>{
    tick()
    if(!clock.minutes)scanner.enqueue([group])
  },{timezone:env.TZ||'Asia/Jayapura'})
  return {group,clock,tick,task}
})
const refresh=setInterval(()=>{for(const timer of timers)timer.tick()},2000)
const heartbeat=process.platform==='win32' ? startHeartbeat('data',()=>({
  source:scanner.activeSource,queued:[...scanner.queue.keys()],last:store.get('last_scan'),
  schedules:timers.map(({group,clock,task})=>({
    group,interval:clock.minutes ? clock.minutes+' menit' : schedules[group],
    next:clock.minutes ? new Date(clock.next).toISOString() : task.getNextRun()?.toISOString()
  }))
})) : undefined
process.once('exit',()=>heartbeat?.stop())
let timer:NodeJS.Timeout
async function pump(){
  let delay=5000
  try{const id=owner();if(id)delay=await deliver(bot,id,store)}catch{console.error('Gagal membaca antrean pengiriman')}
  if(!scanner.stopped)timer=setTimeout(pump,delay)
}
async function shutdown(){scanner.stopped=true;scanner.cancel();clearTimeout(timer);clearInterval(refresh);for(const {task} of timers)await task.stop();if(bot.isRunning())await bot.stop()}
process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown)
await bot.start({onStart:()=>{heartbeat?.ready();console.log('JobRadar aktif');void pump();scanner.enqueue(['remote','freelance','local'])}})
