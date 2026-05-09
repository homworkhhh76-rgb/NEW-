/* oskar-core-fix.js - إصلاح مركزي بدون باتشات متداخلة */
(function(){
  'use strict';
  if(window.__OSKAR_CORE_FIX_20260509__) return;
  window.__OSKAR_CORE_FIX_20260509__=true;
  const APP='supermarket_pos_ar_v1';
  const DEFAULT_PASS='0000000000@@';
  let syncTimer=null, installing=false;
  const now=()=>new Date().toISOString();
  const safe=n=>Number(n||0)||0;
  const clean=s=>String(s??'').trim();
  function toast(m){try{if(window.toast) window.toast(m); else console.log(m)}catch(e){console.log(m)}}
  function read(){try{return JSON.parse(localStorage.getItem(APP)||'{}')||{}}catch(e){return {}}}
  function write(db){localStorage.setItem(APP,JSON.stringify(db||{})); setDB(db||{}); return db||{};}
  function getDB(){try{if(typeof DB!=='undefined'&&DB&&typeof DB==='object')return DB}catch(e){} return window.DB||read();}
  function setDB(db){try{DB=db}catch(e){} window.DB=db;}
  function arr(db,k){if(!Array.isArray(db[k]))db[k]=[]; return db[k];}
  function companyKey(db){return clean(db?.settings?.companyKey)||'SUPER-0001'}
  function stampObject(x){if(x&&typeof x==='object'){x._updatedAt=now();x.updatedAt=x.updatedAt||x._updatedAt;}return x}
  function cartonSize(p){return safe(p.unitsPerCarton||p.cartonSize||p.piecesPerCarton)||0}
  function lineFactor(item,db){if(safe(item.factor))return safe(item.factor); if(item.unit==='كرتونة'){const p=arr(db,'products').find(x=>x.id===item.productId)||{}; return cartonSize(p)||1} return 1}
  function normalizeProduct(p){
    if(!p||typeof p!=='object')return p;
    const cs=cartonSize(p);
    if(cs>0){p.cartonSize=cs;p.unitsPerCarton=cs;}
    const isCarton=p.unit==='كرتونة'||p.inputUnit==='كرتونة';
    if(p.stockUnits===undefined||p.stockUnits===null||p.stockUnits===''){
      p.stockUnits=isCarton&&cs>1&&!p.__unitStockNormalized?safe(p.stock)*cs:safe(p.stock);
      p.__unitStockNormalized=true;
    }
    p.stock=safe(p.stockUnits!==undefined?p.stockUnits:p.stock);
    p.stockUnits=p.stock;
    if(!p.unitPurchasePrice) p.unitPurchasePrice=safe(p.purchasePrice);
    if(!p.unitSalePrice) p.unitSalePrice=safe(p.salePrice||p.price);
    if(cs>0){
      if(!p.cartonPurchasePrice&&p.unitPurchasePrice) p.cartonPurchasePrice=safe(p.unitPurchasePrice)*cs;
      if(!p.cartonSalePrice&&p.cartonPrice) p.cartonSalePrice=safe(p.cartonPrice);
      if(!p.cartonSalePrice&&p.unitSalePrice) p.cartonSalePrice=safe(p.unitSalePrice)*cs;
    }
    p.purchasePrice=safe(p.unitPurchasePrice||p.purchasePrice);
    p.salePrice=safe(p.unitSalePrice||p.salePrice||p.price);
    return p;
  }
  function normalizeDB(db){db=db&&typeof db==='object'?db:{};db.settings=db.settings||{};db.settings.companyKey=companyKey(db);arr(db,'products').forEach(normalizeProduct);db.__deleted=db.__deleted||{};db._deletedIds=db._deletedIds||{};return db;}
  function saveLocal(db){db=normalizeDB(db||getDB());db.lastLocalUpdate=now();write(db);return db;}
  function markDeleted(db,collection,id){db.__deleted=db.__deleted||{};db._deletedIds=db._deletedIds||{};db.__deleted[collection]=db.__deleted[collection]||{};db._deletedIds[collection]=db._deletedIds[collection]||{};db.__deleted[collection][id]=now();db._deletedIds[collection][id]=db.__deleted[collection][id];}
  function syncButton(){return [...document.querySelectorAll('button,.icon-btn')].find(b=>/syncNow|مزامنة|↻/i.test((b.getAttribute('onclick')||'')+' '+(b.title||'')+' '+(b.textContent||'')));}
  function setSpin(on){const b=syncButton(); if(b)b.classList.toggle('syncing',!!on)}
  function queueSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow(false),450)}
  async function syncNow(show=true){
    const db=saveLocal(getDB());
    if(!navigator.onLine||!window.FirebaseBridge){if(show)toast('البيانات محفوظة محليًا - لا يوجد اتصال');return db;}
    setSpin(true);
    try{const merged=await window.FirebaseBridge.sync(db,{companyKey:companyKey(db),prefer:'local'});write(normalizeDB(merged));if(show)toast('تمت المزامنة مع Firebase');try{if(typeof renderPage==='function'&&!window.oskarIsUserEditing?.())renderPage()}catch(e){}return merged;}
    catch(e){console.warn('OSKAR sync error',e);if(show)toast('تعذر المزامنة مع Firebase، تم الحفظ محليًا');return db;}
    finally{setSpin(false)}
  }
  function installSaveHooks(){
    if(installing)return; installing=true;
    try{
      const oldSave=window.saveDB;
      if(typeof oldSave==='function'&&!oldSave.__oskarCoreFix){
        const fixed=function(db){db=saveLocal(db||getDB());queueSync();return db}; fixed.__oskarCoreFix=true; window.saveDB=fixed; try{saveDB=fixed}catch(e){}
      }
      const oldPersist=window.persist;
      if(typeof oldPersist==='function'&&!oldPersist.__oskarCoreFix){
        const fixed=function(){const db=saveLocal(getDB());try{if(typeof updateSyncState==='function')updateSyncState()}catch(e){}queueSync();return db}; fixed.__oskarCoreFix=true; window.persist=fixed; try{persist=fixed}catch(e){}
      }
      window.syncNow=syncNow; try{syncNow.__oskarCoreFix=true}catch(e){}
    }finally{installing=false;}
  }
  function installCrudFixes(){
    if(window.__oskarCrudFixInstalled)return; window.__oskarCrudFixInstalled=true;
    const oldSaveCrud=window.saveCrud;
    window.saveCrud=function(){
      const cfg=window.PAGE_CONFIG||{}; const form=document.getElementById('crudForm');
      if(!form||cfg.collection!=='products') return oldSaveCrud?oldSaveCrud.apply(this,arguments):undefined;
      const db=getDB(); const list=arr(db,'products'); const data=Object.fromEntries(new FormData(form).entries());
      if(data.stock!==undefined){ data.stock=safe(data.stock); data.stockUnits=data.stock; }
      if(data.stockUnits!==undefined) data.stockUnits=safe(data.stockUnits);
      ['purchasePrice','salePrice','cartonPrice','cartonSize','unitsPerCarton','unitPurchasePrice','unitSalePrice','cartonPurchasePrice','cartonSalePrice'].forEach(k=>{if(data[k]!==undefined&&data[k]!=='' )data[k]=safe(data[k])});
      if(data.id){const i=list.findIndex(x=>x.id===data.id); if(i>=0)list[i]=stampObject(normalizeProduct({...list[i],...data}));}
      else{data.id=(window.uid?uid('products'):'prd-'+Date.now());data.createdAt=(window.nowText?nowText():new Date().toLocaleString('ar-EG',{hour12:false}));list.unshift(stampObject(normalizeProduct(data)));}
      saveLocal(db);queueSync();try{if(window.logAction)logAction(data.id?'تعديل':'إضافة','الأصناف',data.name||data.id)}catch(e){}
      try{closeModal()}catch(e){} try{renderPage()}catch(e){} toast('تم حفظ الصنف وتحديث المخزون');
    };
    try{saveCrud=window.saveCrud}catch(e){}
    const oldDelete=window.deleteRec;
    window.deleteRec=function(id){
      const cfg=window.PAGE_CONFIG||{}; if(!id||!cfg.collection) return oldDelete?oldDelete.apply(this,arguments):undefined;
      if(!confirm('تأكيد الحذف؟'))return;
      const db=getDB(); const list=arr(db,cfg.collection); const before=list.length; db[cfg.collection]=list.filter(x=>String(x.id)!==String(id));
      if(db[cfg.collection].length!==before){markDeleted(db,cfg.collection,id);saveLocal(db);queueSync();try{if(window.logAction)logAction('حذف',cfg.title||cfg.collection,id)}catch(e){}try{renderPage()}catch(e){}toast('تم الحذف والمزامنة ستتم تلقائيًا');return;}
      return oldDelete?oldDelete.apply(this,arguments):undefined;
    };
    try{deleteRec=window.deleteRec}catch(e){}
  }
  function installPurchaseFix(){
    const old=window.savePurchase; if(typeof old!=='function'||old.__oskarCoreFix)return;
    const fixed=function(){
      const db=getDB(); const cart=(typeof window.cart!=='undefined'?window.cart:(typeof cart!=='undefined'?cart:[]));
      cart.forEach(i=>{i.factor=lineFactor(i,db);i.total=safe(i.qty)*safe(i.unitPrice)-safe(i.discount)});
      const before=arr(db,'purchases').length; const result=old.apply(this,arguments);
      const afterDB=getDB(); const rec=arr(afterDB,'purchases')[0];
      if(arr(afterDB,'purchases').length>before&&rec&&Array.isArray(rec.items)){
        rec.items.forEach(i=>{i.factor=lineFactor(i,afterDB)});
        normalizeDB(afterDB); saveLocal(afterDB); queueSync();
      }
      return result;
    }; fixed.__oskarCoreFix=true; window.savePurchase=fixed; try{savePurchase=fixed}catch(e){}
  }
  async function installLoginFix(){
    if(!/index\.html$|\/$/.test(location.pathname))return;
    const oldLogin=window.login; if(window.__oskarLoginFixInstalled)return; window.__oskarLoginFixInstalled=true;
    window.login=async function(){
      const role=document.getElementById('role')?.value||'manager'; const pass=clean(document.getElementById('password')?.value); const user=clean(document.getElementById('username')?.value); const key=clean(document.getElementById('companyKey')?.value)||companyKey(getDB());
      let db=getDB(); db.settings=db.settings||{}; db.settings.companyKey=key; write(db);
      if(window.FirebaseBridge&&navigator.onLine){try{await window.FirebaseBridge.pullWithKey(key); db=getDB();}catch(e){console.warn('login pull skipped',e)}}
      if(role==='manager'){
        const cloudPass=clean(db.settings.managerPassword||DEFAULT_PASS);
        if(pass!==cloudPass) return toast('كلمة مرور المدير غير صحيحة');
        if(cloudPass===DEFAULT_PASS||db.settings.forcePasswordChange){
          const p=prompt('يجب تغيير كلمة مرور المدير الآن. اكتب كلمة مرور جديدة:');
          if(!p||clean(p).length<6||clean(p)===DEFAULT_PASS)return toast('كلمة المرور الجديدة غير صالحة');
          db.settings.managerPassword=clean(p); db.settings.forcePasswordChange=false; db.settings._updatedAt=now(); saveLocal(db);
          if(window.FirebaseBridge&&navigator.onLine){try{await window.FirebaseBridge.updateManagerPassword(clean(p),key)}catch(e){await syncNow(false)}}
        }
        localStorage.setItem('currentUser',JSON.stringify({id:'manager',name:'مدير النظام',username:'admin',role:'Admin',permissions:['*'],active:'نشط',companyKey:key})); location.href='لوحة-المتابعة.html'; return;
      }
      const emp=(db.employees||[]).find(e=>[e.username,e.email,e.name,e.phone,e.mobile].map(x=>clean(x).toLowerCase()).includes(user.toLowerCase())&&clean(e.password||e.pass||e.pin)===pass&&clean(e.active||'نشط')!=='غير نشط'&&!e._deleted);
      if(emp){localStorage.setItem('currentUser',JSON.stringify({...emp,companyKey:key,permissions:Array.isArray(emp.permissions)?emp.permissions:[]})); location.href='لوحة-المتابعة.html';return;}
      if(oldLogin)return oldLogin.apply(this,arguments); toast('بيانات الموظف غير صحيحة أو الحساب غير نشط');
    };
  }
  function installStyle(){if(document.getElementById('oskar-core-fix-style'))return; const s=document.createElement('style');s.id='oskar-core-fix-style';s.textContent='.syncing{animation:oskarSpin .8s linear infinite!important}@keyframes oskarSpin{to{transform:rotate(360deg)}}';document.head.appendChild(s)}
  function install(){installStyle(); installSaveHooks(); installCrudFixes(); installPurchaseFix(); installLoginFix(); normalizeDB(getDB());}
  [0,80,250,700,1500,3000].forEach(ms=>setTimeout(install,ms));
  document.addEventListener('DOMContentLoaded',()=>{install();setTimeout(install,500);});
  window.addEventListener('online',()=>queueSync());
  window.addEventListener('storage',e=>{if(e.key===APP&&!window.oskarIsUserEditing?.()){try{setDB(read()); if(typeof renderPage==='function')renderPage()}catch(_){}}});
})();
