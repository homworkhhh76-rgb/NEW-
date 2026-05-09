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

/* ===== OSKAR PURCHASES + PRODUCTS + LIVE SYNC FINAL PATCH - 2026-05-09 ===== */
(function(){
  if(window.__OSKAR_PURCHASES_PRODUCTS_LIVE_FINAL_20260509__) return;
  window.__OSKAR_PURCHASES_PRODUCTS_LIVE_FINAL_20260509__=true;
  const APP='supermarket_pos_ar_v1';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>Number(v||0)||0;
  const txt=v=>String(v??'').trim();
  const today=()=>{try{return window.todayISO?todayISO():new Date().toISOString().slice(0,10)}catch(e){return new Date().toISOString().slice(0,10)}};
  const nowISO=()=>new Date().toISOString();
  const nowText=()=>{try{return window.nowText?window.nowText():new Date().toLocaleString('ar-EG',{hour12:false})}catch(e){return new Date().toLocaleString()}};
  const uid=p=>{try{return window.uid?window.uid(p):p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}catch(e){return p+'-'+Date.now().toString(36)}};
  const money=n=>{try{return window.money?window.money(num(n)):num(n).toFixed(2)+' '+((DB().settings||{}).currency||'₪')}catch(e){return num(n).toFixed(2)}};
  function DB(){try{if(window.DB && typeof window.DB==='object') return window.DB; return window.DB=JSON.parse(localStorage.getItem(APP)||'{}')||{};}catch(e){return window.DB={}}}
  function arr(k){const d=DB(); if(!Array.isArray(d[k])) d[k]=[]; return d[k];}
  function active(a){return (a||[]).filter(x=>!x._deleted&&!x.deletedAt)}
  function currentUserName(){try{return (window.currentUser&&currentUser().name)||'مدير'}catch(e){return 'مدير'}}
  function toast(m){try{(window.toast||alert)(m)}catch(e){console.log(m)}}
  function persistHard(){const d=DB(); d.lastLocalUpdate=nowISO(); try{if(typeof window.saveDB==='function') window.saveDB(d); else localStorage.setItem(APP,JSON.stringify(d));}catch(e){localStorage.setItem(APP,JSON.stringify(d));} try{if(typeof window.persist==='function'&&!window.__OSKAR_PURCHASE_PATCH_PERSISTING__){window.__OSKAR_PURCHASE_PATCH_PERSISTING__=true; window.persist(); window.__OSKAR_PURCHASE_PATCH_PERSISTING__=false;}}catch(e){window.__OSKAR_PURCHASE_PATCH_PERSISTING__=false;} try{window.FirebaseBridge&&window.FirebaseBridge.queueSync&&window.FirebaseBridge.queueSync(d)}catch(e){} try{window.syncNow&&setTimeout(()=>window.syncNow(false),40)}catch(e){} }
  function optionRows(collection,label='name',value='id',empty='اختر'){let rows=active(arr(collection));return '<option value="">'+esc(empty)+'</option>'+rows.map(x=>'<option value="'+esc(x[value]||x.id||x[label]||'')+'">'+esc(x[label]||x.name||x.value||'')+'</option>').join('')}
  function productById(id){return arr('products').find(p=>String(p.id)===String(id));}
  function cartonSize(p){return Math.max(1,num(p&& (p.unitsPerCarton||p.cartonSize||p.piecesPerCarton))||1)}
  function normalizeProductFinal(p){if(!p)return p; const cs=cartonSize(p); p.cartonSize=cs; p.unitsPerCarton=cs; const unit=txt(p.unit||p.inputUnit||'وحدة'); p.unit=unit==='كرتونة'?'كرتونة':'وحدة'; p.stock=num(p.stockUnits!==undefined?p.stockUnits:p.stock); p.stockUnits=p.stock; if(p.unit==='كرتونة'){p.cartonPurchasePrice=num(p.cartonPurchasePrice||p.purchaseCartonPrice||p.purchasePrice*cs||p.unitPurchasePrice*cs); p.cartonSalePrice=num(p.cartonSalePrice||p.cartonPrice||p.saleCartonPrice||p.salePrice*cs||p.unitSalePrice*cs); p.cartonPrice=p.cartonSalePrice; p.unitPurchasePrice=cs?num(p.unitPurchasePrice||p.cartonPurchasePrice/cs||p.purchasePrice):num(p.purchasePrice); p.unitSalePrice=cs?num(p.unitSalePrice||p.cartonSalePrice/cs||p.salePrice||p.price):num(p.salePrice||p.price); p.purchasePrice=p.unitPurchasePrice; p.salePrice=p.unitSalePrice; p.price=p.unitSalePrice;} else {p.purchasePrice=num(p.purchasePrice||p.unitPurchasePrice); p.salePrice=num(p.salePrice||p.unitSalePrice||p.price); p.price=p.salePrice; p.unitPurchasePrice=p.purchasePrice; p.unitSalePrice=p.salePrice; delete p.cartonPurchasePrice; delete p.cartonSalePrice; delete p.cartonPrice;} p._updatedAt=nowISO(); p.updatedAt=nowText(); return p;}
  function branchInfo(){let bs=active(arr('branches')); let id=localStorage.getItem('oskar_current_branch_id')||(DB().settings||{}).currentBranchId||''; return bs.find(b=>b.id===id||b.name===id)||bs[0]||{id:'branch-main',name:'الرئيسي'};}
  function stockAdded(line){return line.inputType==='كرتونة'?num(line.qty)*num(line.cartonSize):num(line.qty)}
  function lineTotal(line){return num(line.qty)*(line.inputType==='كرتونة'?num(line.cartonPurchasePrice):num(line.unitPurchasePrice));}
  function makePurchaseLine(){const p=productById($('purchaseProductId')?.value); if(!p)return null; normalizeProductFinal(p); const t=$('purchaseInputType')?.value||'وحدة'; const cs=t==='كرتونة'?Math.max(1,num($('purchaseCartonSize')?.value)||cartonSize(p)):1; const qty=num($('purchaseQty')?.value); if(qty<=0){toast('أدخل الكمية'); return null;} const unitPurchase=t==='كرتونة'?num($('purchaseCartonPurchasePrice')?.value)/cs:num($('purchaseUnitPurchasePrice')?.value); const unitSale=t==='كرتونة'?num($('purchaseCartonSalePrice')?.value)/cs:num($('purchaseUnitSalePrice')?.value); const line={productId:p.id,name:p.name,sku:p.sku||p.barcode||'',inputType:t,unit:t,qty,cartonSize:cs,factor:t==='كرتونة'?cs:1,unitPurchasePrice:unitPurchase,unitSalePrice:unitSale,unitPrice:t==='كرتونة'?num($('purchaseCartonPurchasePrice')?.value):unitPurchase,cartonPurchasePrice:t==='كرتونة'?num($('purchaseCartonPurchasePrice')?.value):0,cartonSalePrice:t==='كرتونة'?num($('purchaseCartonSalePrice')?.value):0,stockAdded:t==='كرتونة'?qty*cs:qty,total:t==='كرتونة'?qty*num($('purchaseCartonPurchasePrice')?.value):qty*unitPurchase}; return line;}
  function recalcPurchaseInputs(){const p=productById($('purchaseProductId')?.value)||{}; normalizeProductFinal(p); const t=$('purchaseInputType')?.value||'وحدة'; const cs=Math.max(1,num($('purchaseCartonSize')?.value)||cartonSize(p)); const cartonBox=$('purchaseCartonBox'), unitBox=$('purchaseUnitBox'); if(cartonBox)cartonBox.classList.toggle('hide',t!=='كرتونة'); if(unitBox)unitBox.classList.toggle('hide',t==='كرتونة'); if($('purchaseCartonSize')&&!num($('purchaseCartonSize').value))$('purchaseCartonSize').value=cartonSize(p); if($('purchaseUnitPurchasePrice')&&!$('purchaseUnitPurchasePrice').dataset.user)$('purchaseUnitPurchasePrice').value=num(p.unitPurchasePrice||p.purchasePrice).toFixed(3); if($('purchaseUnitSalePrice')&&!$('purchaseUnitSalePrice').dataset.user)$('purchaseUnitSalePrice').value=num(p.unitSalePrice||p.salePrice||p.price).toFixed(3); if($('purchaseCartonPurchasePrice')&&!$('purchaseCartonPurchasePrice').dataset.user)$('purchaseCartonPurchasePrice').value=num(p.cartonPurchasePrice||num(p.purchasePrice)*cartonSize(p)).toFixed(3); if($('purchaseCartonSalePrice')&&!$('purchaseCartonSalePrice').dataset.user)$('purchaseCartonSalePrice').value=num(p.cartonSalePrice||p.cartonPrice||num(p.salePrice||p.price)*cartonSize(p)).toFixed(3); if($('calcUnitPurchase'))$('calcUnitPurchase').textContent=money(t==='كرتونة'?num($('purchaseCartonPurchasePrice')?.value)/cs:num($('purchaseUnitPurchasePrice')?.value)); if($('calcUnitSale'))$('calcUnitSale').textContent=money(t==='كرتونة'?num($('purchaseCartonSalePrice')?.value)/cs:num($('purchaseUnitSalePrice')?.value)); if($('calcStockAdded'))$('calcStockAdded').textContent=((t==='كرتونة'?num($('purchaseQty')?.value)*cs:num($('purchaseQty')?.value))||0).toFixed(3).replace(/\.000$/,'')+' وحدة';}
  function purchaseHistoryRows(){return active(arr('purchases')).slice(0,80).map(r=>{let items=r.items||[]; if(!items.length&&r.productId)items=[r]; let first=items[0]||{}; let qty=items.reduce((s,i)=>s+num(i.qty),0); let stock=items.reduce((s,i)=>s+num(i.stockAdded||stockAdded(i)),0); let desc=items.length>1?items.length+' أصناف':(first.name||first.product||''); let input=items.length>1?'متعدد':(first.inputType||first.unit||'وحدة'); let conv=items.map(i=>(i.inputType||i.unit)==='كرتونة'?num(i.qty)+' × '+num(i.cartonSize||i.factor||1):num(i.qty)).join(' / '); return '<tr><td>'+esc(r.date||r.createdAt||'')+'</td><td>'+esc(r.supplierName||'مورد غير محدد')+'</td><td>'+esc(desc)+'</td><td>'+qty+'</td><td>'+esc(input)+'</td><td>'+esc(conv)+'</td><td>'+stock.toFixed(3).replace(/\.000$/,'')+'</td><td>'+money(first.unitPurchasePrice||first.unitPrice||0)+' / '+money(first.unitSalePrice||0)+'</td><td>'+money(r.total||0)+'</td><td>'+money(r.paid||0)+' / '+money(r.due||0)+'</td><td><button class="btn small ghost" onclick="editPurchaseFinal(\''+esc(r.id)+'\')">تعديل</button> <button class="btn small danger" onclick="deletePurchaseFinal(\''+esc(r.id)+'\')">حذف</button></td></tr>'}).join('')||'<tr><td colspan="11" style="text-align:center;color:#6b7280">لا توجد مشتريات سابقة</td></tr>';}
  function renderPurchaseLines(){const list=window.purchaseLines||[]; const body=$('purchaseLinesBody'); if(!body)return; body.innerHTML=list.map((i,idx)=>'<tr><td>'+esc(i.name)+'</td><td>'+esc(i.inputType)+'</td><td>'+num(i.qty)+'</td><td>'+num(i.cartonSize||1)+'</td><td>'+num(i.stockAdded||stockAdded(i)).toFixed(3).replace(/\.000$/,'')+'</td><td>'+money(i.unitPurchasePrice)+'</td><td>'+money(i.unitSalePrice)+'</td><td>'+money(i.total)+'</td><td><button class="btn small danger" onclick="purchaseLines.splice('+idx+',1);renderPurchaseLines()">×</button></td></tr>').join('')||'<tr><td colspan="9" style="text-align:center;color:#6b7280">أضف صنف للمشتريات</td></tr>'; const total=list.reduce((s,i)=>s+num(i.total),0); if($('grandTotal'))$('grandTotal').textContent=money(total); const paid=$('payAmount'); if(paid&&!paid.dataset.touched) paid.value=total.toFixed(2); if($('dueAmount'))$('dueAmount').textContent=money(Math.max(0,total-num(paid&&paid.value)));}
  window.renderPurchaseLines=renderPurchaseLines;
  window.addPurchaseLineFinal=function(){const line=makePurchaseLine(); if(!line)return; window.purchaseLines=window.purchaseLines||[]; window.purchaseLines.push(line); renderPurchaseLines(); toast('تمت إضافة الصنف للمشتريات');};
  window.renderPurchaseForm=function(){const main=$('mainCard'); if(!main)return; window.purchaseLines=window.purchaseLines||[]; main.innerHTML='<div class="card"><h3>بيانات المشتريات</h3><div class="grid"><div class="field"><label>اسم المورد</label><select id="supplierId">'+optionRows('suppliers','name','id','اختر المورد')+'</select></div><div class="field"><label>التاريخ</label><input id="purchaseDate" type="date" value="'+today()+'"></div><div class="field"><label>الرقم المرجعي</label><input id="referenceNo" placeholder="تلقائي عند الحفظ"></div><div class="field"><label>حالة الدفع</label><select id="paymentStatus"><option>مدفوع</option><option>مدفوع جزئي</option><option>آجل</option></select></div><div class="field"><label>الحساب</label><select id="accountId">'+optionRows('accounts','name','id','اختر الحساب')+'</select></div><div class="field"><label>الملاحظات</label><input id="paymentNote" placeholder="ملاحظة عامة"></div></div></div><div class="card"><h3>اختيار الصنف والإدخال</h3><div class="grid"><div class="field"><label>اختيار الصنف</label><select id="purchaseProductId" onchange="resetPurchaseUserFlags();recalcPurchaseInputs()">'+optionRows('products','name','id','اختر الصنف')+'</select></div><div class="field"><label>نوع الإدخال</label><select id="purchaseInputType" onchange="resetPurchaseUserFlags();recalcPurchaseInputs()"><option>وحدة</option><option>كرتونة</option></select></div><div class="field"><label>الكمية</label><input id="purchaseQty" type="number" step="0.001" value="1" oninput="recalcPurchaseInputs()"></div><div id="purchaseUnitBox" class="full-row two-col-form" style="grid-column:1/-1"><div class="field"><label>سعر الجملة للوحدة</label><input id="purchaseUnitPurchasePrice" type="number" step="0.001" oninput="this.dataset.user=1;recalcPurchaseInputs()"></div><div class="field"><label>سعر البيع للوحدة</label><input id="purchaseUnitSalePrice" type="number" step="0.001" oninput="this.dataset.user=1;recalcPurchaseInputs()"></div></div><div id="purchaseCartonBox" class="full-row two-col-form hide" style="grid-column:1/-1"><div class="field"><label>كم وحدة داخل الكرتونة</label><input id="purchaseCartonSize" type="number" step="1" value="1" oninput="this.dataset.user=1;recalcPurchaseInputs()"></div><div class="field"><label>سعر شراء الكرتونة</label><input id="purchaseCartonPurchasePrice" type="number" step="0.001" oninput="this.dataset.user=1;recalcPurchaseInputs()"></div><div class="field"><label>سعر بيع الكرتونة</label><input id="purchaseCartonSalePrice" type="number" step="0.001" oninput="this.dataset.user=1;recalcPurchaseInputs()"></div><div class="field"><label>سعر الوحدة المحسوب</label><b id="calcUnitPurchase">0</b></div><div class="field"><label>سعر بيع الوحدة المحسوب</label><b id="calcUnitSale">0</b></div></div><div class="field"><label>الكمية التي ستدخل المخزون</label><b id="calcStockAdded">0 وحدة</b></div></div><div class="tools" style="margin-top:12px;justify-content:center"><button class="btn primary" onclick="addPurchaseLineFinal()">+ إضافة للسلة</button><button class="btn ghost" onclick="location.href=\'إضافة-صنف.html\'">+ إنشاء صنف جديد</button></div></div><div class="card"><h3>سلة المشتريات الحالية</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>الصنف</th><th>وحدة/كرتونة</th><th>الكمية</th><th>وحدات/كرتونة</th><th>دخل المخزون</th><th>الجملة</th><th>البيع</th><th>الإجمالي</th><th>حذف</th></tr></thead><tbody id="purchaseLinesBody"></tbody></table></div><div class="grid" style="margin-top:12px"><div class="field"><label>الإجمالي</label><b id="grandTotal">0</b></div><div class="field"><label>المدفوع</label><input id="payAmount" type="number" value="0" oninput="this.dataset.touched=1;renderPurchaseLines()"></div><div class="field"><label>المتبقي</label><b id="dueAmount" style="color:#dc2626">0</b></div></div><div class="tools" style="justify-content:center;margin-top:12px"><button class="btn success" onclick="savePurchaseFinal()">حفظ المشتريات وتحديث المخزون</button></div></div><div class="card"><h3>كل المشتريات السابقة</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>التاريخ</th><th>المورد</th><th>الصنف</th><th>الكمية</th><th>الإدخال</th><th>التحويل للوحدات</th><th>دخل المخزون</th><th>الجملة / البيع</th><th>الإجمالي</th><th>المدفوع / المتبقي</th><th>خيارات</th></tr></thead><tbody id="purchaseHistoryBody">'+purchaseHistoryRows()+'</tbody></table></div></div>'; window.resetPurchaseUserFlags(); recalcPurchaseInputs(); renderPurchaseLines();};
  window.resetPurchaseUserFlags=function(){['purchaseUnitPurchasePrice','purchaseUnitSalePrice','purchaseCartonSize','purchaseCartonPurchasePrice','purchaseCartonSalePrice'].forEach(id=>{const e=$(id); if(e)delete e.dataset.user;});};
  window.recalcPurchaseInputs=recalcPurchaseInputs;
  window.savePurchaseFinal=function(){const lines=(window.purchaseLines||[]).map(x=>({...x})); if(!lines.length)return toast('أضف صنف واحد على الأقل'); const supplier=arr('suppliers').find(s=>String(s.id)===String($('supplierId')?.value)); const total=lines.reduce((s,i)=>s+num(i.total),0); const paid=Math.min(total,num($('payAmount')?.value)); const due=Math.max(0,total-paid); const b=branchInfo(); const ref=txt($('referenceNo')?.value)||('PUR-'+Date.now()); const rec={id:uid('pur'),date:$('purchaseDate')?.value||today(),createdAt:nowText(),_createdAt:nowISO(),_updatedAt:nowISO(),referenceNo:ref,supplierId:supplier?.id||'',supplierName:supplier?.name||'مورد غير محدد',branch:b.name,branchId:b.id,items:lines,total,paid,due,paymentStatus:due>0?(paid>0?'مدفوع جزئي':'آجل'):'مدفوع',accountId:$('accountId')?.value||'',note:$('paymentNote')?.value||'',createdBy:currentUserName()}; arr('purchases').unshift(rec); lines.forEach(i=>{const p=productById(i.productId); const add=num(i.stockAdded||stockAdded(i)); if(p){p.stock=num(p.stockUnits!==undefined?p.stockUnits:p.stock)+add; p.stockUnits=p.stock; p.purchasePrice=num(i.unitPurchasePrice); p.unitPurchasePrice=num(i.unitPurchasePrice); p.salePrice=num(i.unitSalePrice)||num(p.salePrice); p.unitSalePrice=num(i.unitSalePrice)||num(p.unitSalePrice); p.price=p.salePrice; if(i.inputType==='كرتونة'){p.unit='كرتونة'; p.cartonSize=num(i.cartonSize)||1; p.unitsPerCarton=p.cartonSize; p.cartonPurchasePrice=num(i.cartonPurchasePrice); p.cartonSalePrice=num(i.cartonSalePrice); p.cartonPrice=p.cartonSalePrice;} normalizeProductFinal(p);} arr('stockMovements').unshift({id:uid('stk'),date:nowText(),_updatedAt:nowISO(),type:'شراء',product:i.name,productId:i.productId,branch:b.name,branchId:b.id,qty:add,note:ref,createdBy:currentUserName()}); }); try{if(paid>0&&typeof window.addMovement==='function')addMovement(rec.accountId,'out',paid,'مشتريات '+ref,rec.note); if(due>0&&typeof window.addDebt==='function')addDebt('supplier',supplier?.id||'',rec.supplierName,due,ref,'مستحق مورد'); if(typeof window.logAction==='function')logAction('حفظ','مشتريات',ref)}catch(e){} persistHard(); window.purchaseLines=[]; renderPurchaseForm(); toast('تم حفظ المشتريات وتحديث المخزون بالوحدات ومزامنتها');};
  window.deletePurchaseFinal=function(id){const r=arr('purchases').find(x=>String(x.id)===String(id)); if(!r||!confirm('حذف المشتريات وعكس المخزون؟'))return; (r.items||[]).forEach(i=>{const p=productById(i.productId); if(p){p.stock=Math.max(0,num(p.stockUnits!==undefined?p.stockUnits:p.stock)-num(i.stockAdded||stockAdded(i))); p.stockUnits=p.stock; p._updatedAt=nowISO();}}); r._deleted=true; r.deletedAt=nowISO(); r._updatedAt=nowISO(); persistHard(); try{renderPurchaseForm()}catch(e){location.reload()} toast('تم حذف المشتريات وعكس المخزون');};
  window.editPurchaseFinal=function(id){const r=arr('purchases').find(x=>String(x.id)===String(id)); if(!r)return; if(!confirm('سيتم فتح الفاتورة للتعديل بعد عكسها مؤقتًا. متابعة؟'))return; (r.items||[]).forEach(i=>{const p=productById(i.productId); if(p){p.stock=Math.max(0,num(p.stockUnits!==undefined?p.stockUnits:p.stock)-num(i.stockAdded||stockAdded(i))); p.stockUnits=p.stock; p._updatedAt=nowISO();}}); r._deleted=true; r.deletedAt=nowISO(); window.purchaseLines=(r.items||[]).map(x=>({...x})); persistHard(); renderPurchaseForm(); setTimeout(()=>{if($('supplierId'))$('supplierId').value=r.supplierId||''; if($('purchaseDate'))$('purchaseDate').value=r.date||today(); if($('referenceNo'))$('referenceNo').value=r.referenceNo||''; if($('payAmount')){$('payAmount').value=num(r.paid).toFixed(2); $('payAmount').dataset.touched=1;} if($('paymentNote'))$('paymentNote').value=r.note||''; renderPurchaseLines();},50); toast('عدّل البيانات ثم اضغط حفظ');};
  function syncPanelHTML(){return '<button id="oskarLiveSyncBtn" class="icon-btn" title="مزامنة الآن" onclick="oskarLiveSyncNow()">⟳</button><span id="oskarLiveDot" title="الاتصال"></span><span id="oskarPendingOps" class="sync-badge">0</span>'}
  function injectSyncUI(){const actions=document.querySelector('.top-actions'); if(!actions||$('oskarLiveSyncBtn'))return; actions.insertAdjacentHTML('afterbegin',syncPanelHTML()); updateSyncUI();}
  function pendingCount(){try{const d=DB(); return d.lastLocalUpdate&&d.lastSyncAt&&Date.parse(d.lastLocalUpdate)>Date.parse(d.lastSyncAt)?1:0}catch(e){return 0}}
  function updateSyncUI(){const dot=$('oskarLiveDot'), p=$('oskarPendingOps'), b=$('oskarLiveSyncBtn'); if(dot){dot.style.cssText='display:inline-block;width:10px;height:10px;border-radius:50%;background:'+(navigator.onLine?'#22c55e':'#ef4444')+';box-shadow:0 0 0 3px rgba(255,255,255,.18)'} if(p)p.textContent=String(pendingCount()); if(b)b.classList.toggle('syncing',!!window.__OSKAR_SYNC_BUSY__);}
  window.oskarLiveSyncNow=async function(){if(window.__OSKAR_SYNC_BUSY__)return; window.__OSKAR_SYNC_BUSY__=true; updateSyncUI(); try{if(!navigator.onLine)throw new Error('offline'); if(window.FirebaseBridge){await FirebaseBridge.sync(DB(),{prefer:'local'}); if(!window.oskarIsUserEditing||!window.oskarIsUserEditing())try{window.renderPage&&renderPage()}catch(e){}} toast('تمت المزامنة اللحظية');}catch(e){toast('تعذر المزامنة الآن، البيانات محفوظة محليًا');} finally{window.__OSKAR_SYNC_BUSY__=false; updateSyncUI();}}
  function install(){injectSyncUI(); updateSyncUI(); const page=decodeURIComponent(location.pathname); if(/إضافة-مشتريات\.html/.test(page)){window.renderPage=function(){try{window.renderCommon&&renderCommon(); window.updateSyncState&&updateSyncState()}catch(e){} renderPurchaseForm(); injectSyncUI();}; if($('mainCard'))renderPurchaseForm();}}
  setInterval(()=>{try{injectSyncUI(); updateSyncUI(); if(navigator.onLine&&window.FirebaseBridge&&!window.__OSKAR_SYNC_BUSY__&&(!window.oskarIsUserEditing||!window.oskarIsUserEditing()))FirebaseBridge.livePull&&FirebaseBridge.livePull().then(ch=>{if(ch){updateSyncUI();}}).catch(()=>{});}catch(e){}},1000);
  window.addEventListener('online',()=>{updateSyncUI(); try{oskarLiveSyncNow()}catch(e){}});
  window.addEventListener('offline',updateSyncUI);
  window.addEventListener('oskar-db-updated',()=>{updateSyncUI(); if(/إضافة-مشتريات\.html/.test(decodeURIComponent(location.pathname))&&(!window.oskarIsUserEditing||!window.oskarIsUserEditing()))try{renderPurchaseForm()}catch(e){}});
  [0,150,500,1200,2500,4500].forEach(ms=>setTimeout(install,ms));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install); else install();
})();
