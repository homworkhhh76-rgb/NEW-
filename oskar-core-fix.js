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


/* ===== OSKAR CASHIER LIVE + PRODUCT/PURCHASE FINAL FIX 2026-05-09 ===== */
(function(){
  'use strict';
  if(window.__OSKAR_CASHIER_FINAL_FIX_20260509__) return;
  window.__OSKAR_CASHIER_FINAL_FIX_20260509__=true;
  const APP='supermarket_pos_ar_v1';
  const $=id=>document.getElementById(id);
  const safe=v=>Number(v||0)||0;
  const txt=v=>String(v??'').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const uid=p=>(window.uid?window.uid(p):p+'-'+Date.now()+'-'+Math.random().toString(16).slice(2));
  const toast=m=>{try{(window.toast||window.toast2||console.log)(m)}catch(e){console.log(m)}};
  const now=()=>new Date().toISOString();
  function db(){try{let d=JSON.parse(localStorage.getItem(APP)||'{}')||{}; if(!window.DB)window.DB=d; return window.DB;}catch(e){window.DB=window.DB||{};return window.DB}}
  function disk(){try{return JSON.parse(localStorage.getItem(APP)||'{}')||{}}catch(e){return {}}}
  function arr(k){const d=db(); if(!Array.isArray(d[k]))d[k]=[]; return d[k]}
  function save(){const d=db(); d.lastLocalUpdate=now(); localStorage.setItem(APP,JSON.stringify(d)); try{if(typeof saveDB==='function'&&!saveDB.__oskarFinalNoCall){} }catch(e){}; try{window.FirebaseBridge&&window.FirebaseBridge.queueSync&&window.FirebaseBridge.queueSync(d)}catch(e){}; try{window.syncNow&&setTimeout(()=>window.syncNow(false),80)}catch(e){} }
  function productCartonSize(p){return safe(p.unitsPerCarton||p.cartonSize||p.piecesPerCarton)||1}
  function normalizeProduct(p){
    if(!p)return p; const cs=productCartonSize(p); if(cs>1){p.cartonSize=cs;p.unitsPerCarton=cs}
    p.stock=safe(p.stockUnits!==undefined?p.stockUnits:p.stock); p.stockUnits=p.stock;
    if(p.unit==='كرتونة'){
      p.cartonPurchasePrice=safe(p.cartonPurchasePrice||p.purchasePrice||p.unitPurchasePrice*cs);
      p.cartonSalePrice=safe(p.cartonSalePrice||p.cartonPrice||p.salePrice*cs||p.unitSalePrice*cs);
      p.unitPurchasePrice=safe(p.unitPurchasePrice||p.cartonPurchasePrice/cs||p.purchasePrice);
      p.unitSalePrice=safe(p.unitSalePrice||p.cartonSalePrice/cs||p.salePrice||p.price);
      p.purchasePrice=p.unitPurchasePrice; p.salePrice=p.unitSalePrice; p.cartonPrice=p.cartonSalePrice;
    }else{
      p.unit=p.unit||'وحدة'; p.purchasePrice=safe(p.purchasePrice||p.unitPurchasePrice); p.salePrice=safe(p.salePrice||p.unitSalePrice||p.price); p.unitPurchasePrice=p.purchasePrice; p.unitSalePrice=p.salePrice;
    }
    p._updatedAt=now(); return p;
  }
  function optionList(name,selected,empty){
    const map={groups:'productGroups',brands:'brands',branches:'branches',units:'units'}; const a=arr(map[name]||name);
    let opts=empty?[`<option value="">${esc(empty)}</option>`]:[];
    a.forEach(x=>{let v=txt(x.name||x.value||x.id); opts.push(`<option value="${esc(v)}" ${txt(selected)===v?'selected':''}>${esc(v)}</option>`)});
    return opts.join('');
  }
  function productFormHTML(rec={}){
    const isEdit=!!rec.id, unit=rec.unit||'وحدة', cs=productCartonSize(rec), isCarton=unit==='كرتونة';
    const shownStock=isCarton && cs>0 ? (safe(rec.stock)/cs) : safe(rec.stock);
    return `<form id="productFinalForm" class="two-col-form grid">
      <input type="hidden" name="id" value="${esc(rec.id||'')}">
      <div class="section-label full-row" style="grid-column:1/-1">${isEdit?'تعديل الصنف':'إضافة صنف'}</div>
      <div class="field"><label>اسم الصنف</label><input name="name" required value="${esc(rec.name||'')}"></div>
      <div class="field"><label>SKU</label><input name="sku" value="${esc(rec.sku||'')}"></div>
      <div class="field"><label>باركود</label><input name="barcode" value="${esc(rec.barcode||'')}"></div>
      <div class="field"><label>الفرع</label><select name="branch">${optionList('branches',rec.branch,'اختر الفرع')}</select></div>
      <div class="field"><label>المجموعة</label><select name="group">${optionList('groups',rec.group,'اختر المجموعة')}</select></div>
      <div class="field"><label>الماركة</label><select name="brand">${optionList('brands',rec.brand,'اختر الماركة')}</select></div>
      <div class="field"><label>وحدة الإدخال</label><select name="unit" id="prodUnit" onchange="toggleCartonProductFields()"><option ${unit!=='كرتونة'?'selected':''}>وحدة</option><option ${unit==='كرتونة'?'selected':''}>كرتونة</option><option ${unit==='كيلو'?'selected':''}>كيلو</option><option ${unit==='لتر'?'selected':''}>لتر</option></select></div>
      <div class="field"><label id="stockLabel">المخزون الحالي</label><input name="stock" type="number" step="0.001" value="${shownStock}"></div>
      <div id="cartonProductBox" class="full-row two-col-form ${isCarton?'':'hide'}" style="grid-column:1/-1">
        <div class="field"><label>كم وحدة في الكرتونة</label><input name="cartonSize" id="cartonSize" type="number" step="1" value="${cs||1}" oninput="calcProductUnitPrices()"></div>
        <div class="field"><label>سعر الشراء للكرتونة</label><input name="cartonPurchasePrice" id="cartonPurchasePrice" type="number" step="0.01" value="${safe(rec.cartonPurchasePrice||rec.purchasePrice*cs)}" oninput="calcProductUnitPrices()"></div>
        <div class="field"><label>سعر البيع للكرتونة</label><input name="cartonSalePrice" id="cartonSalePrice" type="number" step="0.01" value="${safe(rec.cartonSalePrice||rec.cartonPrice||rec.salePrice*cs)}" oninput="calcProductUnitPrices()"></div>
        <div class="field"><label>سعر الشراء للوحدة تلقائي</label><input name="unitPurchasePrice" id="unitPurchasePrice" value="${safe(rec.unitPurchasePrice||rec.purchasePrice)}" readonly></div>
        <div class="field"><label>سعر البيع للوحدة تلقائي</label><input name="unitSalePrice" id="unitSalePrice" value="${safe(rec.unitSalePrice||rec.salePrice||rec.price)}" readonly></div>
      </div>
      <div id="unitProductBox" class="full-row two-col-form ${isCarton?'hide':''}" style="grid-column:1/-1">
        <div class="field"><label>سعر الشراء للوحدة</label><input name="purchasePrice" type="number" step="0.01" value="${safe(rec.purchasePrice||rec.unitPurchasePrice)}"></div>
        <div class="field"><label>سعر البيع للوحدة</label><input name="salePrice" type="number" step="0.01" value="${safe(rec.salePrice||rec.unitSalePrice||rec.price)}"></div>
      </div>
      <div class="field full-row" style="grid-column:1/-1"><label>ملاحظة</label><textarea name="note">${esc(rec.note||'')}</textarea></div>
    </form>`;
  }
  window.toggleCartonProductFields=function(){
    const is=$('prodUnit')&&$('prodUnit').value==='كرتونة';
    if($('cartonProductBox'))$('cartonProductBox').classList.toggle('hide',!is);
    if($('unitProductBox'))$('unitProductBox').classList.toggle('hide',is);
    if($('stockLabel'))$('stockLabel').textContent=is?'المخزون الحالي بالكرتونة':'المخزون الحالي بالوحدة';
    window.calcProductUnitPrices&&window.calcProductUnitPrices();
  };
  window.calcProductUnitPrices=function(){const size=safe($('cartonSize')&&$('cartonSize').value)||1; if($('unitPurchasePrice'))$('unitPurchasePrice').value=(safe($('cartonPurchasePrice')&&$('cartonPurchasePrice').value)/size).toFixed(3); if($('unitSalePrice'))$('unitSalePrice').value=(safe($('cartonSalePrice')&&$('cartonSalePrice').value)/size).toFixed(3)};
  function saveProductFinalFixed(){
    const f=$('productFinalForm')||$('crudForm'); if(!f)return; const d=Object.fromEntries(new FormData(f).entries());
    const list=arr('products'); let rec=d.id?list.find(x=>String(x.id)===String(d.id)):null; const old=rec?{...rec}:{};
    if(!rec){rec={id:uid('prd'),createdAt:(window.nowText?nowText():new Date().toLocaleString()),createdBy:(window.currentUser?currentUser().name:'مدير')}; list.unshift(rec)}
    Object.assign(rec,d); rec.unit=d.unit||old.unit||'وحدة'; const cs=safe(d.cartonSize)||productCartonSize(old)||1;
    if(rec.unit==='كرتونة'){
      rec.cartonSize=cs; rec.unitsPerCarton=cs; rec.stock=safe(d.stock)*cs; rec.stockUnits=rec.stock;
      rec.cartonPurchasePrice=safe(d.cartonPurchasePrice); rec.cartonSalePrice=safe(d.cartonSalePrice); rec.cartonPrice=rec.cartonSalePrice;
      rec.unitPurchasePrice=safe(d.unitPurchasePrice)||rec.cartonPurchasePrice/cs; rec.unitSalePrice=safe(d.unitSalePrice)||rec.cartonSalePrice/cs;
      rec.purchasePrice=rec.unitPurchasePrice; rec.salePrice=rec.unitSalePrice;
    }else{
      rec.stock=safe(d.stock); rec.stockUnits=rec.stock; delete rec.cartonPurchasePrice; delete rec.cartonSalePrice; delete rec.cartonPrice;
      rec.purchasePrice=safe(d.purchasePrice); rec.salePrice=safe(d.salePrice); rec.unitPurchasePrice=rec.purchasePrice; rec.unitSalePrice=rec.salePrice;
    }
    normalizeProduct(rec); rec.updatedAt=(window.nowText?nowText():new Date().toLocaleString()); rec._updatedAt=now();
    try{window.logAction&&logAction(d.id?'تعديل':'إضافة','الأصناف',rec.name||rec.id)}catch(e){}
    save(); try{window.persist&&window.persist()}catch(e){}; try{window.closeModal&&closeModal()}catch(e){}; try{window.renderPage&&renderPage()}catch(e){}; toast('تم حفظ الصنف وتحديث المخزون');
  }
  window.saveProductFinal=saveProductFinalFixed;
  function installProductScreens(){
    const pc=(window.PAGE_CONFIG&&window.PAGE_CONFIG.collection)||''; if(pc!=='products')return;
    window.openForm=function(editId){const rec=editId?arr('products').find(x=>String(x.id)===String(editId))||{}:{}; const body=$('modalBody')||$('mainCard'); if(!body)return; body.innerHTML=productFormHTML(rec); const title=$('modalTitle'); if(title)title.textContent=editId?'تعديل صنف':'إضافة صنف'; const back=$('modalBack'); if(back){back.style.display='flex'} else {body.insertAdjacentHTML('beforeend','<div class="tools" style="justify-content:center;margin-top:14px"><button class="btn purple" onclick="saveProductFinal()">حفظ الصنف</button></div>')} setTimeout(()=>{toggleCartonProductFields(); calcProductUnitPrices()},0)};
    window.saveCrud=function(){return saveProductFinalFixed()};
  }
  function lineFactor(i){ if(i.unit==='كرتونة')return safe(i.factor||i.cartonSize)||1; return 1; }
  function installPurchases(){
    if(!/مشتريات/.test(decodeURIComponent(location.pathname)))return;
    window.addProductToCart=function(id){const p=arr('products').find(x=>String(x.id)===String(id)); if(!p)return; normalizeProduct(p); const cs=productCartonSize(p); const unit=p.unit==='كرتونة'?'كرتونة':'وحدة'; const price=unit==='كرتونة'?safe(p.cartonPurchasePrice||p.purchasePrice*cs):safe(p.unitPurchasePrice||p.purchasePrice); const item={productId:p.id,name:p.name,sku:p.sku,unit,qty:1,cartonSize:cs,factor:unit==='كرتونة'?cs:1,unitPrice:price,discount:0,total:price}; (window.cart=window.cart||[]).push(item); window.renderCart&&window.renderCart()};
    window.renderCart=function(){const c=window.cart||[]; const el=$('cartBody'); if(!el)return; c.forEach(i=>{i.factor=lineFactor(i); i.total=safe(i.qty)*safe(i.unitPrice)-safe(i.discount)}); const rows=c.map((i,idx)=>{const isCarton=i.unit==='كرتونة'; return `<tr><td>${esc(i.name)}</td><td><select onchange="cart[${idx}].unit=this.value;cart[${idx}].factor=this.value==='كرتونة'?(Number(cart[${idx}].cartonSize)||1):1;renderCart()"><option ${!isCarton?'selected':''}>وحدة</option><option ${isCarton?'selected':''}>كرتونة</option></select>${isCarton?`<div class="muted">الكرتونة = <input type="number" style="width:80px" value="${safe(i.cartonSize)||1}" onchange="cart[${idx}].cartonSize=this.value;cart[${idx}].factor=Number(this.value)||1;renderCart()"> وحدة</div>`:''}</td><td><input type="number" step="0.001" value="${safe(i.qty)}" onchange="cart[${idx}].qty=this.value;renderCart()"></td><td><input type="number" step="0.01" value="${safe(i.unitPrice)}" onchange="cart[${idx}].unitPrice=this.value;renderCart()"></td><td><input type="number" step="0.01" value="${safe(i.discount)}" onchange="cart[${idx}].discount=this.value;renderCart()"></td><td>${(window.money?money(i.total):i.total.toFixed(2))}</td><td><button class="btn small danger" onclick="cart.splice(${idx},1);renderCart()">×</button></td></tr>`}).join('')||'<tr><td colspan="7" style="text-align:center;color:#6b7280">لا توجد أصناف</td></tr>'; el.innerHTML=rows; const total=c.reduce((s,i)=>s+safe(i.total),0); if($('grandTotal'))$('grandTotal').textContent=window.money?money(total):total.toFixed(2); if($('payAmount')&&!$('payAmount').dataset.touched)$('payAmount').value=total.toFixed(2); if($('dueAmount'))$('dueAmount').textContent=window.money?money(Math.max(0,total-safe($('payAmount').value))):Math.max(0,total-safe($('payAmount').value)).toFixed(2)};
    window.savePurchase=function(){const c=window.cart||[]; if(!c.length)return toast('أضف أصناف أولاً'); const total=c.reduce((s,i)=>s+safe(i.total),0), paid=safe($('payAmount')&&$('payAmount').value), supplier=arr('suppliers').find(x=>x.id===($('supplierId')&&$('supplierId').value)), account=($('accountId')&&$('accountId').value)||'cash-main', due=Math.max(0,total-paid), rec={id:uid('pur'),date:($('purchaseDate')&&$('purchaseDate').value)||(window.todayISO?todayISO():new Date().toISOString().slice(0,10)),referenceNo:($('referenceNo')&&$('referenceNo').value)||('PUR-'+Date.now()),supplierId:(supplier&&supplier.id)||'',supplierName:(supplier&&supplier.name)||'مورد غير محدد',branch:($('branch')&&$('branch').value)||'',items:JSON.parse(JSON.stringify(c)),total,paid,due,paymentStatus:due>0?'مستحق':'مدفوع',purchaseStatus:($('purchaseStatus')&&$('purchaseStatus').value)||'استلام',accountId:account,createdBy:(window.currentUser?currentUser().name:'مدير')}; arr('purchases').unshift(rec); rec.items.forEach(i=>{const p=arr('products').find(x=>String(x.id)===String(i.productId)); const addQty=safe(i.qty)*lineFactor(i); if(p){p.stock=safe(p.stock)+addQty; p.stockUnits=p.stock; p.purchasePrice=safe(i.unitPrice)/lineFactor(i); p.unitPurchasePrice=p.purchasePrice; if(i.unit==='كرتونة')p.cartonPurchasePrice=safe(i.unitPrice); p._updatedAt=now()} arr('stockMovements').unshift({id:uid('stk'),date:(window.nowText?nowText():new Date().toLocaleString()),type:'شراء',product:i.name,productId:i.productId,branch:rec.branch,qty:addQty,note:rec.referenceNo})}); try{if(paid>0&&window.addMovement)addMovement(account,'out',paid,'مشتريات '+rec.referenceNo,($('paymentNote')&&$('paymentNote').value)||''); if(due>0&&window.addDebt)addDebt('supplier',(supplier&&supplier.id)||'',rec.supplierName,due,rec.referenceNo,'مستحق مورد'); window.logAction&&logAction('حفظ','مشتريات',rec.referenceNo)}catch(e){} save(); try{window.persist&&persist()}catch(e){} window.cart=[]; window.renderCart(); toast('تم حفظ المشتريات وتحديث المخزون بالوحدات')};
  }
  function installLive(){
    if(window.__OSKAR_LIVE_EVERY_SECOND__)return; window.__OSKAR_LIVE_EVERY_SECOND__=true;
    setInterval(()=>{try{if(document.hidden||!navigator.onLine||!window.FirebaseBridge)return; const editing=!!document.querySelector('.modal-back[style*="flex"], .modal[style*="block"], form:focus-within, input:focus, textarea:focus, select:focus'); if(!editing)window.FirebaseBridge.livePull&&window.FirebaseBridge.livePull()}catch(e){}},1000);
  }
  function installAll(){installProductScreens(); installPurchases(); installLive();}
  [0,200,700,1500,3000,5000].forEach(ms=>setTimeout(installAll,ms));
  document.addEventListener('DOMContentLoaded',()=>{installAll();setTimeout(installAll,1000)});
  window.addEventListener('oskar-db-updated',()=>{try{if(window.renderPage&&!document.querySelector('input:focus,textarea:focus,select:focus,.modal-back[style*="flex"]'))renderPage()}catch(e){}});
})();


