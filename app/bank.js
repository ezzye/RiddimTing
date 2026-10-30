'use strict';
// Private, self-contained banks only. Keep this validator independent of the UI.
function validateSoundBank(text){
 if(typeof text!=='string'||text.length>32*1024*1024)throw new Error('Sound bank exceeds the 32 MB limit.');
 let bank;try{bank=JSON.parse(text);}catch{throw new Error('This sound bank is not valid JSON.');}
 const object=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new Error('Invalid sound bank fields.');};
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
 const str=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const optional=(v,max)=>v===undefined||v===null||str(v,max);
 object(bank,['format','version','id','name','provenance','license','samples']);
 if(bank.format!=='riddimting-soundbank'||bank.version!==1||!id(bank.id)||!str(bank.name,120)||!optional(bank.provenance,500)||!optional(bank.license,500)||!Array.isArray(bank.samples)||!bank.samples.length||bank.samples.length>128)throw new Error('Invalid sound bank header or sample count.');
 const seen=new Set();
 for(const s of bank.samples){object(s,['id','name','data','rootNote','bpm','category','source']);
  if(!id(s.id)||seen.has(s.id)||!str(s.name,120)||typeof s.data!=='string'||!/^data:audio\/wav;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s.data)||s.data.length<30||!(s.rootNote==null||(Number.isInteger(s.rootNote)&&s.rootNote>=0&&s.rootNote<=127))||!(s.bpm==null||(Number.isInteger(s.bpm)&&s.bpm>=40&&s.bpm<=399))||!optional(s.category,120)||!optional(s.source,500))throw new Error('Invalid sound bank sample. Use embedded WAV audio and valid metadata.');seen.add(s.id);
 }
 return bank;
}
function planSoundBank(bank,existing){
 const occupied=new Map(Object.entries(existing).map(([id,s])=>[id,s.data])), additions=[], skipped=[];
 for(const s of bank.samples){const base=`bank-${bank.id}-${s.id}`;let id=base,n=2;while(occupied.has(id)&&occupied.get(id)!==s.data)id=`${base}-${n++}`;
  if(occupied.has(id)){skipped.push(id);continue;}occupied.set(id,s.data);
  additions.push({id,sample:{name:s.name,data:s.data,bankId:bank.id,bankName:bank.name,provenance:bank.provenance??null,license:bank.license??null,rootNote:s.rootNote??null,bpm:s.bpm??null,category:s.category??null,source:s.source??null}});
 }
 return {additions,skipped};
}
