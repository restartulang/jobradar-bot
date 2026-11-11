import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Store} from '../src/db/sqlite.ts'
import {match,type Listing} from '../src/engine/matcher.ts'
import {card} from '../src/bot/formatter.ts'

const sample:Listing={title:'Teknisi perangkat <IT>',source:'Portal',url:'https://example.org/job/42?a=1&b=2',location:'Sirimau',description:'Pemeliharaan perangkat',id:'42'}
const f={cities:['ambon','maluku'],include:['React','Node.js'],exclude:['Cold Calling'],mode:'all'}
test('Filter wilayah, alias, batas kata, blacklist dan mode',()=>{
  assert.equal(match(sample,f)?.work_mode,'local')
  assert.equal(match({...sample,location:'Jakarta'},f),undefined)
  assert.equal(match({...sample,title:'React',location:'WFO Jakarta',remote:true},f),undefined)
  const remote={...sample,title:'React freelance',remote:true,location:'Global'}
  assert.equal(match(remote,f)?.job_type,'freelance')
  assert.equal(match(remote,f,true),undefined)
  assert.equal(match(remote,{...f,mode:'local'}),undefined)
  assert.equal(match(sample,{...f,mode:'remote'}),undefined)
  assert.equal(match({...remote,title:'Reactive developer'},f),undefined)
  assert.equal(match({...remote,description:'Cold Calling'},f),undefined)
  assert.equal(match({...remote,url:'javascript:1'},f),undefined)
})
test('SQLite persisten, transisi tracking dan klaim pengiriman unik',()=>{
  const directory=mkdtempSync(join(tmpdir(),'radar-')),path=join(directory,'jobs.db')
  let db=new DatabaseSync(path)
  try{
    let store=new Store(db,['ambon','maluku'])
    const job=match(sample,f)!
    store.insert(job);store.insert({...job,url:'https://example.org/job/renamed'})
    const row=store.next()!
    assert.equal(store.claim(row.id),true);assert.equal(store.claim(row.id),false)
    store.delivery(row.id,'sent',123);store.track(row.id,'saved')
    store.city('ambon',false);store.city('makassar',true);store.keyword('WordPress','include');store.set('quiet','1')
    db.close();db=new DatabaseSync(path);store=new Store(db,['ambon','maluku']);store.insert(job)
    assert.equal(store.next(),undefined)
    assert.deepEqual(store.filters().cities,['makassar','maluku'])
    assert.ok(store.filters().include.includes('WordPress'));assert.equal(store.get('quiet'),'1')
    const saved=store.list('saved',0)
    assert.equal(saved.length,1)
    const {text,reply_markup}=card(saved[0])
    assert.match(text,/href="https:\/\/example.org\/job\/42\?a=1&amp;b=2"/)
    assert.ok(text.endsWith('https://example.org/job/42?a=1&amp;b=2'))
    assert.equal(reply_markup.inline_keyboard[1][0].url,sample.url)
    assert.match(text,/&lt;IT&gt;/)
    store.track(row.id,'applied')
    assert.ok(store.list('applied',0)[0].applied_at)
    assert.match(card(store.row(row.id)!).text,/SUDAH DILAMAR/)
    store.track(row.id,'ignored');assert.equal(store.list('saved',0).length,0)
  }finally{db.close();rmSync(directory,{recursive:true,force:true})}
})
