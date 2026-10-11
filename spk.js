(function(root){
  var NFFT=512,FL=400,FS=160,NB=80,LO=20,HI=7600,SR=16000;
  var mel=function(f){return 1127*Math.log(1+f/700);};
  var win=new Float64Array(FL),i;
  for(i=0;i<FL;i++) win[i]=Math.pow(0.5-0.5*Math.cos(2*Math.PI*i/(FL-1)),0.85);
  var ml=mel(LO),mh=mel(HI),d=(mh-ml)/(NB+1),NF=NFFT/2+1,fb=[];
  var mm=new Float64Array(NF); for(i=0;i<NF;i++) mm[i]=mel(i*SR/NFFT);
  for(var b=0;b<NB;b++){ var l=ml+b*d,c=l+d,r=c+d,w=new Float64Array(NF); for(i=0;i<NF;i++){ var up=(mm[i]-l)/(c-l),dn=(r-mm[i])/(r-c); w[i]=Math.max(0,Math.min(up,dn)); } fb.push(w); }
  var cosT=new Float64Array(NFFT/2),sinT=new Float64Array(NFFT/2);
  for(i=0;i<NFFT/2;i++){ cosT[i]=Math.cos(2*Math.PI*i/NFFT); sinT[i]=-Math.sin(2*Math.PI*i/NFFT); }
  var rev=new Uint16Array(NFFT); for(i=0;i<NFFT;i++){ var x=i,y=0; for(var k=0;k<9;k++){ y=(y<<1)|(x&1); x>>=1; } rev[i]=y; }
  var re=new Float64Array(NFFT),im=new Float64Array(NFFT);
  function fft(){
    var n=NFFT,t;
    for(var a=0;a<n;a++){ var j=rev[a]; if(j>a){ t=re[a];re[a]=re[j];re[j]=t; t=im[a];im[a]=im[j];im[j]=t; } }
    for(var s=2;s<=n;s<<=1){ var h=s>>1,st=n/s; for(var q=0;q<n;q+=s){ for(var p=0;p<h;p++){ var wr=cosT[p*st],wi=sinT[p*st],u=q+p,v=u+h; var xr=re[v]*wr-im[v]*wi,xi=re[v]*wi+im[v]*wr; re[v]=re[u]-xr; im[v]=im[u]-xi; re[u]+=xr; im[u]+=xi; } } }
  }
  var EPS=1.1920929e-7;
  function fbank(x){ /* x: Float32Array 16 kHz in [-1,1] -> {data:Float32Array(T*80),T} */
    var n=1+Math.floor((x.length-FL)/FS); if(n<1) return null;
    var out=new Float32Array(n*NB),fr=new Float64Array(FL),pw=new Float64Array(NF);
    for(var t=0;t<n;t++){
      var o=t*FS,m=0; for(i=0;i<FL;i++){ fr[i]=x[o+i]*32768; m+=fr[i]; } m/=FL;
      for(i=0;i<FL;i++) fr[i]-=m;
      for(i=FL-1;i>=1;i--) fr[i]=fr[i]-0.97*fr[i-1]; fr[0]=fr[0]-0.97*fr[0];
      for(i=0;i<NFFT;i++){ re[i]=i<FL?fr[i]*win[i]:0; im[i]=0; }
      fft();
      for(i=0;i<NF;i++) pw[i]=re[i]*re[i]+im[i]*im[i];
      for(var bb=0;bb<NB;bb++){ var s=0,w=fb[bb]; for(i=0;i<NF;i++) s+=pw[i]*w[i]; out[t*NB+bb]=Math.log(Math.max(s,EPS)); }
    }
    return {data:out,T:n};
  }
  root.FridayFbank=fbank;
})(typeof window!=="undefined"?window:globalThis);

