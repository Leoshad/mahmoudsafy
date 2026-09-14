(()=>{'use strict';
const $=s=>document.querySelector(s),dialog=$('#account-dialog');let busy=false,mode='settings';
function el(tag,text,parent,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;}
function button(text,parent,fn){const b=el('button',text,parent);b.type='button';b.onclick=fn;return b;}
async function api(path,data){const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});const v=await r.json();if(!r.ok)throw Error(v.error||'Please try again.');return v;}
function start(title){dialog.replaceChildren();el('h2',title,dialog);if(!dialog.open)dialog.showModal();const status=el('p','',dialog);status.setAttribute('role','status');return status;}
function field(form,label,name,type,autocomplete){const wrap=el('label','',form,'formfield');el('span',label,wrap);const input=el('input','',wrap);input.name=name;input.type=type;input.autocomplete=autocomplete;input.required=true;if(name==='password'||name==='confirm'){input.minLength=12;input.maxLength=128;}return input;}
function close(){if(!busy){dialog.querySelectorAll('input').forEach(i=>i.value='');dialog.close();}}
async function settings(){if(busy)return;mode='settings';const status=start('Account settings');status.textContent='Loading…';try{const profile=await api('account');status.textContent=profile.email;if(profile.pendingEmail)el('p','Awaiting confirmation: '+profile.pendingEmail,dialog);button('Change password',dialog,()=>edit('password'));button('Change email',dialog,()=>edit('email'));button('Done',dialog,close);}catch(e){status.textContent=e.message;button('Done',dialog,close);}}
function edit(next){if(busy)return;mode=next;const status=start(next==='email'?'Change email':next==='forgot'?'Reset your password':next==='reset'?'Choose a new password':'Change password');const form=el('form','',dialog);const fields={};
 if(next==='email'||next==='forgot')fields.email=field(form,next==='email'?'New email':'Your account email','email','email','email');
 if(next==='email'||next==='password')fields.current=field(form,'Current password','current','password','current-password');
 if(next==='password'||next==='reset'){el('p','Use 12–128 characters. A few unrelated words make a good password.',form,'muted');fields.password=field(form,'New password','password','password','new-password');fields.confirm=field(form,'Confirm new password','confirm','password','new-password');}
 if(next==='email')el('p','Confirm the change from your current and new inboxes. Your account and shared memories stay the same.',form,'muted');
 if(next==='forgot')el('p','Open the reset email in the same browser where you request it.',form,'muted');
 const secret=Object.values(fields).filter(i=>i.type==='password');if(secret.length)button('Show passwords',form,e=>{const show=secret[0].type==='password';secret.forEach(i=>i.type=show?'text':'password');e.currentTarget.textContent=show?'Hide passwords':'Show passwords';});
 const submit=el('button',next==='email'?'Continue':next==='forgot'?'Send reset link':'Save password',form,'primary');submit.type='submit';button('Cancel',form,close);
 if(next==='password')button('Forgot password?',form,()=>edit('forgot'));
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;status.textContent='';const data=Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value]));if(data.password&&data.password!==data.confirm){fields.confirm.setCustomValidity('The passwords do not match.');fields.confirm.reportValidity();return;}
 busy=true;for(const b of form.querySelectorAll('button'))b.disabled=true;
 try{const path=next==='forgot'?'recovery/request':next==='reset'?'recovery/finish':'account/'+next;const result=await api(path,data);Object.values(fields).forEach(i=>i.value='');form.hidden=true;status.textContent=result.message;button(next==='reset'?'Open Our Place':'Done',dialog,()=>{if(next==='reset')location.assign('/');else close();});}
 catch(err){status.textContent=err.message;}finally{busy=false;for(const b of form.querySelectorAll('button'))b.disabled=false;}
 };if(fields.confirm)fields.confirm.oninput=()=>fields.confirm.setCustomValidity('');fields[Object.keys(fields)[0]]?.focus();
}
$('#account-open').onclick=settings;$('#forgot-password').onclick=()=>edit('forgot');dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{dialog.querySelectorAll('input').forEach(i=>i.value='');});
window.OurAccount={reset(){if(['settings','email','password'].includes(mode)&&!busy)close();}};
const url=new URL(location.href),fragment=new URLSearchParams(url.hash.slice(1)),code=url.searchParams.get('code');
if(code||fragment.has('access_token')||fragment.has('error_description')||url.searchParams.has('error_description')){
 const error=fragment.get('error_description')||url.searchParams.get('error_description');url.searchParams.delete('code');url.searchParams.delete('error');url.searchParams.delete('error_code');url.searchParams.delete('error_description');url.hash='';history.replaceState(history.state,'',url.pathname+url.search);
 if(code){mode='reset';const status=start('Checking your reset link…');busy=true;api('recovery/exchange',{code}).then(()=>{busy=false;edit('reset');}).catch(e=>{busy=false;status.textContent=e.message;button('Request a new link',dialog,()=>edit('forgot'));button('Close',dialog,close);});}
 else{mode='confirmation';const status=start('Email confirmation');status.textContent=error?'This confirmation link expired or could not be verified. Return to Account settings and request a new confirmation.':'Confirmation received. Complete any remaining confirmation email, then sign in with your confirmed address.';button('Done',dialog,close);}
}
})();
