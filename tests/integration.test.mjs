import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../app/', import.meta.url);
const session = fs.readFileSync(new URL('session.js',root),'utf8');
const app = fs.readFileSync(new URL('app.js',root),'utf8');
const hashes=Object.fromEntries(['session.js','app.js','engine.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(new URL(f,root))).digest('hex')]));
const results=[];
function harness(){
 const node={classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},value:'',textContent:'',open:false};
 const document={querySelector:()=>node,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}};
 const intervals=new Map(),timeouts=new Map();let serial=0;
 class AudioStub {
  constructor(){this.ctx={currentTime:0,createBuffer:(channels,length,sampleRate)=>({numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,values:Array.from({length:channels},()=>new Float32Array(length)),copyToChannel(data,ch){this.values[ch].set(data)},getChannelData(ch){return this.values[ch]}})};this.calls=[];this.samples=new Map();this.voices=[];this.fx={type:'delay',x:.4,y:.4};}
  async init(){} setGroup(){} setMaster(){} setFX(){} setSidechain(){} allNotesOff(){} setMicGate(){} punch(){} disableMic(){}
  async stretchSample(id,ratio){return {id,ratio};} setSample(id,v){this.samples.set(id,v);} async sampleFromDataURL(id,data){this.samples.set(id,{restored:data});} bufferToWav(){return new Blob(['cropped']);}
  trigger(p,time,velocity,note,group){const call={pad:{...p},time,velocity,note,group,mutes:[],stops:[]};this.calls.push(call);return {setMuted:(v,t)=>call.mutes.push({v,t}),stop:t=>call.stops.push(t),setParam(){},pressure(){},ended:false};}
 }
 const sandbox={console,document,window:null,navigator:{},location:{protocol:'http:'},localStorage:{getItem(){return null},setItem(){}},CustomEvent:class{},RiddimAudio:AudioStub,RIDDIM_SOUNDS:[],setTimeout:(fn,ms)=>{let id=++serial;timeouts.set(id,{fn,ms});return id},clearTimeout:id=>timeouts.delete(id),setInterval:(fn,ms)=>{let id=++serial;intervals.set(id,{fn,ms});return id},clearInterval:id=>intervals.delete(id),FileReader:class{readAsDataURL(){this.result='data:audio/wav;base64,Y3JvcHBlZA==';this.onload()}},requestAnimationFrame:()=>1,performance:{now:()=>0},Blob,URL,Math};sandbox.window=sandbox;sandbox.addEventListener=()=>{};
 const context=vm.createContext(sandbox);vm.runInContext(session,context,{filename:'session.js'});
 const cut=app.lastIndexOf('(async()=>{await S.init()'); if(cut<0)throw Error('startup marker absent');
 vm.runInContext(app.slice(0,cut)+'\nrender=()=>{}; toast=()=>{}; updateSelectedPanel=()=>{}; click=()=>{}; applyMix=()=>{}; ready=true;',context,{filename:'app.js'});
 return {run:s=>vm.runInContext(s,context),context,intervals,timeouts};
}
async function test(name,fn){try{const detail=await fn(harness());results.push({name,status:'pass',detail});}catch(e){results.push({name,status:'fail',error:e.stack||String(e)});}}
function advance(h,n){for(let i=0;i<n;i++)h.run('A.ctx.currentTime=nextTime; schedule()');}
await test('unequal and repeated song positions reset pattern origin',h=>{
 h.run(`S.p.bpm=60; S.p.swing=0; S.p.groups.forEach(g=>{g.patterns[1]={length:16,events:[]};g.patterns[2]={length:32,events:[]};g.pattern=1}); S.p.scenes=[{patterns:[1,1,1,1],mutes:[false,false,false,false],loops:[]},{patterns:[2,2,2,2],mutes:[false,false,false,false],loops:[]}];S.p.song=[0,1,1,0];S.p.songOn=true;playing=true;nextTime=0;step=0;sceneStart=0;patternOrigins=[0,0,0,0]`);
 const at=[];for(let i=0;i<=96;i++){advance(h,1);if([0,15,16,47,48,79,80,95,96].includes(i))at.push({at:i,...h.run('({songPosition,sceneStart,origins:[...patternOrigins]})')});}
 assert.deepEqual(at.map(x=>x.songPosition),[0,0,1,1,2,2,3,3,0]);assert.deepEqual(at.map(x=>x.sceneStart),[0,0,16,16,48,48,80,80,96]);assert.ok(at.every(x=>x.origins.every(o=>o===x.sceneStart)));return at;
});
await test('scene loop mute reaches existing voice at boundary',h=>{
 h.run(`S.p.bpm=60;S.p.swing=0;S.p.groups.forEach(g=>{g.patterns[1]={length:16,events:[]};g.patterns[2]={length:16,events:[]}});S.p.groups[0].pads[0].mode='loop';S.p.groups[0].pads[0].muted=false;S.p.scenes=[{patterns:[1,1,1,1],mutes:[false,false,false,false],loops:[[false]]},{patterns:[2,2,2,2],mutes:[false,false,false,false],loops:[[true]]}];playing=true;step=0;nextTime=0;syncLoops(0);pendingScene=1`);
 advance(h,1);const call=h.run('A.calls[0]');assert.ok(call.mutes.some(m=>m.v===true&&m.t===0));return call.mutes;
});
await test('stopped sync does not start loop and stopped pattern recalls mutes',h=>{
 h.run(`S.p.groups[0].pads[0].mode='loop';S.p.groups[0].pads[0].muted=false;S.p.groups[0].patterns[2]={length:16,events:[],loopMutes:[true]};playing=false;syncLoops(0);queuePattern(0,2)`);
 assert.equal(h.run('A.calls.length'),0);assert.equal(h.run('S.p.groups[0].pads[0].muted'),true);return 'No audio trigger; saved mute recalled';
});
await test('tempo change records near integrated beat position',async h=>{
 h.run(`S.p.bpm=60; S.p.swing=0;S.p.quantize=false;S.pattern.length=128;S.pattern.events=[];playing=true;step=0;nextTime=0;transportStart=0;recordArmed=true`);advance(h,13);
 await h.run(`A.ctx.currentTime=3;setTempo(120)`);await h.run(`padDown(0,{pointerId:5,pressure:0.8})`);
 const note=h.run('S.pattern.events.at(-1)');assert.ok(Math.abs(note.step-12)<0.05,`recorded step ${note.step}`);return note.step;
});
await test('stretched loop offset follows integrated phase at 60 to 120 BPM',async h=>{
 h.run(`S.p.bpm=60;S.p.swing=0;Object.assign(S.selected,{mode:'loop',sound:'sample:test',stretch:true,loopBpm:60,muted:false});playing=true;step=0;nextTime=0;transportStart=0`);advance(h,13);
 await h.run(`A.ctx.currentTime=3;setTempo(120)`);const call=h.run('A.calls.at(-1)');assert.ok(Math.abs(call.pad._offset-1.5)<.01,`offset ${call.pad._offset}`);assert.equal(call.pad._playbackRate,1);return {offset:call.pad._offset,rate:call.pad._playbackRate};
});
await test('commit produces one undo checkpoint and undo restores scene',h=>{
 h.run(`S.undoStack=[]; S.p.scenes=[]; actions.commit()`);assert.equal(h.run('S.undoStack.length'),1);assert.equal(h.run('S.p.scenes.length'),2);h.run('S.undo()');assert.equal(h.run('S.p.scenes.length'),0);return 'One checkpoint, scene restored';
});
await test('96 PPQN precision and project round trip',h=>{
 h.run(`S.p.quantize=false;S.pattern.events=[];S.record(1+1/24,0,2,.7);S.sampleData['u']={name:'sample',data:'data:audio/wav;base64,AA=='};var encoded=S.serialize();var copy=new RiddimSession();copy.load(encoded)`);
 const data=h.run('({event:copy.pattern.events[0],sample:copy.sampleData.u,projectCount:copy.projects.length})');assert.ok(Math.abs(data.event.step-(1+1/24))<1e-10);assert.equal(data.sample.name,'sample');assert.equal(data.projectCount,9);return data;
});
await test('invalid project controls are rejected without replacing music',h=>{
 h.run(`var beforeMusic=S.serialize();var corrupt=JSON.parse(beforeMusic);corrupt.projects[0].master='bad';var rejected=false;try{S.load(JSON.stringify(corrupt))}catch(e){rejected=true}`);
 assert.equal(h.run('rejected'),true);assert.equal(h.run('S.serialize()===beforeMusic'),true);return 'Corrupt control rejected; music unchanged';
});
await test('external sample URLs are rejected',h=>{
 h.run(`var corrupt=JSON.parse(S.serialize());corrupt.samples={bad:{name:'bad',data:'https://example.invalid/audio.wav'}};var rejected=false;try{S.load(JSON.stringify(corrupt))}catch(e){rejected=true}`);
 assert.equal(h.run('rejected'),true);return 'Project samples must be embedded WAV data';
});
await test('commit at pattern capacity rolls back all groups',h=>{
 h.run(`S.p.scenes=[];for(let i=1;i<=99;i++)S.p.groups[1].patterns[i]={length:16,events:[]};var before=S.serialize();var rejected=false;try{S.commit()}catch(e){rejected=true}`);
 assert.equal(h.run('rejected'),true);assert.equal(h.run('S.serialize()===before'),true);return 'Capacity error is atomic';
});
await test('repeat ticks record successive hits and stop on release',async h=>{
 h.run(`S.p.bpm=60;S.p.quantize=false;S.pattern.events=[];playing=true;recordArmed=true;step=0;clockHistory=[{step:0,time:0,duration:.25}];repeatDivision=16`);
 await h.run(`padDown(0,{pointerId:44,pressure:.8})`);
 const timer=h.intervals.get(h.run('repeatTimer'));assert.equal(timer.ms,250);
 for(const t of [.25,.5,.75]){h.run(`A.ctx.currentTime=${t}`);timer.fn();}
 h.run(`padUp(0,{pointerId:44})`);const events=h.run('S.pattern.events.map(e=>({step:e.step,duration:e.duration}))');
 assert.deepEqual(Array.from(events,e=>e.step),[0,1,2,3]);assert.equal(h.intervals.has(h.run('repeatTimer')),false);return events;
});
await test('held key records actual held duration',async h=>{
 h.run(`S.p.quantize=false;S.pattern.events=[];S.selected.mode='key';playing=true;recordArmed=true;clockHistory=[{step:0,time:0,duration:.25}];A.ctx.currentTime=0`);
 await h.run(`padDown(0,{pointerId:7,pressure:.8})`);h.run(`A.ctx.currentTime=1.5;padUp(0,{pointerId:7})`);
 const duration=h.run('S.pattern.events[0].duration');assert.equal(duration,1.5);return {durationBeats:duration};
});
await test('timing correction selected pad uses triplet grid',h=>{
 h.run(`S.p.timing=12;S.pad=0;S.pattern.events=[{step:1.1,pad:0},{step:1.1,pad:1}];actions['quantize-notes']()`);
 const es=h.run('S.pattern.events');assert.ok(Math.abs(es[0].step-4/3)<1e-8);assert.equal(es[1].step,1.1);return es;
});
await test('swing applied to eighths and sixteenths, not triplets',h=>{
 h.run(`S.p.swing=.5`);const r=h.run(`(()=>{S.p.timing=8;let a=[0,1,2,3,4].map(i=>swingDelay(i,1));S.p.timing=16;let b=[0,1,2,3,4].map(i=>swingDelay(i,1));S.p.timing=12;let c=[0,1,2,3,4].map(i=>swingDelay(i,1));return {eighth:a,sixteenth:b,triplet:c}})()`);
 assert.deepEqual(Array.from(r.eighth),[0,.125,.25,.125,0]);assert.deepEqual(Array.from(r.sixteenth),[0,.125,0,.125,0]);assert.deepEqual(Array.from(r.triplet),[0,0,0,0,0]);return r;
});
await test('song without repeat stops at final boundary',h=>{
 h.run(`S.p.bpm=60;S.p.swing=0;S.p.groups.forEach(g=>{g.patterns[1]={length:16,events:[]};g.pattern=1});S.p.scenes=[{patterns:[1,1,1,1],mutes:[false,false,false,false],loops:[]}];S.p.song=[0];S.p.songOn=true;S.p.songLoop=false;playing=true;step=0;nextTime=0;sceneStart=0;timer=999`);
 advance(h,17);const pending=[...h.timeouts.values()].find(x=>x.ms===0);assert.ok(pending,'expected deferred pause');pending.fn();assert.equal(h.run('playing'),false);assert.equal(h.run('step'),0);return 'Stopped and reset at last scene end';
});
await test('immediate and pattern scene launches use distinct boundaries',h=>{
 h.run(`S.p.bpm=60;S.p.swing=0;S.p.groups.forEach(g=>{g.patterns[1]={length:32,events:[]};g.patterns[2]={length:32,events:[]};g.pattern=1});S.p.scenes=[{patterns:[1,1,1,1],mutes:[false,false,false,false],loops:[]},{patterns:[2,2,2,2],mutes:[false,false,false,false],loops:[]}];playing=true;step=0;nextTime=0;sceneStart=0`);
 advance(h,5);h.run(`S.p.sceneChange='immediate';queueScene(1)`);advance(h,1);assert.equal(h.run('sceneStart'),5);
 h.run(`applySceneAt(0,A.ctx.currentTime,0);S.p.sceneChange='pattern';queueScene(1)`);advance(h,26);assert.equal(h.run('S.p.scene'),0);advance(h,1);assert.equal(h.run('S.p.scene'),1);assert.equal(h.run('sceneStart'),32);return 'Immediate at 5; pattern end at 32';
});
await test('destructive crop undo restores sample data and audio cache',async h=>{
 h.run(`S.selected.sound='sample:u';S.selected.start=.25;S.selected.end=.75;S.sampleData.u={name:'source',data:'data:audio/wav;base64,b3JpZ2luYWw='};A.samples.set('u',{length:8,numberOfChannels:1,sampleRate:8,duration:1,getChannelData(){return new Float32Array([0,1,2,3,4,5,6,7])}});S.save=async()=>{}`);
 await h.run(`cropSample()`);assert.equal(h.run('S.sampleData.u.data'),'data:audio/wav;base64,Y3JvcHBlZA==');assert.equal(h.run('A.samples.get("u").length'),4);
 await h.run(`actions.undo()`);assert.equal(h.run('S.sampleData.u.data'),'data:audio/wav;base64,b3JpZ2luYWw=');assert.equal(h.run('A.samples.get("u").restored'),'data:audio/wav;base64,b3JpZ2luYWw=');return 'Source and cache restored';
});
await test('live vinyl ratio applies to sample and synth and restores on exit',async h=>{
 h.run(`S.p.bpm=80;S.p.groups[0].pads[0].sound='sample:u';S.p.groups[0].pads[0].pitch=2;S.p.groups[0].pads[1].sound='super0';S.p.groups[0].pads[1].pitch=0;actions['live-lock']()`);
 await h.run(`setTempo(160,true)`);const during=h.run(`({sample:audioPad(0,0),synth:audioPad(0,1)})`);assert.equal(during.sample._playbackRate,2);assert.equal(during.sample.pitch,2);assert.equal(during.synth.pitch,12);
 h.run(`actions['live-lock']()`);const after=h.run(`({bpm:S.p.bpm,sample:audioPad(0,0),synth:audioPad(0,1)})`);assert.equal(after.bpm,80);assert.equal(after.synth.pitch,0);assert.equal(after.sample.pitch,2);assert.equal(after.sample._playbackRate,undefined);return {during:{sampleRate:during.sample._playbackRate,synthPitch:during.synth.pitch},afterBpm:after.bpm};
});
const report={created:new Date().toISOString(),sourceHashes:hashes,method:'Node VM with real session.js and app.js excluding startup IIFE; stubbed browser and Web Audio; no signal, audio or device claim',results,pass:results.every(x=>x.status==='pass')};
fs.writeFileSync(new URL('integration-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
