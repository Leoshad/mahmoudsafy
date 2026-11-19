// Printable doctor file for Safy, built only from the viewer's authorized Care snapshot.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function careDate(v){if(!v)return '';if(/^\d{4}$/.test(v))return v;const [y,m,d]=v.split('-');return (d?Number(d)+' ':'')+MONTHS[Number(m)-1]+' '+y;}
const range=l=>l.rangeText||(l.lo!=null&&l.hi!=null?l.lo+'–'+l.hi:l.hi!=null?'< '+l.hi:l.lo!=null?'> '+l.lo:'—');
const STATUS={in:'In range',below:'Below range',above:'Above range',none:'No range given'};
function trend(t){if(!t.previous||t.trend==='incompatible')return '';const up=t.latest.value>t.previous.value;if(t.latest.value===t.previous.value)return '→ same';return (up?'↑ ':'↓ ')+(t.trend==='better'?'toward range':t.trend==='away'?'away from range':t.status==='none'?'':'within range');}
const KIND={crohn:'Crohn’s',blood:'Blood & iron',visit:'Visit',medicine:'Medicine',other:'Other'};
const MOOD={okay:'okay',tired:'tired',pain:'in pain',sleep:'sleeping'};
function describe(e,meds){const d=e.data;
 if(e.kind==='belly'){const p=[];if(d.pain!==null)p.push('belly pain '+d.pain+'/5');if(d.where?.length)p.push(d.where.join(', '));if(d.diarrhea!==null)p.push(d.diarrhea?'diarrhea':'no diarrhea');if(d.note)p.push('“'+d.note+'”');return p.join(' · ');}
 if(e.kind==='checkin')return [...(d.moods??[]).map(m=>MOOD[m]||m),...(d.energy?['energy '+d.energy+'/5']:[]),...(d.symptoms??[]),...(d.note?[d.note]:[])].join(' · ');
 if(e.kind==='bathroom')return 'bathroom visits: '+d.count;if(e.kind==='flare')return 'flare '+(d.state==='start'?'started':'ended');
 if(e.kind==='period')return 'period '+d.state+(d.flow?' · '+d.flow:'');if(e.kind==='note')return d.text;
 if(e.kind==='sleep')return d.end?'sleep '+Math.round((d.end-d.start)/360000)/10+' h':'sleep (ongoing)';
 if(e.kind==='dose'){const m=meds.find(x=>x.id===d.med);return (m?m.name:'medicine')+' '+d.status;}return e.kind;}
