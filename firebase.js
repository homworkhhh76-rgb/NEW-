// firebase.js - ملف فايربيز الوحيد في المشروع
// يعمل بنظام Offline First: التخزين المحلي هو الأساس، والمزامنة تتم عند توفر الإنترنت.
// إذا كان رابط Realtime Database مختلفاً، عدّل databaseURL فقط.
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
  function userRoot(){
    try { const u=JSON.parse(localStorage.getItem('currentUser')||'{}'); return (u.managerId||u.id||'main').replace(/[^a-zA-Z0-9_-]/g,'_'); } catch(e){ return 'main'; }
  }
  async function getCloud(){
    const url=`${firebaseConfig.databaseURL}/pos_projects/${userRoot()}.json`;
    const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('Firebase pull failed'); return await r.json() || {};
  }
  async function putCloud(data){
    const url=`${firebaseConfig.databaseURL}/pos_projects/${userRoot()}.json`;
    const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!r.ok) throw new Error('Firebase push failed'); return await r.json();
  }
  function mergeArrays(localArr=[], cloudArr=[]){
    const map=new Map(); [...cloudArr,...localArr].forEach(x=>{ if(x&&x.id) map.set(x.id,{...(map.get(x.id)||{}),...x}); });
    return [...map.values()].sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
  }
  function mergeDB(local, cloud){
    const out={...cloud,...local};
    Object.keys({...cloud,...local}).forEach(k=>{ if(Array.isArray(local[k])||Array.isArray(cloud[k])) out[k]=mergeArrays(local[k]||[], cloud[k]||[]); });
    out.settings={...(cloud.settings||{}),...(local.settings||{})};
    return out;
  }
  window.FirebaseBridge={
    config:firebaseConfig,
    async sync(localDB){
      if(!navigator.onLine) return localDB;
      const current=localDB || JSON.parse(localStorage.getItem(APP_KEY)||'{}');
      let cloud={}; try{cloud=await getCloud()}catch(e){cloud={}}
      const merged=mergeDB(current, cloud);
      localStorage.setItem(APP_KEY, JSON.stringify(merged));
      await putCloud(merged);
      return merged;
    },
    async pull(){ const cloud=await getCloud(); localStorage.setItem(APP_KEY,JSON.stringify(cloud)); return cloud; },
    async push(){ const db=JSON.parse(localStorage.getItem(APP_KEY)||'{}'); return await putCloud(db); }
  };
})();
