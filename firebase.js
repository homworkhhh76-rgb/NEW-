// firebase.js - طبقة الحفظ والمزامنة العامة لكاشير أوسكار
(function(){
  'use strict';

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCnLAY7zQyBy7gUuL9wszt9aEhiJgvRmxI",
    authDomain: "shop-d52dc.firebaseapp.com",
    databaseURL: "https://shop-d52dc-default-rtdb.firebaseio.com",
    projectId: "shop-d52dc",
    storageBucket: "shop-d52dc.appspot.com",
    messagingSenderId: "97580537866",
    appId: "1:97580537866:web:abc46e5a2f527b6300a7f3",
    measurementId: "G-956RQMBP42"
  };

  const APP_KEY='supermarket_pos_ar_v1';
  const ROOT_PATH='pos_projects';
  const DEFAULT_COMPANY='SUPER-0001';
  const DEFAULT_PASS='0000000000@@';
  const META_KEYS=new Set(['lastSyncAt','lastLocalUpdate','lastCloudPull','__deleted','_deletedIds','_syncMeta']);
  const ITEM_META=new Set(['_updatedAt','_createdAt','_deleted','deletedAt','_syncStamp']);
  const state={snapshot:null,syncTimer:null,pullTimer:null,installTimer:null,applyingRemote:false,writing:false,lastLocalSaveAt:0,lastUserEditAt:0,lastError:null,started:false,deferredRenderTimer:null,authToken:null,authTokenAt:0,sdkPromise:null,configReady:null,patchScriptLoaded:false};
  const originalSetItem=Storage.prototype.setItem;
  const originalRemoveItem=Storage.prototype.removeItem;

  window.firebaseConfig = window.firebaseConfig || DEFAULT_FIREBASE_CONFIG;

  function now(){return new Date().toISOString()}
  function isObj(v){return !!v && typeof v==='object' && !Array.isArray(v)}
  function clone(v){try{return JSON.parse(JSON.stringify(v||{}))}catch(e){return {}}}
  function readLocal(){try{return JSON.parse(localStorage.getItem(APP_KEY)||'{}')||{}}catch(e){return {}}}
  function writeRaw(db){state.writing=true;try{originalSetItem.call(localStorage,APP_KEY,JSON.stringify(db||{}));}finally{state.writing=false}}
  function writeLocal(db,opts={}){db=normalizeDB(db||{});writeRaw(db);if(opts.snapshot!==false)state.snapshot=clone(db);try{window.DB=db}catch(e){}}
  function cleanCompany(v){return String(v||DEFAULT_COMPANY).trim().replace(/[^a-zA-Z0-9_-]/g,'_') || DEFAULT_COMPANY}
  function cleanPass(v){return String(v||'').trim()}
  function safeToast(msg){try{if(window.toast) window.toast(msg)}catch(e){}}
  function sameJSON(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch(e){return false}}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

  function localConfigPromise(){
    if(state.configReady) return state.configReady;
    state.configReady=new Promise(resolve=>{
      try{
        if(document.querySelector('script[data-oskar-config]')) return resolve();
        const s=document.createElement('script');
        s.src='firebase-config.js?v=20260509-root-sync';
        s.dataset.oskarConfig='1';
        s.onload=()=>resolve();
        s.onerror=()=>resolve();
        (document.head||document.documentElement).appendChild(s);
        setTimeout(resolve,900);
      }catch(e){resolve();}
    });
    return state.configReady;
  }
  async function getConfig(){await localConfigPromise();return window.firebaseConfig||DEFAULT_FIREBASE_CONFIG}
  function currentCompanyKey(fallback){
    const db=readLocal(); let key=fallback || db?.settings?.companyKey;
    try{const u=JSON.parse(localStorage.getItem('currentUser')||'{}'); key=key || u.companyKey || u.managerKey;}catch(e){}
    return cleanCompany(key || DEFAULT_COMPANY)
  }
  function sanitizeForFirebase(v){
    try{return JSON.parse(JSON.stringify(v,function(k,val){
      if(typeof val==='function'||typeof val==='undefined') return undefined;
      if(typeof val==='number' && !isFinite(val)) return 0;
      return val;
    }))||{}}catch(e){return {}}
  }
  function appendQuery(u,k,v){return u+(u.includes('?')?'&':'?')+encodeURIComponent(k)+'='+encodeURIComponent(v)}
  async function baseUrl(companyKey,path){
    const cfg=await getConfig();
    if(!cfg.databaseURL) throw new Error('databaseURL غير موجود في firebase-config.js');
    const p=String(path||'').replace(/^\/+|\/+$/g,'');
    return cfg.databaseURL.replace(/\/+$/,'')+'/'+ROOT_PATH+'/'+currentCompanyKey(companyKey)+(p?'/'+p:'')+'.json';
  }
  function loadScript(src){return new Promise((resolve,reject)=>{try{if([...document.scripts].some(s=>s.src===src))return resolve();const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=reject;(document.head||document.documentElement).appendChild(s);}catch(e){reject(e)}})}
  async function ensureFirebaseSDK(){
    if(state.sdkPromise) return state.sdkPromise;
    state.sdkPromise=(async()=>{
      if(!window.firebase || !window.firebase.initializeApp){await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');}
      if(!window.firebase.auth){await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');}
      const cfg=await getConfig();
      if(!window.firebase.apps || !window.firebase.apps.length) window.firebase.initializeApp(cfg);
      return window.firebase;
    })();
    return state.sdkPromise;
  }
  async function getAuthToken(){
    if(state.authToken && Date.now()-state.authTokenAt<45*60*1000) return state.authToken;
    const fb=await ensureFirebaseSDK();
    if(!fb.auth) throw new Error('تعذر تحميل Firebase Auth');
    const auth=fb.auth();
    if(!auth.currentUser) await auth.signInAnonymously();
    state.authToken=await auth.currentUser.getIdToken(true);
    state.authTokenAt=Date.now();
    return state.authToken;
  }
  async function requestJSON(method,data,companyKey,path){
    const cleanData=data===undefined?undefined:sanitizeForFirebase(data||{});
    const body=cleanData===undefined?undefined:JSON.stringify(cleanData);
    let u=await baseUrl(companyKey,path);
    const opts={method,cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'}};
    if(body!==undefined) opts.body=body;
    let r=await fetch(u,opts).catch(e=>{throw new Error('تعذر الاتصال بفايربيز: '+(e&&e.message?e.message:e));});
    if(r.status===401||r.status===403){
      try{const token=await getAuthToken();r=await fetch(appendQuery(u,'auth',token),opts);}catch(e){}
    }
    if(!r.ok){let txt='';try{txt=await r.text()}catch(e){} const err=new Error('تعذر المزامنة مع Firebase: '+r.status+' '+txt.slice(0,160));err.status=r.status;err.body=txt;state.lastError=err;throw err;}
    state.lastError=null;
    try{return await r.json()}catch(e){return {}}
  }
  async function getCloud(companyKey){return await requestJSON('GET',undefined,companyKey)||{}}
  async function putCloud(db,companyKey){return await requestJSON('PUT',normalizeDB(db||{}),companyKey)}
  async function patchPath(path,data,companyKey){return await requestJSON('PATCH',data||{},companyKey,path)}

  function editableElement(el){if(!el)return false;const tag=String(el.tagName||'').toLowerCase();return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable;}
  function activeTyping(){const el=document.activeElement;return editableElement(el)&&el.type!=='button'&&el.type!=='submit'&&el.type!=='checkbox'&&el.type!=='radio';}
  function visible(el){if(!el)return false;const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null;}
  function pageHasOpenEditor(){try{if(window.oskarForceNoRemoteRender)return true;if(document.querySelector('.scanner[style*="flex"],#reader'))return true;const modal=[...document.querySelectorAll('.modal-back,.modal,[role=dialog]')].some(m=>visible(m)&&m.querySelector('input,textarea,select,form'));if(modal)return true;const main=document.getElementById('mainCard');if(main&&main.querySelector('form,#crudForm,#accForm,#editInvoiceForm,#manualDebtForm,#payDebtForm,#productFinalForm'))return true;}catch(e){}return false;}
  function markUserEditing(){state.lastUserEditAt=Date.now()}
  function userIsEditing(){try{if(typeof window.oskarIsUserEditing==='function'&&window.oskarIsUserEditing())return true;}catch(e){}return activeTyping()||pageHasOpenEditor()||Date.now()-state.lastUserEditAt<2500;}

  function itemPublicCopy(x){const o={};Object.keys(x||{}).sort().forEach(k=>{if(!ITEM_META.has(k))o[k]=x[k]});return o}
  function itemChanged(a,b){return !sameJSON(itemPublicCopy(a||{}),itemPublicCopy(b||{}))}
  function stamp(x){return Date.parse(x?._updatedAt||x?.updatedAt||x?._createdAt||x?.createdAt||x?.deletedAt||x?.date||0)||0}
  function settingsStamp(s){return Date.parse(s?._updatedAt||s?.updatedAt||0)||0}
  function isCollectionKey(k,v){return Array.isArray(v)&&!META_KEYS.has(k)}
  function mergeMap(a,b){const out={...(isObj(a)?a:{})};Object.keys(isObj(b)?b:{}).forEach(k=>{out[k]={...(out[k]||{}),...(b[k]||{})}});return out}
  function collectDeleted(){const out={};for(const db of arguments){if(!isObj(db))continue;['__deleted','_deletedIds'].forEach(key=>{const src=db[key];if(!isObj(src))return;Object.keys(src).forEach(coll=>{out[coll]=out[coll]||{};Object.assign(out[coll],src[coll]||{})})});Object.keys(db).forEach(coll=>{const arr=db[coll];if(!Array.isArray(arr))return;arr.forEach(x=>{if(x&&x.id&&(x._deleted||x.deletedAt)){out[coll]=out[coll]||{};out[coll][String(x.id)]=x.deletedAt||x._updatedAt||now();}})});}return out;}
  function ensureDeleted(db){db.__deleted=mergeMap(db.__deleted,{});db._deletedIds=mergeMap(db._deletedIds,{});return db}
  function removeDeletedFromArrays(db){db=isObj(db)?db:{};const del=collectDeleted(db);Object.keys(db).forEach(k=>{if(Array.isArray(db[k])){const d=del[k]||{};db[k]=db[k].filter(x=>!(x&&x.id&&(d[String(x.id)]||x._deleted||x.deletedAt)));}});db.__deleted=mergeMap(db.__deleted,del);db._deletedIds=mergeMap(db._deletedIds,del);return db;}
  function chooseItem(localItem,cloudItem,prefer){if(!localItem)return clone(cloudItem);if(!cloudItem)return clone(localItem);const ls=stamp(localItem),cs=stamp(cloudItem);if(ls>cs)return {...cloudItem,...localItem};if(cs>ls)return {...localItem,...cloudItem};return prefer==='cloud'?{...localItem,...cloudItem}:{...cloudItem,...localItem};}
  function mergeArrays(localArr=[],cloudArr=[],coll='',deleted={},prefer='local'){const byId=new Map(),noId=[];const del=deleted[coll]||{};function add(x,source){if(!x||typeof x!=='object')return;if(x.id){const id=String(x.id);if(del[id]||x._deleted||x.deletedAt)return;const prev=byId.get(id);if(!prev)byId.set(id,{item:clone(x),source});else byId.set(id,{item:chooseItem(source==='local'?x:prev.item,source==='cloud'?x:prev.item,prefer),source:'merged'});}else{const key=JSON.stringify(x);if(!noId.some(y=>JSON.stringify(y)===key))noId.push(clone(x));}}(cloudArr||[]).forEach(x=>add(x,'cloud'));(localArr||[]).forEach(x=>add(x,'local'));return [...byId.values()].map(v=>v.item).concat(noId);}
  function mergeSettings(local={},cloud={},prefer='local'){
    local=isObj(local)?local:{};cloud=isObj(cloud)?cloud:{};
    const ls=settingsStamp(local),cs=settingsStamp(cloud);
    let out;if(ls&&cs&&cs>ls)out={...local,...cloud};else if(ls&&cs&&ls>cs)out={...cloud,...local};else out=prefer==='cloud'?{...local,...cloud}:{...cloud,...local};
    const lp=cleanPass(local.managerPassword),cp=cleanPass(cloud.managerPassword);
    if(cp&&cp!==DEFAULT_PASS&&(!lp||lp===DEFAULT_PASS)){out.managerPassword=cp;out.forcePasswordChange=false;}
    else if(lp&&lp!==DEFAULT_PASS&&(!cp||cp===DEFAULT_PASS)){out.managerPassword=lp;out.forcePasswordChange=false;}
    else if(lp&&cp&&lp!==cp){
      if(cs>ls){out.managerPassword=cp;out.forcePasswordChange=cloud.forcePasswordChange===false?false:out.forcePasswordChange;}
      else if(ls>cs){out.managerPassword=lp;out.forcePasswordChange=local.forcePasswordChange===false?false:out.forcePasswordChange;}
      else out.managerPassword=prefer==='cloud'?cp:lp;
    }
    out.managerPassword=cleanPass(out.managerPassword||DEFAULT_PASS);
    if(out.managerPassword!==DEFAULT_PASS) out.forcePasswordChange=false;
    if(out.forcePasswordChange===undefined) out.forcePasswordChange=out.managerPassword===DEFAULT_PASS;
    out.companyKey=out.companyKey||local.companyKey||cloud.companyKey||DEFAULT_COMPANY;
    return out;
  }
  function mergeDB(local={},cloud={},opts={}){const prefer=opts.prefer||'local';local=isObj(local)?local:{};cloud=isObj(cloud)?cloud:{};const deleted=collectDeleted(local,cloud);const out={...cloud,...local};const keys=new Set([...Object.keys(cloud),...Object.keys(local)]);keys.forEach(k=>{if(isCollectionKey(k,local[k])||isCollectionKey(k,cloud[k]))out[k]=mergeArrays(local[k]||[],cloud[k]||[],k,deleted,prefer)});out.settings=mergeSettings(local.settings,cloud.settings,prefer);out.__deleted=mergeMap(cloud.__deleted,local.__deleted);out.__deleted=mergeMap(out.__deleted,deleted);out._deletedIds=mergeMap(cloud._deletedIds,local._deletedIds);out._deletedIds=mergeMap(out._deletedIds,deleted);return removeDeletedFromArrays(out);}
  function normalizeDB(db){db=isObj(db)?db:{};db.settings=db.settings||{};db.settings.companyKey=db.settings.companyKey||currentCompanyKey();ensureDeleted(db);return removeDeletedFromArrays(db);}
  function markLocalChanges(db){db=normalizeDB(db||{});const base=state.snapshot||readLocal();const t=now();let changed=false;Object.keys(db).forEach(coll=>{if(!Array.isArray(db[coll])||META_KEYS.has(coll))return;const before=Array.isArray(base[coll])?base[coll]:[];const beforeMap=new Map(before.filter(x=>x&&x.id).map(x=>[String(x.id),x]));const afterIds=new Set();db[coll].forEach(x=>{if(!x||typeof x!=='object'||!x.id)return;const id=String(x.id);afterIds.add(id);const old=beforeMap.get(id);if(!old){x._createdAt=x._createdAt||t;x._updatedAt=t;changed=true;}else if(itemChanged(old,x)){x._updatedAt=t;changed=true;}});beforeMap.forEach((old,id)=>{if(!afterIds.has(id)&&old&&!old._deleted&&!old.deletedAt){db.__deleted[coll]=db.__deleted[coll]||{};db._deletedIds[coll]=db._deletedIds[coll]||{};db.__deleted[coll][id]=t;db._deletedIds[coll][id]=t;changed=true;}});});if(!sameJSON((base&&base.settings)||{},db.settings||{})){db.settings._updatedAt=t;changed=true;}if(changed){db.lastLocalUpdate=t;state.lastLocalSaveAt=Date.now();}return db;}

  async function updateManagerPassword(password,companyKey){
    const pass=cleanPass(password); if(!pass||pass===DEFAULT_PASS||pass.length<6) throw new Error('كلمة المرور الجديدة غير صالحة');
    const key=currentCompanyKey(companyKey); const t=now();
    let db=normalizeDB(readLocal()); db.settings=db.settings||{}; db.settings.companyKey=key; db.settings.managerPassword=pass; db.settings.forcePasswordChange=false; db.settings._updatedAt=t; db.lastLocalUpdate=t;
    writeLocal(db);
    const settingsPatch={managerPassword:pass,forcePasswordChange:false,_updatedAt:t,companyKey:key};
    await patchPath('settings',settingsPatch,key);
    const cloud=await getCloud(key).catch(()=>null);
    if(!cloud||!cloud.settings||cleanPass(cloud.settings.managerPassword)!==pass) throw new Error('لم يتم تأكيد كلمة المرور من Firebase');
    db=mergeDB(db,cloud,{prefer:'cloud'}); writeLocal(db); return db;
  }
  async function syncCore(localDB,opts={}){
    const companyKey=currentCompanyKey(opts.companyKey||localDB?.settings?.companyKey);
    let local=opts.rawLocal?normalizeDB(localDB||readLocal()):markLocalChanges(localDB||readLocal());
    local.settings=local.settings||{}; local.settings.companyKey=companyKey;
    const cloud=await getCloud(companyKey).catch(e=>{state.lastError=e;throw e});
    const merged=mergeDB(local,cloud,{prefer:opts.prefer||'local'}); merged.settings.companyKey=companyKey; merged.lastSyncAt=now(); merged.lastLocalUpdate=merged.lastLocalUpdate||local.lastLocalUpdate||now();
    await putCloud(merged,companyKey).catch(e=>{state.lastError=e;throw e});
    writeLocal(merged); state.lastError=null; return merged;
  }
  function shouldAutoSync(){if(!navigator.onLine)return false;try{const u=JSON.parse(localStorage.getItem('currentUser')||'null');if(u&&u.companyKey)return true;}catch(e){}return !/index\.html$/i.test(location.pathname)&&!location.pathname.endsWith('/');}
  function queueSync(db,delay=1000){if(!navigator.onLine||state.applyingRemote)return;clearTimeout(state.syncTimer);state.syncTimer=setTimeout(async()=>{try{await syncCore(db||readLocal(),{prefer:'local'});}catch(e){console.warn(e);}},delay);}
  async function pullMerge(companyKey,render=true){if(!navigator.onLine)return false;if(userIsEditing())return false;if(Date.now()-state.lastLocalSaveAt<1800)return false;const before=readLocal();const cloud=await getCloud(companyKey||before?.settings?.companyKey).catch(e=>{state.lastError=e;return null});if(!cloud||!Object.keys(cloud).length)return false;if(userIsEditing())return false;const merged=mergeDB(before,cloud,{prefer:'cloud'});merged.lastCloudPull=now();const changed=!sameJSON(before,merged);if(changed){state.applyingRemote=true;writeLocal(merged);try{window.DB=clone(merged)}catch(e){}state.applyingRemote=false;if(render)refreshPageFromDB();}return changed;}
  function refreshPageFromDB(){if(userIsEditing()){clearTimeout(state.deferredRenderTimer);state.deferredRenderTimer=setTimeout(()=>{if(!userIsEditing())refreshPageFromDB();},5000);return;}try{window.dispatchEvent(new CustomEvent('oskar-db-updated',{detail:{source:'cloud'}}));}catch(e){}try{if(typeof window.loadDB==='function')window.DB=window.loadDB();}catch(e){}try{if(typeof window.renderPage==='function'&&document.readyState!=='loading')window.renderPage();}catch(e){console.warn(e)}}

  try{
    Storage.prototype.setItem=function(key,value){
      if(key===APP_KEY&&!state.writing&&!state.applyingRemote){
        try{let db=JSON.parse(String(value||'{}'));db=markLocalChanges(db);value=JSON.stringify(db);state.snapshot=clone(db);originalSetItem.call(this,key,value);try{window.DB=db}catch(e){}queueSync(db);return;}catch(e){console.warn(e)}
      }
      return originalSetItem.call(this,key,value);
    };
    Storage.prototype.removeItem=function(key){return originalRemoveItem.call(this,key)};
  }catch(e){}

  window.FirebaseBridge={
    get config(){return window.firebaseConfig||DEFAULT_FIREBASE_CONFIG}, root:currentCompanyKey, lastError:()=>state.lastError,
    async getCloudWithKey(companyKey){return await getCloud(companyKey)},
    async pullWithKey(companyKey){const key=currentCompanyKey(companyKey);const local=readLocal();const cloud=await getCloud(key);if(!cloud||!Object.keys(cloud).length){state.snapshot=clone(local);return local;}const merged=mergeDB(local,cloud,{prefer:'cloud'});merged.settings=merged.settings||{};merged.settings.companyKey=key;merged.lastCloudPull=now();writeLocal(merged);return merged;},
    async pushWithKey(companyKey){const local=markLocalChanges(readLocal());let cloud={};try{cloud=await getCloud(companyKey||local?.settings?.companyKey)}catch(e){cloud={}}const merged=mergeDB(local,cloud,{prefer:'local'});merged.lastSyncAt=now();await putCloud(merged,companyKey||merged?.settings?.companyKey);writeLocal(merged);return merged;},
    async sync(localDB,opts={}){if(!navigator.onLine)return normalizeDB(localDB||readLocal());return await syncCore(localDB||readLocal(),{...opts,prefer:opts.prefer||'local'});},
    async pull(){return await this.pullWithKey(readLocal()?.settings?.companyKey)},
    async push(){return await this.pushWithKey(readLocal()?.settings?.companyKey)},
    async livePull(){return await pullMerge(readLocal()?.settings?.companyKey,true)},
    async updateManagerPassword(password,companyKey){return await updateManagerPassword(password,companyKey||readLocal()?.settings?.companyKey)},
    queueSync, isUserEditing:userIsEditing
  };

  function installPageHooks(){
    if(typeof window.saveDB==='function'&&!window.saveDB.__oskarRootSync){const old=window.saveDB;window.saveDB=function(db){try{db=markLocalChanges(db||window.DB||readLocal());writeLocal(db);queueSync(db);return db;}catch(e){console.warn(e);return old.apply(this,arguments)}};window.saveDB.__oskarRootSync=true;}
    if(typeof window.persist==='function'&&!window.persist.__oskarRootSync){window.persist=function(){const db=window.DB||readLocal();if(typeof window.saveDB==='function')window.saveDB(db);else{const d=markLocalChanges(db);writeLocal(d);queueSync(d);}try{if(typeof window.updateSyncState==='function')window.updateSyncState();}catch(e){}};window.persist.__oskarRootSync=true;}
    if(typeof window.syncNow==='function'&&!window.syncNow.__oskarRootSync){window.syncNow=async function(show=true){const btn=document.querySelector('.top-actions button[onclick*="syncNow"],.top-actions button[title*="مزامنة"]');try{if(btn)btn.classList.add('syncing');if(!navigator.onLine){if(show)safeToast('لا يوجد اتصال');return readLocal();}const merged=await window.FirebaseBridge.sync(window.DB||readLocal(),{prefer:'local'});try{window.DB=clone(merged)}catch(e){}state.snapshot=clone(merged);if(show)safeToast('تمت المزامنة مع Firebase');if(!activeTyping()){try{if(typeof window.renderPage==='function')window.renderPage();}catch(e){}}return merged;}catch(e){console.warn(e);if(show)safeToast('تعذر المزامنة مع Firebase');throw e;}finally{if(btn)btn.classList.remove('syncing');try{if(typeof window.updateSyncState==='function')window.updateSyncState();}catch(e){}}};window.syncNow.__oskarRootSync=true;}
    if(!state.started&&typeof window.renderPage==='function'){state.started=true;startLivePull();}
  }
  function startLivePull(){clearInterval(state.pullTimer);state.pullTimer=setInterval(()=>{if(shouldAutoSync())pullMerge(readLocal()?.settings?.companyKey,true).catch(e=>console.warn(e));},2600);window.addEventListener('focus',()=>{if(shouldAutoSync()&&!userIsEditing())pullMerge(readLocal()?.settings?.companyKey,true).catch(()=>{})});window.addEventListener('online',()=>{queueSync(readLocal(),400);if(!userIsEditing())pullMerge(readLocal()?.settings?.companyKey,true).catch(()=>{})});}
  function loadPatchScript(){if(state.patchScriptLoaded)return;state.patchScriptLoaded=true;try{const s=document.createElement('script');s.src='تعديل.js?v=20260509-live-unit-stock';s.defer=true;(document.head||document.documentElement).appendChild(s);}catch(e){}}

  document.addEventListener('input',markUserEditing,true);document.addEventListener('change',markUserEditing,true);document.addEventListener('focusin',e=>{if(editableElement(e.target))markUserEditing();},true);document.addEventListener('keydown',e=>{if(editableElement(e.target))markUserEditing();},true);
  state.snapshot=clone(readLocal());
  [0,80,250,600,1200,2500,5000,9000].forEach(ms=>setTimeout(installPageHooks,ms));
  state.installTimer=setInterval(installPageHooks,1500);setTimeout(()=>clearInterval(state.installTimer),45000);
  document.addEventListener('DOMContentLoaded',()=>{installPageHooks();loadPatchScript();setTimeout(installPageHooks,500);});
  if(document.readyState!=='loading'){loadPatchScript();}

  /* إصلاح القائمة الجانبية للجوال بدون وميض */
  (function(){
    if(window.__OSKAR_MOBILE_SIDEBAR_FIX__) return; window.__OSKAR_MOBILE_SIDEBAR_FIX__=true;
    try{document.documentElement.classList.add('oskar-mobile-boot-closed')}catch(e){}
    const css=`@media (max-width:1099.98px){html.oskar-mobile-boot-closed body .drawer{transition:none!important;transform:translateX(105%) translateZ(0)!important}html.oskar-mobile-boot-closed body .drawer.open{transform:translateX(105%) translateZ(0)!important}html.oskar-mobile-boot-closed body .drawer-overlay{display:none!important}html body .drawer:not(.open){transform:translateX(105%) translateZ(0)!important;visibility:visible!important}html body .drawer.open{transform:translateX(0) translateZ(0)!important;visibility:visible!important}html body .drawer-overlay:not(.show){display:none!important}html body .drawer-overlay.show{display:block!important}}@media (min-width:1100px){html body .drawer{transform:none!important;right:0!important;top:48px!important;width:280px!important;height:calc(100vh - 48px)!important}html body .drawer-overlay{display:none!important}html body .page{margin-right:280px!important}html body .fab,html body .topbar .menu-open{display:none!important}}`;
    function st(){if(document.getElementById('oskar-mobile-sidebar-fix-style'))return;const x=document.createElement('style');x.id='oskar-mobile-sidebar-fix-style';x.textContent=css;(document.head||document.documentElement).appendChild(x)}
    const mob=()=>window.matchMedia&&window.matchMedia('(max-width:1099.98px)').matches;
    function home(){const d=document.getElementById('drawer')||document.querySelector('.drawer');if(!d||!mob())return;d.querySelectorAll('.menu-group').forEach(g=>{const t=String(g.querySelector('.menu-head b')?.textContent||'').trim();if(t==='الرئيسية')g.classList.add('open');else g.classList.remove('open')})}
    function closeOnce(){if(!mob())return;const d=document.getElementById('drawer')||document.querySelector('.drawer'),o=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay');if(d)d.classList.remove('open');if(o)o.classList.remove('show')}
    function patchButtons(){window.openDrawer=function(){document.documentElement.classList.remove('oskar-mobile-boot-closed');const d=document.getElementById('drawer')||document.querySelector('.drawer'),o=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay');if(d)d.classList.add('open');if(o)o.classList.add('show')};window.closeDrawer=function(){const d=document.getElementById('drawer')||document.querySelector('.drawer'),o=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay');if(d)d.classList.remove('open');if(o)o.classList.remove('show')}}
    function apply(){st();patchButtons();closeOnce();home();setTimeout(()=>document.documentElement.classList.remove('oskar-mobile-boot-closed'),430)}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  })();
})();
