import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {existsSync} from 'node:fs'

const [group, value] = process.argv.slice(2)
if (!['remote','freelance','local'].includes(group) ||
    !(value === 'default' || (/^[1-9]\d*$/.test(value) && Number(value) <= 10080))) {
  throw Error('Pilih remote, freelance, atau local dan masukkan 1-10080 menit atau default.')
}
const path = fileURLToPath(new URL('../data/jobs.db', import.meta.url))
if (!existsSync(path)) throw Error('Jalankan worker sekali untuk membuat database.')
const db = new DatabaseSync(path)
try {
  db.exec('PRAGMA busy_timeout=5000')
  const key = 'interval_' + group
  if (value === 'default') db.prepare('DELETE FROM settings WHERE key=?').run(key)
  else db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(key,value)
  console.log('Jadwal tersimpan.')
} finally { db.close() }
