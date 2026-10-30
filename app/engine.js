/* Riddim audio: original Web Audio recreations; no manufacturer samples. */
(function (global) {
  'use strict';
  const clamp = (v, lo, hi, fallback) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback;
  const catalog = [
    ['kick','Deep Kick','Drums'],['kick-dry','Dry Kick','Drums'],['kick-dub','Dub Kick','Drums'],['kick-punch','Punch Kick','Drums'],
    ['snare','Classic Snare','Drums'],['snare-tight','Tight Snare','Drums'],['snare-dub','Dub Snare','Drums'],['snare-rim','Rim Snare','Drums'],
    ['hat','Closed Hat','Percussion'],['hat-open','Open Hat','Percussion'],['hat-metal','Metal Hat','Percussion'],['rim','Rim Click','Percussion'],
    ['clap','Hand Clap','Percussion'],['shaker','Shaker','Percussion'],['tom','Low Tom','Percussion'],['tom-high','High Tom','Percussion'],
    ['cowbell','Cowbell','Percussion'],['clave','Claves','Percussion'],['conga','Conga','Percussion'],['bongo','Bongo','Percussion'],
    ['bass','Sub Bass','Bass'],['bass-round','Round Bass','Bass'],['bass-growl','Growl Bass','Bass'],['bass-pluck','Pluck Bass','Bass'],
    ['skank','Guitar Skank','Keys'],['skank-bright','Bright Skank','Keys'],['organ','Bubble Organ','Keys'],['organ-dark','Dark Organ','Keys'],
    ['melodica','Melodica','Keys'],['melodica-soft','Soft Melodica','Keys'],['siren','Dub Siren','FX'],['siren-high','High Siren','FX'],
    ['siren-low','Low Siren','FX'],['laser','Laser','FX'],['airhorn','Air Horn','FX'],['noise-rise','Noise Rise','FX'],
    ['super0','Supertone 0: Tone','Supertone'],['super1','Supertone 1: Resonant','Supertone'],['super2','Supertone 2: Unison','Supertone'],
    ['super3','Supertone 3: Lead','Supertone'],['super4','Supertone 4: Pulse','Supertone'],['super5','Supertone 5: Tone','Supertone'],
    ['super6','Supertone 6: Sweep','Supertone'],['super7','Supertone 7: Sine Siren','Supertone'],['super8','Supertone 8: Square Siren','Supertone'],
    ['super9','Supertone 9: Saw Siren','Supertone']
  ];
  const RIDDIM_SOUNDS = catalog.map(([id,name,category]) => ({id,name,category,provenance:'Recreated'}));
  function wav(buffer) {
    const channels = Math.min(2,buffer.numberOfChannels), frames=buffer.length, bytes=44+frames*channels*2;
    const data = new ArrayBuffer(bytes), view = new DataView(data);
    const write = (at,s) => { for(let i=0;i<s.length;i++) view.setUint8(at+i,s.charCodeAt(i)); };
    write(0,'RIFF'); view.setUint32(4,bytes-8,true); write(8,'WAVE'); write(12,'fmt '); view.setUint32(16,16,true);
    view.setUint16(20,1,true); view.setUint16(22,channels,true); view.setUint32(24,buffer.sampleRate,true);
    view.setUint32(28,buffer.sampleRate*channels*2,true); view.setUint16(32,channels*2,true); view.setUint16(34,16,true);
    write(36,'data'); view.setUint32(40,frames*channels*2,true);
    const a=Array.from({length:channels},(_,i)=>buffer.getChannelData(i)); let p=44;
    for(let i=0;i<frames;i++) for(let c=0;c<channels;c++) { const n=clamp(a[c][i],-1,1,0); view.setInt16(p,n<0?n*32768:n*32767,true); p+=2; }
    return new Blob([data],{type:'audio/wav'});
  }
  class RiddimAudio {
    constructor() {
      this.ctx=null; this.samples=new Map(); this.voices=[]; this.groups=[]; this.groupSettings=[]; this.fx={type:'delay',x:.35,y:.3};
      this.masterVolume=.8;this._stretchCache=new Map();this._legatoVoices=new Map();this.sidechain={sourceGroup:-1,targetGroups:[],amount:0,length:.25,shape:'smooth'}; this._punch=[0,0,0,0]; this._serial=0; this._micGate=false; this._ting={type:'dry',amount:0,modulation:0};
    }
    async init() {
      if(this.ctx) { if(this.ctx.state==='suspended' && this.ctx.resume) await this.ctx.resume(); return this; }
      const AC=global.AudioContext||global.webkitAudioContext; if(!AC) throw new Error('Web Audio is not supported in this browser.');
      this._setup(new AC({latencyHint:'interactive'})); if(this.ctx.state==='suspended') await this.ctx.resume(); return this;
    }
    _setup(ctx) {
      this.ctx=ctx; this.master=ctx.createGain(); this.master.gain.value=this.masterVolume;
      this.analyser=ctx.createAnalyser(); this.analyser.fftSize=1024; this.outputDrive=ctx.createGain();this.outputCompressor=ctx.createDynamicsCompressor();this.outputCompressor.threshold.value=0;this.outputCompressor.ratio.value=1;this.outputDrive.connect(this.outputCompressor);this.outputCompressor.connect(this.limiter=ctx.createDynamicsCompressor()); this.limiter.threshold.value=-4;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15; this._setupPunch();this.limiter.connect(this.analyser);this.analyser.connect(ctx.destination);
      this.recordMaster=ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
      if(this.recordMaster) this.analyser.connect(this.recordMaster);
      this.fxInput=ctx.createGain(); this.fxReturn=ctx.createGain(); this.fxReturn.gain.value=.65; this.fxReturn.connect(this.master);
      for(let i=0;i<4;i++) {
        const input=ctx.createGain(), duck=ctx.createGain(), gain=ctx.createGain(), pan=ctx.createStereoPanner(), send=ctx.createGain();
        input.connect(duck);duck.connect(gain); gain.connect(pan); pan.connect(this.master); pan.connect(send); send.connect(this.fxInput);
        this.groups.push({input,duck,gain,pan,send}); if(!this.groupSettings[i])this.groupSettings[i]={volume:.8,pan:0,send:.2,mute:false,solo:false};
      }
      this._makeNoise(); this.setFX(this.fx.type,this.fx.x,this.fx.y); this.groupSettings.forEach((g,i)=>this.setGroup(i,g));
    }
    _makeNoise() {
      const b=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*2),this.ctx.sampleRate), a=b.getChannelData(0); let s=17391;
      for(let i=0;i<a.length;i++){s=(s*1664525+1013904223)>>>0; a[i]=(s/2147483648)-1;} this.noise=b;
    }
    setGroup(index, settings={}) {
      index=Math.floor(clamp(index,0,3,0)); if(!this.groupSettings[index])this.groupSettings[index]={volume:.8,pan:0,send:.2,mute:false,solo:false};Object.assign(this.groupSettings[index],settings); if(!this.ctx)return; const any=this.groupSettings.some(g=>g.solo);
      this.groupSettings.forEach((s,i)=>{const g=this.groups[i]; if(!g)return; const audible=!s.mute && (!any||s.solo);
        g.gain.gain.setTargetAtTime(audible?clamp(s.volume,0,1,.8):0,this.ctx.currentTime,.01);
        g.pan.pan.setTargetAtTime(clamp(s.pan,-1,1,0),this.ctx.currentTime,.01);
        g.send.gain.setTargetAtTime(clamp(s.send,0,1,.2),this.ctx.currentTime,.01); });
    }
    setSidechain(settings={}) {this.sidechain={sourceGroup:Math.floor(clamp(settings.sourceGroup,-1,3,-1)),sourceSound:typeof settings.sourceSound==='string'?settings.sourceSound:null,targetGroups:Array.isArray(settings.targetGroups)?settings.targetGroups.map(n=>Math.floor(Number(n))).filter(n=>n>=0&&n<4):[],amount:clamp(settings.amount,0,1,0),length:clamp(settings.length,.02,4,.25),shape:settings.shape||'smooth'};if(this.ctx)for(const g of this.groups){g.duck.gain.cancelScheduledValues(this.ctx.currentTime);g.duck.gain.setTargetAtTime(1,this.ctx.currentTime,.02);}}
    _duck(group,time,sound) {const s=this.sidechain;if(group!==s.sourceGroup||!s.amount||(s.sourceSound&&s.sourceSound!==sound))return;for(const i of s.targetGroups){const a=this.groups[i].duck.gain;try{a.cancelScheduledValues(time);a.setValueAtTime(1,time);a.linearRampToValueAtTime(Math.max(.001,1-s.amount),time+.005);if(s.shape==='hard')a.setValueAtTime(Math.max(.001,1-s.amount),time+s.length*.5);a.linearRampToValueAtTime(1,time+s.length);}catch(_){}}}
    setOutput(settings={}) {const drive=clamp(settings.drive,0,1,0),speed=clamp(settings.speed,0,1,.5);this.output={drive,speed};if(!this.ctx)return;const t=this.ctx.currentTime;this.outputDrive.gain.setTargetAtTime(1+drive*1.5,t,.02);this.outputCompressor.threshold.setTargetAtTime(-drive*26,t,.02);this.outputCompressor.ratio.setTargetAtTime(1+drive*11,t,.02);this.outputCompressor.attack.setTargetAtTime(.08-speed*.077,t,.02);this.outputCompressor.release.setTargetAtTime(.5-speed*.44,t,.02);}
    setMaster(value) { this.masterVolume=clamp(value,0,1,.8); if(this.master)this.master.gain.setTargetAtTime(this.masterVolume,this.ctx.currentTime,.01); }
    setFX(type,x=.35,y=.3) {
      type=String(type||'delay').toLowerCase(); x=clamp(x,0,1,.35); y=clamp(y,0,1,.3); this.fx={type,x,y}; if(!this.ctx)return;
      if(this._fxNodes && this._fxType===type && this._fxAdjust) {this._fxAdjust(x,y);return;}
      this._fxType=type; this._fxAdjust=null;
      if(this._fxNodes){ try{this.fxInput.disconnect();}catch(_){} this._fxNodes.forEach(n=>{try{if(n.stop)n.stop(); n.disconnect();}catch(_){}}); }
      const c=this.ctx, nodes=[], add=n=>(nodes.push(n),n), input=this.fxInput, out=this.fxReturn;
      if(type==='reverb'||type==='spring') {
        const conv=add(c.createConvolver()), len=Math.floor(c.sampleRate*(.5+2.5*x)), b=c.createBuffer(2,len,c.sampleRate);
        for(let ch=0;ch<2;ch++){let seed=123+ch*100; const a=b.getChannelData(ch); for(let i=0;i<len;i++){seed=(seed*1664525+1013904223)>>>0; a[i]=(seed/2147483648-1)*Math.pow(1-i/len,1.2+3*(1-y));}}
        conv.buffer=b; const colour=add(c.createBiquadFilter()),pre=add(c.createDelay(.2));colour.type='lowpass';colour.frequency.value=800+18000*y;pre.delayTime.value=.005+x*.12;input.connect(pre);pre.connect(conv);conv.connect(colour);colour.connect(out);this._fxAdjust=(a,b)=>{pre.delayTime.setTargetAtTime(.005+a*.12,c.currentTime,.03);colour.frequency.setTargetAtTime(800+18000*b,c.currentTime,.03);};
      } else if(type==='distortion'||type==='drive') {
        const sh=add(c.createWaveShaper()), filter=add(c.createBiquadFilter()), curve=new Float32Array(2048), k=1+x*70;
        for(let i=0;i<curve.length;i++){const v=i/(curve.length-1)*2-1; curve[i]=Math.tanh(v*k)/Math.tanh(k);}
        sh.curve=curve; sh.oversample='2x'; filter.type='lowpass'; filter.frequency.value=500+12000*y; const drive=add(c.createGain());drive.gain.value=.4+x*6;input.connect(drive);drive.connect(sh); sh.connect(filter); filter.connect(out);this._fxAdjust=(a,b)=>{drive.gain.setTargetAtTime(.4+a*6,c.currentTime,.03);filter.frequency.setTargetAtTime(500+12000*b,c.currentTime,.03);};
      } else if(type==='chorus'||type==='phaser') {
        const wet=add(c.createGain()), osc=add(c.createOscillator()), depth=add(c.createGain()); wet.gain.value=.75;
        if(type==='chorus'){const delay=add(c.createDelay(.1)); delay.delayTime.value=.015+x*.02; depth.gain.value=.002+y*.009; osc.frequency.value=.15+x*4; input.connect(delay); delay.connect(wet); osc.connect(depth); depth.connect(delay.delayTime);}
        else {const f=add(c.createBiquadFilter()); f.type='allpass'; f.frequency.value=500+x*1800; f.Q.value=1+y*7; depth.gain.value=200+y*900; osc.frequency.value=.1+x*3; input.connect(f); f.connect(wet); osc.connect(depth); depth.connect(f.frequency);}
        wet.connect(out); osc.start(); this._fxAdjust=(a,b)=>{osc.frequency.setTargetAtTime((type==='chorus'?.15:.1)+a*(type==='chorus'?4:3),c.currentTime,.03);depth.gain.setTargetAtTime(type==='chorus'?.002+b*.009:200+b*900,c.currentTime,.03);};
      } else if(type==='filter') {
        const f=add(c.createBiquadFilter()); f.type='lowpass'; f.frequency.value=120*Math.pow(140,x); f.Q.value=.2+y*14; input.connect(f); f.connect(out);this._fxAdjust=(a,b)=>{f.frequency.setTargetAtTime(120*Math.pow(140,a),c.currentTime,.03);f.Q.setTargetAtTime(.2+b*14,c.currentTime,.03);};
      } else if(type==='compressor') {
        const d=add(c.createDynamicsCompressor()); d.threshold.value=-40+35*x; d.knee.value=10; d.ratio.value=2+18*y; d.attack.value=.003; d.release.value=.18; input.connect(d); d.connect(out);this._fxAdjust=(a,b)=>{d.threshold.setTargetAtTime(-40+35*a,c.currentTime,.03);d.ratio.setTargetAtTime(2+18*b,c.currentTime,.03);};
      } else {
        const delay=add(c.createDelay(2)), feedback=add(c.createGain()), filter=add(c.createBiquadFilter()); delay.delayTime.value=.055+x*.8; feedback.gain.value=Math.min(.82,.08+y*.74); filter.type='lowpass'; filter.frequency.value=3600;
        input.connect(delay); delay.connect(filter); filter.connect(out); filter.connect(feedback); feedback.connect(delay);this._fxAdjust=(a,b)=>{delay.delayTime.setTargetAtTime(.055+a*.8,c.currentTime,.05);feedback.gain.setTargetAtTime(Math.min(.82,.08+b*.74),c.currentTime,.03);};
      }
      this._fxNodes=nodes;
    }
    punch(index,amount=1) {index=Math.floor(clamp(index,0,11,0));amount=clamp(amount,0,1,0);this._punch[index]=amount;if(this._punchStages){const stage=this._punchStages[index],t=this.ctx.currentTime;stage.dry.gain.setTargetAtTime(1-amount,t,.008);stage.wet.gain.setTargetAtTime(amount,t,.008);}return ()=>this.punch(index,0);}
    _setupPunch() {
      const c=this.ctx;this._punchStages=[];let prior=this.master;
      for(let i=0;i<12;i++){
        const input=c.createGain(),output=c.createGain(),dry=c.createGain(),wet=c.createGain();prior.connect(input);input.connect(dry);dry.connect(output);wet.connect(output);wet.gain.value=0;dry.gain.value=1;
        const filter=(type,freq,q=1)=>{const n=c.createBiquadFilter();n.type=type;n.frequency.value=freq;n.Q.value=q;input.connect(n);n.connect(wet);return n;};
        const delay=(seconds,feedback)=>{const d=c.createDelay(2),fb=c.createGain();d.delayTime.value=seconds;fb.gain.value=feedback;input.connect(d);d.connect(wet);d.connect(fb);fb.connect(d);return d;};
        const lfo=(target,hz,depth,base)=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=hz;g.gain.value=depth;target.value=base;o.connect(g);g.connect(target);o.start();};
        if(i===0){const g=c.createGain();input.connect(g);g.connect(wet);lfo(g.gain,10,.5,.5);}
        else if(i===1){this._pitchShift(input,wet,.5);}
        else if(i===2){const sh=c.createWaveShaper(),v=new Float32Array(4096);for(let j=0;j<v.length;j++){const x=j/(v.length-1)*2-1;v[j]=Math.round(x*12)/12;}sh.curve=v;input.connect(sh);sh.connect(wet);}
        else if(i===3)filter('lowpass',650,.8);
        else if(i===4)filter('highpass',900,.8);
        else if(i===5)delay(.31,.48);
        else if(i===6)delay(.125,.55);
        else if(i===7){const d=delay(.05,0); lfo(d.delayTime,.35,.045,.05);}
        else if(i===8){const f=filter('lowpass',1300,4);lfo(f.frequency,2,1100,1300);}
        else if(i===9){this._pitchShift(input,wet,1.25);}
        else if(i===10){const f=filter('bandpass',1000,3);lfo(f.frequency,4,800,1000);}
        else delay(.045,.68);
        this._punchStages.push({dry,wet});prior=output;
      }
      prior.connect(this.outputDrive);
    }
    _pitchShift(input,output,ratio,track) {
      const c=this.ctx,window=.09,rate=Math.abs(1-ratio)/window;
      for(let k=0;k<2;k++){
        const d=c.createDelay(.2),g=c.createGain(),saw=c.createOscillator(),fade=c.createOscillator(),amp=c.createGain(),gainDepth=c.createGain();
        const re=new Float32Array(24),im=new Float32Array(24);for(let n=1;n<24;n++)im[n]=((n%2)?1:-1)*(k&&n%2?-1:1)/n*(ratio>1?-1:1);
        saw.setPeriodicWave(c.createPeriodicWave(re,im));saw.frequency.value=rate;amp.gain.value=window*.45;d.delayTime.value=window*.5;saw.connect(amp);amp.connect(d.delayTime);
        const fr=new Float32Array([0,k?-1:1]),fi=new Float32Array(2);fade.setPeriodicWave(c.createPeriodicWave(fr,fi));fade.frequency.value=rate;gainDepth.gain.value=.5;g.gain.value=.5;fade.connect(gainDepth);gainDepth.connect(g.gain);
        input.connect(d);d.connect(g);g.connect(output);saw.start();fade.start();if(track)track.push(d,g,saw,fade,amp,gainDepth);
      }
    }
    setSample(id,buffer) { if(!id||!buffer||!buffer.getChannelData) throw new Error('A sample ID and AudioBuffer are required.'); this.samples.set(String(id),buffer);for(const key of this._stretchCache.keys())if(key.startsWith(String(id)+'|'))this._stretchCache.delete(key);return buffer; }
    async stretchSample(id,ratio) {
      if(!this.ctx)await this.init(); const input=this.samples.get(String(id));if(!input)throw new Error('Sample not found');
      ratio=clamp(ratio,.1,10,1);const key=String(id)+'|'+ratio.toFixed(6);if(this._stretchCache.has(key))return this._stretchCache.get(key);if(Math.abs(ratio-1)<.00001)return input;
      const size=2048,hop=512,search=80,channels=input.numberOfChannels,outLength=Math.max(1,Math.round(input.length/ratio));
      const out=this.ctx.createBuffer(channels,outLength,input.sampleRate),dest=Array.from({length:channels},(_,i)=>out.getChannelData(i)),src=Array.from({length:channels},(_,i)=>input.getChannelData(i)),weights=new Float32Array(outLength);
      const window=new Float32Array(size);for(let i=0;i<size;i++)window[i]=Math.sin(Math.PI*(i+.5)/size)**2;
      let previous=0, grain=0;for(let outPos=0;outPos<outLength;outPos+=hop,grain++){
        const ideal=Math.round(outPos*ratio);let start=Math.max(0,Math.min(input.length-1,ideal));
        if(grain>0){let best=-Infinity;const predicted=Math.max(0,Math.min(input.length-1,previous+Math.round(hop*ratio)));for(let off=-search;off<=search;off+=8){const candidate=predicted+off;if(candidate<0||candidate+size>=input.length)continue;let dot=0,a2=1e-8,b2=1e-8;for(let k=0;k<size-hop;k+=12){const at=outPos+k;if(at>=outLength||weights[at]<.001)continue;const a=dest[0][at]/weights[at],b=src[0][candidate+k];dot+=a*b;a2+=a*a;b2+=b*b;}const score=dot/Math.sqrt(a2*b2)-Math.abs(off)*.00002;if(score>best){best=score;start=candidate;}}}
        previous=start;for(let j=0;j<size&&outPos+j<outLength&&start+j<input.length;j++){const w=window[j],at=outPos+j;weights[at]+=w;for(let ch=0;ch<channels;ch++)dest[ch][at]+=src[ch][start+j]*w;}
        if(grain%128===127)await new Promise(resolve=>setTimeout(resolve,0));
      }
      for(let i=0;i<outLength;i++)if(weights[i]>1e-8)for(let ch=0;ch<channels;ch++)dest[ch][i]/=weights[i];
      this._stretchCache.set(key,out);while(this._stretchCache.size>24)this._stretchCache.delete(this._stretchCache.keys().next().value);return out;
    }
    async importSample(file,id) {
      if(!this.ctx) await this.init(); const buf=await file.arrayBuffer(); const audio=await this.ctx.decodeAudioData(buf.slice(0));
      id=String(id||('sample-'+Date.now().toString(36)+'-'+(++this._serial))); this.setSample(id,audio);
      return {id,name:file.name||id,duration:audio.duration,channels:audio.numberOfChannels};
    }
    bufferToWav(buffer) { return wav(buffer); }
    async sampleToDataURL(id) {const b=this.samples.get(id); if(!b)throw new Error('Sample not found'); return new Promise((resolve,reject)=>{const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(wav(b));});}
    async sampleFromDataURL(id,data) {if(!this.ctx)await this.init(); const ab=await (await fetch(data)).arrayBuffer(); return this.setSample(id,await this.ctx.decodeAudioData(ab));}
    trigger(pad,time,velocity=.8,semitone=0,group=0) {
      if(!this.ctx) return null; const c=this.ctx; time=Number.isFinite(time)?Math.max(c.currentTime,time):c.currentTime; pad=pad||{};
      group=Math.floor(clamp(group,0,3,0)); this._duck(group,time,String(pad._sourceSound||pad.sound||'kick'));if(pad.midiOnly)return null; velocity=clamp(velocity,0,1,.8); let id=String(pad.sound||'kick'); if(this._punch[10]>0 && !id.startsWith('sample:')){const pool=RIDDIM_SOUNDS.filter(s=>s.category!=='Supertone');id=pool[(++this._serial*13)%pool.length].id;}
      const pitch=clamp(pad.pitch,-36,36,0)+clamp(semitone,-48,48,0), ratio=Math.pow(2,pitch/12);
      const attack=clamp(pad.attack,0,4,.005), decay=clamp(pad.decay,.01,8,.2), sustain=clamp(pad.sustain,0,1,.5), release=clamp(pad.release,.005,8,.18);
      const mode=pad.mode||'oneshot',v=velocity, amp=c.createGain(), audible=c.createGain(), level=c.createGain(), filter=c.createBiquadFilter(), highpass=c.createBiquadFilter(),pan=c.createStereoPanner();level.gain.value=clamp(pad.volume,0,1,.8);highpass.type='highpass';highpass.frequency.value=clamp(pad.highpassHz,10,12000,10);
      const cutoff=clamp(pad.cutoff,40,20000,18000), q=clamp(pad.resonance,0,20,.3), tone=clamp(pad.tone,0,1,.5), param=clamp(pad.param,0,1,.5);
      filter.type='lowpass'; filter.frequency.value=Math.min(c.sampleRate*.45,cutoff); filter.Q.value=q; pan.pan.value=clamp(pad.pan,-1,1,0);
      amp.connect(audible);audible.connect(level);level.connect(filter);filter.connect(highpass);highpass.connect(pan); pan.connect(this.groups[group].input);
      amp.gain.setValueAtTime(0,time); amp.gain.linearRampToValueAtTime(v,time+Math.max(.001,attack));
      const tonal=/^(bass|skank|organ|melodica|super|siren|airhorn)/.test(id), defaultLen=tonal?.65:.35;
      const held=mode==='key'||mode==='legato'||mode==='loop'; let length=clamp(pad.length,.04,12,defaultLen);
      const sources=[],soundOscillators=[];let sampleSource=null, stopped=false, ended=0, cleanupTimer;
      const source=n=>{sources.push(n); n.onended=()=>{ended++; if(ended>=sources.length) cleanup();}; return n;};
      const cleanup=()=>{clearTimeout(cleanupTimer); for(const n of sources){try{n.disconnect();}catch(_){}} try{amp.disconnect();audible.disconnect();level.disconnect();filter.disconnect();highpass.disconnect();pan.disconnect();}catch(_){} voice.ended=true;if(this._legatoVoices.get(group+'|'+id)===voice)this._legatoVoices.delete(group+'|'+id);this.voices=this.voices.filter(a=>a!==voice);};
      const osc=(type,freq,level=1)=>{const o=source(c.createOscillator()), g=c.createGain(); o.type=type;soundOscillators.push(o); o.frequency.setValueAtTime(Math.max(1,freq*ratio),time); g.gain.value=level; o.connect(g); g.connect(amp); o.start(time); return o;};
      const noise=(level=1,kind='highpass',freq=2500)=>{const n=source(c.createBufferSource()), f=c.createBiquadFilter(), g=c.createGain(); n.buffer=this.noise; n.loop=held; f.type=kind; f.frequency.value=Math.min(c.sampleRate*.45,freq); g.gain.value=level; n.connect(f); f.connect(g); g.connect(amp); n.start(time); return n;};
      let pressureOsc=null,pressureBase=0,sirenLfo=null,sirenDepth=null,samplePosition=null,sampleRateRatio=1,legatoConnected=false; let sample=this.samples.get(id.replace(/^sample:/,''));
      if(id.startsWith('sample:')) {
        if(!sample){amp.disconnect();audible.disconnect();level.disconnect();filter.disconnect();highpass.disconnect();pan.disconnect();return null;}
        let start=clamp(pad.start,0,.999,0), end=clamp(pad.end,.001,1,1); if(end<=start)end=Math.min(1,start+.001);
        if(pad.reverse){const b=c.createBuffer(sample.numberOfChannels,sample.length,sample.sampleRate); for(let ch=0;ch<b.numberOfChannels;ch++){const src=sample.getChannelData(ch),dst=b.getChannelData(ch); for(let i=0;i<src.length;i++)dst[i]=src[src.length-1-i];} sample=b; const a=start;start=1-end;end=1-a;}
        const n=source(c.createBufferSource());sampleSource=n; n.buffer=sample; n.playbackRate.value=ratio*clamp(pad._playbackRate,.125,8,1);sampleRateRatio=n.playbackRate.value;n.loop=mode==='loop'; n.loopStart=start*sample.duration; n.loopEnd=end*sample.duration; n.connect(amp);
        const legatoKey=group+'|'+id,old=mode==='legato'?this._legatoVoices.get(legatoKey):null;samplePosition=start*sample.duration;
        if(old&&!old.ended&&(old.releaseAt===null||old.releaseAt>time)&&old.samplePosition!==null){samplePosition=Math.min(end*sample.duration-.001,old.samplePosition+Math.max(0,time-old.startedAt)*old.sampleRateRatio);old.stop(time);legatoConnected=true;amp.gain.cancelScheduledValues(time);amp.gain.setValueAtTime(v,time);}
        if(n.loop){const span=n.loopEnd-n.loopStart, offset=clamp(pad._offset,0,86400,0);samplePosition=n.loopStart+(offset*n.playbackRate.value)%span;n.start(time,samplePosition);} else n.start(time,samplePosition,Math.max(.001,end*sample.duration-samplePosition)); length=Math.max(.001,end*sample.duration-samplePosition)/n.playbackRate.value;
      } else if(id.startsWith('kick')) {
        const kick=id==='kick-dry'?{length:.23,start:170,end:72,drop:.045,click:2400}:id==='kick-punch'?{length:.31,start:280,end:65,drop:.065,click:4200}:id==='kick-dub'?{length:.7,start:155,end:39,drop:.19,click:800}:{length:.52,start:190,end:46,drop:.12,click:1300};length=kick.length;const o=osc('sine',kick.start,1);o.frequency.setValueAtTime((kick.start+40*param)*ratio,time);o.frequency.exponentialRampToValueAtTime(kick.end*ratio,time+kick.drop);noise(.12,'lowpass',kick.click);
      } else if(id.startsWith('snare')) {length=id==='snare-dub'?.48:.23; noise(.65,'highpass',id==='snare-tight'?2500:1300); const o=osc('triangle',id==='snare-rim'?310:180,.5); o.frequency.exponentialRampToValueAtTime(100*ratio,time+.12);}
      else if(id.startsWith('hat')||id==='shaker') {length=id==='hat-open'?.42:.11; noise(.65,'highpass',id==='shaker'?4500:7000); if(id==='hat-metal')osc('square',5100,.09);}
      else if(id==='rim'||id==='clave') {length=.10; osc('square',id==='clave'?2100:850,.32); noise(.15,'bandpass',1600);}
      else if(id==='clap') {length=.24; noise(.75,'bandpass',1500);}
      else if(id.startsWith('tom')||id==='conga'||id==='bongo'){length=.28; const o=osc('sine',id==='tom-high'?220:id==='bongo'?330:id==='conga'?260:125,.9);o.frequency.exponentialRampToValueAtTime((id==='tom'?85:150)*ratio,time+.18);noise(.12,'lowpass',1800);}
      else if(id==='cowbell'){length=.22;osc('square',540,.24);osc('square',800,.24);}
      else if(id.startsWith('bass')) {length=.75; osc(id==='bass-growl'?'sawtooth':id==='bass-pluck'?'triangle':'sine',id==='bass-pluck'?65.4:55,.8); if(id==='bass-round')osc('triangle',55,.22);}
      else if(id.startsWith('skank')) {length=.2; [1,1.26,1.5].forEach(f=>osc(id==='skank-bright'?'sawtooth':'triangle',220*f,.23));}
      else if(id.startsWith('organ')) {length=.35;const dark=id==='organ-dark';[1,2,3].forEach((f,i)=>osc('sine',220*f,(dark?[.54,.08,.025]:[.45,.2,.1])[i]));if(dark)filter.frequency.value=Math.min(filter.frequency.value,1300);}
      else if(id.startsWith('melodica')) {length=.8;const soft=id==='melodica-soft';osc(soft?'triangle':'sawtooth',261.63,soft?.5:.5);osc('square',261.63,soft?.06:.12);if(soft)filter.frequency.value=Math.min(filter.frequency.value,1600);}
      else if(id.startsWith('siren')) {length=1.2; const base=id==='siren-low'?420:id==='siren-high'?900:650; const o=osc('sine',base,.7); pressureOsc=o; pressureBase=base*ratio; o.frequency.setValueAtTime(base*ratio,time); o.frequency.linearRampToValueAtTime((base*(1.2+param))*ratio,time+.25);o.frequency.linearRampToValueAtTime(base*ratio,time+.6);}
      else if(id==='laser') {length=.45; const o=osc('sawtooth',1800,.5);o.frequency.exponentialRampToValueAtTime(130*ratio,time+.4);}
      else if(id==='airhorn') {length=1; [1,1.01,1.5].forEach(f=>osc('sawtooth',220*f,.24));}
      else if(id==='noise-rise'){length=1;noise(.55,'bandpass',1200+tone*4500);}
      else if(id.startsWith('super')) {length=.8;const n=Math.floor(clamp(Number(id.slice(5)),0,9,0)); const wave=['sine','triangle','square','sawtooth','square','sawtooth','sine','triangle','sine','sawtooth'][n];
        const o=osc(n>=7?['sine','square','sawtooth'][n-7]:wave,n>=7?450+param*550:130.81,n===2||n===3||n===4||n===5||n>=8?.35:.7); if(n>=7){pressureOsc=o;pressureBase=(300+tone*900)*ratio;o.frequency.setValueAtTime(pressureBase,time);sirenLfo=source(c.createOscillator());sirenDepth=c.createGain();sirenLfo.frequency.value=.5+param*9;sirenDepth.gain.value=pressureBase*.3;sirenLfo.connect(sirenDepth);sirenDepth.connect(o.frequency);sirenLfo.start(time);if(n===8)osc('square',(300+tone*900)*2,.12);} if(n===4)o.setPeriodicWave(c.createPeriodicWave(new Float32Array([0,0,0,0,0]),new Float32Array([0,1,.35,.15,.1])));
        if(n===5){const a=osc('sawtooth',130.81,.25);a.detune.value=8+param*25;} if(n===6){const mod=source(c.createOscillator()),depth=c.createGain();mod.frequency.value=392.43*ratio;depth.gain.value=120+param*500;mod.connect(depth);depth.connect(o.frequency);mod.start(time);}
        if(n===2){const u=osc('sawtooth',130.81,.2);u.detune.value=5+param*30;} if(n===1||n===3){filter.frequency.value=300+tone*9000;filter.Q.value=1+param*8;} if(n===6){o.frequency.exponentialRampToValueAtTime((65+tone*300)*ratio,time+.1+param*.7);}
      } else {length=.2;osc('sine',220,.5);}
      const decayAt=time+Math.max(.001,attack)+Math.max(.01,decay);
      if(held){amp.gain.linearRampToValueAtTime(v*sustain,decayAt);} else {const end=time+Math.max(.03,length); amp.gain.setTargetAtTime(.0001,time+Math.max(.001,attack),Math.max(.015,length/5)); for(const n of sources){try{n.stop(end+.1);}catch(_){}}}
      const baseDetunes=soundOscillators.map(o=>o.detune.value);const voice={ended:false,isReleased:false,releaseAt:null,samplePosition,sampleRateRatio,startedAt:time,stop:(when)=>{when=Number.isFinite(when)?Math.max(c.currentTime,time,when):Math.max(c.currentTime,time);if(voice.releaseAt!==null&&when>=voice.releaseAt)return;stopped=true;voice.isReleased=when<=c.currentTime;voice.releaseAt=when;try{const elapsed=Math.max(0,when-time),at=Math.max(.001,attack);let level;if(legatoConnected)level=v*sustain;else if(elapsed<at)level=v*elapsed/at;else if(held)level=elapsed<at+decay?v*(1-(1-sustain)*(elapsed-at)/decay):v*sustain;else level=v*Math.exp(-Math.max(0,elapsed-at)/Math.max(.015,length/5));amp.gain.cancelScheduledValues(when);amp.gain.setValueAtTime(Math.max(.0001,level),when);amp.gain.exponentialRampToValueAtTime(.0001,when+release); for(const n of sources)try{n.stop(when+release+.02);}catch(_){} }catch(_){}},cancel:()=>{const now=c.currentTime;amp.gain.cancelScheduledValues(now);amp.gain.setValueAtTime(0,now);for(const n of sources)try{n.stop(now);}catch(_){}cleanup();},setMuted:(muted,when)=>{const t=Number.isFinite(when)?Math.max(c.currentTime,when):c.currentTime;audible.gain.setTargetAtTime(muted?0:1,t,.005);},setParams:(params={},when)=>{const t=Number.isFinite(when)?Math.max(c.currentTime,time,when):Math.max(c.currentTime,time);if(voice.ended||(voice.releaseAt!==null&&t>=voice.releaseAt+release))return;const set=(a,v)=>a.setTargetAtTime(v,t,.015);
        if(params.cutoff!==undefined)set(filter.frequency,clamp(params.cutoff,40,c.sampleRate*.45,18000));if(params.highpassHz!==undefined)set(highpass.frequency,clamp(params.highpassHz,10,c.sampleRate*.45,10));if(params.resonance!==undefined)set(filter.Q,clamp(params.resonance,0,20,.3));if(params.pan!==undefined)set(pan.pan,clamp(params.pan,-1,1,0));if(params.volume!==undefined)set(level.gain,clamp(params.volume,0,1,.8));
        if(params.pitch!==undefined){const offset=(clamp(params.pitch,-36,36,0)-clamp(pad.pitch,-36,36,0))*100;soundOscillators.forEach((o,i)=>set(o.detune,baseDetunes[i]+offset));if(sampleSource)set(sampleSource.detune,offset);}
        if(id.startsWith('super')){const n=Number(id.slice(5));if(n>=7){if(params.tone!==undefined){pressureBase=(300+clamp(params.tone,0,1,.5)*900)*ratio;pressureOsc.frequency.cancelScheduledValues(t);set(pressureOsc.frequency,pressureBase);if(sirenDepth)set(sirenDepth.gain,pressureBase*.3);if(n===8&&soundOscillators[1])set(soundOscillators[1].frequency,pressureBase*2);}if(params.param!==undefined&&sirenLfo)set(sirenLfo.frequency,.5+clamp(params.param,0,1,.5)*9);}else{if(params.tone!==undefined)set(filter.frequency,Math.min(c.sampleRate*.45,100+clamp(params.tone,0,1,.5)*12000));if(params.param!==undefined){const q=clamp(params.param,0,1,.5);if(n===1||n===3)set(filter.Q,.4+q*10);else if(n===2&&soundOscillators[1])set(soundOscillators[1].detune,5+q*30);else if(n===4&&soundOscillators[0]){const real=new Float32Array(9),imag=new Float32Array(9);for(let h=1;h<9;h++)imag[h]=Math.sin(Math.PI*h*(.15+q*.7))/h;soundOscillators[0].setPeriodicWave(c.createPeriodicWave(real,imag));}else if(n===0||n===5||n===6)set(filter.Q,.3+q*4);}}}},
        setParam:(name,value,when)=>voice.setParams({[name]:value},when),pressure:(value,when)=>{if(pressureOsc){const t=Number.isFinite(when)?Math.max(c.currentTime,when):c.currentTime;pressureOsc.frequency.cancelScheduledValues(t);pressureOsc.frequency.setTargetAtTime(pressureBase*(1+clamp(value,0,1,0)),t,.02);}},group,pad:id,sourceSound:pad._sourceSound||id,baseVinyl:pad._vinylRate||1};
      voice.stereo=!!(sample&&sample.numberOfChannels>1);if(mode==='legato'&&sample)this._legatoVoices.set(group+'|'+id,voice);this.voices.push(voice); const offline=typeof global.OfflineAudioContext==='function' && c instanceof global.OfflineAudioContext;const max=this.voices.some(v=>v.stereo)?12:16;if(!offline && this.voices.length>max){const old=this.voices.find(v=>v!==voice&&!v.isLoop)||this.voices[0];this.voices=this.voices.filter(v=>v!==old);old.ended=true;old.stop(time);} voice.isLoop=mode==='loop';
      if(!held && !(c instanceof (global.OfflineAudioContext||Function))) cleanupTimer=setTimeout(cleanup,Math.max(1000,(time-c.currentTime+length+1)*1000));
      return voice;
    }
    allNotesOff() {this.voices.slice().forEach(v=>v.cancel?v.cancel():v.stop());}
    meter() {if(!this.analyser)return {peak:0,rms:0}; const a=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(a);let peak=0,sum=0;for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;}return {peak,rms:Math.sqrt(sum/a.length)};}
    async enableMic() {
      if(!this.ctx)await this.init(); if(this.micStream)return this.micStream;
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Microphone access requires a secure context and browser permission.');
      this.micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:2}}); this.micSource=this.ctx.createMediaStreamSource(this.micStream); this.micIn=this.ctx.createGain(); this.micSource.connect(this.micIn);
      this.micGate=this.ctx.createGain(); this.micGate.gain.value=this._micGate?1:0; this.micIn.connect(this.micGate); this.micGate.connect(this.master);
      this.sampleBus=this.ctx.createMediaStreamDestination(); this.micIn.connect(this.sampleBus); this.setTing(this._ting.type,this._ting.amount,this._ting.modulation); return this.micStream;
    }
    disableMic() { if(this.micStream)this.micStream.getTracks().forEach(t=>t.stop()); for(const n of [this.micSource,this.micIn,this.micGate,...(this._tingNodes||[])])if(n)try{if(n.stop)n.stop();n.disconnect();}catch(_){} this.micStream=null;this.micSource=null;this.micIn=null;this.micGate=null;this.sampleBus=null; }
    setMicGate(on) {this._micGate=!!on; if(this.micGate)this.micGate.gain.setTargetAtTime(on?1:0,this.ctx.currentTime,.01);}
    setTing(type,amount=0,modulation=0) {
      this._ting={type:String(type||'dry').toLowerCase(),amount:clamp(amount,0,1,0),modulation:clamp(modulation,0,1,0)}; if(!this.micIn)return;
      for(const n of this._tingNodes||[])try{if(n.stop)n.stop();n.disconnect();}catch(_){} this._tingNodes=[]; this.micIn.disconnect(); this.micIn.connect(this.micGate); this.micIn.connect(this.sampleBus);
      const c=this.ctx,{amount:a,modulation:m}=this._ting, add=n=>(this._tingNodes.push(n),n), wet=add(c.createGain()); wet.gain.value=a; wet.connect(this.micGate);
      if(type==='echo') {const d=add(c.createDelay(1)),fb=add(c.createGain());d.delayTime.value=.1+.45*m;fb.gain.value=.2+a*.45;this.micIn.connect(d);d.connect(wet);d.connect(fb);fb.connect(d);}
      else if(type==='spring') {const conv=add(c.createConvolver()),b=c.createBuffer(1,Math.floor(c.sampleRate*1.3),c.sampleRate),v=b.getChannelData(0);let seed=3;for(let i=0;i<v.length;i++){seed=(seed*1664525+1013904223)>>>0;v[i]=(seed/2147483648-1)*Math.exp(-i/c.sampleRate*4)*.35;}conv.buffer=b;this.micIn.connect(conv);conv.connect(wet);}
      else if(type==='pixie') {this._pitchShift(this.micIn,wet,1.5+m*.5,this._tingNodes);}
      else if(type==='robot') {const mod=add(c.createOscillator()),ring=add(c.createGain());ring.gain.value=0;mod.frequency.value=30+m*170;this.micIn.connect(ring);mod.connect(ring.gain);ring.connect(wet);mod.start();}
      else {wet.gain.value=0;}
    }
    _recorder(stream) {
      if(!global.MediaRecorder)throw new Error('Recording is not supported by this browser.');
      const rec=new MediaRecorder(stream),chunks=[]; rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);}; rec.start();
      return {rec,chunks,stop:()=>new Promise((resolve,reject)=>{rec.onerror=e=>reject(e.error||new Error('Recording failed'));rec.onstop=()=>resolve(new Blob(chunks,{type:rec.mimeType||'audio/webm'}));if(rec.state!=='inactive')rec.stop();else resolve(new Blob(chunks,{type:rec.mimeType||'audio/webm'}));})};
    }
    async startSampling(source='mic') {if(source==='master'&&!this.recordMaster)throw new Error('Output sampling is unavailable.');if(source!=='master'&&(!this.micStream||!this.sampleBus))throw new Error('Enable the microphone before sampling.'); if(this._sampleRec)throw new Error('Sampling is already in progress.');this._sampleRec=this._recorder(source==='master'?this.recordMaster.stream:this.sampleBus.stream);}
    async stopSampling() {if(!this._sampleRec)throw new Error('Sampling is not in progress.');const r=this._sampleRec;this._sampleRec=null;const blob=await r.stop();return this.ctx.decodeAudioData(await blob.arrayBuffer());}
    startRecording() {if(!this.recordMaster)throw new Error('Audio recording is unavailable.');if(this._recording)throw new Error('Recording is already in progress.');this._recording=this._recorder(this.recordMaster.stream);}
    async stopRecording() {if(!this._recording)throw new Error('Recording is not in progress.');const r=this._recording;this._recording=null;return r.stop();}
    async render(project,bars=4,options={}) {
      const Offline=global.OfflineAudioContext||global.webkitOfflineAudioContext;if(!Offline)throw new Error('Offline rendering is not supported.');
      project=project||{};bars=Math.round(clamp(bars,1,128,4));const bpm=clamp(project.bpm,40,399,120),swing=clamp(project.swing,0,1,0),step=60/bpm/4,signature=Array.isArray(project.timeSignature)?project.timeSignature:[4,4],numerator=Math.round(clamp(signature[0],1,16,4)),denominator=[2,4,8,16].includes(Number(signature[1]))?Number(signature[1]):4,barSteps=numerator*16/denominator,totalSteps=bars*barSteps,duration=totalSteps*step;
      const groups=Array.isArray(project.groups)?project.groups:[],prepared=groups.map(g=>(g.pads||[]).map(p=>({...p})));
      // Prepare the same pitch-preserving loop buffers used by live playback.
      const stretched=[];for(let g=0;g<prepared.length;g++)for(let p=0;p<prepared[g].length;p++){const pad=prepared[g][p];if(!pad||!pad.stretch||pad._stretched||!String(pad.sound||'').startsWith('sample:'))continue;const source=pad.sound.slice(7),ratio=pad.stretchBars?(this.samples.get(source)?.duration||1)*(clamp(pad.end,0,1,1)-clamp(pad.start,0,1,0))/(pad.stretchBars*barSteps*step):bpm/clamp(pad.loopBpm,40,399,bpm);if(Math.abs(ratio-1)<.001)continue;if(!this.samples.has(source))continue;const buffer=await this.stretchSample(source,ratio),id='__render_stretch_'+g+'_'+p;stretched.push([id,buffer]);prepared[g][p]={...pad,sound:'sample:'+id,_stretched:true,_playbackRate:1,_sourceSound:pad.sound};}
      const rate=this.ctx?this.ctx.sampleRate:44100,offline=new Offline(2,Math.ceil((duration+3)*rate),rate),e=new RiddimAudio();e.masterVolume=clamp(project.master,0,1,.8);e.samples=new Map(this.samples);for(const [id,b]of stretched)e.samples.set(id,b);e._setup(offline);if(project.output)e.setOutput(project.output);if(project.sidechain)e.setSidechain(project.sidechain);
      const fx=project.fx||{};e.setFX(fx.type||'delay',fx.x,fx.y);for(let i=0;i<4;i++)e.setGroup(i,groups[i]||{volume:0});
      const timing=project.timing||16,swingWidth=timing===8?2:timing===16?1:0,swingAt=position=>{if(!swingWidth)return 0;const phase=((position%(2*swingWidth))+2*swingWidth)%(2*swingWidth);return (phase<=swingWidth?phase:2*swingWidth-phase)*swing*step;};const timeline=[], add=(t,kind,data)=>timeline.push({t,kind,...data});let cursor=0,sceneIndex=0;
      const song=options.song&&Array.isArray(project.song)&&project.song.length&&Array.isArray(project.scenes)&&project.scenes.length?project.song:null;
      while(cursor<totalSteps){const scene=song?project.scenes[song[sceneIndex%song.length]]:null;
        const patterns=groups.map((group,g)=>{const number=scene?.patterns?.[g]??group.pattern??1;return (group.patterns||{})[String(number)]||{length:16,events:[]};});
        const sceneLength=song?Math.ceil(Math.max(barSteps,...patterns.map(p=>clamp(p.length,1,12672,barSteps)))/barSteps)*barSteps:totalSteps;
        const end=Math.min(totalSteps,cursor+sceneLength);add(cursor*step,'scene',{scene,patterns});
        for(let g=0;g<Math.min(4,groups.length);g++){const pat=patterns[g],length=Math.round(clamp(pat.length,1,12672,barSteps));
          for(const ev of pat.events||[]){const offset=clamp(ev.step,0,length-.001,0);for(let local=offset;cursor+local<end;local+=length){const absolute=cursor+local,p=clamp(ev.probability,0,1,1),hash=(((Math.floor(absolute*24)+1)*1103515245+(g+1)*12345+((ev.pad||0)+1)*2654435761)>>>0)/4294967296;if(hash>=p)continue;const t=absolute*step+swingAt(absolute);add(t,'note',{g,ev});}}
          for(const ev of pat.automation||[]){if(!Number.isFinite(Number(ev.step)))continue;const offset=clamp(ev.step,0,length-.001,0);for(let local=offset;cursor+local<end;local+=length){const absolute=cursor+local,t=absolute*step+swingAt(absolute);add(t,'automation',{g,ev});}}
        }
        cursor=end;sceneIndex++;if(!song)break;
      }
      const loopVoices=[];for(let g=0;g<Math.min(4,groups.length);g++){loopVoices[g]=[];for(let p=0;p<prepared[g].length;p++){const pad=prepared[g][p];if(pad&&pad.mode==='loop'){const voice=e.trigger({...pad,_playbackRate:1},0,.8,0,g);if(voice){voice.stop(duration);loopVoices[g][p]=voice;voice.setMuted(!!pad.muted,0);}}}}
      const mix=groups.map(g=>({volume:clamp(g.volume,0,1,.8),send:clamp(g.send,0,1,.2),pan:clamp(g.pan,-1,1,0),mute:!!g.mute,solo:!!g.solo}));
      const updateMix=(g,t)=>{const m=mix[g],bus=e.groups[g],anySolo=mix.some(x=>x.solo);bus.gain.gain.setValueAtTime(m.mute||(anySolo&&!m.solo)?0:m.volume,t);bus.send.gain.setValueAtTime(m.send,t);bus.pan.pan.setValueAtTime(m.pan,t);};
      const rank={scene:0,automation:1,note:2};timeline.sort((a,b)=>a.t-b.t||rank[a.kind]-rank[b.kind]);
      for(const item of timeline){const t=Math.max(0,Math.min(duration,item.t));if(item.kind==='scene'){for(let g=0;g<Math.min(4,groups.length);g++){if(item.scene?.mutes?.[g]!==undefined)mix[g].mute=!!item.scene.mutes[g];updateMix(g,t);const initial=item.patterns[g]?.loopMutes;for(let p=0;p<(loopVoices[g]||[]).length;p++){const v=loopVoices[g][p];if(!v)continue;let muted=item.scene?.loops?.[g]?.[p];if(muted===undefined)muted=prepared[g][p].muted;if(initial?.[p]!==undefined)muted=initial[p];v.setMuted(!!muted,t);}}continue;}
        const {g,ev}=item;if(item.kind==='automation'){const name=String(ev.param||''),value=Number(ev.value);if(!Number.isFinite(value))continue;if(name==='volume'||name==='send'||name==='pan'){mix[g][name]=clamp(value,name==='pan'?-1:0,1,mix[g][name]);updateMix(g,t);}else{const p=Math.floor(clamp(ev.pad,0,Math.max(0,prepared[g].length-1),groups[g].selectedPad||0));if(prepared[g][p]){prepared[g][p][name]=value;for(const voice of e.voices)if(voice.group===g&&(voice.sourceSound||voice.pad)===(prepared[g][p]._sourceSound||prepared[g][p].sound))voice.setParams?.({[name]:value},t);}}continue;}
        const pad=prepared[g]?.[ev.pad];if(!pad||pad.mode==='loop')continue;const siren=/^super[789]$|^siren/.test(pad.sound||''),voice=e.trigger(siren?{...pad,mode:'key'}:pad,t,ev.velocity,ev.note,g);if(voice&&(['key','legato'].includes(pad.mode||'')||siren))voice.stop(t+clamp(ev.duration,.01,64,.25)*60/bpm);
      }
      const result=await offline.startRendering();return wav(result);
    }
  }
  RiddimAudio.bufferToWav=wav; global.RiddimAudio=RiddimAudio; global.RIDDIM_SOUNDS=RIDDIM_SOUNDS;
})(typeof window!=='undefined'?window:globalThis);
