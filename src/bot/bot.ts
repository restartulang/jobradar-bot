import {Bot,GrammyError} from 'grammy'
import type {Store} from '../db/sqlite.ts'
import {Scanner,sources} from '../scrapers/index.ts'
import {card,titleLink} from './formatter.ts'
import {registerProfile} from './profile.ts'
export const commands={
  stop_scan:'Hentikan scan aktif dan antreannya',
  profil:'Atur profil pencarian loker',
  start:'Panduan singkat',saved:'Daftar loker tersimpan',applied:'Riwayat lamaran',scan:'Pindai semua sumber',scan_local:'Pindai kota aktif',locations:'Lihat kota aktif',add_city:'Tambah kota pantauan',remove_city:'Hapus kota pantauan',mode:'Pilih all, remote, atau local',keywords:'Lihat kata kunci',add_kw:'Tambahkan skill',block_kw:'Blokir kata kunci',quiet:'Ubah mode senyap',status:'Kesehatan sumber dan bot'
}
export function setup(token:string,owner:()=>string|undefined,store:Store,scanner:Scanner,pair:(text:string,id:string)=>boolean){
  const bot=new Bot(token)
  bot.use(async(ctx,next)=>{
    if(ctx.chat?.type!=='private' || ctx.chat.id!==ctx.from?.id)return
    const id=String(ctx.chat.id)
    if(id===owner())return next()
    if(pair(ctx.message?.text?.trim()||'',id))await ctx.reply('Akun terhubung ke JobRadar. Kirim /status untuk mengecek bot.')
  })
  registerProfile(bot,store)
  bot.command('start',ctx=>ctx.reply('JobRadar siap. Buka /profil untuk mengatur pencarian, /scan untuk mencari loker, atau /status untuk melihat kesehatan sumber.'))
  bot.command('stop_scan',ctx=>ctx.reply(scanner.cancel()
    ? 'Scan dihentikan dan antrean scan dibatalkan. Jadwal otomatis berikutnya tetap aktif.'
    : 'Tidak ada scan yang sedang berjalan atau mengantre.'))
  bot.command(['scan','scan_local'],async ctx=>{
    const local=ctx.message?.text?.split(/[@\s]/)[0]==='/scan_local'
    scanner.enqueue(local?['local']:['remote','freelance','local'],local)
    await ctx.reply('Pemindaian masuk antrean. Hasil yang cocok dikirim ke sini.')
  })
  bot.command('locations',ctx=>ctx.reply('Wilayah aktif: '+(store.filters().cities.join(', ')||'kosong')))
  bot.command('mode',ctx=>{
    const m=ctx.match.trim().toLowerCase()
    if(!['all','remote','local'].includes(m))return ctx.reply('Mode aktif: '+store.filters().mode+'\nGunakan /mode all, /mode remote, atau /mode local.')
    store.set('mode',m);return ctx.reply('Mode aktif: '+m)
  })
  for(const cmd of ['add_kw','block_kw','add_city','remove_city'] as const){
    bot.command(cmd,ctx=>{
      const v=ctx.match.trim().toLowerCase()
      if(!v || v.length>80)return ctx.reply('Gunakan /'+cmd+' diikuti teks 1–80 karakter.')
      if(cmd.endsWith('city'))store.city(v,cmd==='add_city')
      else store.keyword(v,cmd==='add_kw'?'include':'exclude')
      return ctx.reply('Pengaturan diperbarui: '+v)
    })
  }
  bot.command('keywords',async ctx=>{
    const f=store.filters(),text='Skill: '+f.include.join(', ')+'\n\nBlokir: '+f.exclude.join(', ')
    for(let i=0;i<text.length;i+=3500)await ctx.reply(text.slice(i,i+3500))
  })
  bot.command('quiet',ctx=>{const on=store.get('quiet')!=='1';store.set('quiet',on?'1':'0');return ctx.reply('Notifikasi senyap '+(on?'aktif':'nonaktif'))})
  bot.command('status',ctx=>ctx.reply('Uptime: '+Math.floor(process.uptime()/60)+' menit\nMode: '+store.filters().mode+'\n'+store.report()))
  for(const status of ['saved','applied']){
    bot.command(status,async ctx=>{
      const page=Number(ctx.match||1)
      if(!Number.isSafeInteger(page)||page<1||page>1e8)return ctx.reply('Nomor halaman tidak valid.')
      const rows=store.list(status,page-1)
      if(!rows.length)return ctx.reply('Halaman ini kosong.')
      const lines=rows.slice(0,5).map(r=>titleLink(r)+(status==='applied'?' · '+r.applied_at+' UTC':''))
      if(rows.length>5)lines.push('Berikutnya: /'+status+' '+(page+1))
      await ctx.reply(lines.join('\n'),{parse_mode:'HTML',link_preview_options:{is_disabled:true}})
    })
  }
  bot.callbackQuery(/^(saved|applied|ignored):(\d+)$/,async ctx=>{
    const [,status,id]=ctx.match, row=store.row(Number(id)),msg=ctx.callbackQuery.message
    if(!msg||!row||(row.telegram_msg_id && row.telegram_msg_id!==msg.message_id))return ctx.answerCallbackQuery({text:'Lowongan tidak ditemukan.'})
    if(row.status==='applied' && status==='saved')return ctx.answerCallbackQuery({text:'Sudah tercatat di /applied.'})
    store.track(row.id,status)
    await ctx.answerCallbackQuery({text:{saved:'Tersimpan',applied:'Lamaran tercatat',ignored:'Diabaikan'}[status]})
    if(status==='ignored'){await ctx.deleteMessage();return}
    const {text,reply_markup}=card(store.row(row.id)!)
    try{await ctx.editMessageText(text,{parse_mode:'HTML',reply_markup,link_preview_options:{is_disabled:true}})}catch(e){if(!(e instanceof GrammyError && e.description.includes('message is not modified')))throw e}
  })
  for(const source of sources)if(source.disabled)store.health(source.name,source.disabled)
  bot.catch(()=>console.error('Gagal memproses pembaruan Telegram'))
  return bot
}
export async function deliver(bot:Bot,chat:string,store:Store){
  const job=store.next()
  if(!job || !store.claim(job.id))return 1500
  try{
    const {text,reply_markup}=card(job)
    const msg=await bot.api.sendMessage(chat,text,{parse_mode:'HTML',reply_markup,disable_notification:store.get('quiet')==='1',link_preview_options:{is_disabled:true}})
    store.delivery(job.id,'sent',msg.message_id)
  }catch(e){
    if(e instanceof GrammyError && e.error_code===429){
      store.delivery(job.id,'pending')
      return 1000*(1+(e.parameters.retry_after||30))
    }
    if(e instanceof GrammyError && e.error_code<500)store.delivery(job.id,'failed')
    console.error('Pengiriman tidak terkonfirmasi untuk loker',job.id)
  }
  return 1200
}
