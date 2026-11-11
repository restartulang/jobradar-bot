import {load} from 'cheerio'
import {plain,request,type Source} from './feeds.ts'
import type {Listing} from '../engine/matcher.ts'
type Entry=Record<string,any>
function walk(value:any,rows:Entry[]){
  if(!value || typeof value!=='object')return
  if([value['@type']].flat().includes('JobPosting'))rows.push(value)
  else for(const child of Object.values(value))walk(child,rows)
}
export function extract(html:string,base:string,source:string,detail=false):Listing[]{
  const $=load(html), rows:Entry[]=[]
  $('script[type="application/ld+json"]').each((_,s)=>{try{walk(JSON.parse($(s).text()),rows)}catch{/* Multiple independent metadata blocks */}})
  return rows.flatMap(x=>{
    const raw=x.url || (detail && ($('link[rel="canonical"]').attr('href') || base))
    if(!raw||!x.title)return []
    const location=[x.jobLocation].flat().filter(Boolean).map(p=>[p.address?.addressLocality,p.address?.addressRegion,typeof p.address==='string'?p.address:''].filter(Boolean).join(', ')).join(' / ')
    const pay=x.baseSalary?.value
    return [{title:plain(x.title),id:x.identifier?.value?String(x.identifier.value):undefined,url:new URL(raw,base).href,source,company:x.hiringOrganization?.name,location,description:plain(x.description),remote:x.jobLocationType==='TELECOMMUTE',type:String(x.employmentType||'').replace(/_/g,' '),salary:pay?[x.baseSalary.currency,pay.value||[pay.minValue,pay.maxValue].filter(Boolean).join('–'),pay.unitText].filter(Boolean).join(' '):undefined}]
  })
}
type Portal={name:string,search:(q:string)=>string,detail:RegExp}
const portals:Portal[]=[
  {name:'JobStreet ID',search:q=>'https://id.jobstreet.com/id/'+(q==='remote'?'remote-jobs':'jobs-in-'+encodeURIComponent(q)),detail:/\/job\/\d+/},
  {name:'Glints ID',search:q=>'https://glints.com/id/opportunities/jobs/explore?keyword='+encodeURIComponent(q),detail:/\/opportunities\/jobs\/(?!explore)[^/]+\/[\da-f-]+/},
  {name:'Kalibrr',search:q=>'https://www.kalibrr.com/id-ID/job-board/te/'+encodeURIComponent(q),detail:/\/c\/[^/]+\/jobs\/\d+/},
  {name:'Indeed ID',search:q=>'https://id.indeed.com/jobs?'+new URLSearchParams(q==='remote'?{q:'remote',l:'Indonesia'}:{q:'',l:q}),detail:/\/viewjob\?.*jk=/},
  {name:'Karir',search:q=>'https://karir.com/search?q='+encodeURIComponent(q),detail:/\/opportunities\/\d+/}
]
export const localSources:Source[]=portals.map(p=>({name:p.name,group:'local',async *fetch(queries,signal){
  const seen=new Set<string>(), errors:string[]=[]
  for(const query of queries){
    try{
      const base=p.search(query), html=await request(base,{},signal)
      const items=extract(html,base,p.name)
      if(items.length){yield* items;continue}
      const $=load(html),links=new Set<string>()
      $('a[href]').each((_,a)=>{
        try{const u=new URL($(a).attr('href')!,base)
          if(u.hostname===new URL(base).hostname && p.detail.test(u.href) && !seen.has(u.href))links.add(u.href)
        }catch{/* Ignore malformed href */}})
      if(!links.size && !/tidak (ada|ditemukan) lowongan|no (jobs|results) found/i.test($.text()))throw Error('Daftar tidak dapat dibaca')
      for(const link of [...links].slice(0,12)){
        seen.add(link)
        try{const jobs=extract(await request(link,{},signal),link,p.name,true)
          if(!jobs.length)throw Error('Metadata lowongan tidak tersedia')
          yield* jobs
        }catch(e){signal.throwIfAborted();errors.push((e as Error).message)}
      }
    }catch(e){signal.throwIfAborted();errors.push((e as Error).message)}
  }
  if(errors.length)throw Error(errors[0])
}}))
localSources.push({name:'Google Jobs',group:'local',disabled:process.env.SERPAPI_KEY?undefined:'SERPAPI_KEY belum diisi',async *fetch(queries,signal){
  for(const q of queries){
    const params=new URLSearchParams({engine:'google_jobs',q:'lowongan kerja '+q,gl:'id',hl:'id',api_key:process.env.SERPAPI_KEY!})
    const data=JSON.parse(await request('https://serpapi.com/search.json?'+params,{},signal))
    if(data.error)throw Error('Google Jobs gagal memproses kueri')
    for(const r of data.jobs_results||[]){
      const url=r.apply_options?.[0]?.link
      if(url)yield {source:'Google Jobs',title:r.title,id:r.job_id,url,company:r.company_name,location:r.location,description:r.description,remote:r.detected_extensions?.work_from_home,type:r.detected_extensions?.schedule_type,salary:r.detected_extensions?.salary}
    }
  }
}})
