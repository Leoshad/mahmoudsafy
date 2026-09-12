import { DatabaseSync } from 'node:sqlite';
import { initialState } from './domain.mjs';
export class Store {
  constructor(path) {
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(initialState()));
  }
  read(){return JSON.parse(this.db.prepare('SELECT data FROM state WHERE id=1').get().data);}
  transaction(fn){
    this.db.exec('BEGIN IMMEDIATE');
    try {const state=this.read(); const result=fn(state); this.db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(state));this.db.exec('COMMIT');return result;}
    catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
