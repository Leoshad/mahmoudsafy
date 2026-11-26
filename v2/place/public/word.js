(()=>{'use strict';
// Our Word: today's shared word and word-for-word challenges. The server keeps every secret word.
const $=s=>document.querySelector(s),make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
const LANGS={ar:'العربية',en:'English'};
// Enter lives as the gold Submit button beside Give up, so the keyboard keeps letters and delete only.
const KEYS={en:[[...'qwertyuiop'],[...'asdfghjkl'],[...'zxcvbnm','back']],ar:[[...'ضصثقفغعهخحج'],[...'شسيبلاتنمكط'],[...'ذئءؤروزظد','back']]};
const RANK={absent:1,present:2,correct:3};
let host,who=null,data=null,tab='daily',opened=false,busy=false,fullView=true,signature='',clockOffset=0,version=-1;
let crownHolder=null;const crownTag=(el,name)=>{if(name&&name===crownHolder){const c=document.createElement('span');c.className='game-crown';c.textContent='👑';c.title=name+' holds the crown';c.setAttribute('aria-label','holds the crown');el.append(c);}return el;};
let typed=[],shake=false,dailyLang='en',soundOn=true,audio=null;
const revealed=new Map(),celebrated=new Map();let dismissed=null;
const ANIM=1800;
const draft={lang:'en',word:'',hint:'',note:'',photo:null,uploading:false};
try{soundOn=localStorage.getItem('our-place:word:sound')!=='off';}catch{}

// Same normalization as the server: Arabic without diacritics, one alef, ة→ه, ى→ي.
function normalize(text,lang){let w=String(text??'').trim();if(lang==='ar')return w.replace(/[ً-ْٰـ\s]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');return w.toLowerCase().replace(/\s/g,'');}
const LETTERS={ar:/^[ء-غف-ي]+$/,en:/^[a-z]+$/};
const other=()=>who==='Mahmoud'?'Safy':'Mahmoud';
const clock=ms=>{if(!Number.isFinite(ms)||ms<0)return '0:00';const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const tries=n=>n+(n===1?' try':' tries');
const dayLabel=key=>{try{return new Date(key+'T12:00:00Z').toLocaleDateString(undefined,{day:'numeric',month:'short'});}catch{return key;}};

// ---------- sound ----------
function soundButton(){const b=$('#word-sound');if(!b)return;b.textContent=soundOn?'Sound on':'Muted';b.setAttribute('aria-pressed',String(soundOn));}
function unlockSound(){if(!soundOn)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;audio??=new A();if(audio.state!=='running')audio.resume().catch(()=>{});}catch{}}
function tone(hz,at=0,length=.09,volume=.06,type='sine'){
 if(!soundOn||document.hidden||!opened||audio?.state!=='running')return;
 try{const now=audio.currentTime+at,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(hz,now);g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(volume,now+.008);g.gain.exponentialRampToValueAtTime(.001,now+length);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+length+.02);o.onended=()=>{o.disconnect();g.disconnect();};}catch{}
}
const tap=()=>tone(520,0,.05,.035,'triangle');
function flipSounds(marks){marks.forEach((m,i)=>tone(m==='correct'?660:m==='present'?520:330,i*.16+.12,.11,.05));}
function winSound(){[523,659,784,1047].forEach((hz,i)=>tone(hz,i*.13,.22,.06));}
function loseSound(){[330,262].forEach((hz,i)=>tone(hz,i*.18,.25,.05));}

// ---------- shell ----------
function save(){try{if(who)localStorage.setItem('our-place:word:'+who,JSON.stringify({tab,opened,fullView}));}catch{}}
function playing(){const m=match();return !!m&&m.status==='active'&&m.me.started&&!m.me.finished;}
function focused(){return opened&&fullView;}
let wasFocused=false;
function show(){const p=$('#word-panel'),now=focused();p.hidden=!opened;p.classList.toggle('word-focused',now);p.classList.toggle('word-playing',now&&playing());const size=$('#word-size');if(size){const label=now?'Exit full screen':'Full screen';size.innerHTML=now?'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>':'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';size.setAttribute('aria-label',label);size.title=label;size.setAttribute('aria-pressed',String(now));}if(wasFocused&&!now&&opened)requestAnimationFrame(()=>host?.revealPanel?.('#word-panel'));wasFocused=now;$('#word-open').hidden=opened;document.body.classList.toggle('word-locked',focused());save();}
function error(e){$('#word-error').textContent=e?.message||'Could not connect. Your game is saved.';}
function btn(label,root,fn,cls){const b=make('button',label,root,cls);b.type='button';b.onclick=()=>{unlockSound();return Promise.resolve(fn()).catch(error);};b.disabled=busy;return b;}
async function command(type,payload={}){
 if(busy)return false;busy=true;$('#word-error').textContent='';let ok=false;render(true);
 try{await host.command('word.'+type,payload);if(type==='guess')typed=[];await host.sync();ok=true;}
 catch(e){await host.sync().catch(()=>{});if(type==='guess'){shake=true;tone(180,0,.12,.04,'square');}error(e);}
 finally{busy=false;render(true);}
 return ok;
}
function match(){if(!data)return null;return tab==='daily'?data.daily?.current:data.challenge&&['active','complete'].includes(data.challenge.status)?data.challenge:null;}
function matchKey(m){return (tab==='daily'?'daily':'challenge')+':'+m.id;}

// ---------- board ----------
function letterStates(guesses){const out={};for(const g of guesses)[...g.word].forEach((ch,i)=>{const m=g.marks[i];if((RANK[m]??0)>(RANK[out[ch]]??0))out[ch]=m;});return out;}
function tile(root,ch,mark,cls=''){const t=make('span',ch||'',root,'word-tile'+(mark?' '+mark:'')+(ch&&!mark?' filled':'')+(cls?' '+cls:''));t.setAttribute('aria-label',ch?(ch+(mark?' · '+mark:'')):'empty');return t;}
function boardView(root,m,length,lang,{live=false,mini=false}={}){
 const grid=make('div',undefined,root,'word-board'+(mini?' mini':''));grid.dir=lang==='ar'?'rtl':'ltr';grid.style.setProperty('--len',length);grid.setAttribute('role','grid');grid.setAttribute('aria-label',mini?'Board':'Your board');
 const guesses=m.guesses||[],max=data?.limits?.tries||6,rows=mini?max:Math.min(max,guesses.length+(live?1:0)),key=live?matchKey(match()):null;
 for(let r=0;r<rows;r++){
  const row=make('div',undefined,grid,'word-row');row.setAttribute('role','row');
  const g=guesses[r];
  if(g){const id=key?key+':'+r:null;if(id&&!revealed.has(id)){revealed.set(id,Date.now());flipSounds(g.marks);}const age=id?Date.now()-revealed.get(id):Infinity;[...g.word].forEach((ch,i)=>{const t=tile(row,mini?'':ch,g.marks[i]);if(age<ANIM){t.classList.add('flip');t.style.animationDelay=(i*160-age)+'ms';}});}
  else if(live&&r===guesses.length){if(shake){row.classList.add('shake');shake=false;}for(let i=0;i<length;i++)tile(row,typed[i],null,i===typed.length?'cursor':'');}
  else for(let i=0;i<length;i++)tile(row,'',null);
 }
 return grid;
}
function keyboard(root,lang,guesses){
 const states=letterStates(guesses),kb=make('div',undefined,root,'word-keyboard');kb.dir='ltr';kb.setAttribute('aria-label','Keyboard');
 for(const row of KEYS[lang]){const r=make('div',undefined,kb,'word-key-row');for(const k of row){
  const b=make('button',k==='enter'?(lang==='ar'?'إدخال':'Enter'):k==='back'?'⌫':k,r,'word-key'+(k.length>1?' wide':'')+(states[k]?' '+states[k]:''));b.type='button';b.disabled=busy;
  if(k==='back')b.setAttribute('aria-label','Delete letter');if(k==='enter')b.setAttribute('aria-label','Submit word');
  b.onclick=()=>{unlockSound();press(k);};
 }}
}
function press(k){
 const m=match();if(!m||!playing()||busy)return;const length=m.length;
 if(k==='enter'){submit();return;}
 if(k==='back'){if(typed.length){typed.pop();render(true);}return;}
 if(typed.length<length){typed.push(k);tap();render(true);}
}
async function submit(){
 const m=match();if(!m)return;
 if(typed.length!==m.length){shake=true;error(new Error('Use exactly '+m.length+' letters.'));render(true);return;}
 await command('guess',{match:tab,id:m.id,guess:typed.join('')});
}
function onKey(e){
 if(!opened||!playing()||e.ctrlKey||e.metaKey||e.altKey)return;
 const t=e.target;if(t&&(t.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(t.tagName)))return;
 const m=match(),lang=tab==='daily'?m.lang:data.challenge.lang;
 if(e.key==='Enter'){e.preventDefault();press('enter');return;}
 if(e.key==='Backspace'){e.preventDefault();press('back');return;}
 const ch=normalize(e.key,lang);if(ch.length===1&&LETTERS[lang].test(ch)){e.preventDefault();press(ch);}
}

// ---------- clues ----------
// Topic of the word (free), letters you revealed with 💡, and how many tries are left.
function cluePanel(root,m,lang,topic,label){
 const box=make('div',undefined,root,'word-clues');
 if(topic){const t=make('p',undefined,box,'word-topic');make('span',label||(lang==='ar'?'الموضوع':'Topic'),t,'word-clue-label');make('strong',topic,t);t.dir='auto';}
 const hints=m.me.hints||[],max=data?.limits?.hints??2;
 if(hints.length){const row=make('div',undefined,box,'word-known');row.dir=lang==='ar'?'rtl':'ltr';row.setAttribute('aria-label','Letters you revealed');const at=new Map(hints.map(h=>[h.i,h.letter]));for(let i=0;i<m.length;i++)tile(row,at.get(i)||'',at.has(i)?'correct':null,'known');}
 const foot=make('div',undefined,box,'word-clue-row');
 make('span',(lang==='ar'?'محاولة ':'Try ')+Math.min((m.me.guesses?.length??0)+1,data?.limits?.tries||6)+(lang==='ar'?' من ':' of ')+(data?.limits?.tries||6),foot,'word-try-count');
 const left=max-hints.length,b=btn(left?'💡 Show a letter · '+left+' left':'💡 No letters left',foot,()=>command('hint',{match:tab,id:m.id}),'word-hint-button');b.disabled=busy||!left;b.title='Reveals one letter in its place. If you tie on tries, fewer letters revealed wins.';
}

// ---------- pieces ----------
function rivalLine(root,m){
 const r=m.rival,name=other(),chip=make('div',undefined,root,'word-rival');
 if(crownHolder===who)crownTag(make('span','You',chip,'word-rival-name me'),who);
 crownTag(make('span',name,chip,'word-rival-name '+name.toLowerCase()),name);
 make('span',!r.started?'not started yet':!r.finished?'playing…':r.tries!=null?(r.solved?'solved · '+tries(r.tries):'did not solve'):'finished',chip,'word-rival-state'+(r.finished?' done':r.started?' live':''));
}
function statusRow(root,title,m){
 const row=make('div',undefined,root,'word-status-row');make('p',title,row,'word-turn').setAttribute('role','status');
 const c=make('span','',row,'word-clock');c.title='Your clock';c.setAttribute('aria-label','Your time');if(m.me.finished)c.textContent='⏱ '+clock(m.me.ms);else{c.dataset.start=String(m.me.startedAt||'');tick();}
}
function tick(){const c=document.querySelector('#word-game .word-clock[data-start]');if(!c)return;const start=Number(c.dataset.start);c.textContent=start?'⏱ '+clock(Date.now()+clockOffset-start):'';}
function wordTiles(root,word,lang,cls='word-answer'){const box=make('div',undefined,root,cls);box.dir=lang==='ar'?'rtl':'ltr';for(const ch of [...String(word||'').replace(/[\u064B-\u0652\u0670\u0640\s]/g,'')])tile(box,ch,'correct');box.setAttribute('aria-label',word);return box;}
function resultCard(root,m,lang,{title,answer,note}){
 const card=make('div',undefined,root,'word-result');card.setAttribute('role','status');const key=matchKey(m)+':result';
 if(!celebrated.has(key)){celebrated.set(key,Date.now());if(m.winner===who)winSound();else if(m.winner)loseSound();}const age=Date.now()-celebrated.get(key);if(age<900){card.classList.add('word-result-enter');card.style.animationDelay=(-age)+'ms';}
 make('small',title,card);
 make('h3',m.status==='void'?'No match today':m.winner===who?'You won!':m.winner?m.winner+' won':'It’s a tie',card);
 if(answer){make('p',lang==='ar'?'الكلمة':'The word',card,'word-result-label');wordTiles(card,answer,lang);}
 const sides=make('div',undefined,card,'word-result-sides');
 for(const [name,b] of [[who,m.me],[other(),m.rival]]){
  const s=make('div',undefined,sides,'word-result-side'+(m.winner===name?' winner':''));crownTag(make('strong',name===who?'You':name,s),name);
  make('span',!b.started?'Did not play':b.solved?tries(b.tries)+(b.hints?.length?' · '+b.hints.length+' letter'+(b.hints.length>1?'s':'')+' shown':'')+' · '+clock(b.ms):'Not solved'+(b.ms!=null?' · '+clock(b.ms):''),s);
  if(b.guesses?.length)boardView(s,b,[...b.guesses[0].word].length,lang,{mini:true});
 }
 make('p',m.status==='void'?'Only one of you played, so no point this time.':m.winner?'Fewer tries wins; then fewer letters shown; then the faster clock. Saved to the crown.':'Same result for both of you. No point this time.',card,'word-result-note');
 if(note)make('p',note,card,'word-result-note');
 return card;
}
function reveal(root,c){
 if(!c.reveal)return;const box=make('div',undefined,root,'word-surprise');
 make('small','FROM '+other().toUpperCase(),box,'label');make('p',(c.me.solved?'You found ':'The word was ')+'',box,'word-surprise-lead');wordTiles(box,c.reveal.word,c.lang,'word-answer small');
 if(c.reveal.note){const n=make('p',c.reveal.note,box,'word-surprise-note');n.dir='auto';}
 if(c.reveal.photo){const img=make('img',undefined,box,'word-surprise-photo');img.alt='A surprise from '+other();img.loading='lazy';img.src='/api/photos/'+encodeURIComponent(c.reveal.photo);img.onclick=()=>window.open(img.src,'_blank','noopener');}
 if(!c.reveal.note&&!c.reveal.photo)make('p','No surprise this time, just the word.',box,'muted');
}
function langPicker(root,value,onPick,label='Language'){
 const wrap=make('div',undefined,root,'word-lang');make('span',label,wrap,'word-field-label');const row=make('div',undefined,wrap,'word-lang-row');
 for(const [k,name] of Object.entries(LANGS)){const b=make('button',name,row,value===k?'selected':'');b.type='button';b.disabled=busy;b.setAttribute('aria-pressed',String(value===k));b.onclick=()=>onPick(k);}
}

// ---------- daily ----------
function renderDaily(root){
 const d=data.daily,m=d.current;
 if(!m){
  if(d.last)lastDay(root,d.last);
  const card=make('div',undefined,root,'word-start');
  make('small','TODAY’S WORD · '+dayLabel(d.today).toUpperCase(),card,'label');make('h4','Same word. Same day. Who finds it first?',card);
  const todayLang=d.lang||'en';
  make('p',other()+' plays the same word. Your clock starts when you press Start.',card,'muted');
  btn('Start · invite '+other(),card,async()=>{if(await command('daily',{lang:todayLang})){fullView=true;render(true);}},'primary word-start-button');
  make('p',other()+' gets a notification to play the same word.',card,'muted word-small');
  return;
 }
 const LEVEL={easy:'Easy',medium:'Medium',hard:'Hard 🔥'};const title='Today’s word · '+m.length+' letters · '+LANGS[m.lang]+(m.level?' · '+LEVEL[m.level]:'');
 if(m.status!=='active'){resultCard(root,m,m.lang,{title:'TODAY’S WORD · '+dayLabel(m.date).toUpperCase(),answer:m.answer,note:'A new word arrives at midnight Riyadh time.'});return;}
 if(!m.me.started){
  const card=make('div',undefined,root,'word-start');make('small','TODAY’S WORD · '+dayLabel(m.date).toUpperCase(),card,'label');
  make('h4',(m.startedBy===who?'You':m.startedBy)+' started today’s word',card);make('p',m.length+' letters · 6 tries · a topic clue and up to 2 letters to reveal. Your clock starts when you press Start.',card,'muted');
  rivalLine(card,m);btn('Start today’s word',card,async()=>{if(await command('daily',{lang:m.lang})){fullView=true;render(true);}},'primary word-start-button');return;
 }
 statusRow(root,title,m);rivalLine(root,m);
 if(!m.me.finished)cluePanel(root,m,m.lang,m.topic);
 boardView(root,m.me,m.length,m.lang,{live:!m.me.finished});
 if(m.me.finished){waitingCard(root,m,m.answer,m.lang);return;}
 keyboard(root,m.lang,m.me.guesses);
}
function waitingCard(root,m,answer,lang){
 const card=make('div',undefined,root,'word-waiting');make('h4',m.me.solved?'Solved in '+tries(m.me.tries)+' · '+clock(m.me.ms):'Not this time',card);
 if(answer){make('p',lang==='ar'?'الكلمة':'The word',card,'word-result-label');wordTiles(card,answer,lang,'word-answer small');}
 make('p','Waiting for '+other()+' to finish. The result appears for both of you.',card,'muted');
}
function lastDay(root,l){
 const box=make('details',undefined,root,'word-last');box.dataset.persistent='true';make('summary',dayLabel(l.date)+' · '+(l.status==='void'?'no match':l.winner?(l.winner===who?'you won':l.winner+' won'):'tie')+' · '+l.answer,box);
 const row=make('div',undefined,box,'word-result-sides');for(const [name,b] of [[who,l.me],[other(),l.rival]]){const s=make('div',undefined,row,'word-result-side');crownTag(make('strong',name===who?'You':name,s),name);make('span',!b.started?'Did not play':b.solved?tries(b.tries)+' · '+clock(b.ms):'Not solved',s);}
}

// ---------- challenge ----------
function photoPicker(root){
 const wrap=make('div',undefined,root,'word-photo');make('span','Surprise photo · optional',wrap,'word-field-label');
 if(draft.photo){const prev=make('div',undefined,wrap,'word-photo-preview');const img=make('img',undefined,prev);img.src=draft.photo.preview;img.alt='Your surprise photo';btn(draft.uploading?'Uploading…':'Remove photo',prev,()=>{if(draft.photo?.preview?.startsWith('blob:'))URL.revokeObjectURL(draft.photo.preview);draft.photo=null;render(true);}).disabled=busy||draft.uploading;return;}
 const label=make('label','Add a photo',wrap,'word-photo-add');const input=make('input',undefined,label);input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=()=>{const f=input.files?.[0];input.value='';if(f)upload(f);};
}
async function upload(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){error(new Error('Choose a JPG, PNG or WebP photo.'));return;}
 const preview=URL.createObjectURL(file);draft.photo={preview,id:null};draft.uploading=true;render(true);
 try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const res=await host.api('photos',{data:canvas.toDataURL('image/jpeg',.8).split(',')[1]});if(draft.photo?.preview===preview)draft.photo.id=res.id;}
 catch(e){if(draft.photo?.preview===preview)draft.photo=null;error(e);}
 finally{draft.uploading=false;render(true);}
}
function wordForm(root,lang,{answering=false}={}){
 const form=make('form',undefined,root,'word-form');form.noValidate=true;
 const use=answering?lang:draft.lang,n=[...normalize(draft.word,use)].length,okShape=LETTERS[use].test(normalize(draft.word,use))&&n>=4&&n<=7;
 const field=(label,key,max,area=false,placeholder='')=>{const l=make('label',undefined,form,'word-field');make('span',label,l,'word-field-label');const i=make(area?'textarea':'input',undefined,l);if(!area)i.type='text';i.maxLength=max;i.value=draft[key];i.dir='auto';i.placeholder=placeholder;i.dataset.field=key;i.autocomplete='off';i.spellcheck=false;i.oninput=()=>{draft[key]=i.value;if(key==='word')render(true);};return i;};
 field('Your word for '+other()+' · 4 to 7 letters','word',20,false,use==='ar'?'مثال: قهوة':'e.g. coffee');
 const count=make('p',draft.word?(okShape?n+' letters ✓':use==='ar'?'Arabic letters only, 4 to 7 letters, no spaces.':'English letters only, 4 to 7 letters, no spaces.'):'Any word from your life: a nickname, a place, a song.',form,'word-count'+(draft.word&&!okShape?' bad':''));count.setAttribute('aria-live','polite');
 field('Hint · optional','hint',40,false,'e.g. a place, a food');
 field('Surprise message · opens after '+other()+' finishes','note',400,true,'Something sweet to read after the game…');
 photoPicker(form);
 const actions=make('div',undefined,form,'word-form-actions');
 const send=btn(answering?'Send my word · start':'Send challenge to '+other(),actions,()=>sendWord(answering),'primary');send.disabled=busy||!okShape||draft.uploading;
 if(answering)btn('Not now',actions,()=>command('decline',{id:data.challenge.id}));
 form.onsubmit=e=>{e.preventDefault();if(!send.disabled)send.click();};
}
async function sendWord(answering){
 const c=data.challenge,payload={word:draft.word,hint:draft.hint,note:draft.note,photo:draft.photo?.id||null};
 const ok=answering?await command('answer',{id:c.id,...payload}):await command('challenge',{lang:draft.lang,...payload});
 if(ok){if(draft.photo?.preview?.startsWith('blob:'))URL.revokeObjectURL(draft.photo.preview);Object.assign(draft,{word:'',hint:'',note:'',photo:null});render(true);}
}
function renderChallenge(root){
 const c=data.challenge&&!(data.challenge.status==='complete'&&dismissed===data.challenge.id)?data.challenge:null;
 if(!c||['declined','cancelled','expired'].includes(c.status)){
  if(c&&c.owner===who&&c.status!=='cancelled')make('p',c.status==='declined'?other()+' said not now to your last challenge.':'Your last challenge expired.',root,'muted');
  const card=make('div',undefined,root,'word-start');make('small','CHALLENGE',card,'label');make('h4','Write a word for '+other(),card);make('p',other()+' writes one for you too. Whoever solves the other’s word in fewer tries wins.',card,'muted');
  wordForm(card,draft.lang);return;
 }
 if(c.status==='waiting'){
  if(c.owner===who){const card=make('div',undefined,root,'word-waiting');make('h4','Waiting for '+other()+'…',card);make('p',other()+' is writing a word for you. Your word: ',card,'muted');wordTiles(card,c.myWord.display,c.lang,'word-answer small');if(c.myWord.hint)make('p','Hint: '+c.myWord.hint,card,'muted');if(c.myWord.hasNote||c.myWord.hasPhoto)make('p','With a surprise '+[c.myWord.hasNote&&'message',c.myWord.hasPhoto&&'photo'].filter(Boolean).join(' and ')+' for after '+other()+' finishes.',card,'muted');btn('Cancel challenge',card,()=>command('cancel',{id:c.id}));return;}
  const card=make('div',undefined,root,'word-start');make('small','CHALLENGE FROM '+c.owner.toUpperCase(),card,'label');make('h4',c.owner+' wrote a word for you',card);make('p','Write one back in '+LANGS[c.lang]+'. Then you both start solving.',card,'muted');
  wordForm(card,c.lang,{answering:true});return;
 }
 if(c.status==='complete'){resultCard(root,c,c.lang,{title:'CHALLENGE COMPLETE',answer:null});reveal(root,c);const yours=make('p','Your word was ',root,'muted word-yours');yours.append(make('strong',c.myWord?.display||''));btn('New challenge',root,()=>{dismissed=c.id;render(true);},'primary word-start-button');return;}
 const title=other()+'’s word · '+c.length+' letters · '+LANGS[c.lang];
 if(!c.me.started){const card=make('div',undefined,root,'word-start');make('small','CHALLENGE',card,'label');make('h4',other()+'’s word is ready',card);make('p',c.length+' letters · 6 tries'+(c.hint?' · Hint: '+c.hint:'')+'. Your clock starts when you press Start.',card,'muted');rivalLine(card,c);btn('Start',card,async()=>{if(await command('start',{id:c.id})){fullView=true;render(true);}},'primary word-start-button');return;}
 statusRow(root,title,c);rivalLine(root,c);
 if(!c.me.finished)cluePanel(root,c,c.lang,c.hint||null,'Hint from '+other());else if(c.hint)make('p','Hint · '+c.hint,root,'word-hint').dir='auto';
 boardView(root,c.me,c.length,c.lang,{live:!c.me.finished});
 if(c.me.finished){waitingCard(root,c,null,c.lang);reveal(root,c);return;}
 keyboard(root,c.lang,c.me.guesses);
}

// ---------- records ----------
let historySignature='';
function renderRecords(){
 const r=data?.records??{wins:{},ties:0,history:[]},sig=JSON.stringify(r);if(sig===historySignature)return;historySignature=sig;
 const root=$('#word-records');root.replaceChildren();make('small','YOUR RIVALRY · MATCH WINS',root,'label');
 for(const n of ['Mahmoud','Safy'])make('span',n+' · '+(r.wins?.[n]??0),root,'word-win-total');if(r.ties)make('span','Ties · '+r.ties,root,'word-win-total');
 const list=$('#word-history-list');list.replaceChildren();if(!r.history?.length)make('p','Finished matches will be remembered here.',list,'muted');
 for(const h of r.history??[]){const row=make('div',undefined,list,'word-history-row');make('strong',(h.kind==='daily'?'Today’s word':'Challenge')+' · '+(h.winner?h.winner+' won':'Tie'),row);
  make('span',['Mahmoud','Safy'].map(n=>{const x=h.results?.[n];return n+' '+(x?.solved?tries(x.tries)+' · '+clock(x.ms):'not solved');}).join(' · '),row);
  make('small',new Date(h.date).toLocaleDateString()+' · '+LANGS[h.lang]+(h.kind==='daily'&&(h.answerDisplay||h.answer)?' · '+(h.answerDisplay||h.answer):''),row);}
}
function invitation(){
 const c=data?.challenge,root=$('#word-invitation');if(!root)return;root.replaceChildren();root.hidden=!(c?.status==='waiting'&&c.owner!==who);if(root.hidden)return;
 make('span',c.owner+' sent you an Our Word challenge.',root);
 btn('Write my word',root,()=>{tab='challenge';opened=true;host.goto('together');render(true);host.revealPanel?.('#word-panel');},'primary');
 btn('Not now',root,()=>command('decline',{id:c.id}));
}
function openNote(){
 const d=data?.daily?.current,c=data?.challenge;let note='A word a day. A word from me to you.';
 if(c?.status==='waiting'&&c.owner!==who)note=c.owner+' wrote a word for you.';
 else if(c?.status==='active'&&!c.me.finished)note='Your challenge is waiting.';
 else if(d?.status==='active'&&!d.me.finished)note=d.rival.finished?other()+' finished today’s word. Your turn.':d.me.started?'Today’s word is in progress.':'Today’s word is waiting for you.';
 $('#word-open-note').textContent=note;
}

// ---------- render ----------
function render(force=false){
 if(!data||!who)return;show();invitation();renderRecords();openNote();
 $('#word-daily-tab').classList.toggle('selected',tab==='daily');$('#word-challenge-tab').classList.toggle('selected',tab==='challenge');
 $('#word-daily-tab').setAttribute('aria-selected',String(tab==='daily'));$('#word-challenge-tab').setAttribute('aria-selected',String(tab==='challenge'));
 const sig=JSON.stringify([tab,data.daily,data.challenge,typed,busy,dailyLang,draft.lang,draft.photo?.id,draft.uploading,fullView,crownHolder]);
 if(!force&&sig===signature)return;signature=sig;
 const active=document.activeElement,field=active?.dataset?.field,caret=field?[active.selectionStart,active.selectionEnd]:null;
 const root=$('#word-game');root.replaceChildren();root.setAttribute('aria-busy',String(busy));
 if(tab==='daily')renderDaily(root);else renderChallenge(root);
 const m=match();
 if(m&&m.status==='active'&&m.me.started&&!m.me.finished){const foot=make('div',undefined,root,'word-footer');
  btn('Give up',foot,async()=>{if(await window.OurGameUI.confirm({title:'Give up this word?',message:'It counts as not solved. If '+other()+' solves it, '+other()+' wins.',confirmLabel:'Give up'}))await command('giveup',{match:tab,id:m.id});},'word-leave');
  const ready=typed.length===m.length,submit=btn('Submit ✓',foot,()=>press('enter'),'word-submit'+(ready?' ready':''));submit.setAttribute('aria-label','Submit your word');}
 if(field){const again=root.querySelector('[data-field="'+field+'"]');if(again){again.focus();try{again.setSelectionRange(...caret);}catch{}}}
}
// Back button: an open game is its own history step, so Back closes it and you stay on Do Together.
function stepIn(){if(history.state?.panel!=='word')history.pushState({placeTab:'together',panel:'word'},'');}
function closePanel(){const own=history.state?.panel==='word';opened=false;show();if(own)history.back();}
function focusAttention(){const c=data?.challenge;if(c&&(c.status==='waiting'&&c.owner!==who||c.status==='active'&&!c.me.finished))tab='challenge';else if(data?.daily?.current?.status==='active'||!data?.daily?.current)tab='daily';opened=true;stepIn();render(true);}
function init(h){
 host=h;soundButton();window.OurGameUI?.registerChat?.($('.word-head'),()=>{opened=false;show();host.goto('chat');});
 $('#word-open').onclick=()=>{unlockSound();opened=true;stepIn();fullView=playing();render(true);host.revealPanel?.('#word-panel');};
 $('#word-size').onclick=()=>{fullView=!fullView;show();render(true);};
 $('#word-collapse').onclick=()=>closePanel();
 window.addEventListener('popstate',e=>{if(opened&&e.state?.panel!=='word'){opened=false;show();}});
 $('#word-chat').onclick=()=>{opened=false;show();host.goto('chat');};
 $('#word-sound').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('our-place:word:sound',soundOn?'on':'off');}catch{}soundButton();if(soundOn){unlockSound();tap();}};
 for(const t of ['daily','challenge'])$('#word-'+t+'-tab').onclick=()=>{tab=t;typed=[];$('#word-error').textContent='';render(true);};
 document.addEventListener('keydown',onKey);
 if(typeof setInterval!=='undefined')setInterval(tick,500);
}
window.OurWord={init,focusAttention,normalize,sync(s){
 if(!s?.word)return;crownHolder=s.crown?.holder??null;
 if(Number.isFinite(s.version)&&who===s.who&&s.version<version)return;
 if(who!==s.who){who=s.who;opened=false;tab='daily';typed=[];revealed.clear();celebrated.clear();signature='';
  try{const saved=JSON.parse(localStorage.getItem('our-place:word:'+who)||'null');if(saved){tab=saved.tab==='challenge'?'challenge':'daily';opened=!!saved.opened;fullView=saved.fullView!==false;}}catch{}}
 const first=!data;if(Number.isFinite(s.serverNow))clockOffset=s.serverNow-Date.now();version=s.version;
 const before=match()?.id;data=s.word;
 if(first)for(const m of [data.daily?.current,data.challenge])if(m?.me?.guesses)m.me.guesses.forEach((_,i)=>revealed.set((m===data.daily?.current?'daily':'challenge')+':'+m.id+':'+i,0));
 if(first)for(const [k,m] of [['daily',data.daily?.current],['challenge',data.challenge]])if(m&&['complete','void'].includes(m.status))celebrated.set(k+':'+m.id+':result',0);
 if(match()?.id!==before)typed=[];
 render();
},reset(){who=null;data=null;version=-1;signature='';historySignature='';typed=[];revealed.clear();celebrated.clear();opened=false;Object.assign(draft,{word:'',hint:'',note:'',photo:null,uploading:false});$('#word-game')?.replaceChildren();$('#word-records')?.replaceChildren();const inv=$('#word-invitation');if(inv)inv.hidden=true;document.body.classList.remove('word-locked');$('#word-panel').hidden=true;$('#word-open').hidden=false;}};
})();
