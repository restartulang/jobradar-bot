import {DatabaseSync} from 'node:sqlite'
import 'cheerio'
import 'grammy'
import 'node-cron'
import 'rss-parser'

if (!process.env.TELEGRAM_BOT_TOKEN || (process.env.TELEGRAM_CHAT_ID && !/^\d+$/.test(process.env.TELEGRAM_CHAT_ID))) {
  throw Error('Isi TELEGRAM_BOT_TOKEN. Chat ID opsional harus berupa angka.')
}
new DatabaseSync(':memory:').close()
