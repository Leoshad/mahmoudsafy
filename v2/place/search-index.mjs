export function initSearchIndex(db){
 const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE name='message_search'").get();
 db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(text,content='messages',content_rowid='rowid',tokenize='trigram');
 CREATE TRIGGER IF NOT EXISTS message_search_insert AFTER INSERT ON messages BEGIN INSERT INTO message_search(rowid,text) VALUES(new.rowid,new.text); END;
 CREATE TRIGGER IF NOT EXISTS message_search_delete AFTER DELETE ON messages BEGIN INSERT INTO message_search(message_search,rowid,text) VALUES('delete',old.rowid,old.text); END;
 CREATE TRIGGER IF NOT EXISTS message_search_update AFTER UPDATE OF text ON messages BEGIN INSERT INTO message_search(message_search,rowid,text) VALUES('delete',old.rowid,old.text); INSERT INTO message_search(rowid,text) VALUES(new.rowid,new.text); END;`);
 if(!exists)db.exec("INSERT INTO message_search(message_search) VALUES('rebuild')");
}
