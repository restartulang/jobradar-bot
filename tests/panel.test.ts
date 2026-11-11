import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {Store} from '../src/db/sqlite.ts'
import {IntervalClock} from '../src/interval.ts'
import {registerProfile} from '../src/bot/profile.ts'

test('Perubahan dari panel terlihat oleh koneksi worker dan interval dapat dipulihkan',()=>{
  const dir=mkdtempSync(join(tmpdir(),'jobradar-panel-'))
  mkdirSync(join(dir,'data'));mkdirSync(join(dir,'scripts'))
  const script=join(dir,'scripts','interval.mjs')
  copyFileSync(new URL('../scripts/interval.mjs',import.meta.url),script)
  const db=new DatabaseSync(join(dir,'data','jobs.db'))
  try{
    const store=new Store(db,['ambon'])
    const edit=(value:string)=>spawnSync(process.execPath,[script,'local',value]).status
    assert.equal(edit('90'),0)
    const clock=new IntervalClock()
    const tick=(now:number)=>clock.tick(store.get('interval_local'),now)
    assert.equal(tick(0),false);assert.equal(clock.next,5400000)
    assert.equal(tick(5400000),true);assert.equal(tick(5400000),false)
    assert.equal(edit('0'),1);assert.equal(store.get('interval_local'),'90')
    assert.equal(edit('15'),0);assert.equal(tick(5500000),false)
    assert.equal(clock.next,6400000)
    assert.equal(edit('default'),0);assert.equal(tick(6400000),false)
    assert.equal(clock.minutes,0)
  }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})

test('Menu profil memakai setelan matcher dan menangani jawaban untuk prompt bot',async()=>{
  const db=new DatabaseSync(':memory:')
  try{
    const store=new Store(db,['ambon'])
    const handlers=new Map<string,(ctx:any,next?:()=>void)=>Promise<unknown>>()
    const callbacks:Array<{pattern:RegExp,fn:(ctx:any)=>Promise<void>}>=[]
    const bot={
      command:(_:unknown,fn:any)=>handlers.set('menu',fn),
      on:(_:unknown,fn:any)=>handlers.set('text',fn),
      callbackQuery:(pattern:RegExp,fn:any)=>callbacks.push({pattern,fn})
    }
    registerProfile(bot as unknown as Parameters<typeof registerProfile>[0],store)
    let message=''
    const ctx:any={me:{id:2},reply:(s:string)=>{message=s},answerCallbackQuery:async()=>{},editMessageText:(s:string)=>{message=s}}
    const click=async(data:string)=>{
      const item=callbacks.find(c=>c.pattern.test(data))!
      ctx.match=data.match(item.pattern);await item.fn(ctx)
    }
    await handlers.get('menu')!(ctx);assert.match(message,/Profil loker/)
    await click('profil:mode:local');assert.equal(store.filters().mode,'local')
    for(const [action,value] of [['city','Medan'],['skill','Zig'],['block','Sales']]){
      await click('profil:'+action)
      ctx.message={text:value,reply_to_message:{from:{id:2},text:message}}
      await handlers.get('text')!(ctx)
    }
    assert.ok(store.filters().cities.includes('medan'));assert.ok(store.filters().include.includes('zig'))
    assert.ok(store.filters().exclude.includes('sales'))
    await click('profil:remove')
    ctx.message={text:'Zig',reply_to_message:{from:{id:2},text:message}}
    await handlers.get('text')!(ctx);assert.ok(!store.filters().include.includes('zig'))
  }finally{db.close()}
})