/* ===== OSKAR IMPORTS + DIRECT INVOICE PATCH 2026-05-09 ===== */
(function(){
 'use strict';
 if(window.__OSKAR_IMPORTS_DIRECT_PATCH__)return; window.__OSKAR_IMPORTS_DIRECT_PATCH__=true;
 const APP='supermarket_pos_ar_v1',$=id=>document.getElementById(id),safe=v=>Number(v||0)||0,txt=v=>String(v??'').trim();
 const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const uid=p=>(window.uid?window.uid(p):p+'-'+Date.now()+'-'+Math.random().toString(16).slice(2));
 const toast=m=>{try{(window.toast||alert)(m)}catch(e){console.log(m)}};
 function db(){try{window.DB=window.DB||JSON.parse(localStorage.getItem(APP)||'{}')||{};return window.DB}catch(e){return window.DB=window.DB||{}}}
 function arr(k){let d=db(); if(!Array.isArray(d[k]))d[k]=[]; return d[k]}
 function save(){let d=db(); d.lastLocalUpdate=new Date().toISOString(); localStorage.setItem(APP,JSON.stringify(d)); try{window.syncNow&&setTimeout(()=>syncNow(false),50)}catch(e){} }
 function money(n){return window.money?window.money(n):(safe(n).toFixed(2)+' '+((db().settings||{}).currency||''))}
 function opt(list,sel,empty){return `<option value="">${esc(empty||'اختر')}</option>`+list.map(x=>`<option value="${esc(x.id)}" ${String(sel)===String(x.id)?'selected':''}>${esc(x.name||x.title||x.id)}</option>`).join('')}
 function productUnit(p){return txt(p.unit||p.inputUnit||'وحدة')}
 function csize(p){return safe(p.unitsPerCarton||p.cartonSize||p.piecesPerCarton)||1}
 function addMenu(){let menu=document.querySelector('.drawer .menu,.sidebar .menu,nav.menu'); if(!menu||document.getElementById('importsMenuPatch'))return; let html=`<div id="importsMenuPatch" class="menu-group"><button class="menu-title" type="button" onclick="this.parentElement.classList.toggle('open')">📦 الواردات</button><div class="submenu" style="display:grid"><a href="الواردات.html">➕ إضافة واردات</a><a href="سجل-الواردات.html">📋 سجل الواردات</a></div></div>`; menu.insertAdjacentHTML('beforeend',html)}
 function renderImportForm(){let ps=arr('products'), su=arr('suppliers'), ac=arr('accounts').filter(a=>(a.active||'نشط')!=='غير نشط');
  let html=`<div class="card"><h3>إضافة واردات</h3><div class="grid">
  <div class="field"><label>اختر المورد</label><input list="suppliersDL" id="impSupplierSearch" placeholder="ابحث/اختر المورد"><datalist id="suppliersDL">${su.map(s=>`<option value="${esc(s.name||'')}" data-id="${esc(s.id)}"></option>`).join('')}</datalist></div>
  <div class="field"><label>اختر الصنف</label><input list="productsDL" id="impProductSearch" placeholder="ابحث باسم الصنف أو الباركود" oninput="oskarImportPickProduct()"><datalist id="productsDL">${ps.map(p=>`<option value="${esc((p.name||'')+' | '+(p.barcode||p.sku||''))}" data-id="${esc(p.id)}"></option>`).join('')}</datalist></div>
  <div class="field"><label>الحساب/صندوق الكاش</label><select id="impAccount">${opt(ac,'cash-main','اختر الحساب')}</select></div>
  <div class="field"><label>تاريخ الواردة</label><input id="impDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  </div><div id="importUnitBox"></div><div class="tools"><button class="btn success" onclick="saveOskarImport()">حفظ وترحيل للمخزون</button></div></div>`;
  $('mainCard').innerHTML=html; }
 window.oskarImportPickProduct=function(){let v=txt($('impProductSearch')?.value), p=arr('products').find(x=>v.includes(x.name||'@@')||v.includes(x.barcode||'@@')||v.includes(x.sku||'@@')); let box=$('importUnitBox'); if(!box)return; if(!p){box.innerHTML='';return} let u=productUnit(p), cs=csize(p), carton=u==='كرتونة'; box.dataset.pid=p.id; box.innerHTML=carton?`<div class="grid"><div class="field"><label>عدد الكراتين</label><input id="impCartons" type="number" step="0.001" oninput="calcOskarImport()"></div><div class="field"><label>كم وحدة بالكرتونة</label><input id="impCSize" type="number" value="${cs}" oninput="calcOskarImport()"></div><div class="field"><label>سعر الجملة للكرتونة</label><input id="impCartonCost" type="number" step="0.01" oninput="calcOskarImport()"></div><div class="field"><label>سعر البيع للكرتونة</label><input id="impCartonSale" type="number" step="0.01" oninput="calcOskarImport()"></div><div class="field"><label>سعر الجملة للوحدة</label><input id="impUnitCost" readonly></div><div class="field"><label>سعر البيع للوحدة</label><input id="impUnitSale" readonly></div><div class="kpi"><span>الإجمالي</span><strong id="impTotal">0</strong></div></div>`:`<div class="grid"><div class="field"><label>الكمية بال${esc(u)}</label><input id="impQty" type="number" step="0.001" oninput="calcOskarImport()"></div><div class="field"><label>سعر الجملة للوحدة</label><input id="impUnitCost" type="number" step="0.01" oninput="calcOskarImport()"></div><div class="field"><label>سعر البيع للوحدة</label><input id="impUnitSale" type="number" step="0.01"></div><div class="kpi"><span>الإجمالي</span><strong id="impTotal">0</strong></div></div>`; calcOskarImport(); }
 window.calcOskarImport=function(){let pid=$('importUnitBox')?.dataset.pid,p=arr('products').find(x=>x.id===pid); if(!p)return; let total=0;if(productUnit(p)==='كرتونة'){let q=safe($('impCartons')?.value),cs=safe($('impCSize')?.value)||1,cc=safe($('impCartonCost')?.value),ss=safe($('impCartonSale')?.value); if($('impUnitCost'))$('impUnitCost').value=(cc/cs).toFixed(3); if($('impUnitSale'))$('impUnitSale').value=(ss/cs).toFixed(3); total=q*cc}else total=safe($('impQty')?.value)*safe($('impUnitCost')?.value); if($('impTotal'))$('impTotal').textContent=money(total)}
 window.saveOskarImport=function(){let pid=$('importUnitBox')?.dataset.pid,p=arr('products').find(x=>x.id===pid); if(!p)return toast('اختر الصنف'); let carton=productUnit(p)==='كرتونة', cs=carton?(safe($('impCSize')?.value)||1):1, qty=carton?safe($('impCartons')?.value)*cs:safe($('impQty')?.value), unitCost=safe($('impUnitCost')?.value), unitSale=safe($('impUnitSale')?.value), total=qty*unitCost, account=$('impAccount')?.value||'cash-main'; if(qty<=0)return toast('أدخل الكمية'); let supName=txt($('impSupplierSearch')?.value).split('|')[0], sup=arr('suppliers').find(s=>txt(s.name)===supName); let rec={id:uid('imp'),date:$('impDate')?.value||new Date().toISOString().slice(0,10),supplierId:sup?.id||'',supplierName:sup?.name||supName||'غير محدد',productId:p.id,productName:p.name,unit:productUnit(p),qtyUnits:qty,cartons:carton?safe($('impCartons')?.value):0,cartonSize:cs,unitCost,unitSale,total,accountId:account,createdAt:new Date().toISOString()}; arr('imports').unshift(rec); let before=safe(p.stockUnits??p.stock); p.stock=before+qty;p.stockUnits=p.stock;p.purchasePrice=unitCost;p.unitPurchasePrice=unitCost;p.salePrice=unitSale;p.unitSalePrice=unitSale;if(carton){p.cartonSize=cs;p.unitsPerCarton=cs;p.cartonPurchasePrice=unitCost*cs;p.cartonSalePrice=unitSale*cs;p.cartonPrice=p.cartonSalePrice} arr('stockMovements').unshift({id:uid('stk'),date:new Date().toLocaleString('ar-EG'),type:'واردات',product:p.name,productId:p.id,qty,balanceBefore:before,balanceAfter:p.stock,note:'واردة '+rec.id}); try{window.addMovement?addMovement(account,'out',total,'واردات '+p.name,'خصم تكلفة الواردات',rec.id):(arr('accountMovements').unshift({id:uid('mov'),accountId:account,type:'out',amount:total,note:'واردات '+p.name,date:new Date().toISOString()}), arr('accounts').forEach(a=>{if(a.id===account)a.balance=safe(a.balance)-total}))}catch(e){} try{window.logAction&&logAction('إضافة','الواردات',p.name+' +'+qty)}catch(e){} save(); toast('تم حفظ الواردة وترحيلها للمخزون'); renderImportForm(); }
 function renderImportLog(){let rows=arr('imports').map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.supplierName)}</td><td>${esc(r.productName)}</td><td>${safe(r.qtyUnits)}</td><td>${money(r.unitCost)}</td><td>${money(r.total)}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد واردات</td></tr>'; $('mainCard').innerHTML=`<div class="card"><h3>سجل الواردات</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>التاريخ</th><th>المورد</th><th>الصنف</th><th>الوحدات</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table></div></div>`}
 function patchDirectInvoice(){if(!/الكاشير|مبيعات/.test(decodeURIComponent(location.pathname)))return; if(window.__directInvoicePatched)return; window.__directInvoicePatched=true; window.addDirectInvoiceItem=function(){let name=prompt('اسم الصنف اليدوي:'); if(!name)return; let cost=safe(prompt('سعر الجملة للصنف:')), price=safe(prompt('سعر البيع:')), qty=safe(prompt('الكمية:',1))||1; window.cart=window.cart||[]; window.cart.push({id:uid('manual'),productId:'manual',name,qty,unit:'وحدة',unitCost:cost,purchasePrice:cost,cost,unitPrice:price,price,total:qty*price,manual:true,noStock:true,profit:(price-cost)*qty}); try{window.renderCart&&renderCart()}catch(e){} }; let host=document.querySelector('.tools,.invoice-tools'); if(host&&!document.getElementById('directInvoiceBtn'))host.insertAdjacentHTML('beforeend','<button id="directInvoiceBtn" class="btn purple" onclick="addDirectInvoiceItem()">+ صنف يدوي بدون مخزون</button>') }
 function employeePerm(){if(!/الموظفين/.test(decodeURIComponent(location.pathname)))return; setTimeout(()=>{document.querySelectorAll('label,.perm-item').forEach(x=>{}); let box=[...document.querySelectorAll('.permissions,.perm-list,.grid')].find(e=>/صلاح/.test(e.textContent||'')); if(box&&!box.textContent.includes('الواردات'))box.insertAdjacentHTML('beforeend','<label class="perm-item"><input type="checkbox" name="permissions" value="imports"> الواردات</label>')},700)}
 function install(){addMenu(); let path=decodeURIComponent(location.pathname); if(/الواردات\.html/.test(path))renderImportForm(); if(/سجل-الواردات\.html/.test(path))renderImportLog(); patchDirectInvoice(); employeePerm();}
 document.addEventListener('DOMContentLoaded',()=>{install();setTimeout(install,800);setTimeout(install,2000)}); setTimeout(install,300);
})();


