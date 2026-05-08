// firebase.js - ملف فايربيز الوحيد في المشروع
// Offline-first: التخزين المحلي هو الأساس، والمزامنة تتم تلقائياً عند توفر الإنترنت.
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
  function readLocal(){ try{return JSON.parse(localStorage.getItem(APP_KEY)||'{}')}catch(e){return {}} }
  function writeLocal(db){ localStorage.setItem(APP_KEY, JSON.stringify(db||{})); }
  function clean(v){ return String(v||'SUPER-0001').trim().replace(/[^a-zA-Z0-9_-]/g,'_') || 'SUPER-0001'; }
  function root(companyKey){
    const db=readLocal();
    let key = companyKey || db?.settings?.companyKey;
    try{ const u=JSON.parse(localStorage.getItem('currentUser')||'{}'); key = key || u.companyKey || u.managerKey; }catch(e){}
    return clean(key || 'SUPER-0001');
  }
  function url(companyKey){ return `${firebaseConfig.databaseURL}/pos_projects/${root(companyKey)}.json`; }
  async function getCloud(companyKey){ const r=await fetch(url(companyKey),{cache:'no-store'}); if(!r.ok) throw new Error('Firebase pull failed'); return await r.json() || {}; }
  async function putCloud(data, companyKey){ const r=await fetch(url(companyKey),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data||{})}); if(!r.ok) throw new Error('Firebase push failed'); return await r.json(); }
  function mergeDeleted(local={}, cloud={}){
    const out={};
    [cloud.__deleted, cloud._deletedIds, local.__deleted, local._deletedIds].forEach(src=>{
      if(!src) return;
      Object.keys(src).forEach(coll=>{
        out[coll]=out[coll]||{};
        Object.assign(out[coll], src[coll]||{});
      });
    });
    Object.keys({...cloud,...local}).forEach(coll=>{
      [cloud[coll], local[coll]].forEach(arr=>{
        if(!Array.isArray(arr)) return;
        arr.forEach(x=>{ if(x&&x.id&&(x._deleted||x.deletedAt)){ out[coll]=out[coll]||{}; out[coll][x.id]=x.deletedAt||x._updatedAt||new Date().toISOString(); } });
      });
    });
    return out;
  }
  function mergeArrays(localArr=[], cloudArr=[], coll='', deleted={}){
    const map=new Map();
    const del=deleted[coll]||{};
    function ts(x){return Date.parse(x?._updatedAt||x?.deletedAt||x?.updatedAt||x?.createdAt||x?.date||0)||0;}
    [...cloudArr,...localArr].forEach(x=>{
      if(!x||!x.id)return;
      if(del[x.id]||x._deleted||x.deletedAt){return;}
      const p=map.get(x.id);
      if(!p||ts(x)>=ts(p))map.set(x.id,{...(p||{}),...x});
    });
    return [...map.values()].sort((a,b)=>String(b._updatedAt||b.createdAt||b.date||'').localeCompare(String(a._updatedAt||a.createdAt||a.date||'')));
  }
  function mergeDB(local={}, cloud={}){
    const deleted=mergeDeleted(local,cloud);
    const out={...cloud,...local};
    Object.keys({...cloud,...local}).forEach(k=>{ if(Array.isArray(local[k])||Array.isArray(cloud[k])) out[k]=mergeArrays(local[k]||[], cloud[k]||[], k, deleted); });
    out.__deleted=deleted;
    out._deletedIds=deleted;
    out.settings={...(cloud.settings||{}),...(local.settings||{})};
    out.settings.companyKey = out.settings.companyKey || local?.settings?.companyKey || cloud?.settings?.companyKey || 'SUPER-0001';
    out.lastSyncAt = new Date().toISOString();
    return out;
  }
  window.FirebaseBridge={
    config: firebaseConfig,
    root,
    async pullWithKey(companyKey){ const cloud=await getCloud(companyKey); if(cloud && Object.keys(cloud).length){ writeLocal(cloud); } return cloud; },
    async pushWithKey(companyKey){ const db=readLocal(); db.lastLocalUpdate = db.lastLocalUpdate || new Date().toISOString(); await putCloud(db, companyKey); return db; },
    async sync(localDB, opts={}){
      if(!navigator.onLine) return localDB || readLocal();
      const current = localDB || readLocal();
      let cloud={}; try{ cloud=await getCloud(opts.companyKey || current?.settings?.companyKey); }catch(e){ cloud={}; }
      const merged = mergeDB(current, cloud);
      merged.lastLocalUpdate = new Date().toISOString();
      writeLocal(merged);
      await putCloud(merged, merged?.settings?.companyKey || opts.companyKey);
      return merged;
    },
    async pull(){ return await this.pullWithKey(readLocal()?.settings?.companyKey); },
    async push(){ return await this.pushWithKey(readLocal()?.settings?.companyKey); }
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
