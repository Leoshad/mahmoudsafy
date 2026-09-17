import {backup, DatabaseSync} from 'node:sqlite';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, stat, statfs, open, appendFile, readdir, unlink, link} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID} from 'node:crypto';
import {createGzip, createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Transform, Writable} from 'node:stream';
import {unusedPhotos, reclaimPhotos} from './photo-storage.mjs';
const DAY = 86400000;
const key = secret => {
  if (typeof secret !== 'string' || secret.length < 32) throw Error('A valid SESSION_SECRET is required.');
  return createHash('sha256').update('our-place-backup-v1:' + secret).digest();
};
function verify(path) {
  const db = new DatabaseSync(path, {readOnly: true});
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Backup integrity check failed.');
    db.prepare('SELECT body FROM state WHERE id=1').get();
    db.prepare('SELECT count(*) FROM photos').get();
  } finally { db.close(); }
}
async function remove(path) { await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
export async function createRecoveryBackup(store, directory, secret, now = Date.now()) {
  const cipherKey = key(secret);
  await mkdir(directory, {recursive: true, mode: 0o700});
  const pages = store.db.prepare('PRAGMA page_count').get().page_count;
  const pageSize = store.db.prepare('PRAGMA page_size').get().page_size;
  const free = await statfs(directory);
  // Retain existing copies if there isn't enough space for both temporary files.
  if (free.bavail * free.bsize < pages * pageSize * 2.2 + 64 * 1024 * 1024) throw Error('Not enough free space for a safe backup.');
  const name = 'recovery-' + now + '-' + randomUUID();
  const temp = join(directory, name + '.sqlite.tmp'), encrypted = join(directory, name + '.tmp'), final = join(directory, name + '.opbackup');
  try {
    // SQLite's online backup API includes committed WAL data.
    const handle = await open(temp, 'wx', 0o600); await handle.close();
    await backup(store.db, temp); verify(temp);
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', cipherKey, iv);
    const out = await open(encrypted, 'wx', 0o600); await out.write(iv); await out.close();
    const original=createHash('sha256');
    const digest=new Transform({transform(chunk,_,done){original.update(chunk);done(null,chunk);}});
    await pipeline(createReadStream(temp), digest, createGzip(), cipher, createWriteStream(encrypted, {flags: 'a', mode: 0o600}));
    await appendFile(encrypted, cipher.getAuthTag());
    // Verify the encrypted archive too, before treating it as recoverable.
    const decoded=createHash('sha256'),decipher=createDecipheriv('aes-256-gcm',cipherKey,iv);
    decipher.setAuthTag(cipher.getAuthTag());
    const encryptedSize=(await stat(encrypted)).size;
    await pipeline(createReadStream(encrypted,{start:12,end:encryptedSize-17}),decipher,createGunzip(),new Writable({write(chunk,_,done){decoded.update(chunk);done();}}));
    if(decoded.digest('hex')!==original.digest('hex'))throw Error('Encrypted recovery verification failed.');
    const completed=await open(encrypted,'r');try{await completed.sync();}finally{await completed.close();}
    await link(encrypted, final);
    const files = (await readdir(directory)).filter(n => /^recovery-\d+-[a-f0-9-]+\.opbackup$/.test(n)).sort().reverse();
    for (const old of files.slice(2)) await remove(join(directory, old));
    return final;
  } finally { await remove(temp); await remove(encrypted); }
}
export async function restoreRecoveryBackup(source, destination, secret) {
  const cipherKey = key(secret), info = await stat(source);
  if (info.size < 29) throw Error('Invalid backup.');
  const handle = await open(source, 'r'), iv = Buffer.alloc(12), tag = Buffer.alloc(16);
  try { await handle.read(iv, 0, 12, 0); await handle.read(tag, 0, 16, info.size - 16); } finally { await handle.close(); }
  const decipher = createDecipheriv('aes-256-gcm', cipherKey, iv); decipher.setAuthTag(tag);
  const temp = destination + '.' + randomUUID() + '.tmp';
  let bytes = 0;
  const bound = new Transform({transform(chunk, _, done) { bytes += chunk.length; done(bytes > 1024 ** 3 ? Error('Backup is too large.') : null, chunk); }});
  try {
    await pipeline(createReadStream(source, {start: 12, end: info.size - 17}), decipher, createGunzip(), bound, createWriteStream(temp, {flags:'wx',mode:0o600}));
    verify(temp);
    // Never overwrite a live database or an existing recovery destination.
    await link(temp, destination);
  } finally { await remove(temp); }
}
export function startMaintenance(store, directory, secret) {
  let pending = null, stopped = false;
  async function run() {
    if (pending || stopped) return pending;
    pending = (async () => {
      const candidates = unusedPhotos(store);
      await createRecoveryBackup(store, directory, secret);
      if (!stopped) reclaimPhotos(store, candidates);
      console.log('Recovery backup verified; photo maintenance completed.');
    })().catch(() => console.error('Recovery backup failed; photo cleanup skipped.')).finally(() => { pending = null; });
    return pending;
  }
  const timer = setInterval(run, DAY); timer.unref();
  // A fresh verified backup precedes every cleanup, including after a deploy.
  const start = setTimeout(run, 10000); start.unref();
  return async () => { stopped = true; clearInterval(timer); clearTimeout(start); await pending; };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [action, source, destination] = process.argv.slice(2);
  if (action !== 'restore' || !source || !destination) throw Error('Usage: node backup.mjs restore ARCHIVE NEW_DATABASE_PATH');
  await restoreRecoveryBackup(source, destination, process.env.SESSION_SECRET);
  console.log('Backup verified and restored to the new destination. The running app was not changed.');
}
