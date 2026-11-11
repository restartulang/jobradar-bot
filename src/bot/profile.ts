import type {Bot} from 'grammy'
import type {Store} from '../db/sqlite.ts'

const prompts = {
  city: 'Kota mana yang ingin dipantau?',
  uncity: 'Kota mana yang ingin dihapus dari pantauan?',
  skill: 'Skill apa yang ingin dicocokkan?',
  block: 'Kata apa yang ingin diblokir?',
  remove: 'Kata apa yang ingin dihapus dari daftar skill atau blokir?'
}

export function registerProfile(bot:Bot, store:Store) {
  function menu() {
    const f=store.filters()
    const summary=(values:string[]) => values.join(', ').slice(0,900) || 'Belum diatur'
    const button=(text:string,action:string)=>({text,callback_data:'profil:'+action})
    const modes=[['all','Semua'],['remote','Remote'],['local','Lokal']]
    const keyboard={inline_keyboard:[
      modes.map(([mode,label])=>button((f.mode===mode?'✓ ':'')+label,'mode:'+mode)),
      [button('+ Kota','city'),button('Hapus kota','uncity')],
      [button('+ Skill','skill'),button('+ Kata blokir','block')],
      [button('Hapus kata','remove')]
    ]}
    const text=['Profil loker','Mode: '+f.mode,'Kota pantauan: '+summary(f.cities),
      'Skill yang dicari: '+summary(f.include),'Kata yang diblokir: '+summary(f.exclude)].join('\n\n')
    return {text,keyboard}
  }
  bot.command(['profil','profile'],ctx=>{
    const {text,keyboard}=menu()
    return ctx.reply(text,{reply_markup:keyboard})
  })
  bot.callbackQuery(/^profil:mode:(all|remote|local)$/,async ctx=>{
    const mode=ctx.match[1]
    if(store.filters().mode===mode){await ctx.answerCallbackQuery({text:'Mode ini sudah aktif.'});return}
    store.set('mode',mode)
    await ctx.answerCallbackQuery({text:'Mode disimpan.'})
    const {text,keyboard}=menu()
    await ctx.editMessageText(text,{reply_markup:keyboard})
  })
  bot.callbackQuery(/^profil:(city|uncity|skill|block|remove)$/,async ctx=>{
    await ctx.answerCallbackQuery()
    await ctx.reply(prompts[ctx.match[1] as keyof typeof prompts],{reply_markup:{force_reply:true}})
  })
  bot.on('message:text',async(ctx,next)=>{
    const reply=ctx.message.reply_to_message
    if(!reply || reply.from?.id!==ctx.me.id || !('text' in reply))return next()
    const action=Object.entries(prompts).find(([,prompt])=>prompt===reply.text)?.[0]
    const value=ctx.message.text.trim().toLowerCase()
    if(!action || value.startsWith('/'))return next()
    if(!value || value.length>80)return ctx.reply('Masukkan 1–80 karakter. Buka /profil untuk mencoba lagi.')
    if(action==='city' || action==='uncity')store.city(value,action==='city')
    else if(action==='remove')store.removeKeyword(value)
    else store.keyword(value,action==='skill'?'include':'exclude')
    const {text,keyboard}=menu()
    await ctx.reply(text,{reply_markup:keyboard})
  })
}
