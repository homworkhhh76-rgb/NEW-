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

// إصلاح نهائي لسلوك القائمة الجانبية بدون تعديل الهيدر أو الشريط السفلي
// المطلوب: القائمة نفسها تبدأ مغلقة، وعند فتحها يكون قسم "الرئيسية" فقط مفتوحًا تلقائيًا.
(function(){
  if(window.__OSKAR_DRAWER_INITIAL_STATE_FIX__) return;
  window.__OSKAR_DRAWER_INITIAL_STATE_FIX__ = true;

  const STYLE_ID = 'oskar-drawer-initial-state-fix-style';
  function addStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      /* اجعل القائمة الجانبية مغلقة افتراضيًا حتى على الشاشات الكبيرة */
      .drawer{transform:translateX(105%)!important;will-change:transform!important;transition:transform .2s cubic-bezier(.2,.8,.2,1)!important;}
      .drawer.open{transform:translateX(0)!important;}
      .drawer-overlay{display:none!important;}
      .drawer-overlay.show{display:block!important;}
      .page{margin-right:auto!important;margin-left:auto!important;}
      .topbar .menu-open,.fab{display:flex!important;align-items:center!important;justify-content:center!important;}
      .menu-group:not(.open)>.submenu{display:none!important;}
      .menu-group.open>.submenu{display:block!important;}
      @media(min-width:1100px){
        .drawer{top:48px!important;height:calc(100vh - 48px)!important;width:280px!important;box-shadow:-8px 0 28px rgba(0,0,0,.18)!important;border-left:1px solid var(--line,#dce8e2)!important;}
        .drawer-brand{display:none!important;}
        .drawer-overlay.show{display:block!important;}
        .page{margin-right:auto!important;}
      }
    `;
    document.head.appendChild(st);
  }

  function txt(el){ return String(el && el.textContent || '').replace(/\s+/g,' ').trim(); }
  function getDrawer(){ return document.getElementById('drawer') || document.querySelector('.drawer'); }
  function getOverlay(){ return document.getElementById('drawerOverlay') || document.querySelector('.drawer-overlay'); }

  function resetSubmenusToHomeOnly(){
    const drawer = getDrawer();
    if(!drawer) return;
    const groups = Array.from(drawer.querySelectorAll('.menu-group'));
    if(!groups.length) return;
    groups.forEach(g => g.classList.remove('open'));
    const home = groups.find(g => txt(g.querySelector('.menu-head b')) === 'الرئيسية') || groups[0];
    if(home) home.classList.add('open');
  }

  function reallyCloseDrawer(){
    addStyle();
    const drawer = getDrawer();
    const overlay = getOverlay();
    if(drawer) drawer.classList.remove('open');
    if(overlay) overlay.classList.remove('show');
    document.documentElement.classList.remove('drawer-open');
    document.body && document.body.classList.remove('drawer-open');
  }

  function reallyOpenDrawer(){
    addStyle();
    resetSubmenusToHomeOnly();
    const drawer = getDrawer();
    const overlay = getOverlay();
    if(drawer) drawer.classList.add('open');
    if(overlay) overlay.classList.add('show');
    document.documentElement.classList.add('drawer-open');
    document.body && document.body.classList.add('drawer-open');
  }

  function installOverrides(){
    addStyle();
    window.openDrawer = reallyOpenDrawer;
    window.closeDrawer = reallyCloseDrawer;
    window.toggleMenu = function(btn){
      const group = btn && btn.closest ? btn.closest('.menu-group') : null;
      if(!group) return;
      group.classList.toggle('open');
    };
  }

  function applyInitialState(){
    installOverrides();
    resetSubmenusToHomeOnly();
    reallyCloseDrawer();
  }

  // طبّق الإصلاح بعد تحميل كل سكربتات الصفحة، لأن الصفحات تعيد تعريف renderCommon/toggleMenu.
  function boot(){
    applyInitialState();
    setTimeout(applyInitialState, 60);
    setTimeout(applyInitialState, 250);
    setTimeout(applyInitialState, 700);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('load', function(){ setTimeout(applyInitialState, 120); });
})();
