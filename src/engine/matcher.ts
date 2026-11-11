export type Listing = {title:string, url:string, source:string, id?:string, company?:string, location?:string, remote?:boolean, description?:string, type?:string, salary?:string}
export type Filters = {cities:string[], include:string[], exclude:string[], mode:string}
export const categories = {
  fullstack:'JavaScript|TypeScript|Node.js|React|Next.js|PWA|Offline-first|IndexedDB|Service Worker|Full-Stack|Frontend|Backend',
  uiux:'UI/UX|Product Designer|SaaS|Figma|Design System|Dashboard Design|Wireframing|Prototyping',
  infra:'Docker|Self-hosted|Linux|Cloudflare|Reverse Proxy|CI/CD|VPS|SysAdmin|DevOps|Server',
  iot:'IoT|Telemetry|Data Logging|Sensor|MQTT|WebSockets|Hardware Monitoring|Embedded|Microcontroller',
  support:'Technical Support|IT Support|Troubleshooting|Helpdesk|System Diagnostics|Network|Maintenance|QA'
}
export const excluded = 'Cobol|Mainframe|.NET Legacy|US Citizen Only|Security Clearance|3D Animation|Print Design|Motion Graphic|Mechanical CAD|Civil Engineering|Telemarketing|Cold Calling|Sales Target'.split('|')
const localSkills = 'Teknisi|Jaringan|Operator IT|Vendor Proyek Lapangan|Perangkat|Pemeliharaan Sistem'.split('|')
function contains(text:string, word:string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[ -]+/g,'[ -]+')
  return new RegExp('(?:^|[^\\p{L}\\p{N}])'+escaped+'(?=$|[^\\p{L}\\p{N}])','iu').test(text)
}
export function match(job:Listing, filters:Filters, onlyLocal=false) {
  if (!job.title.trim() || !/^https?:\/\/[^\s<>"]+$/i.test(job.url) || job.url.length>1800) return
  try { new URL(job.url) } catch { return }
  const place = job.location || ''
  const geo = place+' '+job.title
  const body = job.title+' '+(job.description || '')
  const onsite = /\b(on[ -]?site|wfo|hybrid|hibrida|non[ -]remote|no remote|not remote)\b/i.test(geo+' '+(job.type || ''))
  const remote = !onsite && (job.remote || /\b(remote|wfh|wfa|work from (home|anywhere))\b/i.test(geo))
  const city = filters.cities.find(c=>contains(place,c) || (c==='ambon' && /\b(sirimau|baguala|pass?o|pattimura)\b/i.test(place)))
  const mode = remote ? 'remote' : city ? 'local' : null
  if (!mode || (onlyLocal && mode!=='local') || (filters.mode!=='all' && filters.mode!==mode)) return
  if (filters.exclude.some(k=>contains(body,k)) || (!city && /data cent(?:er|re) physical only/i.test(body))) return
  const skills = [...new Set([...filters.include,...(mode==='local'?localSkills:[])])].filter(k=>contains(body,k))
  if (!skills.length) return
  const kind = (job.type || '')+' '+job.title
  const job_type = /bounty|micro[ -]?gig/i.test(kind)?'bounty':/part[ -]?time|async|paruh waktu/i.test(kind)?'part_time':/freelance|contract|project|kontrak|proyek/i.test(kind)?'freelance':/full[ -]?time|penuh waktu|permanent/i.test(kind)?'full_time':'unknown'
  return {...job, location:place || 'Remote', work_mode:mode, job_type, matched_skills:skills, match_score:Math.min(100,60+skills.length*8), summary:(job.description || job.title).replace(/\s+/g,' ').trim().slice(0,250)}
}
export type Matched = NonNullable<ReturnType<typeof match>>
