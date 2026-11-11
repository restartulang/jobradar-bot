import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {Store} from '../src/db/sqlite.ts'
import {Scanner} from '../src/scrapers/scanner.ts'

test('Stop membatalkan fetch aktif dan antrean lama; scan baru tetap berjalan',async()=>{
  const db=new DatabaseSync(':memory:')
  try {
    const calls:string[]=[]
    const store=new Store(db,['ambon'])
    const scanner=new Scanner(store,[
      {name:'R',group:'remote',async *fetch(_,signal){
        calls.push('remote')
        await new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
      }},
      {name:'L',group:'local',async *fetch(){calls.push('local')}},
      {name:'F',group:'freelance',async *fetch(){calls.push('freelance')}}
    ])
    assert.equal(scanner.cancel(),false)
    scanner.enqueue(['remote','local'])
    assert.equal(scanner.cancel(),true)
    assert.equal(scanner.cancel(),false)
    scanner.enqueue(['freelance'])
    await new Promise<void>(resolve=>setImmediate(resolve))
    assert.deepEqual(calls,['remote','freelance'])
    assert.equal(scanner.running,false)
    assert.equal(db.prepare('SELECT state FROM health WHERE source=?').get('R'),undefined)
  } finally {db.close()}
})
