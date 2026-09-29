// Literal, parameterized search of the shared conversation only; never private jobs.
export function searchChat(store, input, start = 0) {
 const query=String(input??'').trim();
 if(!query)return {total:0,offset:0,matches:[]};
 if(query.length>200)throw Object.assign(new Error('Search up to 200 characters.'),{status:400});
 const offset=Number(start||0);
 if(!Number.isSafeInteger(offset)||offset<0)throw Object.assign(new Error('Invalid search position.'),{status:400});
 const indexed=[...query].length>=3&&!query.includes('\0');
 const where=(indexed?'rowid IN (SELECT rowid FROM message_search WHERE message_search MATCH ?) AND ':'')+'instr(lower(text),lower(?))>0';
 const args=indexed?['"'+query.replaceAll('"','""')+'"',query]:[query];
 const total=store.db.prepare('SELECT count(*) AS n FROM messages WHERE '+where).get(...args).n;
 const matches=store.db.prepare('SELECT id,rowid AS sequence FROM messages WHERE '+where+' ORDER BY rowid DESC LIMIT 50 OFFSET ?').all(...args,offset);
 return {total,offset,matches};
}
