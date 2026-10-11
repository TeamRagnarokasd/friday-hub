/* Voce di Friday: Piper (Paola) dentro il browser. Tutto incluso nell'app: nessun server, nessun limite. */
(function(){
  var sess=null, PW=null, PD=null, U=null;
  function js(src){ return new Promise(function(ok,ko){ var s=document.createElement("script"); s.src=src; s.onload=ok; s.onerror=function(){ko(new Error("script "+src));}; document.head.appendChild(s); }); }
  function dec(b64){ var bin=atob(b64), b=new Uint8Array(bin.length); for(var k=0;k<bin.length;k++) b[k]=bin.charCodeAt(k); return b; }
  function join(parts){ var t=0; parts.forEach(function(p){t+=p.length;}); var all=new Uint8Array(t), o=0; parts.forEach(function(p){all.set(p,o);o+=p.length;}); return all; }
  async function bin(p){ var r=await fetch(U(p)); if(!r.ok) throw new Error("file "+p+" "+r.status); return new Uint8Array(await r.arrayBuffer()); }
  async function init(onProg){
    U=function(p){ return new URL(p,location.href).href; };
    await js(U("ort/ort.wasm.min.js")); await js(U("ph/piper_phonemize.js"));
    var i, parts=[];
    var ow=await bin("data/ort-wasm.wasm");
    PW=await bin("data/pw.wasm");
    PD=(await bin("data/pd.data")).buffer;
    ort.env.wasm.numThreads=1; ort.env.wasm.proxy=false;
    ort.env.wasm.wasmBinary=ow;
    ort.env.wasm.wasmPaths={mjs:U("ort/ort-wasm-simd-threaded.mjs")};
    for(i=0;i<2;i++){ parts.push(await bin("data/model-"+i+".bin")); if(onProg) onProg((i+1)/2); }
    var all=join(parts); parts=null;
    sess=await ort.InferenceSession.create(all.buffer,{executionProviders:["wasm"],graphOptimizationLevel:"all"});
    return true;
  }
  function phon(text){
    return new Promise(async function(res,rej){
      try{
        var m=await createPiperPhonemize({
          wasmBinary:PW,
          getPreloadedPackage:function(){ return PD.slice(0); },
          print:function(d){ try{res(JSON.parse(d).phoneme_ids);}catch(e){rej(e);} },
          printErr:function(){},
          locateFile:function(u){ return u; }
        });
        m.callMain(["-l","it","--input",JSON.stringify([{text:text}]),"--espeak_data","/espeak-ng-data"]);
      }catch(e){ rej(e); }
    });
  }
  function wav(f32,rate){
    var n=f32.length, buf=new ArrayBuffer(44+n*2), v=new DataView(buf);
    function w(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
    w(0,"RIFF");v.setUint32(4,36+n*2,true);w(8,"WAVE");w(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,n*2,true);
    for(var i=0;i<n;i++){ var x=Math.max(-1,Math.min(1,f32[i])); v.setInt16(44+i*2,x<0?x*32768:x*32767,true); }
    return new Blob([buf],{type:"audio/wav"});
  }
  /* parametri scelti: noise 0.85, length 1.08, noise_w 1.0 */
  async function synth(text){
    var ids=await phon(text);
    var out=await sess.run({
      input:new ort.Tensor("int64",BigInt64Array.from(ids.map(function(x){return BigInt(x);})),[1,ids.length]),
      input_lengths:new ort.Tensor("int64",BigInt64Array.from([BigInt(ids.length)])),
      scales:new ort.Tensor("float32",Float32Array.from([0.85,1.08,1.0]))
    });
    var pcm=out.output.data, s=0, pk=0, i;
    for(i=0;i<pcm.length;i++){ s+=pcm[i]*pcm[i]; var a=Math.abs(pcm[i]); if(a>pk)pk=a; }
    var rms=Math.sqrt(s/pcm.length)||1e-6, g=Math.min(0.11/rms, 0.95/(pk||1));
    var o=new Float32Array(pcm.length); for(i=0;i<pcm.length;i++) o[i]=pcm[i]*g;
    return {pcm:o, rate:22050, seconds:pcm.length/22050};
  }
  /* riproduzione con AudioContext: dopo lo sblocco con un tocco non serve altro gesto */
  var ctx=null;
  function unlock(){
    try{
      if(!ctx){ var AC=window.AudioContext||window.webkitAudioContext; ctx=new AC(); }
      if(ctx.state!=="running") ctx.resume();
      var b=ctx.createBuffer(1,1,22050), sr=ctx.createBufferSource(); sr.buffer=b; sr.connect(ctx.destination); sr.start(0);
    }catch(e){}
  }
  function play(pcm,rate,onend){
    var h={src:null,stopped:false,stop:function(){ h.stopped=true; try{ if(h.src){ h.src.onended=null; h.src.stop(); } }catch(_){} }};
    function go(){
      if(h.stopped) return;
      var b=ctx.createBuffer(1,pcm.length,rate); b.getChannelData(0).set(pcm);
      var sr=ctx.createBufferSource(); sr.buffer=b; sr.connect(ctx.destination); sr.onended=function(){ if(!h.stopped&&onend) onend(); };
      h.src=sr; sr.start(0);
    }
    try{
      if(!ctx) unlock();
      if(ctx.state==="running") go(); else ctx.resume().then(function(){ if(ctx.state==="running") go(); else throw new Error("audio bloccato"); }).catch(function(e){ if(onend) onend(e); });
    }catch(e){ if(onend) onend(e); }
    return h;
  }
  window.FridayVoce={init:init,synth:synth,unlock:unlock,play:play,ready:function(){return !!sess;}};
})();