/* Riconoscimento della voce: impronta vocale (wespeaker) dentro il telefono */
(function(){
  var sess=null, loading=null;
  function js(src){ return new Promise(function(ok,ko){ var s=document.createElement("script"); s.src=src; s.onload=ok; s.onerror=function(){ko(new Error("script "+src));}; document.head.appendChild(s); }); }
  function dec(b64){ var bin=atob(b64), b=new Uint8Array(bin.length); for(var k=0;k<bin.length;k++) b[k]=bin.charCodeAt(k); return b; }
  function waitOrt(){ return new Promise(function(ok,ko){ var t0=Date.now(); (function p(){ if(window.ort && ort.env && ort.env.wasm && ort.env.wasm.wasmBinary) return ok(); if(Date.now()-t0>120000) return ko(new Error("motore audio non pronto")); setTimeout(p,300); })(); }); }
  function init(){
    if(sess) return Promise.resolve(true);
    if(loading) return loading;
    loading=(async function(){
      await waitOrt();
      var r=await fetch(new URL("data/spk.onnx",location.href).href); if(!r.ok) throw new Error("spk.onnx "+r.status);
      var all=new Uint8Array(await r.arrayBuffer());
      sess=await ort.InferenceSession.create(all.buffer,{executionProviders:["wasm"]});
      return true;
    })().catch(function(e){ loading=null; throw e; });
    return loading;
  }
  function mono16k(buf){ /* AudioBuffer a 16 kHz -> Float32Array mono */
    var n=buf.length, ch=buf.numberOfChannels, out=new Float32Array(n), c, i;
    for(c=0;c<ch;c++){ var d=buf.getChannelData(c); for(i=0;i<n;i++) out[i]+=d[i]/ch; }
    return out;
  }
  async function decodeBlob(blob){
    var ab=await blob.arrayBuffer(), ctx;
    try{ ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:16000}); }catch(_){ ctx=new (window.AudioContext||window.webkitAudioContext)(); }
    var buf=await new Promise(function(ok,ko){ var p=ctx.decodeAudioData(ab,ok,ko); if(p&&p.then) p.then(ok,ko); });
    var x=mono16k(buf), sr=buf.sampleRate;
    try{ ctx.close(); }catch(_){}
    if(sr!==16000){ /* riduzione semplice con media per blocchi */
      var r=sr/16000, m=Math.floor(x.length/r), y=new Float32Array(m);
      for(var i=0;i<m;i++){ var a=Math.floor(i*r), b=Math.min(x.length,Math.floor((i+1)*r)), s=0; for(var k=a;k<b;k++) s+=x[k]; y[i]=s/Math.max(1,b-a); }
      x=y;
    }
    return x;
  }
  function voiced(x){ /* tiene solo i tratti con voce (energia sopra una soglia) */
    var W=320, n=Math.floor(x.length/W), e=[], i, k, mx=0;
    for(i=0;i<n;i++){ var s=0; for(k=0;k<W;k++){ var v=x[i*W+k]; s+=v*v; } e.push(Math.sqrt(s/W)); if(e[i]>mx) mx=e[i]; }
    var th=Math.max(mx*0.08,0.002), out=[];
    for(i=0;i<n;i++) if(e[i]>=th) out.push(x.subarray(i*W,(i+1)*W));
    var t=0; out.forEach(function(p){t+=p.length;}); var y=new Float32Array(t), o=0; out.forEach(function(p){ y.set(p,o); o+=p.length; });
    return y;
  }
  async function embedPcm(x){
    await init();
    var v=voiced(x); if(v.length<16000*2) throw new Error("voce troppo breve ("+(v.length/16000).toFixed(1)+" s)");
    if(v.length>16000*30) v=v.subarray(0,16000*30);
    var f=FridayFbank(v); if(!f) throw new Error("audio troppo corto");
    var out=await sess.run({feats:new ort.Tensor("float32",f.data,[1,f.T,80])});
    var e=Array.prototype.slice.call(out[Object.keys(out)[0]].data), nn=0, i;
    for(i=0;i<e.length;i++) nn+=e[i]*e[i]; nn=Math.sqrt(nn)||1;
    return e.map(function(a){ return Math.round(a/nn*10000)/10000; });
  }
  async function embedBlob(blob){ return embedPcm(await decodeBlob(blob)); }
  function cos(a,b){ var s=0,i; for(i=0;i<a.length;i++) s+=a[i]*b[i]; return s; } /* vettori gia normalizzati */
  window.FridaySpk={init:init,embedBlob:embedBlob,embedPcm:embedPcm,cos:cos,ready:function(){return !!sess;}};
})();