const SIGN={'pad-2h':'pad change under 2 h','double':'two pads at once','night':'night changes','clots':'clots ≥ 2.5 cm'};
const dn=v=>Math.round(Date.parse(v+'T12:00:00Z')/86400000);
const zday=(ms,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
function periodSection(c){const z=c.zone||'Africa/Cairo';const list=(c.entries??[]).filter(e=>e.kind==='period').sort((a,b)=>a.occurredAt-b.occurredAt);const ps=[];let cur=null;
 for(const e of list){const d=zday(e.occurredAt,z);if(e.data.state==='start'){cur={start:d,end:null,flows:new Set(),signs:new Set()};ps.push(cur);}if(!cur)continue;if(e.data.flow)cur.flows.add(e.data.flow);for(const x of e.data.signs??[])cur.signs.add(x);if(e.data.state==='end'){cur.end=d;cur=null;}}
 if(!ps.length)return '';const rows=ps.slice(-6).reverse().map((p,i,arr)=>{const next=arr[i-1];return '<tr><td>'+esc(careDate(p.start))+'</td><td>'+(p.end?(dn(p.end)-dn(p.start)+1)+' days':'ongoing')+'</td><td>'+(next?(dn(next.start)-dn(p.start))+' days':'—')+'</td><td>'+esc([...p.flows].join(', '))+(p.signs.size?'<br><span class="flag">'+esc([...p.signs].map(x=>SIGN[x]).join(', '))+'</span>':'')+'</td></tr>';}).join('');
 return '<h2>Periods</h2><table class="labs"><thead><tr><th>Started</th><th>Length</th><th>Cycle</th><th>Flow · signs</th></tr></thead><tbody>'+rows+'</tbody></table>';}
function sleepSection(c,now){const z=c.zone||'Africa/Cairo';const n=(c.entries??[]).filter(e=>e.kind==='sleep'&&e.data.end&&e.data.end>=now-14*86400000);if(n.length<3)return '';const h=n.map(e=>(e.data.end-e.data.start)/3600000);const avg=Math.round(h.reduce((a,b)=>a+b,0)/h.length*10)/10;const q=n.filter(e=>e.data.quality==='bad').length;
 return '<h2>Sleep, last 14 days</h2><p>'+n.length+' nights logged · average '+avg+' h · '+h.filter(x=>x>=7).length+' nights of 7 h or more'+(q?' · '+q+(q===1?' rough night':' rough nights'):'')+'.</p>';}
export function careDocumentHTML(c,{who,fontCSS='',now=Date.now()}={}){
 const day=new Intl.DateTimeFormat('en-GB',{timeZone:c.zone||'Africa/Cairo',day:'numeric',month:'long',year:'numeric'}).format(now);
 const latest=c.labs.filter(t=>t.latest);const outside=latest.filter(t=>['below','above'].includes(t.status));
 const active=c.meds.filter(m=>m.active),past=c.meds.filter(m=>!m.active&&m.stoppedOn);
 const groups=[...new Set(latest.map(t=>t.group))];
 const history=[...c.milestones.map(m=>({date:m.date,kind:KIND[m.kind]||m.kind,title:m.title,note:[m.note,m.paper?('Paper: '+m.paper+(m.historical?' (historical document)':'')):''].filter(Boolean).join(' — ')})),
  ...c.meds.filter(m=>m.startedOn).map(m=>({date:m.startedOn,kind:'Medicine',title:'Started '+m.name,note:[m.dose,m.notes].filter(Boolean).join(' · ')})),
  ...c.meds.filter(m=>m.stoppedOn).map(m=>({date:m.stoppedOn,kind:'Medicine',title:'Stopped '+m.name,note:''}))];
 const labDays=[...new Set(c.labs.flatMap(t=>t.readings.filter(r=>r.verified).map(r=>r.date)))];
 for(const d of labDays){const n=c.labs.filter(t=>t.readings.some(r=>r.verified&&r.date===d));history.push({date:d,kind:'Labs',title:'Lab tests',note:n.map(t=>t.test).slice(0,8).join(', ')+(n.length>8?' +'+(n.length-8)+' more':'')});}
 history.sort((a,b)=>b.date.padEnd(10,'z').localeCompare(a.date.padEnd(10,'z')));
 const recent=(c.entries??[]).filter(e=>e.kind!=='dose'&&e.occurredAt>=now-30*86400000);
 const watch=latest.filter(t=>t.readings.filter(r=>r.verified).length>1&&/^(hemoglobin|ferritin|vitamin d|esr · first|transferrin saturation|serum iron|mcv|rdw)/.test(t.key));
 const row=(cells,cls='')=>'<tr'+(cls?' class="'+cls+'"':'')+'>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Safy — health file</title><style>${fontCSS}
@page{size:A4;margin:16mm 14mm 18mm}
*{box-sizing:border-box}body{margin:0;font:10.5pt/1.45 Arial,'CareArabic',sans-serif;color:#1d1a1c}
h1{font:600 20pt Georgia,serif;margin:0 0 2mm}h2{font:600 12.5pt Georgia,serif;margin:7mm 0 2.5mm;padding-bottom:1.5mm;border-bottom:1.5px solid #c9a96e;break-after:avoid}
h3{font-size:10.5pt;margin:4mm 0 1.5mm;color:#5a4a52}.muted{color:#6d6168}.small{font-size:9pt}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1d1a1c;padding-bottom:3mm}
.note{background:#f6f1e8;border-left:3px solid #c9a96e;padding:2.5mm 3.5mm;margin:3mm 0;font-size:9.5pt}
.key{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.box{border:1px solid #ddd3d8;border-radius:2mm;padding:3mm}.box b{display:block;margin-bottom:1mm}
table{width:100%;border-collapse:collapse;font-size:9.5pt;break-inside:auto}tr{break-inside:avoid}th{text-align:left;font-size:8.5pt;letter-spacing:.4px;text-transform:uppercase;color:#6d6168;border-bottom:1px solid #b9adb3;padding:1.5mm 2mm}
td{border-bottom:1px solid #ebe4e8;padding:1.6mm 2mm;vertical-align:top}table.labs td:nth-child(n+3){white-space:nowrap}tr.out td{background:#fbf4ea}tr.out td:nth-child(2){font-weight:700}
.flag{font-weight:700;color:#9a4b12}ol{margin:0;padding-left:5mm}li{margin:0 0 2mm}.empty{color:#6d6168;font-style:italic}</style></head><body>
<div class="head"><div><h1>Health file — Safy</h1><div class="muted">Prepared ${esc(day)} · from her medical papers</div></div><div class="small muted" style="text-align:right">Our Place · shared by ${esc(who)}</div></div>
<div class="note">Values, units, flags and ranges are copied exactly as printed on each lab sheet. Please check the original papers for anything important.</div>
<h2>At a glance</h2><div class="key">
<div class="box"><b>Crohn’s treatment</b>${esc(c.crohn?.treatment||'Not recorded')}</div>
<div class="box"><b>Current medicines</b>${active.length?active.map(m=>esc(m.name)+(m.dose?' — '+esc(m.dose):'')).join('<br>'):'<span class="empty">None recorded</span>'}</div>
<div class="box" style="grid-column:1/3"><b>Latest results outside the lab’s range</b>${outside.length?outside.map(t=>esc(t.test)+': <b style="display:inline">'+esc(t.latest.valueText)+' '+esc(t.latest.unit)+'</b> ('+esc(range(t.latest))+') · '+esc(careDate(t.latest.date))+(t.previous?' · before: '+esc(t.previous.valueText)+' on '+esc(careDate(t.previous.date)):'')).join('<br>'):'<span class="empty">None</span>'}</div></div>
${(c.guide??[]).some(g=>g.kind==='ask')?'<h2>Questions for this visit</h2><ol>'+(c.guide??[]).filter(g=>g.kind==='ask').map(g=>'<li dir="auto"><b>'+esc(g.title)+'</b>'+(g.action?'<br>'+esc(g.action):'')+'</li>').join('')+'</ol>':''}
<h2>Medicines</h2>${c.meds.length?'<table><thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>Since</th><th>Notes</th></tr></thead><tbody>'+[...active,...past].map(m=>row([esc(m.name)+(m.active?'':' <span class="muted">(stopped '+esc(careDate(m.stoppedOn))+')</span>'),esc(m.dose),esc(m.schedule==='as-needed'?'as needed':m.schedule==='weekly'?'weekly':(m.times.join(', ')||'daily')),esc(careDate(m.startedOn)),esc(m.notes)])).join('')+'</tbody></table>':'<p class="empty">No medicines recorded.</p>'}
<h2>Latest lab results</h2>${latest.length?groups.map(g=>'<h3>'+esc(g)+'</h3><table class="labs"><thead><tr><th style="width:30%">Test</th><th>Result</th><th>Range</th><th>Date</th><th>Before</th><th>Change</th></tr></thead><tbody>'+latest.filter(t=>t.group===g).map(t=>row([esc(t.test),esc(t.latest.valueText)+' '+esc(t.latest.unit)+(t.latest.flag?' <span class="flag">'+esc(t.latest.flag)+'</span>':''),esc(range(t.latest)),esc(careDate(t.latest.date)),t.previous?esc(t.previous.valueText)+' · '+esc(careDate(t.previous.date)):'—',esc(trend(t))],['below','above'].includes(t.status)?'out':'')).join('')+'</tbody></table>').join(''):'<p class="empty">No lab results recorded.</p>'}
${watch.length?'<h2>Trends of key tests</h2><table><thead><tr><th style="width:30%">Test</th><th>Readings, oldest → newest</th></tr></thead><tbody>'+watch.map(t=>row([esc(t.test)+' <span class="muted">('+esc(t.latest.unit)+')</span>',t.readings.filter(r=>r.verified).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>esc(r.valueText)+(r.flag?' <span class="flag">'+esc(r.flag)+'</span>':'')+' <span class="muted">('+esc(careDate(r.date))+')</span>').join(' → ')])).join('')+'</tbody></table>':''}
<h2>History</h2>${history.length?'<table><thead><tr><th style="width:17%">Date</th><th style="width:15%">Type</th><th>What happened</th></tr></thead><tbody>'+history.map(h=>row([esc(careDate(h.date)),esc(h.kind),'<b>'+esc(h.title)+'</b>'+(h.note?'<br><span dir="auto">'+esc(h.note)+'</span>':'')])).join('')+'</tbody></table>':'<p class="empty">No history recorded.</p>'}
${recent.length?'<h2>Symptoms logged in the last 30 days</h2><table><thead><tr><th style="width:22%">When</th><th>Logged</th></tr></thead><tbody>'+recent.map(e=>row([esc(new Intl.DateTimeFormat('en-GB',{timeZone:c.zone||'Africa/Cairo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(e.occurredAt)),'<span dir="auto">'+esc(describe(e,c.meds))+'</span>'])).join('')+'</tbody></table>':''}
${periodSection(c)}${sleepSection(c,now)}${(c.appointments??[]).some(a=>a.date>=c.today)?'<h2>Upcoming appointments</h2><table><tbody>'+c.appointments.filter(a=>a.date>=c.today).map(a=>row([esc(careDate(a.date))+(a.time?' · '+esc(a.time):''),'<b>'+esc(a.title)+'</b>',esc([a.doctor,a.place].filter(Boolean).join(' · '))])).join('')+'</tbody></table>':''}
<h2>Doctors</h2>${c.doctors.length?'<table><tbody>'+c.doctors.map(d=>row(['<b>'+esc(d.specialty)+'</b>',esc(d.name),esc(d.phone),esc(d.note)])).join('')+'</tbody></table>':'<p class="empty">No doctors recorded.</p>'}
</body></html>`;}
