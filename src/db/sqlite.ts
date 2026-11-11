import {createHash} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {categories,excluded,type Filters,type Matched} from '../engine/matcher.ts'

export type Row = {id:number,title:string,company:string,source:string,url:string,work_mode:string,location:string,job_type:string,salary:string,matched_skills:string,match_score:number,summary:string,status:string,applied_at:string|null,telegram_msg_id:number|null}
export class Store {
  db:DatabaseSync
  constructor(db:DatabaseSync,cities:string[]) {
    this.db=db
    db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,job_hash TEXT UNIQUE NOT NULL,title TEXT NOT NULL,company TEXT,source TEXT NOT NULL,work_mode TEXT NOT NULL,location TEXT,job_type TEXT,salary TEXT,matched_skills TEXT,match_score INTEGER,url TEXT NOT NULL,summary TEXT,status TEXT DEFAULT 'new',telegram_msg_id INTEGER, delivery TEXT DEFAULT 'pending',applied_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS watched_locations(id INTEGER PRIMARY KEY,city_keyword TEXT UNIQUE,is_active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS keywords(id INTEGER PRIMARY KEY,word TEXT UNIQUE COLLATE NOCASE,type TEXT NOT NULL,category TEXT);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS health(source TEXT PRIMARY KEY,state TEXT,checked TEXT DEFAULT CURRENT_TIMESTAMP);`)
    db.exec('BEGIN')
    try {
      if(!this.get('initialized')){
        for(const c of cities)this.city(c,true)
        for(const [cat,words] of Object.entries(categories))for(const w of words.split('|'))this.keyword(w,'include',cat)
        for(const w of excluded)this.keyword(w,'exclude')
        this.set('initialized','1')
      }
      db.exec('COMMIT')
    } catch(e){db.exec('ROLLBACK');throw e}
  }
  get(k:string){return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(k) as {value:string}|undefined)?.value}
  set(k:string,v:string){this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k,v)}
  city(c:string,on:boolean){this.db.prepare('INSERT INTO watched_locations(city_keyword,is_active) VALUES (?,?) ON CONFLICT(city_keyword) DO UPDATE SET is_active=excluded.is_active').run(c.trim().toLowerCase(),Number(on))}
  keyword(w:string,t:string,c='general'){this.db.prepare('INSERT INTO keywords(word,type,category) VALUES (?,?,?) ON CONFLICT(word) DO UPDATE SET type=excluded.type,category=excluded.category').run(w,t,c)}
  filters():Filters {
    const words=this.db.prepare('SELECT word,type FROM keywords ORDER BY word').all() as {word:string,type:string}[]
    return {cities:(this.db.prepare('SELECT city_keyword FROM watched_locations WHERE is_active=1 ORDER BY city_keyword').all() as {city_keyword:string}[]).map(r=>r.city_keyword),include:words.filter(r=>r.type==='include').map(r=>r.word),exclude:words.filter(r=>r.type==='exclude').map(r=>r.word),mode:this.get('mode') || 'all'}
  }
  removeKeyword(word:string){this.db.prepare('DELETE FROM keywords WHERE word=?').run(word)}
  insert(j:Matched){
    const url=new URL(j.url)
    url.hash=''
    for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key))url.searchParams.delete(key)
    const hash=createHash('sha256').update(j.source+'\n'+(j.id || url.href)).digest('hex')
    this.db.prepare('INSERT INTO jobs(job_hash,title,company,source,work_mode,location,job_type,salary,matched_skills,match_score,url,summary) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_hash) DO NOTHING').run(hash,j.title,j.company||'',j.source,j.work_mode,j.location,j.job_type,j.salary||'',JSON.stringify(j.matched_skills),j.match_score,j.url,j.summary)
  }
  row(id:number){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Row|undefined}
  next(){return this.db.prepare("SELECT * FROM jobs WHERE delivery='pending' ORDER BY id LIMIT 1").get() as Row|undefined}
  claim(id:number){return this.db.prepare("UPDATE jobs SET delivery='sending' WHERE id=? AND delivery='pending'").run(id).changes===1}
  delivery(id:number,state:string,msg:number|null=null){this.db.prepare('UPDATE jobs SET delivery=?,telegram_msg_id=? WHERE id=?').run(state,msg,id)}
  track(id:number,status:string){this.db.prepare("UPDATE jobs SET status=?,updated_at=CURRENT_TIMESTAMP,applied_at=CASE WHEN ?='applied' THEN COALESCE(applied_at,CURRENT_TIMESTAMP) ELSE applied_at END WHERE id=?").run(status,status,id)}
  list(status:string,page:number){return this.db.prepare('SELECT * FROM jobs WHERE status=? ORDER BY updated_at DESC,id DESC LIMIT 6 OFFSET ?').all(status,page*5) as Row[]}
  health(source:string,state:string){this.db.prepare('INSERT OR REPLACE INTO health(source,state) VALUES (?,?)').run(source,state)}
  report(){const totals=this.db.prepare("SELECT COUNT(*) n,COUNT(CASE WHEN delivery='sending' THEN 1 END) uncertain,COUNT(CASE WHEN delivery='failed' THEN 1 END) failed FROM jobs").get() as {n:number,uncertain:number,failed:number}
    const rows=this.db.prepare('SELECT source,state,checked FROM health ORDER BY source').all() as {source:string,state:string,checked:string}[]
    return ['Lowongan di database: '+totals.n,'Pengiriman belum terkonfirmasi: '+totals.uncertain,'Pengiriman ditolak: '+totals.failed,'Scan terakhir (UTC): '+(this.get('last_scan')||'belum ada'),...rows.map(r=>r.source+' · '+r.state+' · '+r.checked+' UTC')].join('\n')
  }
}
