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
  function mergeArrays(localArr=[], cloudArr=[]){
    const map=new Map();
    function ts(x){return Date.parse(x?._updatedAt||x?.deletedAt||x?.updatedAt||x?.createdAt||x?.date||0)||0;}
    [...cloudArr,...localArr].forEach(x=>{if(!x||!x.id)return;const p=map.get(x.id);if(!p||ts(x)>=ts(p))map.set(x.id,{...(p||{}),...x});});
    return [...map.values()].sort((a,b)=>String(b._updatedAt||b.createdAt||b.date||'').localeCompare(String(a._updatedAt||a.createdAt||a.date||'')));
  }
  function mergeDB(local={}, cloud={}){
    const out={...cloud,...local};
    Object.keys({...cloud,...local}).forEach(k=>{ if(Array.isArray(local[k])||Array.isArray(cloud[k])) out[k]=mergeArrays(local[k]||[], cloud[k]||[]); });
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
