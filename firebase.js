// firebase.js - ملف فايربيز الوحيد في المشروع
// إصلاح مركزي للمزامنة: يلتقط أي حفظ/تعديل/حذف من كل الصفحات ثم يدمجه مع Firebase.
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
  if(window.__OSKAR_FIREBASE_SYNC_CORE_V3__) return;
  window.__OSKAR_FIREBASE_SYNC_CORE_V3__ = true;

  const APP_KEY = 'supermarket_pos_ar_v1';
  const DEFAULT_COMPANY = 'SUPER-0001';
  const META_KEYS = new Set(['_updatedAt','updatedAt','lastLocalUpdate','lastSyncAt','_dirty','_syncSeq']);
  const KNOWN_ARRAYS = [
    'accounts','branches','units','employees','activityLog','accountMovements','products','customers','suppliers',
    'sales','draftSales','quotations','purchases','expenses','wages','debts','debtPayments','manualDebts','payments',
    'stockMovements','stockTransfers','damagedStock','returns','saleReturns','purchaseReturns','cashierSessions',
    'groups','brands','priceGroups','customerGroups','variations','taxRates','invoices','invoicePrints','workers','bestSellers',
    'restaurantProducts','restaurantOrders','restaurantSales','restaurantExpenses','restaurantTables','restaurantMenu',
    'restaurantReservations','restaurantWastage','restaurantPayments','restaurantInventoryMovements','restaurantLoyalty',
    'restaurantCategories','restaurantRecipes'
  ];

  const nativeGet = Storage.prototype.getItem;
  const nativeSet = Storage.prototype.setItem;
  const nativeRemove = Storage.prototype.removeItem;
  let internalWrite = false;
  let syncTimer = null;
  let writeSeq = Number(sessionStorage.getItem('oskar_sync_seq') || '0') || 0;

  function now(){ return new Date().toISOString(); }
  function safeJSON(v, fallback){ try{ return JSON.parse(v); }catch(e){ return fallback; } }
  function clone(v){ return safeJSON(JSON.stringify(v == null ? {} : v), {}); }
  function readRaw(){ return nativeGet.call(localStorage, APP_KEY); }
  function readLocal(){ return safeJSON(readRaw() || '{}', {}) || {}; }
  function writeRaw(db){ internalWrite = true; try{ nativeSet.call(localStorage, APP_KEY, JSON.stringify(db || {})); } finally { internalWrite = false; } }
  function cleanKey(v){ return String(v || DEFAULT_COMPANY).trim().replace(/[^a-zA-Z0-9_-]/g,'_') || DEFAULT_COMPANY; }
  function companyKey(companyKey){
    const db = readLocal();
    let key = companyKey || db?.settings?.companyKey;
    try{ const u = safeJSON(nativeGet.call(localStorage,'currentUser') || '{}', {}); key = key || u.companyKey || u.managerKey; }catch(e){}
    return cleanKey(key || DEFAULT_COMPANY);
  }
  function firebaseURL(companyKeyArg){ return `${firebaseConfig.databaseURL}/pos_projects/${companyKey(companyKeyArg)}.json`; }
  function isPlainObject(x){ return x && typeof x === 'object' && !Array.isArray(x); }
  function objKeys(o){ return o && typeof o === 'object' ? Object.keys(o) : []; }
  function allKeys(a,b){ return Array.from(new Set([...(objKeys(a)),...(objKeys(b))])); }
  function stampValue(x){
    if(!x || typeof x !== 'object') return 0;
    const raw = x._updatedAt || x.updatedAt || x.deletedAt || x.createdAt || x.date || x.time || '';
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : (Number(x._syncSeq || 0) || 0);
  }
  function stable(v){
    if(Array.isArray(v)) return v.map(stable);
    if(isPlainObject(v)){
      const out = {};
      Object.keys(v).sort().forEach(k=>{ if(!META_KEYS.has(k)) out[k] = stable(v[k]); });
      return out;
    }
    return v;
  }
  function stableString(v){ try{ return JSON.stringify(stable(v)); }catch(e){ return ''; } }
  function nextSeq(){ writeSeq += 1; try{ sessionStorage.setItem('oskar_sync_seq', String(writeSeq)); }catch(e){} return writeSeq; }
  function makeId(prefix){ return `${prefix || 'id'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }
  function mergeDeleted(a,b){
    const out = {};
    [a?.__deleted, a?._deletedIds, b?.__deleted, b?._deletedIds].forEach(src=>{
      if(!src || typeof src !== 'object') return;
      Object.keys(src).forEach(coll=>{
        out[coll] = out[coll] || {};
        Object.keys(src[coll] || {}).forEach(id=>{
          const oldT = Date.parse(out[coll][id] || '') || 0;
          const newT = Date.parse(src[coll][id] || '') || 0;
          if(!out[coll][id] || newT >= oldT) out[coll][id] = src[coll][id] || now();
        });
      });
    });
    return out;
  }
  function noteDeletion(deleted, coll, id, ts){
    if(!coll || !id) return;
    deleted[coll] = deleted[coll] || {};
    deleted[coll][String(id)] = deleted[coll][String(id)] || ts || now();
  }
  function detectDeleted(prev, next, deleted){
    allKeys(prev,next).forEach(coll=>{
      if(coll === '__deleted' || coll === '_deletedIds') return;
      if(!Array.isArray(prev?.[coll]) || !Array.isArray(next?.[coll])) return;
      const before = new Set(prev[coll].filter(x=>x && x.id).map(x=>String(x.id)));
      const after = new Set(next[coll].filter(x=>x && x.id).map(x=>String(x.id)));
      before.forEach(id=>{ if(!after.has(id)) noteDeletion(deleted, coll, id, now()); });
    });
  }
  function normalizeArray(arr, coll, prevArr, deleted, markDirty){
    const prevMap = new Map((Array.isArray(prevArr) ? prevArr : []).filter(x=>x && x.id).map(x=>[String(x.id), x]));
    const seen = new Set();
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach((item)=>{
      if(!item || typeof item !== 'object') return;
      const x = {...item};
      if(!x.id) x.id = makeId(coll);
      x.id = String(x.id);
      if(seen.has(x.id)) return;
      seen.add(x.id);
      if(x._deleted || x.deletedAt){ noteDeletion(deleted, coll, x.id, x.deletedAt || x._updatedAt || now()); return; }
      if(deleted?.[coll]?.[x.id]) return;
      const p = prevMap.get(x.id);
      if(!x.createdAt && p?.createdAt) x.createdAt = p.createdAt;
      if(!x.createdAt) x.createdAt = now();
      const changed = !p || stableString(p) !== stableString(x);
      if(markDirty && changed){
        x._updatedAt = now();
        x._syncSeq = nextSeq();
        x._dirty = true;
      }else if(!x._updatedAt){
        x._updatedAt = p?._updatedAt || p?.updatedAt || x.createdAt || now();
      }
      out.push(x);
    });
    return out;
  }
  function normalizeDB(input, prev, opts){
    const db = clone(input || {});
    const before = prev || {};
    const markDirty = opts?.markDirty !== false;
    db.settings = {...(db.settings || {})};
    db.settings.companyKey = db.settings.companyKey || before?.settings?.companyKey || companyKey() || DEFAULT_COMPANY;
    const deleted = mergeDeleted(before, db);
    if(opts?.detectDeletes !== false) detectDeleted(before, db, deleted);
    const keys = Array.from(new Set([...KNOWN_ARRAYS, ...allKeys(before,db).filter(k=>Array.isArray(before?.[k]) || Array.isArray(db?.[k]))]));
    keys.forEach(k=>{ db[k] = normalizeArray(db[k] || [], k, before[k] || [], deleted, markDirty); });
    if(!db.accounts.some(a=>a && a.id === 'cash-main')){
      db.accounts.unshift({id:'cash-main',name:'الصندوق الرئيسي',code:'1001',type:'الأصول المتداولة',balance:0,openingBalance:0,active:'نشط',createdAt:now(),_updatedAt:now(),_syncSeq:nextSeq()});
    }
    db.__deleted = deleted;
    db._deletedIds = deleted;
    db.lastLocalUpdate = db.lastLocalUpdate || now();
    return db;
  }
  function assignGlobal(db){
    window.DB = db;
    try{ DB = db; }catch(e){}
  }
  function commitLocal(db, opts){
    const prev = readLocal();
    const normalized = normalizeDB(db || prev, prev, opts || {});
    normalized.lastLocalUpdate = now();
    writeRaw(normalized);
    assignGlobal(normalized);
    try{ if(typeof updateSyncState === 'function') updateSyncState(); }catch(e){}
    if(!opts || opts.sync !== false) scheduleSync();
    return normalized;
  }
  function purgeDeleted(db){
    const deleted = mergeDeleted(db, db);
    Object.keys(deleted).forEach(coll=>{
      const ids = deleted[coll] || {};
      if(Array.isArray(db[coll])) db[coll] = db[coll].filter(x=>!x || !x.id || !ids[String(x.id)]);
    });
    db.__deleted = deleted;
    db._deletedIds = deleted;
    return db;
  }
  function sanitizeFirebase(v){
    if(v === undefined || typeof v === 'function' || typeof v === 'symbol') return null;
    if(v === null || typeof v !== 'object') return v;
    if(Array.isArray(v)) return v.map(sanitizeFirebase);
    const out = {};
    Object.keys(v).forEach(k=>{
      const safeKey = String(k).replace(/[.#$\[\]\/]/g,'_');
      out[safeKey] = sanitizeFirebase(v[k]);
    });
    return out;
  }
  async function getCloud(companyKeyArg){
    const r = await fetch(firebaseURL(companyKeyArg), {cache:'no-store'});
    if(!r.ok){
      const txt = await r.text().catch(()=>r.statusText);
      throw new Error('Firebase pull failed: '+r.status+' '+txt);
    }
    return await r.json() || {};
  }
  async function putCloud(data, companyKeyArg){
    const payload = JSON.stringify(sanitizeFirebase(data || {}));
    const r = await fetch(firebaseURL(companyKeyArg), {method:'PUT',headers:{'Content-Type':'application/json'},body:payload});
    if(!r.ok){
      const txt = await r.text().catch(()=>r.statusText);
      throw new Error('Firebase push failed: '+r.status+' '+txt);
    }
    return await r.json();
  }
  function mergeArrays(localArr, cloudArr, coll, deleted){
    const map = new Map();
    function put(item, source){
      if(!item || typeof item !== 'object' || !item.id) return;
      const id = String(item.id);
      const delAt = Date.parse(deleted?.[coll]?.[id] || '') || 0;
      const itemAt = stampValue(item);
      if(item._deleted || item.deletedAt || (delAt && delAt >= itemAt)) return;
      const old = map.get(id);
      if(!old || itemAt >= stampValue(old) || source === 'local') map.set(id, {...old, ...item, id});
    }
    (Array.isArray(cloudArr) ? cloudArr : []).forEach(x=>put(x,'cloud'));
    (Array.isArray(localArr) ? localArr : []).forEach(x=>put(x,'local'));
    return Array.from(map.values()).sort((a,b)=>stampValue(b)-stampValue(a));
  }
  function mergeDB(local, cloud){
    const localNorm = normalizeDB(local || {}, {}, {markDirty:false, detectDeletes:false});
    const cloudNorm = normalizeDB(cloud || {}, {}, {markDirty:false, detectDeletes:false});
    const deleted = mergeDeleted(localNorm, cloudNorm);
    const out = {...cloudNorm, ...localNorm};
    const keys = Array.from(new Set([...KNOWN_ARRAYS, ...allKeys(localNorm,cloudNorm).filter(k=>Array.isArray(localNorm?.[k]) || Array.isArray(cloudNorm?.[k]))]));
    keys.forEach(k=>{ out[k] = mergeArrays(localNorm[k] || [], cloudNorm[k] || [], k, deleted); });
    out.settings = {...(cloudNorm.settings || {}), ...(localNorm.settings || {})};
    out.settings.companyKey = out.settings.companyKey || localNorm?.settings?.companyKey || cloudNorm?.settings?.companyKey || companyKey() || DEFAULT_COMPANY;
    out.__deleted = deleted;
    out._deletedIds = deleted;
    out.lastSyncAt = now();
    out.lastLocalUpdate = localNorm.lastLocalUpdate || now();
    return purgeDeleted(out);
  }
  function scheduleSync(){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async()=>{
      if(!navigator.onLine || !window.FirebaseBridge) return;
      try{ await window.FirebaseBridge.sync(readLocal(), {silent:true}); }
      catch(e){ console.warn('OSKAR background sync skipped:', e); }
    }, 900);
  }

  // يلتقط أي حفظ مباشر من الصفحات، ويضيف طابع تعديل/حذف قبل التخزين.
  Storage.prototype.setItem = function(key, value){
    if(this === localStorage && key === APP_KEY && !internalWrite){
      try{
        const prev = readLocal();
        const incoming = safeJSON(String(value || '{}'), {});
        const normalized = normalizeDB(incoming, prev, {markDirty:true, detectDeletes:true});
        const changed = stableString(prev) !== stableString(normalized);
        value = JSON.stringify(normalized);
        assignGlobal(normalized);
        const res = nativeSet.call(this, key, value);
        if(changed) scheduleSync();
        return res;
      }catch(e){ console.warn('OSKAR local save guard fallback:', e); }
    }
    return nativeSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function(key){
    if(this === localStorage && key === APP_KEY && !internalWrite){
      console.warn('OSKAR blocked removing main DB key to protect data.');
      return;
    }
    return nativeRemove.call(this, key);
  };

  window.FirebaseBridge = {
    config: firebaseConfig,
    root: companyKey,
    readLocal,
    commitLocal,
    mergeDB,
    async pullWithKey(key){
      const cloud = await getCloud(key);
      if(cloud && Object.keys(cloud).length){
        const normalized = normalizeDB(cloud, {}, {markDirty:false, detectDeletes:false});
        normalized.settings = {...(normalized.settings||{}), companyKey: companyKey(key)};
        writeRaw(normalized);
        assignGlobal(normalized);
        return normalized;
      }
      return cloud || {};
    },
    async pushWithKey(key){
      return await this.sync(readLocal(), {companyKey:key});
    },
    async sync(localDB, opts){
      if(!navigator.onLine) return commitLocal(localDB || readLocal(), {sync:false});
      const local = commitLocal(localDB || readLocal(), {sync:false});
      const key = opts?.companyKey || local?.settings?.companyKey || companyKey();
      const cloud = await getCloud(key).catch(err=>{
        if(opts?.silent) console.warn('OSKAR pull failed, trying push-safe merge with local only:', err);
        return {};
      });
      const merged = mergeDB(local, cloud || {});
      merged.settings = {...(merged.settings||{}), companyKey: companyKey(key)};
      await putCloud(merged, key);
      merged.lastSyncAt = now();
      merged.lastLocalUpdate = now();
      writeRaw(merged);
      assignGlobal(merged);
      try{ if(typeof updateSyncState === 'function') updateSyncState(); }catch(e){}
      return merged;
    },
    async pull(){ return await this.pullWithKey(readLocal()?.settings?.companyKey); },
    async push(){ return await this.pushWithKey(readLocal()?.settings?.companyKey); }
  };

  function installRuntimePatches(){
    window.__OSKAR_RUNTIME_SAVE_PATCHED_V3__ = true;

    window.saveDB = function(db){ return commitLocal(db || readLocal(), {sync:true}); };
    try{ saveDB = window.saveDB; }catch(e){}

    window.collection = function(name){
      const db = (function(){ try{ return DB || window.DB || readLocal(); }catch(e){ return window.DB || readLocal(); } })();
      if(!Array.isArray(db[name])) db[name] = [];
      assignGlobal(db);
      return db[name];
    };
    try{ collection = window.collection; }catch(e){}

    window.persist = function(){
      let db; try{ db = DB || window.DB || readLocal(); }catch(e){ db = window.DB || readLocal(); }
      return commitLocal(db, {sync:true});
    };
    try{ persist = window.persist; }catch(e){}

    window.syncNow = async function(show=true){
      const btn = document.querySelector('.top-actions button[onclick*="syncNow"], button[onclick*="syncNow"]');
      try{
        if(btn) btn.classList.add('syncing');
        if(!navigator.onLine){ if(show && typeof toast === 'function') toast('لا يوجد اتصال، البيانات محفوظة محليًا'); return readLocal(); }
        const db = await window.FirebaseBridge.sync((function(){ try{return DB || window.DB || readLocal();}catch(e){return window.DB || readLocal();} })(), {});
        assignGlobal(db);
        if(show && typeof toast === 'function') toast('تمت المزامنة مع Firebase');
        try{ if(typeof renderPage === 'function') renderPage(); }catch(e){}
        return db;
      }catch(e){
        console.error('OSKAR sync failed:', e);
        if(show && typeof toast === 'function') toast('تعذر المزامنة، تحقق من اتصال Firebase أو صلاحيات قاعدة البيانات');
        return readLocal();
      }finally{ if(btn) btn.classList.remove('syncing'); }
    };
    try{ syncNow = window.syncNow; }catch(e){}

    // تقوية الحفظ العام في صفحات CRUD مثل الموردين والعملاء والفئات بدون تغيير الواجهة.
    if(typeof window.saveCrud === 'function' || (typeof saveCrud !== 'undefined')){
      const oldSaveCrud = (typeof saveCrud === 'function') ? saveCrud : window.saveCrud;
      window.saveCrud = function(){
        try{
          const cfg = (typeof CFG !== 'undefined' ? CFG : (window.PAGE_CONFIG || {}));
          const form = document.getElementById('crudForm');
          if(form && cfg && cfg.collection){
            const fd = new FormData(form);
            const data = Object.fromEntries(fd.entries());
            const permList = fd.getAll('perm').filter(Boolean);
            if(fd.get('allPerms')) data.permissions = ['*'];
            else if(permList.length) data.permissions = permList;
            const wasEdit = !!data.id;
            let db; try{ db = DB || window.DB || readLocal(); }catch(e){ db = window.DB || readLocal(); }
            if(!Array.isArray(db[cfg.collection])) db[cfg.collection] = [];
            const arr = db[cfg.collection];
            if(data.id){
              const idx = arr.findIndex(x=>String(x.id) === String(data.id));
              if(idx >= 0) arr[idx] = {...arr[idx], ...data, updatedAt: (typeof nowText === 'function' ? nowText() : now()), _updatedAt: now(), _syncSeq: nextSeq(), _dirty:true};
              else arr.unshift({...data, id:String(data.id), createdAt:now(), _updatedAt:now(), _syncSeq:nextSeq(), _dirty:true});
            }else{
              data.id = (typeof uid === 'function' ? uid(cfg.collection) : makeId(cfg.collection));
              data.createdAt = (typeof nowText === 'function' ? nowText() : now());
              data.createdBy = (typeof currentUser === 'function' ? currentUser().name : 'مدير النظام');
              data._updatedAt = now(); data._syncSeq = nextSeq(); data._dirty = true;
              arr.unshift(data);
            }
            assignGlobal(db);
            commitLocal(db, {sync:true});
            try{ if(typeof logAction === 'function') logAction(wasEdit ? 'تعديل' : 'إضافة', cfg.title || cfg.collection, data.name || data.id); }catch(e){}
            try{ if(typeof closeModal === 'function') closeModal(); }catch(e){}
            try{ if(typeof renderPage === 'function') renderPage(); }catch(e){}
            try{ if(typeof toast === 'function') toast('تم الحفظ'); }catch(e){}
            return;
          }
        }catch(e){ console.warn('OSKAR CRUD guard fallback:', e); }
        return oldSaveCrud && oldSaveCrud.apply(this, arguments);
      };
      try{ saveCrud = window.saveCrud; }catch(e){}
    }

    if(typeof window.deleteRec === 'function' || (typeof deleteRec !== 'undefined')){
      const oldDeleteRec = (typeof deleteRec === 'function') ? deleteRec : window.deleteRec;
      window.deleteRec = function(id){
        try{
          const cfg = (typeof CFG !== 'undefined' ? CFG : (window.PAGE_CONFIG || {}));
          if(cfg && cfg.collection){
            if(!confirm('تأكيد الحذف؟')) return;
            let db; try{ db = DB || window.DB || readLocal(); }catch(e){ db = window.DB || readLocal(); }
            if(!Array.isArray(db[cfg.collection])) db[cfg.collection] = [];
            const beforeLen = db[cfg.collection].length;
            db.__deleted = db.__deleted || {}; db._deletedIds = db._deletedIds || {};
            noteDeletion(db.__deleted, cfg.collection, String(id), now());
            noteDeletion(db._deletedIds, cfg.collection, String(id), now());
            db[cfg.collection] = db[cfg.collection].filter(x=>!x || String(x.id) !== String(id));
            assignGlobal(db);
            commitLocal(db, {sync:true});
            try{ if(typeof logAction === 'function') logAction('حذف', cfg.title || cfg.collection, id); }catch(e){}
            try{ if(typeof renderPage === 'function') renderPage(); }catch(e){}
            try{ if(typeof toast === 'function') toast(beforeLen ? 'تم الحذف' : 'تم'); }catch(e){}
            return;
          }
        }catch(e){ console.warn('OSKAR delete guard fallback:', e); }
        return oldDeleteRec && oldDeleteRec.apply(this, arguments);
      };
      try{ deleteRec = window.deleteRec; }catch(e){}
    }
  }

  function latePatch(){
    installRuntimePatches();
    try{ assignGlobal(normalizeDB((function(){try{return DB||window.DB||readLocal()}catch(e){return window.DB||readLocal()}})(), readLocal(), {markDirty:false, detectDeletes:false})); }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', latePatch, {once:true});
  else latePatch();
  [80,300,900,1800].forEach(ms=>setTimeout(latePatch, ms));
  window.addEventListener('online', ()=>scheduleSync());
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
