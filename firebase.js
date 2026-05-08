// firebase.js - ملف فايربيز الوحيد في المشروع
// إصلاح جذري: حفظ محلي أولاً، ثم مزامنة سحابية آمنة للحفظ والتعديل والحذف بدون تغيير تصميم الصفحات.
const firebaseConfig = {
  apiKey: "AIzaSyCnLAY7zQyBy7gUuL9wszt9aEhiJgvRmxI",
  authDomain: "shop-d52dc.firebaseapp.com",
  databaseURL: "https://shop-d52dc-default-rtdb.firebaseio.com",
  projectId: "shop-d52dc",
  storageBucket: "shop-d52dc.appspot.com",
  messagingSenderId: "97580537866",
  appId: "1:97580537866:web:abc46e5a2f527b6300a7f3",
  measurementId: "G-956RQMBP42"
};
(function(){
  'use strict';
  const APP_KEY='supermarket_pos_ar_v1';
  const ROOT_PATH='pos_projects';
  const DEFAULT_COMPANY='SUPER-0001';
  const DELETE_KEYS=['__deleted','_deletedIds'];
  const META_KEYS=new Set(['lastSyncAt','lastLocalUpdate','lastCloudPull','__deleted','_deletedIds','_syncMeta']);
  const ITEM_META=new Set(['_updatedAt','_createdAt','_deleted','deletedAt','_syncStamp']);
  const state={snapshot:null,syncTimer:null,pullTimer:null,installTimer:null,applyingRemote:false,lastLocalSaveAt:0,lastUserEditAt:0,lastError:null,started:false};

  function now(){return new Date().toISOString()}
  function isObj(v){return !!v && typeof v==='object' && !Array.isArray(v)}
  function clone(v){try{return JSON.parse(JSON.stringify(v||{}))}catch(e){return {}}}
  function readLocal(){try{return JSON.parse(localStorage.getItem(APP_KEY)||'{}')||{}}catch(e){return {}}}
  function writeLocal(db,opts={}){localStorage.setItem(APP_KEY,JSON.stringify(db||{})); if(opts.snapshot!==false) state.snapshot=clone(db||{});}
  function clean(v){return String(v||DEFAULT_COMPANY).trim().replace(/[^a-zA-Z0-9_-]/g,'_') || DEFAULT_COMPANY}
  function currentCompanyKey(fallback){
    const db=readLocal(); let key=fallback || db?.settings?.companyKey;
    try{const u=JSON.parse(localStorage.getItem('currentUser')||'{}'); key=key || u.companyKey || u.managerKey;}catch(e){}
    return clean(key || DEFAULT_COMPANY)
  }
  function url(companyKey){return `${firebaseConfig.databaseURL}/${ROOT_PATH}/${currentCompanyKey(companyKey)}.json`}
  function safeToast(msg){try{if(window.toast) window.toast(msg)}catch(e){}}
  function sameJSON(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch(e){return false}}
  function editableElement(el){
    if(!el) return false;
    const tag=String(el.tagName||'').toLowerCase();
    return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable||!!(el.closest&&el.closest('form,.modal,.dialog,[role=dialog]'));
  }
  function markUserEditing(){state.lastUserEditAt=Date.now();}
  function userIsEditing(){
    if(editableElement(document.activeElement)) return true;
    return Date.now()-state.lastUserEditAt<12000;
  }
  function itemPublicCopy(x){const o={}; Object.keys(x||{}).sort().forEach(k=>{if(!ITEM_META.has(k))o[k]=x[k]}); return o}
  function itemChanged(a,b){return !sameJSON(itemPublicCopy(a||{}), itemPublicCopy(b||{}))}
  function stamp(x){return Date.parse(x?._updatedAt||x?.updatedAt||x?._createdAt||x?.createdAt||x?.deletedAt||x?.date||0)||0}
  function settingsStamp(s){return Date.parse(s?._updatedAt||s?.updatedAt||0)||0}
  function isCollectionKey(k,v){return Array.isArray(v) && !META_KEYS.has(k)}
  function mergeMap(a,b){const out={...(isObj(a)?a:{})}; Object.keys(isObj(b)?b:{}).forEach(k=>{out[k]={...(out[k]||{}),...(b[k]||{})}}); return out}
  function collectDeleted(){
    const out={};
    for(const db of arguments){
      if(!isObj(db)) continue;
      DELETE_KEYS.forEach(key=>{const src=db[key]; if(!isObj(src))return; Object.keys(src).forEach(coll=>{out[coll]=out[coll]||{}; Object.assign(out[coll],src[coll]||{})})});
      Object.keys(db).forEach(coll=>{const arr=db[coll]; if(!Array.isArray(arr))return; arr.forEach(x=>{if(x&&x.id&&(x._deleted||x.deletedAt)){out[coll]=out[coll]||{}; out[coll][x.id]=x.deletedAt||x._updatedAt||now();}})});
    }
    return out;
  }
  function ensureDeleted(db){db.__deleted=mergeMap(db.__deleted,{}); db._deletedIds=mergeMap(db._deletedIds,{}); return db}
  function removeDeletedFromArrays(db){
    db=isObj(db)?db:{}; const del=collectDeleted(db);
    Object.keys(db).forEach(k=>{if(Array.isArray(db[k])){const d=del[k]||{}; db[k]=db[k].filter(x=>!(x&&x.id&&(d[x.id]||x._deleted||x.deletedAt)));}});
    db.__deleted=mergeMap(db.__deleted,del); db._deletedIds=mergeMap(db._deletedIds,del);
    return db;
  }
  function chooseItem(localItem,cloudItem,prefer){
    if(!localItem) return clone(cloudItem);
    if(!cloudItem) return clone(localItem);
    const ls=stamp(localItem), cs=stamp(cloudItem);
    if(ls>cs) return {...cloudItem,...localItem};
    if(cs>ls) return {...localItem,...cloudItem};
    return prefer==='cloud' ? {...localItem,...cloudItem} : {...cloudItem,...localItem};
  }
  function mergeArrays(localArr=[],cloudArr=[],coll='',deleted={},prefer='local'){
    const byId=new Map(), noId=[]; const del=deleted[coll]||{};
    function add(x,source){
      if(!x||typeof x!=='object') return;
      if(x.id){
        if(del[x.id]||x._deleted||x.deletedAt) return;
        const prev=byId.get(x.id);
        if(!prev) byId.set(x.id,{item:clone(x),source});
        else byId.set(x.id,{item:chooseItem(source==='local'?x:prev.item, source==='cloud'?x:prev.item, prefer),source:'merged'});
      }else{
        const key=JSON.stringify(x);
        if(!noId.some(y=>JSON.stringify(y)===key)) noId.push(clone(x));
      }
    }
    (cloudArr||[]).forEach(x=>add(x,'cloud'));
    (localArr||[]).forEach(x=>add(x,'local'));
    return [...byId.values()].map(v=>v.item).concat(noId);
  }
  function mergeSettings(local={},cloud={},prefer='local'){
    local=isObj(local)?local:{}; cloud=isObj(cloud)?cloud:{};
    const ls=settingsStamp(local), cs=settingsStamp(cloud);
    let out;
    if(ls && cs && cs>ls) out={...local,...cloud};
    else if(ls && cs && ls>cs) out={...cloud,...local};
    else out=prefer==='cloud'?{...local,...cloud}:{...cloud,...local};
    if(local.managerPassword && local.managerPassword!=='0000000000@@' && (!cloud.managerPassword || cloud.managerPassword==='0000000000@@')){
      out.managerPassword=local.managerPassword; out.forcePasswordChange=false;
    }
    out.companyKey=out.companyKey || local.companyKey || cloud.companyKey || DEFAULT_COMPANY;
    return out;
  }
  function mergeDB(local={},cloud={},opts={}){
    const prefer=opts.prefer||'local'; local=isObj(local)?local:{}; cloud=isObj(cloud)?cloud:{};
    const deleted=collectDeleted(local,cloud);
    const out={...cloud,...local};
    const keys=new Set([...Object.keys(cloud),...Object.keys(local)]);
    keys.forEach(k=>{if(isCollectionKey(k,local[k])||isCollectionKey(k,cloud[k])) out[k]=mergeArrays(local[k]||[],cloud[k]||[],k,deleted,prefer)});
    out.settings=mergeSettings(local.settings,cloud.settings,prefer);
    out.__deleted=mergeMap(cloud.__deleted,local.__deleted); out.__deleted=mergeMap(out.__deleted,deleted);
    out._deletedIds=mergeMap(cloud._deletedIds,local._deletedIds); out._deletedIds=mergeMap(out._deletedIds,deleted);
    return removeDeletedFromArrays(out);
  }
  function normalizeDB(db){
    db=isObj(db)?db:{}; db.settings=db.settings||{}; db.settings.companyKey=db.settings.companyKey||currentCompanyKey();
    ensureDeleted(db); return removeDeletedFromArrays(db);
  }
  function markLocalChanges(db){
    db=normalizeDB(db||{}); const base=state.snapshot||readLocal(); const t=now(); let changed=false;
    Object.keys(db).forEach(coll=>{
      if(!Array.isArray(db[coll])||META_KEYS.has(coll)) return;
      const before=Array.isArray(base[coll])?base[coll]:[];
      const beforeMap=new Map(before.filter(x=>x&&x.id).map(x=>[String(x.id),x]));
      const afterIds=new Set();
      db[coll].forEach(x=>{
        if(!x||typeof x!=='object'||!x.id) return;
        afterIds.add(String(x.id));
        const old=beforeMap.get(String(x.id));
        if(!old){x._createdAt=x._createdAt||t; x._updatedAt=t; changed=true;}
        else if(itemChanged(old,x)){x._updatedAt=t; changed=true;}
      });
      beforeMap.forEach((old,id)=>{
        if(!afterIds.has(id) && old && !old._deleted && !old.deletedAt){
          db.__deleted[coll]=db.__deleted[coll]||{}; db._deletedIds[coll]=db._deletedIds[coll]||{};
          db.__deleted[coll][id]=t; db._deletedIds[coll][id]=t; changed=true;
        }
      });
    });
    if(!sameJSON((base&&base.settings)||{},db.settings||{})) { db.settings._updatedAt=t; changed=true; }
    if(changed){db.lastLocalUpdate=t; state.lastLocalSaveAt=Date.now();}
    return db;
  }
  async function requestJSON(method,data,companyKey){
    const options={method,cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'}};
    if(data!==undefined) options.body=JSON.stringify(data||{});
    const r=await fetch(url(companyKey),options);
    if(!r.ok){let body=''; try{body=await r.text()}catch(e){} const err=new Error('تعذر الاتصال بفايربيز: '+r.status+' '+body.slice(0,120)); err.status=r.status; throw err;}
    try{return await r.json()}catch(e){return {}}
  }
  async function getCloud(companyKey){return await requestJSON('GET',undefined,companyKey)||{}}
  async function putCloud(db,companyKey){return await requestJSON('PUT',normalizeDB(db||{}),companyKey)}
  async function patchPath(path,data,companyKey){
    const cleanPath=String(path||'').replace(/^\/+|\/+$/g,'');
    const options={method:'PATCH',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'},body:JSON.stringify(data||{})};
    const r=await fetch(`${firebaseConfig.databaseURL}/${ROOT_PATH}/${currentCompanyKey(companyKey)}/${cleanPath}.json`,options);
    if(!r.ok){let body='';try{body=await r.text()}catch(e){}throw new Error('تعذر تحديث فايربيز: '+r.status+' '+body.slice(0,120));}
    try{return await r.json()}catch(e){return {}}
  }
  async function updateManagerPassword(password,companyKey){
    const pass=String(password||'').trim();
    if(!pass || pass==='0000000000@@' || pass.length<6) throw new Error('كلمة المرور الجديدة غير صالحة');
    const t=now();
    const db=normalizeDB(readLocal());
    db.settings=db.settings||{};
    db.settings.managerPassword=pass;
    db.settings.forcePasswordChange=false;
    db.settings._updatedAt=t;
    db.lastLocalUpdate=t;
    writeLocal(db);
    if(navigator.onLine){
      await patchPath('settings',{managerPassword:pass,forcePasswordChange:false,_updatedAt:t,companyKey:db.settings.companyKey||currentCompanyKey(companyKey)},companyKey||db.settings.companyKey);
      try{await syncCore(db,{companyKey:companyKey||db.settings.companyKey,rawLocal:true,prefer:'local'});}catch(e){console.warn(e)}
    }
    return db;
  }
  async function syncCore(localDB,opts={}){
    const companyKey=opts.companyKey || localDB?.settings?.companyKey || currentCompanyKey();
    let local=opts.rawLocal?normalizeDB(localDB||readLocal()):markLocalChanges(localDB||readLocal());
    const cloud=await getCloud(companyKey).catch(e=>{state.lastError=e; throw e});
    const merged=mergeDB(local,cloud,{prefer:opts.prefer||'local'});
    merged.lastSyncAt=now(); merged.lastLocalUpdate=merged.lastLocalUpdate||local.lastLocalUpdate||now();
    await putCloud(merged,companyKey).catch(e=>{state.lastError=e; throw e});
    writeLocal(merged); state.lastError=null; return merged;
  }
  function shouldAutoSync(){
    if(!navigator.onLine) return false;
    try{const u=JSON.parse(localStorage.getItem('currentUser')||'null'); if(u&&u.companyKey) return true;}catch(e){}
    return !/index\.html$/i.test(location.pathname) && !location.pathname.endsWith('/');
  }
  function queueSync(db){
    if(!shouldAutoSync()||state.applyingRemote) return;
    clearTimeout(state.syncTimer);
    state.syncTimer=setTimeout(async()=>{try{await syncCore(db||readLocal(),{prefer:'local'});}catch(e){console.warn(e);}},900);
  }
  async function pullMerge(companyKey,render=true){
    if(!navigator.onLine) return false;
    if(userIsEditing()) return false;
    if(Date.now()-state.lastLocalSaveAt<1800) return false;
    const before=readLocal();
    const cloud=await getCloud(companyKey||before?.settings?.companyKey).catch(e=>{state.lastError=e; return null});
    if(!cloud || !Object.keys(cloud).length) return false;
    const merged=mergeDB(before,cloud,{prefer:'cloud'}); merged.lastCloudPull=now();
    const changed=!sameJSON(before,merged);
    if(changed){state.applyingRemote=true; writeLocal(merged); try{window.DB=clone(merged);}catch(e){} state.applyingRemote=false; if(render) refreshPageFromDB();}
    return changed;
  }
  function refreshPageFromDB(){
    if(userIsEditing()) return;
    try{window.dispatchEvent(new CustomEvent('oskar-db-updated',{detail:{source:'cloud'}}));}catch(e){}
    try{if(typeof window.loadDB==='function') window.DB=window.loadDB();}catch(e){}
    try{if(typeof window.renderPage==='function' && document.readyState!=='loading') window.renderPage();}catch(e){console.warn(e)}
  }

  window.FirebaseBridge={
    config:firebaseConfig, root:currentCompanyKey, lastError:()=>state.lastError,
    async pullWithKey(companyKey){
      const local=readLocal(); const cloud=await getCloud(companyKey);
      if(!cloud || !Object.keys(cloud).length){state.snapshot=clone(local); return local;}
      const merged=mergeDB(local,cloud,{prefer:'cloud'}); merged.lastCloudPull=now(); writeLocal(merged); return merged;
    },
    async pushWithKey(companyKey){
      const local=markLocalChanges(readLocal());
      let cloud={}; try{cloud=await getCloud(companyKey||local?.settings?.companyKey)}catch(e){cloud={}};
      const merged=mergeDB(local,cloud,{prefer:'local'}); merged.lastSyncAt=now();
      await putCloud(merged,companyKey||merged?.settings?.companyKey); writeLocal(merged); return merged;
    },
    async sync(localDB,opts={}){if(!navigator.onLine) return normalizeDB(localDB||readLocal()); return await syncCore(localDB||readLocal(),{...opts,prefer:opts.prefer||'local'});},
    async pull(){return await this.pullWithKey(readLocal()?.settings?.companyKey)},
    async push(){return await this.pushWithKey(readLocal()?.settings?.companyKey)},
    async livePull(){return await pullMerge(readLocal()?.settings?.companyKey,true)},
    async updateManagerPassword(password,companyKey){return await updateManagerPassword(password,companyKey||readLocal()?.settings?.companyKey)},
    queueSync
  };

  function installPageHooks(){
    if(typeof window.saveDB==='function' && !window.saveDB.__oskarSyncFixed){
      window.saveDB=function(db){
        try{db=markLocalChanges(db||window.DB||readLocal()); writeLocal(db); window.DB=db; queueSync(db); return db;}
        catch(e){console.warn(e); localStorage.setItem(APP_KEY,JSON.stringify(db||{})); return db;}
      };
      window.saveDB.__oskarSyncFixed=true;
    }
    if(typeof window.persist==='function' && !window.persist.__oskarSyncFixed){
      window.persist=function(){
        const db=window.DB||readLocal();
        if(typeof window.saveDB==='function') window.saveDB(db); else {const d=markLocalChanges(db); writeLocal(d); queueSync(d);}
        try{if(typeof window.updateSyncState==='function') window.updateSyncState();}catch(e){}
      };
      window.persist.__oskarSyncFixed=true;
    }
    if(typeof window.syncNow==='function' && !window.syncNow.__oskarSyncFixed){
      window.syncNow=async function(show=true){
        try{
          if(!navigator.onLine){if(show) safeToast('لا يوجد اتصال'); return;}
          const merged=await window.FirebaseBridge.sync(window.DB||readLocal(),{prefer:'local'});
          window.DB=clone(merged); state.snapshot=clone(merged);
          if(show) safeToast('تمت المزامنة');
          try{if(typeof window.renderPage==='function') window.renderPage();}catch(e){}
        }catch(e){console.warn(e); if(show) safeToast('تعذر المزامنة، تأكد من صلاحيات Realtime Database');}
      };
      window.syncNow.__oskarSyncFixed=true;
    }
    if(!state.started && typeof window.renderPage==='function'){
      state.started=true;
      startLivePull();
    }
  }
  function startLivePull(){
    clearInterval(state.pullTimer);
    state.pullTimer=setInterval(()=>{if(shouldAutoSync()) pullMerge(readLocal()?.settings?.companyKey,true).catch(e=>console.warn(e));},5000);
    window.addEventListener('focus',()=>{if(shouldAutoSync()) pullMerge(readLocal()?.settings?.companyKey,true).catch(()=>{})});
    window.addEventListener('online',()=>{queueSync(readLocal()); pullMerge(readLocal()?.settings?.companyKey,true).catch(()=>{})});
  }
  document.addEventListener('input',markUserEditing,true);
  document.addEventListener('change',markUserEditing,true);
  document.addEventListener('focusin',e=>{if(editableElement(e.target)) markUserEditing();},true);
  document.addEventListener('keydown',e=>{if(editableElement(e.target)) markUserEditing();},true);
  state.snapshot=clone(readLocal());
  [0,80,250,600,1200,2500].forEach(ms=>setTimeout(installPageHooks,ms));
  document.addEventListener('DOMContentLoaded',()=>{installPageHooks(); setTimeout(installPageHooks,500);});
})();

/* ===== OSKAR MOBILE SIDEBAR FIX - 2026-05-08 ===== */
(function(){
  if(window.__OSKAR_MOBILE_SIDEBAR_FIX__) return;
  window.__OSKAR_MOBILE_SIDEBAR_FIX__ = true;
  const css = `
    @media (max-width:1099.98px){
      html body .drawer:not(.open){transform:translateX(105%) translateZ(0) !important;visibility:visible !important;}
      html body .drawer.open{transform:translateX(0) translateZ(0) !important;visibility:visible !important;}
      html body .drawer-overlay:not(.show){display:none !important;}
      html body .drawer-overlay.show{display:block !important;}
    }
    @media (min-width:1100px){
      html body .drawer{transform:none !important;right:0 !important;top:48px !important;width:280px !important;height:calc(100vh - 48px) !important;}
      html body .drawer-overlay{display:none !important;}
      html body .page{margin-right:280px !important;}
      html body .fab, html body .topbar .menu-open{display:none !important;}
    }`;
  function installStyle(){if(document.getElementById('oskar-mobile-sidebar-fix-style')) return; const st=document.createElement('style'); st.id='oskar-mobile-sidebar-fix-style'; st.textContent=css; (document.head||document.documentElement).appendChild(st);}
  installStyle();
  const isMobile=()=>window.matchMedia&&window.matchMedia('(max-width:1099.98px)').matches;
  function setHomeOpenOnly(){const drawer=document.getElementById('drawer')||document.querySelector('.drawer'); if(!drawer||!isMobile())return; drawer.querySelectorAll('.menu-group').forEach(group=>{const title=String(group.querySelector('.menu-head b')?.textContent||'').trim(); if(title==='الرئيسية') group.classList.add('open'); else group.classList.remove('open');});}
  function closeMobileDrawerOnStart(){if(!isMobile())return; const drawer=document.getElementById('drawer')||document.querySelector('.drawer'); const overlay=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay'); if(drawer)drawer.classList.remove('open'); if(overlay)overlay.classList.remove('show');}
  function applyInitialMobileState(){installStyle(); closeMobileDrawerOnStart(); setHomeOpenOnly();}
  function scheduleInitial(){[0,80,220,500,900].forEach(ms=>setTimeout(applyInitialMobileState,ms));}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',scheduleInitial,{once:true}); else scheduleInitial();
  window.addEventListener('resize',()=>{installStyle(); if(!isMobile()){const drawer=document.getElementById('drawer')||document.querySelector('.drawer'); const overlay=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay'); if(drawer)drawer.classList.remove('open'); if(overlay)overlay.classList.remove('show');}});
})();
