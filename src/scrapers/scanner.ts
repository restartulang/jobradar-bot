import {match} from '../engine/matcher.ts'
import type {Store} from '../db/sqlite.ts'
import type {Group,Source} from './feeds.ts'
export class Scanner {
  store:Store
  queue=new Map<Group,boolean>()
  running=false
  activeSource=''
  stopped=false
  sources:Source[]
  controller?:AbortController
  constructor(store:Store,sources:Source[]){this.store=store;this.sources=sources}
  cancel(){
    const active=!!this.controller && !this.controller.signal.aborted
    const queued=this.queue.size
    this.queue.clear()
    this.controller?.abort()
    return active || queued>0
  }
  enqueue(groups:Group[],localOnly=false){
    for(const g of groups)this.queue.set(g,(this.queue.get(g)??true)&&localOnly)
    if(!this.running)void this.drain().catch(()=>console.error('Gagal menjalankan antrean scan'))
  }
  async drain(){
    const controller=new AbortController()
    this.controller=controller
    const {signal}=controller
    this.running=true
    try{
      while(this.queue.size && !this.stopped){
        const [group,onlyLocal]=this.queue.entries().next().value!
        this.queue.delete(group)
        for(const s of this.sources.filter(s=>s.group===group)){
          if(this.stopped || signal.aborted)return
          if(s.disabled){this.store.health(s.name,s.disabled);continue}
          const filters=this.store.filters()
          if(group!=='local' && filters.mode==='local')continue
          const queries=[...(!onlyLocal && filters.mode!=='local'?['remote']:[]),...(filters.mode!=='remote'?filters.cities:[])]
          if(group==='local' && !queries.length)continue
          this.activeSource=s.name
          let count=0
          try{
            for await(const raw of s.fetch(queries,signal)){
              if(this.stopped || signal.aborted)return
              const job=match(raw,this.store.filters(),onlyLocal)
              if(job){this.store.insert(job);count++}
            }
            if(signal.aborted)return
            this.store.health(s.name,'OK · '+count+' cocok')
          }catch(e){if(signal.aborted)return;this.store.health(s.name,'Gagal · '+(e as Error).message.slice(0,100))}
        }
        this.store.set('last_scan',new Date().toISOString())
      }
    }finally{
      this.controller=undefined
      this.running=false
      this.activeSource=''
      if(this.queue.size && !this.stopped)this.enqueue([])
    }
  }
}
