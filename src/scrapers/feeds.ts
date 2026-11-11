import {load} from 'cheerio'
import Parser from 'rss-parser'
import type {Listing} from '../engine/matcher.ts'
export type Group='remote'|'freelance'|'local'
export type Source={name:string,group:Group,disabled?:string,fetch:(queries:string[],signal:AbortSignal)=>AsyncIterable<Listing>}
export async function request(url:string,headers:Record<string,string>={},signal:AbortSignal){
  const r=await fetch(url,{headers:{'User-Agent':'JobRadar/1.0 personal job reader',...headers},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])})
  if(!r.ok)throw Error('HTTP '+r.status)
  const chunks:Uint8Array[]=[]
  let bytes=0
  if(!r.body)throw Error('Respons kosong')
  for await(const chunk of r.body as unknown as AsyncIterable<Uint8Array>){
    bytes+=chunk.length
    if(bytes>12_000_000)throw Error('Respons terlalu besar')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString()
}
export function plain(s:unknown){const str=String(s??'');return (/<[a-z]|&[#a-z]/i.test(str)?load(str).text():str).replace(/\s+/g,' ').trim()}
type Item=Record<string,any>
function api(name:string,group:Group,url:string,pick:(data:any)=>Item[],map:(x:Item)=>Partial<Listing>,headers:Record<string,string>={}):Source{
  return {name,group,async *fetch(_queries,signal){
    const rows=pick(JSON.parse(await request(url,headers,signal)))
    if(!Array.isArray(rows))throw Error('Format daftar berubah')
    for(const x of rows){
      const j=map(x)
      if(!j.title || !j.url)continue
      yield {...j,title:plain(j.title),url:j.url,source:name,id:j.id==null?undefined:String(j.id),description:plain(j.description),remote:j.remote??true}
    }
  }}
}
function feed(name:string,group:Group,url:string|undefined):Source{
  return {name,group,disabled:!url?'RSS resmi dihentikan':undefined,async *fetch(_queries,signal){
    const result=await new Parser().parseString(await request(url!,{},signal))
    for(const r of result.items)if(r.title && r.link)yield {source:name,title:r.title,url:r.link,id:r.guid,remote:true,description:plain(r.contentSnippet||r.content),type:group==='freelance'?'freelance':undefined}
  }}
}
export const feeds:Source[]=[
  api('RemoteOK','remote','https://remoteok.com/api',x=>x,x=>({id:x.id,title:x.position,url:x.url,company:x.company,location:x.location,description:[x.description,...(x.tags||[])].join(' '),salary:x.salary_min?'USD '+x.salary_min+'–'+x.salary_max:undefined})),
  api('Remotive','remote','https://remotive.com/api/remote-jobs',x=>x.jobs,x=>({id:x.id,title:x.title,url:x.url,company:x.company_name,location:x.candidate_required_location,description:x.description,type:String(x.job_type||'').replace(/_/g,' '),salary:x.salary})),
  api('Jobicy','remote','https://jobicy.com/api/v2/remote-jobs',x=>x.jobs,x=>({id:x.id,title:x.jobTitle,url:x.url,company:x.companyName,location:x.jobGeo,description:x.jobDescription,type:String(x.jobType||''),salary:x.annualSalaryMin?[x.salaryCurrency,x.annualSalaryMin,'–',x.annualSalaryMax].join(' '):undefined})),
  api('WorkingNomads','remote','https://www.workingnomads.com/api/exposed_jobs/',x=>x,x=>({title:x.title,url:x.url,company:x.company_name,location:x.location,description:x.description})),
  feed('WeWorkRemotely','remote','https://weworkremotely.com/remote-jobs.rss'),
  feed('Upwork','freelance',process.env.UPWORK_FEED_URL),
  api('Freelancer','freelance','https://www.freelancer.com/api/projects/0.1/projects/active/?limit=100&job_details=true&compact=true',x=>x.result.projects,x=>({id:x.id,title:x.title,url:x.seo_url?'https://www.freelancer.com/projects/'+x.seo_url:undefined,description:[x.preview_description,...(x.jobs||[]).map((j:Item)=>j.name)].join(' '),type:'freelance',remote:!x.local,location:x.location?.city,salary:x.budget?[x.currency?.code,x.budget.minimum,'–',x.budget.maximum].join(' '):undefined})),
  api('GitHub Issues','freelance','https://api.github.com/search/issues?q=is%3Aissue+is%3Aopen+label%3Abounty&sort=created&order=desc&per_page=100',x=>x.items,x=>({id:x.id,title:x.title,url:x.html_url,company:x.repository_url?.split('/').slice(-2).join('/'),description:x.body,type:'bounty'}),process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})
]
