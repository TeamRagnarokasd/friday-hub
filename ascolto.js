/* Ascolto automatico: microfono sempre attivo (solo a pagina intera), riconosce chi parla dalla voce */
(function(){
  var SOGLIA=0.70, LS="friday_voci";
  var voci={}; try{ voci=JSON.parse(localStorage.getItem(LS)||"{}")||{}; }catch(_){ voci={}; }
  var st=null, ctx=null, proc=null, on=false, buf=[], inSp=false, quiet=0, floor=0.004, enrol=null, last="";
  var barEl=null, txtEl=null;
  function say(t){ last=t; if(txtEl) txtEl.textContent=t; }
  function salva(){ try{ localStorage.setItem(LS,JSON.stringify(voci)); }catch(_){} }
  function down(x,sr){ if(sr===16000) return x; var r=sr/16000,m=Math.floor(x.length/r),y=new Float32Array(m);
    for(var i=0;i<m;i++){ var a=Math.floor(i*r),b=Math.min(x.length,Math.floor((i+1)*r)),s=0; for(var k=a;k<b;k++) s+=x[k]; y[i]=s/Math.max(1,b-a); } return y; }
  function cat(parts){ var t=0; parts.forEach(function(p){t+=p.length;}); var o=new Float32Array(t),k=0; parts.forEach(function(p){ o.set(p,k); k+=p.length; }); return o; }
  function chi(e){ var best=null,bs=-1; Object.keys(voci).forEach(function(n){ var c=FridaySpk.cos(e,voci[n]); if(c>bs){bs=c;best=n;} }); return {nome:best,s:bs}; }
  function mean(list){ var m=new Array(256).fill(0); list.forEach(function(e){ for(var i=0;i<256;i++) m[i]+=e[i]; }); var n=0; for(var i=0;i<256;i++) n+=m[i]*m[i]; n=Math.sqrt(n)||1; return m.map(function(v){return Math.round(v/n*10000)/10000;}); }
  async function frase(pcm,sr){
    var x=down(pcm,sr), e;
    try{ e=await FridaySpk.embedPcm(x); }catch(err){ say("(voce troppo breve)"); return; }
    if(enrol){ enrol.list.push(e); enrol.need--; if(enrol.need>0){ say("Registro "+enrol.nome+": ancora "+enrol.need+" frasi..."); return; }
      voci[enrol.nome]=mean(enrol.list); salva(); say("Voce di "+enrol.nome+" salvata."); var cb=enrol.done; enrol=null; if(cb) cb(); return; }
    var r=chi(e);
    if(!r.nome){ say("Nessuna voce registrata."); return; }
    var ris=r.s>=SOGLIA?r.nome:"Persona sconosciuta";
    say(ris+" ("+Math.round(r.s*100)+"%)");
    if(window.FridayAscolto.onChi) window.FridayAscolto.onChi({nome:r.s>=SOGLIA?r.nome:null,punteggio:r.s,pcm:pcm,rate:sr});
  }
  function frame(d){
    var s=0,i; for(i=0;i<d.length;i++) s+=d[i]*d[i]; var rms=Math.sqrt(s/d.length);
    var th=Math.max(floor*3,0.012);
    if(!inSp){ floor=floor*0.95+rms*0.05; if(rms>th){ inSp=true; quiet=0; buf=[new Float32Array(d)]; } }
    else{ buf.push(new Float32Array(d)); if(rms>th) quiet=0; else quiet++;
      var dur=buf.length*d.length/ctx.sampleRate;
      if(quiet>=4 || dur>20){ inSp=false; var x=cat(buf); buf=[]; if(x.length/ctx.sampleRate>1.5) frase(x,ctx.sampleRate); else say("Ascolto..."); } }
  }
  async function start(){
    if(on) return;
    await FridaySpk.init();
    st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:true}});
    ctx=new (window.AudioContext||window.webkitAudioContext)(); if(ctx.state!=="running") await ctx.resume();
    var src=ctx.createMediaStreamSource(st); proc=ctx.createScriptProcessor(4096,1,1); var g=ctx.createGain(); g.gain.value=0;
    proc.onaudioprocess=function(ev){ frame(ev.inputBuffer.getChannelData(0)); };
    src.connect(proc); proc.connect(g); g.connect(ctx.destination); on=true; say("Ascolto attivo.");
  }
  function stop(){ on=false; try{ st.getTracks().forEach(function(t){t.stop();}); }catch(_){} try{ ctx.close(); }catch(_){} say("Ascolto fermo."); }
  function registra(nome,frasi,done){ enrol={nome:nome,list:[],need:frasi||3,done:done}; say("Registro "+nome+": parla, "+enrol.need+" frasi (racconta qualcosa)."); }
  function ui(){
    barEl=document.createElement("div"); barEl.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:60;background:rgba(10,4,2,.94);border-top:1px solid #5a300a;color:#ffb347;font:13px monospace;padding:8px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center";
    txtEl=document.createElement("div"); txtEl.style.cssText="flex:1 1 100%"; txtEl.textContent="Pagina intera: tocca Attiva ascolto.";
    function bt(t,fn){ var b=document.createElement("button"); b.type="button"; b.textContent=t; b.style.cssText="font:inherit;color:#ffb347;background:#1a0a04;border:1px solid #5a300a;padding:8px 10px;text-transform:uppercase"; b.addEventListener("click",fn); barEl.appendChild(b); return b; }
    barEl.appendChild(txtEl);
    bt("Attiva ascolto",function(){ start().catch(function(e){ say("Errore: "+(e&&e.name||"")+" "+(e&&e.message||e)); }); });
    bt("Registra voce",function(){ var n=prompt("Nome di chi registra la voce:",""); if(!n) return; n=n.trim(); start().then(function(){ registra(n,3); }).catch(function(e){ say("Errore: "+(e&&e.name||"")+" "+(e&&e.message||e)); }); });
    bt("Ferma",stop);
    document.body.appendChild(barEl);
  }
  window.FridayAscolto={ui:ui,start:start,stop:stop,registra:registra,voci:function(){return Object.keys(voci);},onChi:null,ultimo:function(){return last;}};
})();
