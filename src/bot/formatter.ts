import type {Row} from '../db/sqlite.ts'
export const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const types:Record<string,string>={bounty:'BOUNTY / MICRO-GIG',freelance:'FREELANCE / PROJECT',part_time:'PART-TIME / ASYNC',full_time:'FULL-TIME',unknown:'Tidak dicantumkan'}
export function titleLink(j:Row){return '<a href="'+esc(j.url)+'">'+esc(j.title.slice(0,180))+'</a>'}
export function card(j:Row){
  const badge=j.work_mode==='local'?'📍 [LOKAL: '+esc(j.location.slice(0,100).toUpperCase())+']':'🌍 [REMOTE · '+j.match_score+'% MATCH]'
  const text=[badge,j.status==='applied'?'✅ SUDAH DILAMAR':'','🔗 '+titleLink(j),'','🏢 '+esc((j.company||'Perusahaan tidak dicantumkan').slice(0,140)),'🌐 '+esc(j.source)+' · '+types[j.job_type],'📍 '+esc(j.location.slice(0,120)),'💰 '+esc((j.salary||'N/A').slice(0,100)),'🛠 '+esc(JSON.parse(j.matched_skills).join(', ').slice(0,230)),'',esc(j.summary),'','🔗 Tautan cadangan',esc(j.url)].join('\n')
  return {text,reply_markup:{inline_keyboard:[[{text:j.status==='saved'?'⭐ Tersimpan':'⭐ Simpan',callback_data:'saved:'+j.id},{text:'✅ Dilamar',callback_data:'applied:'+j.id},{text:'❌ Abaikan',callback_data:'ignored:'+j.id}],[{text:'🔗 Buka Halaman Lowongan ↗',url:j.url}]]}}
}
