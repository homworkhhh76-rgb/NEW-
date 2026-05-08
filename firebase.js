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

/* ===== OSKAR FIREBASE SAVE/EDIT/DELETE SYNC FIX - 2026-05-08 =====
   إصلاح محدود داخل ملف Firebase فقط:
   - لا يغير صفحات الموقع أو التصميم.
   - يحافظ على الحفظ المحلي كما هو.
   - يضيف ختم تحديث للتعديلات حتى لا يغلبها القديم في Firebase.
   - يحفظ علامات حذف تلقائياً عندما يحذف أي صف من أي جدول، حتى لا يرجعه الدمج من السحابة.
   - يشغل مزامنة هادئة بعد أي حفظ محلي على مفتاح بيانات البرنامج.
*/
(function(){
  if(window.__OSKAR_FIREBASE_SYNC_FIX_V2__) return;
  window.__OSKAR_FIREBASE_SYNC_FIX_V2__ = true;

  const APP_KEY = 'supermarket_pos_ar_v1';
  const FALLBACK_COMPANY = 'SUPER-0001';
  let internalWrite = false;
  let autoTimer = null;
  let autoBusy = false;
  let autoPending = false;

  const originalSetItem = Storage.prototype.setItem;

  function now(){ return new Date().toISOString(); }
  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v){ try{return JSON.parse(JSON.stringify(v||{}));}catch(e){return {}; } }
  function parse(v){ try{return JSON.parse(v || '{}') || {}; }catch(e){ return {}; } }
  function readLocal(){ return parse(localStorage.getItem(APP_KEY)); }
  function writeLocal(db){
    internalWrite = true;
    try{ localStorage.setItem(APP_KEY, JSON.stringify(db || {})); }
    finally{ internalWrite = false; }
  }
  function clean(v){ return String(v || FALLBACK_COMPANY).trim().replace(/[^a-zA-Z0-9_-]/g,'_') || FALLBACK_COMPANY; }
  function companyRoot(companyKey){
    const db = readLocal();
    let key = companyKey || db?.settings?.companyKey;
    try{
      const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
      key = key || u.companyKey || u.managerKey;
    }catch(e){}
    return clean(key || FALLBACK_COMPANY);
  }
  function url(companyKey){ return `${firebaseConfig.databaseURL}/pos_projects/${companyRoot(companyKey)}.json`; }
  async function getCloud(companyKey){
    const r = await fetch(url(companyKey), {cache:'no-store'});
    if(!r.ok) throw new Error('Firebase pull failed: ' + r.status);
    return await r.json() || {};
  }
  async function putCloud(data, companyKey){
    const r = await fetch(url(companyKey), {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data || {})
    });
    if(!r.ok) throw new Error('Firebase push failed: ' + r.status);
    return await r.json();
  }

  function mergeDeleted(){
    const out = {};
    for(const src of arguments){
      if(!src) continue;
      const pools = [src.__deleted, src._deletedIds];
      pools.forEach(pool=>{
        if(!isObj(pool)) return;
        Object.keys(pool).forEach(coll=>{
          out[coll] = out[coll] || {};
          if(isObj(pool[coll])) Object.assign(out[coll], pool[coll]);
        });
      });
      Object.keys(src).forEach(coll=>{
        const arr = src[coll];
        if(!Array.isArray(arr)) return;
        arr.forEach(row=>{
          if(row && row.id && (row._deleted || row.deletedAt)){
            out[coll] = out[coll] || {};
            out[coll][row.id] = row.deletedAt || row._updatedAt || row.updatedAt || now();
          }
        });
      });
    }
    return out;
  }

  function rememberDeleted(db, coll, id, t){
    if(!db || !coll || !id) return;
    t = t || now();
    db.__deleted = db.__deleted || {};
    db.__deleted[coll] = db.__deleted[coll] || {};
    db.__deleted[coll][id] = db.__deleted[coll][id] || t;
    db._deletedIds = db._deletedIds || {};
    db._deletedIds[coll] = db._deletedIds[coll] || {};
    db._deletedIds[coll][id] = db._deletedIds[coll][id] || t;
  }

  function strippedForCompare(row){
    if(!isObj(row)) return row;
    const x = {...row};
    delete x._updatedAt;
    delete x.updatedAt;
    delete x.lastSyncAt;
    delete x.lastLocalUpdate;
    return x;
  }
  function sameRow(a,b){
    try{return JSON.stringify(strippedForCompare(a)) === JSON.stringify(strippedForCompare(b));}
    catch(e){return false;}
  }
  function rowTime(row){
    return Date.parse(row?._updatedAt || row?.updatedAt || row?.deletedAt || row?.createdAt || row?.date || row?.time || 0) || 0;
  }

  function normalizeLocalChange(next, prev){
    next = clone(next);
    prev = clone(prev);
    const t = now();
    const deleted = mergeDeleted(prev, next);

    // لو كود الصفحة حذف صفاً من المصفوفة بدون تسجيل علامة حذف، نسجلها هنا تلقائياً.
    Object.keys(prev).forEach(coll=>{
      if(!Array.isArray(prev[coll]) || !Array.isArray(next[coll])) return;
      const nextIds = new Set(next[coll].filter(x=>x && x.id).map(x=>String(x.id)));
      prev[coll].forEach(oldRow=>{
        if(oldRow && oldRow.id && !nextIds.has(String(oldRow.id))){
          deleted[coll] = deleted[coll] || {};
          deleted[coll][oldRow.id] = deleted[coll][oldRow.id] || t;
        }
      });
    });

    // نختم الصفوف الجديدة أو المعدلة حتى يغلب التعديل المحلي على نسخة Firebase القديمة.
    Object.keys(next).forEach(coll=>{
      if(!Array.isArray(next[coll])) return;
      const oldMap = new Map((prev[coll] || []).filter(x=>x && x.id).map(x=>[String(x.id), x]));
      next[coll] = next[coll].filter(row=>{
        if(!row || typeof row !== 'object') return true;
        if(row.id && (row._deleted || row.deletedAt)){
          deleted[coll] = deleted[coll] || {};
          deleted[coll][row.id] = row.deletedAt || row._updatedAt || t;
          return false;
        }
        if(row.id){
          const old = oldMap.get(String(row.id));
          if(!old){
            row.createdAt = row.createdAt || t;
            row._updatedAt = row._updatedAt || t;
          }else if(!sameRow(old,row)){
            row._updatedAt = t;
          }
        }
        return true;
      });
    });

    Object.keys(deleted).forEach(coll=>{
      const ids = deleted[coll] || {};
      if(Array.isArray(next[coll])) next[coll] = next[coll].filter(row=>!row || !row.id || !ids[row.id]);
      Object.keys(ids).forEach(id=>rememberDeleted(next, coll, id, ids[id]));
    });

    next.settings = next.settings || {};
    next.settings.companyKey = next.settings.companyKey || prev?.settings?.companyKey || FALLBACK_COMPANY;
    next.lastLocalUpdate = t;
    return next;
  }

  function mergeArrays(localArr, cloudArr, coll, deleted){
    const map = new Map();
    const del = (deleted && deleted[coll]) || {};
    function add(row, source){
      if(!row || typeof row !== 'object') return;
      if(row.id && (del[row.id] || row._deleted || row.deletedAt)) return;
      if(!row.id){
        const key = 'noid:' + JSON.stringify(row);
        if(!map.has(key)) map.set(key, row);
        return;
      }
      const key = String(row.id);
      const old = map.get(key);
      if(!old){ map.set(key, {...row}); return; }
      const nt = rowTime(row), ot = rowTime(old);
      // عند تساوي الوقت نخلي المحلي يغلب، لأن المستخدم ضغط حفظ الآن وقد لا تكون الصفحات القديمة كتبت تاريخ تحديث.
      if(nt > ot || (nt === ot && source === 'local')) map.set(key, {...old, ...row});
    }
    (cloudArr || []).forEach(row=>add(row,'cloud'));
    (localArr || []).forEach(row=>add(row,'local'));
    return Array.from(map.values()).sort((a,b)=>String(b._updatedAt||b.updatedAt||b.createdAt||b.date||'').localeCompare(String(a._updatedAt||a.updatedAt||a.createdAt||a.date||'')));
  }

  function mergeDB(local, cloud){
    local = normalizeLocalChange(local || {}, readLocal());
    cloud = clone(cloud || {});
    const deleted = mergeDeleted(cloud, local);
    const out = {...cloud, ...local};
    const keys = new Set([...Object.keys(cloud), ...Object.keys(local)]);
    keys.forEach(k=>{
      if(Array.isArray(cloud[k]) || Array.isArray(local[k])){
        out[k] = mergeArrays(local[k] || [], cloud[k] || [], k, deleted);
      }else if(isObj(cloud[k]) || isObj(local[k])){
        out[k] = {...(cloud[k] || {}), ...(local[k] || {})};
      }
    });
    out.settings = {...(cloud.settings || {}), ...(local.settings || {})};
    out.settings.companyKey = out.settings.companyKey || local?.settings?.companyKey || cloud?.settings?.companyKey || FALLBACK_COMPANY;
    out.__deleted = {};
    out._deletedIds = {};
    Object.keys(deleted).forEach(coll=>{
      out.__deleted[coll] = {...(deleted[coll] || {})};
      out._deletedIds[coll] = {...(deleted[coll] || {})};
      if(Array.isArray(out[coll])) out[coll] = out[coll].filter(row=>!row || !row.id || !deleted[coll][row.id]);
    });
    out.lastSyncAt = now();
    return out;
  }

  function scheduleAutoSync(delay){
    if(internalWrite) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(runAutoSync, delay || 450);
  }

  async function runAutoSync(){
    if(!navigator.onLine || !window.FirebaseBridge) return;
    if(autoBusy){ autoPending = true; return; }
    autoBusy = true;
    try{
      const local = readLocal();
      if(local && Object.keys(local).length) await window.FirebaseBridge.sync(local, {companyKey:local?.settings?.companyKey});
    }catch(e){ console.warn('Oskar Firebase auto sync skipped:', e); }
    finally{
      autoBusy = false;
      if(autoPending){ autoPending = false; scheduleAutoSync(300); }
    }
  }

  // نراقب حفظ بيانات البرنامج فقط. أي حفظ/تعديل/حذف محلي يمر من هنا بدون لمس كود الصفحات.
  Storage.prototype.setItem = function(key, value){
    if(key === APP_KEY && !internalWrite){
      const prev = readLocal();
      const normalized = normalizeLocalChange(parse(value), prev);
      originalSetItem.call(this, key, JSON.stringify(normalized));
      scheduleAutoSync(350);
      return;
    }
    return originalSetItem.call(this, key, value);
  };

  window.FirebaseBridge = {
    config: firebaseConfig,
    root: companyRoot,
    async pullWithKey(companyKey){
      const cloud = await getCloud(companyKey);
      if(cloud && Object.keys(cloud).length){
        const merged = mergeDB(readLocal(), cloud);
        writeLocal(merged);
        try{ if(typeof window.DB === 'object') window.DB = merged; }catch(e){}
        return merged;
      }
      return cloud || {};
    },
    async pushWithKey(companyKey){
      const db = normalizeLocalChange(readLocal(), readLocal());
      writeLocal(db);
      await putCloud(db, companyKey || db?.settings?.companyKey);
      return db;
    },
    async sync(localDB, opts={}){
      const base = normalizeLocalChange(localDB || readLocal(), readLocal());
      if(!navigator.onLine){ writeLocal(base); return base; }
      let cloud = {};
      try{ cloud = await getCloud(opts.companyKey || base?.settings?.companyKey); }catch(e){ cloud = {}; }
      const merged = mergeDB(base, cloud);
      writeLocal(merged);
      await putCloud(merged, opts.companyKey || merged?.settings?.companyKey);
      try{ if(typeof window.DB === 'object') window.DB = merged; }catch(e){}
      return merged;
    },
    async pull(){ return await this.pullWithKey(readLocal()?.settings?.companyKey); },
    async push(){ return await this.pushWithKey(readLocal()?.settings?.companyKey); },
    _mergeDB: mergeDB,
    _normalizeLocalChange: normalizeLocalChange
  };

  window.addEventListener('online',()=>scheduleAutoSync(250));

  // بعد ما تنتهي الصفحة من تعريف saveDB/persist/syncNow نغلفها فقط، بدون تغيير منطق الموقع.
  function patchPageSaveFunctions(){
    if(typeof window.saveDB === 'function' && !window.saveDB.__oskarSyncWrapped){
      const oldSaveDB = window.saveDB;
      const wrappedSaveDB = function(db){
        const res = oldSaveDB.apply(this, arguments);
        try{
          const latest = normalizeLocalChange(db || readLocal(), readLocal());
          writeLocal(latest);
          if(db && typeof db === 'object') Object.assign(db, latest);
          try{ window.DB = latest; }catch(e){}
          scheduleAutoSync(350);
        }catch(e){ console.warn('saveDB sync patch skipped:', e); }
        return res;
      };
      wrappedSaveDB.__oskarSyncWrapped = true;
      wrappedSaveDB.__oskarOriginal = oldSaveDB;
      window.saveDB = wrappedSaveDB;
    }

    if(typeof window.persist === 'function' && !window.persist.__oskarSyncWrapped){
      const oldPersist = window.persist;
      const wrappedPersist = function(){
        const res = oldPersist.apply(this, arguments);
        try{
          const latest = normalizeLocalChange((typeof window.DB === 'object' && window.DB) ? window.DB : readLocal(), readLocal());
          writeLocal(latest);
          try{ window.DB = latest; }catch(e){}
          scheduleAutoSync(300);
        }catch(e){ console.warn('persist sync patch skipped:', e); }
        return res;
      };
      wrappedPersist.__oskarSyncWrapped = true;
      wrappedPersist.__oskarOriginal = oldPersist;
      window.persist = wrappedPersist;
    }

    if(!window.syncNow || !window.syncNow.__oskarSyncWrapped){
      const oldSyncNow = window.syncNow;
      const wrappedSyncNow = async function(show=true){
        const btn = document.querySelector('.top-actions button[onclick*="syncNow"],.top-actions button[title*="مزامنة"],button[onclick*="syncNow"]');
        try{
          if(btn) btn.classList.add('syncing');
          const local = normalizeLocalChange((typeof window.DB === 'object' && window.DB) ? window.DB : readLocal(), readLocal());
          writeLocal(local);
          if(!navigator.onLine){ if(show && window.toast) toast('لا يوجد اتصال، البيانات محفوظة محليًا'); return local; }
          const synced = await window.FirebaseBridge.sync(local, {companyKey:local?.settings?.companyKey});
          try{ window.DB = synced; }catch(e){}
          if(show && window.toast) toast('تمت المزامنة مع Firebase');
          try{ if(typeof renderPage === 'function') renderPage(); }catch(e){}
          return synced;
        }catch(e){
          console.warn(e);
          if(show && window.toast) toast('تعذر المزامنة، البيانات محفوظة محليًا');
          if(oldSyncNow && oldSyncNow !== wrappedSyncNow){ try{return await oldSyncNow(show);}catch(_){} }
          return readLocal();
        }finally{
          if(btn) btn.classList.remove('syncing');
        }
      };
      wrappedSyncNow.__oskarSyncWrapped = true;
      wrappedSyncNow.__oskarOriginal = oldSyncNow;
      window.syncNow = wrappedSyncNow;
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(patchPageSaveFunctions,0),{once:true});
  else setTimeout(patchPageSaveFunctions,0);
  [80,250,700,1500].forEach(ms=>setTimeout(patchPageSaveFunctions,ms));
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
