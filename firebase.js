// firebase.js - ملف فايربيز الوحيد في المشروع
// إصلاح جذري للمزامنة: يحافظ على الحفظ المحلي، ثم يدمج مع السحابة، ويمرر الحذف كسجل حذف حتى لا يرجع بعد التحديث.
const firebaseConfig = {
  apiKey: "AIzaSyC0l8H7dBiGqK75-ajx1-l5eky45FK4Wmw",
  authDomain: "momen-628a4.firebaseapp.com",
  projectId: "momen-628a4",
  storageBucket: "momen-628a4.firebasestorage.app",
  messagingSenderId: "285369896637",
  appId: "1:285369896637:web:914f5b3b1958af313331d4",
  measurementId: "G-BNETR9564X",
  databaseURL: "https://momen-628a4-default-rtdb.firebaseio.com"
};
(function(){
  const APP_KEY='supermarket_pos_ar_v1';
  const SYSTEM_KEYS=new Set(['settings','lastSyncAt','lastLocalUpdate','__deleted','_deletedIds','_syncMeta']);
  function now(){return new Date().toISOString()}
  function readLocal(){try{return JSON.parse(localStorage.getItem(APP_KEY)||'{}')||{}}catch(e){return {}}}
  function writeLocal(db){try{localStorage.setItem(APP_KEY,JSON.stringify(db||{}))}catch(e){console.error('تعذر حفظ البيانات محلياً',e)}}
  function clean(v){return String(v||'SUPER-0001').trim().replace(/[^a-zA-Z0-9_-]/g,'_') || 'SUPER-0001'}
  function root(companyKey){
    const db=readLocal(); let key=companyKey || db?.settings?.companyKey;
    try{const u=JSON.parse(localStorage.getItem('currentUser')||'{}'); key=key || u.companyKey || u.managerKey}catch(e){}
    return clean(key || 'SUPER-0001')
  }
  function url(companyKey){return `${firebaseConfig.databaseURL}/pos_projects/${root(companyKey)}.json`}
  function isObj(v){return v&&typeof v==='object'&&!Array.isArray(v)}
  function stamp(x){return Date.parse(x?._updatedAt||x?.updatedAt||x?.deletedAt||x?.createdAt||x?.date||0)||0}
  function mergeMap(a,b){const o={...(a||{})};Object.keys(b||{}).forEach(k=>{o[k]={...(o[k]||{}),...(b[k]||{})}});return o}
  function collectDeleted(){
    const out={};
    for(const db of arguments){
      if(!db) continue;
      [db.__deleted,db._deletedIds].forEach(src=>{if(!src)return;Object.keys(src).forEach(c=>{out[c]=out[c]||{};Object.assign(out[c],src[c]||{})})});
      Object.keys(db).forEach(c=>{const arr=db[c]; if(!Array.isArray(arr))return; arr.forEach(x=>{if(x&&x.id&&(x._deleted||x.deletedAt)){out[c]=out[c]||{};out[c][x.id]=x.deletedAt||x._updatedAt||now()}})})
    }
    return out
  }
  function mergeArrays(a=[],b=[],coll='',deleted={}){
    const map=new Map(), noid=[]; const del=deleted[coll]||{};
    function add(x){
      if(!x||typeof x!=='object')return;
      if(x.id){ if(del[x.id]||x._deleted||x.deletedAt)return; const p=map.get(x.id); if(!p||stamp(x)>=stamp(p)) map.set(x.id,{...(p||{}),...x}); }
      else { const key=JSON.stringify(x); if(!noid.some(y=>JSON.stringify(y)===key)) noid.push(x); }
    }
    (a||[]).forEach(add); (b||[]).forEach(add);
    return [...map.values(),...noid]
  }
  function mergeDB(a={},b={}){
    a=isObj(a)?a:{}; b=isObj(b)?b:{};
    const deleted=collectDeleted(a,b);
    const out={...a,...b};
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    keys.forEach(k=>{if(Array.isArray(a[k])||Array.isArray(b[k])) out[k]=mergeArrays(a[k]||[],b[k]||[],k,deleted)});
    out.__deleted=mergeMap(a.__deleted,b.__deleted); out.__deleted=mergeMap(out.__deleted,deleted);
    out._deletedIds=mergeMap(a._deletedIds,b._deletedIds); out._deletedIds=mergeMap(out._deletedIds,deleted);
    out.settings={...(a.settings||{}),...(b.settings||{})};
    out.settings.companyKey=out.settings.companyKey || a?.settings?.companyKey || b?.settings?.companyKey || 'SUPER-0001';
    return out
  }
  function normalize(db){
    db=isObj(db)?db:{}; const deleted=collectDeleted(db);
    Object.keys(db).forEach(k=>{if(Array.isArray(db[k])){const del=deleted[k]||{}; db[k]=db[k].filter(x=>!x||!x.id||(!del[x.id]&&!x._deleted&&!x.deletedAt))}});
    db.__deleted=mergeMap(db.__deleted,deleted); db._deletedIds=mergeMap(db._deletedIds,deleted);
    db.settings=db.settings||{}; db.settings.companyKey=db.settings.companyKey||root();
    return db
  }
  async function requestJSON(method,data,companyKey){
    const r=await fetch(url(companyKey),{method,cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},body:data===undefined?undefined:JSON.stringify(data||{})});
    if(!r.ok){let t='';try{t=await r.text()}catch(e){} throw new Error('Firebase '+method+' failed: '+r.status+' '+t.slice(0,160))}
    try{return await r.json()}catch(e){return {}}
  }
  async function getCloud(companyKey){return await requestJSON('GET',undefined,companyKey) || {}}
  async function putCloud(data,companyKey){return await requestJSON('PUT',normalize(data||{}),companyKey)}
  window.FirebaseBridge={
    config:firebaseConfig, root,
    async pullWithKey(companyKey){const local=readLocal(); const cloud=await getCloud(companyKey); const merged=normalize(mergeDB(cloud,local)); if(Object.keys(cloud||{}).length)writeLocal(merged); return merged},
    async pushWithKey(companyKey){const local=normalize(readLocal()); let cloud={}; try{cloud=await getCloud(companyKey||local?.settings?.companyKey)}catch(e){cloud={}} const merged=normalize(mergeDB(cloud,local)); merged.lastSyncAt=now(); merged.lastLocalUpdate=merged.lastLocalUpdate||now(); await putCloud(merged,companyKey||merged?.settings?.companyKey); writeLocal(merged); return merged},
    async sync(localDB,opts={}){if(!navigator.onLine)return normalize(localDB||readLocal()); const local=normalize(localDB||readLocal()); const companyKey=opts.companyKey||local?.settings?.companyKey; const cloud=await getCloud(companyKey).catch(()=>({})); const merged=normalize(mergeDB(cloud,local)); merged.lastSyncAt=now(); merged.lastLocalUpdate=merged.lastLocalUpdate||now(); await putCloud(merged,companyKey||merged?.settings?.companyKey); writeLocal(merged); return merged},
    async pull(){return await this.pullWithKey(readLocal()?.settings?.companyKey)},
    async push(){return await this.pushWithKey(readLocal()?.settings?.companyKey)}
  };
})();

