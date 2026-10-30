'use strict';
// All event positions use sixteenth-note steps; duration is in quarter-note beats.
const clone=v=>JSON.parse(JSON.stringify(v));
const GROUP_NAMES=['Drums','Bass','Keys','Textures'];
const PALETTE=['#e8ac4a','#76a99b','#bd9acb','#e97b56'];
const DEFAULT_SOUNDS=[['kick','snare','hat','rim','clap','shaker','tom','cowbell','kick','snare','hat','airhorn'],['super0','super1','super2','super3','super4','bass','super0','super1','super2','super3','super4','bass'],['skank','organ','melodica','super5','super6','skank','organ','melodica','super5','super6','skank','organ'],['super7','super8','super9','siren','laser','airhorn','rim','shaker','cowbell','clap','tom','hat']];
function makePad(sound,i){return {sound,name:'',volume:.75,pan:0,pitch:0,attack:.004,decay:.18,sustain:.6,release:.18,start:0,end:1,reverse:false,mode:'oneshot',cutoff:14000,resonance:1,tone:.5,param:.5,muteGroup:0,muted:false,loopBpm:80,stretch:false};}
function makePattern(length=16){return {length,events:[]};}
function makeProject(index=0){return {version:1,name:index===0?'Kingston after dark':`Untitled session ${index+1}`,bpm:80,swing:.1,master:.75,key:0,scale:'minor',octave:0,metronome:false,fx:{type:'delay',x:.4,y:.4},groups:GROUP_NAMES.map((name,g)=>({name,volume:.8,pan:0,send:g===2?.3:.12,mute:false,solo:false,pattern:1,pads:DEFAULT_SOUNDS[g].map(makePad),patterns:{'1':makePattern(32)}})),scenes:[],scene:0,song:[],songOn:false,live:false,quantize:true};}
function demoProject(){const p=makeProject();const add=(g,pad,steps,note=0)=>steps.forEach((step,i)=>p.groups[g].patterns[1].events.push({step,pad,velocity:pad===2?.4+(i%2)*.18:.78,note,duration:g===1?.7:.25,probability:1}));add(0,0,[8,24]);add(0,1,[8,24]);add(0,2,[0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30]);add(0,3,[6,22]);add(0,5,[3,7,11,15,19,23,27,31]);add(1,0,[0,6,16,22],-12);add(1,0,[12,28],-5);add(2,0,[2,6,10,14,18,22,26,30]);p.groups[2].pads[0].pitch=-12;return p;}
class RiddimSession{
 constructor(namespace=null){this.namespace=namespace;this.saveQueue=Promise.resolve();this.projects=Array.from({length:9},(_,i)=>makeProject(i));this.projects[0]=demoProject();this.current=0;this.group=0;this.pad=0;this.undoStack=[];this.redoStack=[];this.clipboard=null;this.sampleData={};this.bundledSamples={};this.installBundled();if(window.RIDDIM_HOSTED_STARTER)this.projects[0]=clone(window.RIDDIM_HOSTED_STARTER);this.ting=null;this.view='studio';this.dirty=false;this.onchange=()=>{};this.persistTimer=null;this.storageError='';}
 installBundled(){
  if(!Array.isArray(window.RIDDIM_HOSTED_BANKS)||typeof validateSoundBank!=='function'||typeof planSoundBank!=='function')return;
  try{const library={};for(const raw of window.RIDDIM_HOSTED_BANKS){const bank=validateSoundBank(JSON.stringify(raw));for(const entry of planSoundBank(bank,library).additions)library[entry.id]=entry.sample;}if(Object.keys(library).length>128)throw new Error('Hosted library too large');this.bundledSamples=library;this.mergeBundled();}catch(e){this.bundledSamples={};}
 }
 mergeBundledInto(samples){for(const [id,sample] of Object.entries(this.bundledSamples)){let target=id,n=2;if(Object.prototype.hasOwnProperty.call(samples,id)&&samples[id]?.data!==sample.data){target=id+'-hosted';while(Object.prototype.hasOwnProperty.call(samples,target)&&samples[target]?.data!==sample.data)target=id+'-hosted-'+n++;}if(!Object.prototype.hasOwnProperty.call(samples,target))samples[target]={...sample};}return samples;}
 mergeBundled(){this.mergeBundledInto(this.sampleData);}
 get p(){return this.projects[this.current];} get g(){return this.p.groups[this.group];} get selected(){return this.g.pads[this.pad];} get pattern(){return this.g.patterns[this.g.pattern];}
 snapshot(){return {projects:clone(this.projects),current:this.current,group:this.group,pad:this.pad,sampleData:{...this.sampleData},ting:clone(this.ting)};}
 checkpoint(){this.undoStack.push(this.snapshot());if(this.undoStack.length>40)this.undoStack.shift();this.redoStack=[];}
 changed(){this.dirty=true;this.onchange();clearTimeout(this.persistTimer);this.persistTimer=setTimeout(()=>this.save(),450);}
 edit(fn){
  if(this.p.live&&!this._liveEdit)throw new Error('Live lock is on. Unlock to edit.');
  this.checkpoint();const before=this.undoStack[this.undoStack.length-1];
  try{fn();this.changed();}catch(error){this.projects=before.projects;this.current=before.current;this.group=before.group;this.pad=before.pad;this.undoStack.pop();if(before.sampleData)this.sampleData=before.sampleData;this.ting=before.ting;throw error;}
 }
 undo(){if(!this.undoStack.length)return false;this.redoStack.push(this.snapshot());this.restore(this.undoStack.pop());return true;}
 redo(){if(!this.redoStack.length)return false;this.undoStack.push(this.snapshot());this.restore(this.redoStack.pop());return true;}
 restore(s){this.projects=s.projects;this.current=s.current;this.group=s.group;this.pad=s.pad;if(s.sampleData)this.sampleData=s.sampleData;this.mergeBundled();if(s.ting!==undefined)this.ting=s.ting;this.changed();}
 selectProject(i){if(i<0||i>8)return;this.current=i;this.group=0;this.pad=0;this.undoStack=[];this.redoStack=[];this.changed();}
 toggleStep(step,note=0){this.edit(()=>{const events=this.pattern.events;const i=events.findIndex(e=>e.pad===this.pad&&e.step===step&&e.note===note);if(i>=0)events.splice(i,1);else events.push({step,pad:this.pad,note,velocity:.8,duration:.25,probability:1});});}
 record(step,pad,note=0,velocity=.8){if(this.p.live&&!this.p.liveControls?.record)return;const pattern=this.pattern;pattern.events.push({step:((Math.round(step*24)/24)%pattern.length+pattern.length)%pattern.length,pad,note,velocity,duration:.25,probability:1});this.changed();}
 setPattern(g,n){n=Math.max(1,Math.min(99,n));const a=this.p.groups[g];if(!a.patterns[n])a.patterns[n]=makePattern(a.patterns[a.pattern].length);a.pattern=n;this.changed();}
 duplicatePattern(){this.edit(()=>{let n=1;while(this.g.patterns[n]&&n<=99)n++;if(n>99)throw new Error('All 99 patterns are in use.');this.g.patterns[n]=clone(this.pattern);this.g.pattern=n;});}
 commit(){this.edit(()=>{if(this.p.scenes.length>=99)throw new Error('A project can hold 99 scenes.');if(!this.p.scenes.length)this.p.scenes.push(this.sceneSnapshot());this.p.groups.forEach(g=>{let n=1;while(g.patterns[n]&&n<=99)n++;if(n>99)throw new Error('All patterns are in use.');g.patterns[n]=clone(g.patterns[g.pattern]);g.pattern=n;});this.p.scenes.push(this.sceneSnapshot());this.p.scene=this.p.scenes.length-1;});}
 sceneSnapshot(){return {name:`Scene ${this.p.scenes.length+1}`,patterns:this.p.groups.map(g=>g.pattern),mutes:this.p.groups.map(g=>g.mute),loops:this.p.groups.map(g=>g.pads.map(p=>!!p.muted))};}
 launchScene(i){const s=this.p.scenes[i];if(!s)return;this.p.scene=i;s.patterns.forEach((n,g)=>{this.p.groups[g].pattern=n;this.p.groups[g].mute=s.mutes[g];s.loops?.[g]?.forEach((m,p)=>this.p.groups[g].pads[p].muted=m);});this.changed();}
 clearPattern(){this.edit(()=>this.pattern.events=[]);}
 copyPattern(){this.clipboard=clone(this.pattern);}
 pastePattern(){if(this.clipboard)this.edit(()=>this.g.patterns[this.g.pattern]=clone(this.clipboard));}
 scaleNote(i){const scales={minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11],pentatonic:[0,3,5,7,10],chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],dorian:[0,2,3,5,7,9,10]};const a=scales[this.p.scale]||scales.minor;return this.p.key+12*this.p.octave+a[i%a.length]+12*Math.floor(i/a.length);}
 serialize(){return JSON.stringify({format:'riddim-private',version:1,projects:this.projects,current:this.current,samples:this.sampleData,ting:this.ting});}
 load(raw,silent=false){
  const x=JSON.parse(raw),bad=()=>{throw new Error('This project contains invalid music or control data.');};
  const number=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
  const fxNames=['delay','reverb','distortion','chorus','filter','compressor','phaser'];
  const validateFX=f=>f&&fxNames.includes(f.type)&&number(f.x,0,1)&&number(f.y,0,1);
  if(x.format!=='riddim-private'||x.version!==1||!Array.isArray(x.projects)||x.projects.length!==9)throw new Error('This is not a Riddim Private Studio project.');
  for(const p of x.projects){
   if(!p||typeof p.name!=='string'||!number(p.bpm,40,399)||!number(p.master,0,1)||!number(p.swing,0,1)||!validateFX(p.fx)||!Array.isArray(p.groups)||p.groups.length!==4)bad();
   for(const k of ['key','octave'])if(!number(p[k],-48,48))bad();
   if(p.timeSignature&&(!Array.isArray(p.timeSignature)||p.timeSignature.length!==2||!number(p.timeSignature[0],1,16)||![2,4,8,16].includes(p.timeSignature[1])))bad();
   if(!Number.isInteger(p.scene)||p.scene<0||p.scene>98)bad();if(p.output&&(!number(p.output.drive,0,1)||!number(p.output.speed,0,1)))bad();if(p.sidechain&&(!number(p.sidechain.sourceGroup,-1,3)||!Array.isArray(p.sidechain.targetGroups)||p.sidechain.targetGroups.some(n=>!Number.isInteger(n)||n<0||n>3)||!number(p.sidechain.amount,0,1)||!number(p.sidechain.length,.02,4)))bad();if(p.fxMemory&&Object.values(p.fxMemory).some(f=>!validateFX(f)))bad();
   if(!Array.isArray(p.scenes)||p.scenes.length>99||!Array.isArray(p.song)||p.song.length>99)bad();
   for(const g of p.groups){
    if(!g||typeof g.name!=='string'||!number(g.volume,0,1)||!number(g.pan,-1,1)||!number(g.send,0,1)||!Number.isInteger(g.pattern)||g.pattern<1||g.pattern>99||!g.patterns||!g.patterns[g.pattern]||Object.keys(g.patterns).length>99||!Array.isArray(g.pads)||g.pads.length!==12)bad();
    for(const pad of g.pads){
     if(!pad||typeof pad.sound!=='string'||(pad.name!==undefined&&typeof pad.name!=='string')||!['oneshot','key','legato','loop'].includes(pad.mode))bad();
     const limits={volume:[0,1],pan:[-1,1],pitch:[-48,48],attack:[0,8],decay:[0,8],sustain:[0,1],release:[0,8],start:[0,1],end:[0,1],cutoff:[0,24000],resonance:[0,24],tone:[0,1],param:[0,1],loopBpm:[30,399]};
     for(const [key,limitsForKey]of Object.entries(limits))if(!number(pad[key],...limitsForKey))bad();
     for(const [key,range]of Object.entries({midiChannel:[1,16],midiRoot:[0,127],stretchBars:[0,99]}))if(pad[key]!==undefined&&!number(pad[key],...range))bad();if(pad.highpassHz!==undefined&&!number(pad.highpassHz,0,24000))bad();
     if(pad.end<=pad.start)bad();
    }
    for(const pat of Object.values(g.patterns)){
     if(!pat||!Number.isInteger(pat.length)||pat.length<1||pat.length>12672||!Array.isArray(pat.events)||pat.events.length>100000)bad();
     for(const e of pat.events)if(!e||!number(e.step,0,pat.length-0.0000001)||!Number.isInteger(e.pad)||e.pad<0||e.pad>11||!number(e.velocity,0,1)||!number(e.note,-120,120)||!number(e.duration,0,64)||(e.probability!==undefined&&!number(e.probability,0,1)))bad();
     if(pat.automation&&(!Array.isArray(pat.automation)||pat.automation.some(e=>!e||!number(e.step,0,pat.length)||typeof e.param!=='string'||!number(e.value,-24000,24000))))bad();
    }
   }
   for(const scene of p.scenes)if(!scene||!Array.isArray(scene.patterns)||scene.patterns.length!==4||scene.patterns.some((n,g)=>!Number.isInteger(n)||!p.groups[g].patterns[n])||!Array.isArray(scene.mutes)||scene.mutes.length!==4)bad();
   if(p.song.some(n=>!Number.isInteger(n)||n<0||n>=p.scenes.length))bad();
  }
  if(x.samples&&(typeof x.samples!=='object'||Array.isArray(x.samples)||Object.values(x.samples).some(s=>!s||typeof s.name!=='string'||typeof s.data!=='string'||!/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/.test(s.data))))throw new Error('The project contains an invalid audio sample.');
  const merged=this.mergeBundledInto({...x.samples}),hosted=Object.entries(this.bundledSamples).filter(([id,s])=>Object.entries(merged).some(([key,v])=>(key===id||key===id+'-hosted'||key.startsWith(id+'-hosted-'))&&v.data===s.data)).length;if(Object.keys(merged).length-hosted>999)throw new Error('The project contains more than 999 user samples.');x.samples=merged;if(new Blob([JSON.stringify(x)]).size>200000000)throw new Error('Project archive is too large after adding hosted sounds.');
  if(x.ting&&(!Array.isArray(x.ting.samples)||x.ting.samples.length!==4||x.ting.samples.some(s=>typeof s!=='string')||!['dry','echo','spring','pixie','robot'].includes(x.ting.effect)))bad();
  if(x.ting?.config){if(JSON.stringify(x.ting.config).length>100000)bad();if(typeof window.TingRack==='function')new window.TingRack({ctx:null}).load(x.ting.config);}if(!silent)this.checkpoint();this.projects=x.projects;this.current=Math.max(0,Math.min(8,Number.isInteger(x.current)?x.current:0));this.sampleData=x.samples||{};this.mergeBundled();this.ting=x.ting||null;this.group=0;this.pad=0;if(!silent)this.changed();
 }
 async save(){
  if(this.namespace){if(this.storageUnavailable){this.storageError=this.storageError||'Snapshot storage unavailable. Autosave is disabled; export a project backup.';document.dispatchEvent(new CustomEvent('riddim-save'));return false;}const bundle=this.serialize();const operation=this.saveQueue.then(async()=>{try{await this.dbPut('workspace',bundle);this.dirty=false;this.storageError='';return true;}catch(e){this.storageError='Autosave failed. Export a project backup.';return false;}finally{document.dispatchEvent(new CustomEvent('riddim-save'));}});this.saveQueue=operation;return operation;}
  try{localStorage.setItem('riddim-session',JSON.stringify({projects:this.projects,current:this.current,version:1}));await this.dbPut('samples',this.sampleData);this.dirty=false;this.storageError='';}catch(e){this.storageError='Autosave failed. Export a project backup.';}document.dispatchEvent(new CustomEvent('riddim-save'));
 }
 async init(embedded=null){
  if(this.namespace){let existing,readFailed=false;try{existing=await this.dbGet('workspace');}catch(e){readFailed=true;this.storageUnavailable=true;this.storageError='Saved snapshot could not be read. Autosave is disabled; export a project backup.';}
   if(existing!==undefined&&existing!==null){try{this.load(existing,true);return true;}catch(e){this.storageUnavailable=true;this.storageError='Saved snapshot is invalid. Autosave is disabled; export a project backup.';if(embedded)this.load(embedded,true);return false;}}
   if(embedded){this.load(embedded,true);if(!readFailed)await this.save();}return false;
  }
  try{const raw=localStorage.getItem('riddim-session');if(raw){const x=JSON.parse(raw);if(x.projects?.length===9){this.projects=x.projects;this.current=x.current||0;}}this.sampleData=await this.dbGet('samples')||{};this.mergeBundled();}catch(e){this.storageError='Saved session unavailable. Export backups to keep your music safe.';}
 }
 async database(){return new Promise((ok,no)=>{if(!window.indexedDB)return no(new Error('IndexedDB unavailable'));const r=indexedDB.open(this.namespace?'riddim-private-'+this.namespace:'riddim-private',1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
 async dbGet(key){const db=await this.database();return new Promise((ok,no)=>{const r=db.transaction('data').objectStore('data').get(key);r.onsuccess=()=>{db.close();ok(r.result);};r.onerror=()=>{db.close();no(r.error);};});}
 async dbPut(key,value){const db=await this.database();return new Promise((ok,no)=>{const t=db.transaction('data','readwrite');t.objectStore('data').put(value,key);t.oncomplete=()=>{db.close();ok();};t.onerror=()=>{db.close();no(t.error);};});}
}
window.RiddimSession=RiddimSession;