/* ===== Oskar imports real save/sync/sidebar patch ===== */
(function(){
  const LS_PREFIX='oskar_';
  const read=(k,d=[])=>{try{return JSON.parse(localStorage.getItem(k)||localStorage.getItem(LS_PREFIX+k)||JSON.stringify(d))||d}catch(e){return d}};
  const write=(k,v)=>{localStorage.setItem(k,JSON.stringify(v));localStorage.setItem(LS_PREFIX+k,JSON.stringify(v)); window.dispatchEvent(new CustomEvent('oskar:data-changed',{detail:{key:k}})); try{ if(navigator.onLine && window.firebaseSyncAll) window.firebaseSyncAll(); if(window.OSKAR_SYNC&&OSKAR_SYNC.pushAll) OSKAR_SYNC.pushAll(); }catch(e){} };
  const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const num=v=>Number(String(v||0).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)))||0;
  function addActivity(text,obj){const a=read('activities',read('activityLog',[])); a.unshift(Object.assign({id:id(),date:new Date().toISOString(),type:'imports',text:text},obj||{})); write('activities',a); write('activityLog',a)}
  function findProduct(products,pid){return products.find(p=>String(p.id||p.code||p.barcode||p.sku)===String(pid))}
  window.OSKAR_SAVE_IMPORT=function(data){
    const products=read('products',read('items',[]));
    const accounts=read('accounts',[]);
    const imports=read('imports',read('importRecords',[]));
    const product=findProduct(products,data.productId);
    if(!product) throw new Error('اختر الصنف');
    const qty=num(data.unitQty||data.qty||data.quantity);
    if(qty<=0) throw new Error('أدخل كمية صحيحة');
    const totalCost=num(data.totalCost || (qty*num(data.wholesaleUnit)));
    const wholesaleUnit=num(data.wholesaleUnit || (totalCost/qty));
    const saleUnit=num(data.saleUnit || product.salePrice || product.price || 0);
    product.stock=num(product.stock||product.quantity||product.qty)+qty;
    product.quantity=product.stock; product.qty=product.stock;
    product.wholesalePrice=wholesaleUnit; product.cost=wholesaleUnit; product.purchasePrice=wholesaleUnit;
    product.salePrice=saleUnit; product.price=saleUnit;
    product.updatedAt=new Date().toISOString();
    const accId=data.accountId||'cash';
    let account=accounts.find(a=>String(a.id)===String(accId)||String(a.name)===String(accId));
    if(account){account.balance=num(account.balance)-totalCost; account.updatedAt=new Date().toISOString(); write('accounts',accounts)}
    else {let cash=num(localStorage.getItem('cashBox')||localStorage.getItem('oskar_cashBox')); localStorage.setItem('cashBox',String(cash-totalCost)); localStorage.setItem('oskar_cashBox',String(cash-totalCost));}
    const rec={id:id(),date:new Date().toISOString(),supplierId:data.supplierId||'',supplierName:data.supplierName||'',productId:product.id||product.code||product.barcode,productName:product.name||product.title,unit:data.unit||'وحدة',quantityUnits:qty,totalCost,wholesaleUnit,saleUnit,accountId:accId,note:data.note||''};
    imports.unshift(rec);
    const moves=read('stockMovements',[]); moves.unshift({id:id(),date:rec.date,type:'import',productId:rec.productId,productName:rec.productName,qty:qty,stockAfter:product.stock,ref:rec.id});
    write('products',products); write('items',products); write('imports',imports); write('importRecords',imports); write('stockMovements',moves);
    addActivity('إضافة واردات: '+rec.productName+' كمية '+qty,{ref:rec.id,total:totalCost});
    return rec;
  };
  function enhanceImportsPage(){
    if(!/الواردات/.test(location.href+document.body.innerText))return;
    const btn=[...document.querySelectorAll('button,input[type=button],input[type=submit]')].find(b=>/حفظ|ترحيل|إضافة/.test(b.textContent||b.value||''));
    if(!btn||btn.dataset.oskarImportFixed)return; btn.dataset.oskarImportFixed='1';
    btn.addEventListener('click',function(ev){
      try{
        const g=n=>document.querySelector('[name="'+n+'"],#'+n);
        const unit=(g('unit')&&g('unit').value)||'';
        const cartons=num(g('cartons')&&g('cartons').value), per=num(g('unitsPerCarton')&&g('unitsPerCarton').value)||1;
        const qty=cartons>0?cartons*per:num((g('quantity')||g('qty')||g('unitQty')||{}).value);
        const totalCost=cartons>0?num((g('cartonWholesale')||g('wholesaleCarton')||{}).value)*cartons:num((g('totalCost')||{}).value)||qty*num((g('wholesaleUnit')||g('cost')||{}).value);
        const saleUnit=cartons>0?num((g('cartonSale')||g('saleCarton')||{}).value)/per:num((g('saleUnit')||g('price')||{}).value);
        window.OSKAR_SAVE_IMPORT({productId:(g('productId')||g('product')||{}).value,supplierId:(g('supplierId')||g('supplier')||{}).value,accountId:(g('accountId')||g('account')||{}).value,unit,unitQty:qty,totalCost,wholesaleUnit:qty?totalCost/qty:0,saleUnit});
        alert('تم حفظ الواردة وتحديث المخزون وخصم الحساب');
      }catch(e){alert(e.message||'تعذر حفظ الواردة')}
    },true);
  }
  document.addEventListener('DOMContentLoaded',enhanceImportsPage); setTimeout(enhanceImportsPage,800);
})();