/* ===== OSKAR MOBILE SIDEBAR FIX - 2026-05-08 ===== */
(function(){
  if(window.__OSKAR_MOBILE_SIDEBAR_FIX__) return;
  window.__OSKAR_MOBILE_SIDEBAR_FIX__ = true;

  // إصلاح الجوال فقط: الدرج يبدأ مغلقاً، والديسكتوب يبقى ظاهر طبيعي.
  const css = `
    @media (max-width:1099.98px){
      html body .drawer:not(.open){
        transform:translateX(105%) translateZ(0) !important;
        visibility:visible !important;
      }
      html body .drawer.open{
        transform:translateX(0) translateZ(0) !important;
        visibility:visible !important;
      }
      html body .drawer-overlay:not(.show){display:none !important;}
      html body .drawer-overlay.show{display:block !important;}
    }
    @media (min-width:1100px){
      html body .drawer{
        transform:none !important;
        right:0 !important;
        top:48px !important;
        width:280px !important;
        height:calc(100vh - 48px) !important;
      }
      html body .drawer-overlay{display:none !important;}
      html body .page{margin-right:280px !important;}
      html body .fab, html body .topbar .menu-open{display:none !important;}
    }
  `;
  function installStyle(){
    if(document.getElementById('oskar-mobile-sidebar-fix-style')) return;
    const st=document.createElement('style');
    st.id='oskar-mobile-sidebar-fix-style';
    st.textContent=css;
    (document.head || document.documentElement).appendChild(st);
  }
  installStyle();

  const isMobile = () => window.matchMedia && window.matchMedia('(max-width:1099.98px)').matches;

  function setHomeOpenOnly(){
    const drawer=document.getElementById('drawer') || document.querySelector('.drawer');
    if(!drawer || !isMobile()) return;
    drawer.querySelectorAll('.menu-group').forEach(group=>{
      const title=String(group.querySelector('.menu-head b')?.textContent || '').trim();
      if(title === 'الرئيسية') group.classList.add('open');
      else group.classList.remove('open');
    });
  }

  function closeMobileDrawerOnStart(){
    if(!isMobile()) return;
    const drawer=document.getElementById('drawer') || document.querySelector('.drawer');
    const overlay=document.getElementById('drawerOverlay') || document.querySelector('.drawer-overlay');
    if(drawer) drawer.classList.remove('open');
    if(overlay) overlay.classList.remove('show');
  }

  function applyInitialMobileState(){
    installStyle();
    closeMobileDrawerOnStart();
    setHomeOpenOnly();
  }

  // لأن الصفحات تعيد رسم القائمة أكثر من مرة، نطبّق الوضع الافتراضي بعد الرسم فقط.
  function scheduleInitial(){
    [0,80,220,500,900].forEach(ms=>setTimeout(applyInitialMobileState,ms));
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',scheduleInitial,{once:true});
  }else{
    scheduleInitial();
  }

  window.addEventListener('resize',()=>{
    installStyle();
    if(!isMobile()){
      const drawer=document.getElementById('drawer') || document.querySelector('.drawer');
      const overlay=document.getElementById('drawerOverlay') || document.querySelector('.drawer-overlay');
      if(drawer) drawer.classList.remove('open');
      if(overlay) overlay.classList.remove('show');
    }
  });
})();
