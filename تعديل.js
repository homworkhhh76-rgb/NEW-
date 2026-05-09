// تعديل.js - ملف تصحيح عام لكل الصفحات بدون تغيير التصميم
(function(){
  'use strict';
  try{document.documentElement.classList.add('oskar-mobile-boot-closed')}catch(e){}
  if(window.__OSKAR_ROOT_PATCH_RUNNING__) return;
  window.__OSKAR_ROOT_PATCH_RUNNING__=true;

  const APP_KEY='supermarket_pos_ar_v1';
  const DEFAULT_PASS='0000000000@@';
  const DEFAULT_COMPANY='SUPER-0001';
  const state={lastInputAt:0,renderTimer:null};

  function $(id){return document.getElementById(id)}
  function clean(v){return String(v||'').trim()}
  function norm(v){return clean(v).toLowerCase()}
  function load(){try{return JSON.parse(localStorage.getItem(APP_KEY)||'{}')||{}}catch(e){return {}}}
  function save(db){db=db||{};db.settings=db.settings||{};localStorage.setItem(APP_KEY,JSON.stringify(db));try{window.DB=db}catch(e){}return db}
  function msg(m){try{if(window.toast)toast(m);else alert(m)}catch(e){alert(m)}}
  function uid(p){try{if(typeof window.uid==='function')return window.uid(p)}catch(e){}return (p||'id')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
  function nowText(){try{if(typeof window.nowText==='function')return window.nowText()}catch(e){}return new Date().toLocaleString('ar-EG',{hour12:false})}
  function currentUser(){try{if(typeof window.currentUser==='function')return window.currentUser()}catch(e){}try{return JSON.parse(localStorage.getItem('currentUser')||'null')||{name:'مدير النظام',permissions:['*']}}catch(e){return {name:'مدير النظام',permissions:['*']}}}
  function cfg(){return window.CFG||window.PAGE_CONFIG||{}}
  function collectionName(){return cfg().collection||''}
  function arr(db,name){db[name]=Array.isArray(db[name])?db[name]:[];return db[name]}
  function toastSafe(t){try{if(window.toast)toast(t)}catch(e){}}
  function editable(el){if(!el)return false;const t=(el.tagName||'').toLowerCase();return t==='input'||t==='textarea'||t==='select'||el.isContentEditable;}
  function activeTyping(){const el=document.activeElement;return editable(el)&&el.type!=='button'&&el.type!=='submit'&&el.type!=='checkbox'&&el.type!=='radio';}
  function allowRender(fn){window.__OSKAR_ALLOW_RENDER=true;try{return fn()}finally{setTimeout(()=>{window.__OSKAR_ALLOW_RENDER=false},0)}}
  function markInput(){state.lastInputAt=Date.now()}

  function fastFilterTable(q,input){
    q=norm(q);
    const scope=(input&&input.closest('.card'))||document;
    const table=(scope.querySelector&&scope.querySelector('.data-table'))||document.querySelector('.data-table');
    if(!table)return;
    const rows=[...table.querySelectorAll('tbody tr')];
    let shown=0;
    rows.forEach(tr=>{
      const isEmpty=/لا توجد بيانات/.test(tr.textContent||'');
      if(isEmpty){tr.style.display=q?'none':'';return;}
      const ok=!q||norm(tr.textContent).includes(q);
      tr.style.display=ok?'':'none';
      if(ok)shown++;
    });
    const muted=scope.querySelector&&scope.querySelector('.muted');
    if(muted&&/عرض/.test(muted.textContent||'')) muted.textContent='عرض '+shown+' إدخالات';
  }

  document.addEventListener('input',function(e){
    if(!editable(e.target))return;
    markInput();
    if(e.target.id==='searchBox'){
      e.stopImmediatePropagation();
      fastFilterTable(e.target.value,e.target);
    }
  },true);
  document.addEventListener('keydown',function(e){if(editable(e.target))markInput()},true);
  document.addEventListener('focusin',function(e){if(editable(e.target))markInput()},true);

  function patchRenderPage(){
    if(typeof window.renderPage!=='function'||window.renderPage.__oskarNoInputClear)return;
    const old=window.renderPage;
    window.renderPage=function(){
      if(window.__OSKAR_ALLOW_RENDER) return old.apply(this,arguments);
      if(activeTyping()){
        clearTimeout(state.renderTimer);
        state.renderTimer=setTimeout(()=>{if(!activeTyping())allowRender(()=>old.call(window));},2500);
        return;
      }
      return old.apply(this,arguments);
    };
    window.renderPage.__oskarNoInputClear=true;
  }

  function saveAndSync(db){
    save(db);
    try{if(window.FirebaseBridge&&navigator.onLine)window.FirebaseBridge.queueSync(db,250)}catch(e){}
    try{if(typeof window.updateSyncState==='function')window.updateSyncState()}catch(e){}
    return db;
  }

  function patchSyncNow(){
    if(typeof window.syncNow==='function'&&window.syncNow.__oskarFinalSync)return;
    window.syncNow=async function(show=true){
      const btn=document.querySelector('.top-actions button[onclick*="syncNow"],.top-actions button[title*="مزامنة"]');
      try{
        if(btn)btn.classList.add('syncing');
        let db=load();
        if(!navigator.onLine||!window.FirebaseBridge){if(show)msg('لا يوجد اتصال، البيانات محفوظة محلياً');return db;}
        db=await window.FirebaseBridge.sync(db,{companyKey:db.settings&&db.settings.companyKey,prefer:'local'});
        save(db);
        if(show)msg('تمت المزامنة مع Firebase');
        if(!activeTyping()&&typeof window.renderPage==='function')allowRender(()=>window.renderPage());
        return db;
      }catch(e){
        console.warn(e);
        if(show)msg('تعذر المزامنة مع Firebase، راجع صلاحيات Realtime Database');
        throw e;
      }finally{
        if(btn)btn.classList.remove('syncing');
        try{if(typeof window.updateSyncState==='function')window.updateSyncState()}catch(e){}
      }
    };
    window.syncNow.__oskarFinalSync=true;
  }

  function patchSaveCrud(){
    if(typeof window.saveCrud==='function'&&!window.saveCrud.__oskarRobustSave){
      window.saveCrud=function(){
        const form=$('crudForm');
        const coll=collectionName();
        if(!form||!coll){return;}
        const db=load();
        const list=arr(db,coll);
        const data=Object.fromEntries(new FormData(form).entries());
        if(coll==='employees') data.permissions=[...form.querySelectorAll('[name=perm]:checked')].map(x=>x.value);
        const t=nowText();
        if(data.id){
          const i=list.findIndex(x=>String(x&&x.id)===String(data.id));
          if(i>=0) list[i]={...list[i],...data,updatedAt:t,_updatedAt:new Date().toISOString()};
          else {data.createdAt=t;data.createdBy=currentUser().name;data._createdAt=new Date().toISOString();data._updatedAt=data._createdAt;list.unshift(data);}
          try{if(typeof window.logAction==='function')window.logAction('تعديل',cfg().title||coll,data.name||data.id)}catch(e){}
        }else{
          data.id=uid(coll);data.createdAt=t;data.createdBy=currentUser().name;data._createdAt=new Date().toISOString();data._updatedAt=data._createdAt;list.unshift(data);
          try{if(typeof window.logAction==='function')window.logAction('إضافة',cfg().title||coll,data.name||data.id)}catch(e){}
        }
        saveAndSync(db);
        try{if(typeof window.closeModal==='function')window.closeModal()}catch(e){}
        if(typeof window.renderPage==='function')allowRender(()=>window.renderPage());
        msg('تم الحفظ');
      };
      window.saveCrud.__oskarRobustSave=true;
    }
  }

  function patchSaveAccount(){
    if(typeof window.saveAccount==='function'&&!window.saveAccount.__oskarRobustAccount){
      window.saveAccount=function(){
        const f=$('accForm');
        if(!f){if(typeof window.saveCrud==='function')return window.saveCrud();return;}
        const db=load();
        const list=arr(db,'accounts');
        const data=Object.fromEntries(new FormData(f).entries());
        if(data.id){
          const i=list.findIndex(x=>String(x&&x.id)===String(data.id));
          if(i>=0){const oldBalance=Number(list[i].balance||0);list[i]={...list[i],...data,balance:oldBalance,updatedAt:nowText(),_updatedAt:new Date().toISOString()};}
          else {data.id=data.id||uid('acc');data.balance=Number(data.openingBalance||0);data.createdBy=currentUser().name;data._createdAt=new Date().toISOString();data._updatedAt=data._createdAt;list.unshift(data);}
          try{if(typeof window.logAction==='function')window.logAction('تعديل','حسابات',data.name||data.id)}catch(e){}
        }else{
          data.id=uid('acc');data.balance=Number(data.openingBalance||0);data.createdBy=currentUser().name;data._createdAt=new Date().toISOString();data._updatedAt=data._createdAt;list.unshift(data);
          try{if(data.balance&&typeof window.addMovement==='function')window.addMovement(data.id,'in',data.balance,'رصيد افتتاحي','إنشاء حساب')}catch(e){}
          try{if(typeof window.logAction==='function')window.logAction('إضافة','حسابات',data.name||data.id)}catch(e){}
        }
        saveAndSync(db);
        try{if(typeof window.closeModal==='function')window.closeModal()}catch(e){}
        if(typeof window.renderAccounts==='function')allowRender(()=>window.renderAccounts());else if(typeof window.renderPage==='function')allowRender(()=>window.renderPage());
        msg('تم الحفظ');
      };
      window.saveAccount.__oskarRobustAccount=true;
    }
  }

  function patchDeleteSync(){
    if(typeof window.deleteRec==='function'&&!window.deleteRec.__oskarDeleteSync){
      const old=window.deleteRec;
      window.deleteRec=function(id){
        const before=load();
        const coll=collectionName();
        const beforeIds=new Set((before[coll]||[]).map(x=>String(x&&x.id)));
        const r=old.apply(this,arguments);
        setTimeout(()=>{
          const db=load();
          db.__deleted=db.__deleted||{};db._deletedIds=db._deletedIds||{};
          if(coll){
            const afterIds=new Set((db[coll]||[]).map(x=>String(x&&x.id)));
            beforeIds.forEach(x=>{if(x&&!afterIds.has(x)){db.__deleted[coll]=db.__deleted[coll]||{};db._deletedIds[coll]=db._deletedIds[coll]||{};const t=new Date().toISOString();db.__deleted[coll][x]=t;db._deletedIds[coll][x]=t;}});
          }
          saveAndSync(db);
        },40);
        return r;
      };
      window.deleteRec.__oskarDeleteSync=true;
    }
  }

  async function pullLoginData(key){
    let db=load();db.settings=db.settings||{};
    key=clean(key||db.settings.companyKey||DEFAULT_COMPANY)||DEFAULT_COMPANY;
    let cloud=null;
    if(window.FirebaseBridge&&navigator.onLine){
      try{cloud=await window.FirebaseBridge.getCloudWithKey(key)}catch(e){console.warn(e)}
      if(cloud&&Object.keys(cloud).length){
        if(cloud.settings&&cloud.settings.managerPassword){
          try{db=await window.FirebaseBridge.pullWithKey(key)}catch(e){console.warn(e);db=load()}
        }else{
          db.settings=db.settings||{};db.settings.companyKey=key;db.settings.managerPassword=DEFAULT_PASS;db.settings.forcePasswordChange=true;
        }
      }
    }
    db.settings=db.settings||{};db.settings.companyKey=key;save(db);return {db,cloud};
  }

  function patchLogin(){
    if(!/index\.html$|\/$/.test(location.pathname))return;
    window.login=async function(){
      const role=($('role')&&$('role').value)||'manager';
      const pass=clean(($('password')&&$('password').value)||'');
      const user=norm(($('username')&&$('username').value)||'');
      const key=clean(($('companyKey')&&$('companyKey').value)||load().settings?.companyKey||DEFAULT_COMPANY)||DEFAULT_COMPANY;
      const pulled=await pullLoginData(key);
      let db=pulled.db;db.settings=db.settings||{};
      if(role==='manager'){
        const saved=clean(db.settings.managerPassword||DEFAULT_PASS);
        if(pass!==saved) return msg('كلمة مرور المدير غير صحيحة');
        if(saved===DEFAULT_PASS||db.settings.forcePasswordChange){
          const p=prompt('يجب تغيير كلمة مرور المدير الآن. اكتب كلمة مرور جديدة:');
          const newPass=clean(p);
          if(!newPass||newPass.length<6||newPass===DEFAULT_PASS)return msg('كلمة المرور الجديدة غير صالحة');
          if(!navigator.onLine||!window.FirebaseBridge)return msg('يجب الاتصال بالإنترنت لحفظ كلمة المرور في Firebase');
          try{db=await window.FirebaseBridge.updateManagerPassword(newPass,key)}catch(e){console.warn(e);return msg('تعذر حفظ كلمة المرور في Firebase، تأكد من صلاحيات قاعدة البيانات');}
        }
        localStorage.setItem('currentUser',JSON.stringify({id:'manager',name:'مدير النظام',username:'admin',role:'Admin',permissions:['*'],active:'نشط',companyKey:key,managerId:'manager',loginAt:new Date().toISOString()}));
        location.href='لوحة-المتابعة.html';
        return;
      }
      const employees=Array.isArray(db.employees)?db.employees:[];
      const emp=employees.find(e=>{
        const names=[e.username,e.email,e.name,e.fullName,e.mobile,e.phone].map(norm);
        const saved=clean(e.password||e.pass||e.pin||e.employeePassword||'');
        return norm(e.active||'نشط')!=='غير نشط'&&!e._deleted&&names.includes(user)&&saved===pass;
      });
      if(emp){localStorage.setItem('currentUser',JSON.stringify({...emp,permissions:Array.isArray(emp.permissions)?emp.permissions:[],companyKey:key,managerId:'manager',loginAt:new Date().toISOString()}));location.href='لوحة-المتابعة.html';}
      else msg('بيانات الموظف غير صحيحة أو الحساب غير نشط');
    };
    window.login.__oskarCloudLogin=true;
  }

  function sessionRedirect(){
    if(!/index\.html$|\/$/.test(location.pathname))return;
    if(/[?&]logout=1/.test(location.search))return;
    try{
      const u=JSON.parse(localStorage.getItem('currentUser')||'null');
      if(u&&u.companyKey&&u.active!=='غير نشط') location.replace('لوحة-المتابعة.html');
    }catch(e){}
  }

  function patchLogoutButtons(){
    document.addEventListener('click',function(e){
      const el=e.target.closest&&e.target.closest('[onclick],button,a');
      if(!el)return;
      const txt=(el.textContent||'')+' '+(el.getAttribute('title')||'')+' '+(el.getAttribute('onclick')||'');
      if(/تسجيل الخروج|logout|currentUser/.test(txt)&&!/login/.test(txt)){
        try{localStorage.removeItem('currentUser')}catch(x){}
      }
    },true);
  }

  function patchAll(){patchRenderPage();patchSyncNow();patchSaveCrud();patchSaveAccount();patchDeleteSync();patchLogin();}
  sessionRedirect();patchLogoutButtons();patchAll();
  document.addEventListener('DOMContentLoaded',()=>{sessionRedirect();patchAll();setTimeout(patchAll,300);setTimeout(patchAll,1200);});
  const timer=setInterval(patchAll,1000);setTimeout(()=>clearInterval(timer),60000);

  /* ===== إصلاحات مباشرة للقائمة والمزامنة والوحدات والمخزون ===== */
  (function(){
    if(window.__OSKAR_LIVE_UNIT_STOCK_FIX__) return;
    window.__OSKAR_LIVE_UNIT_STOCK_FIX__=true;

    const liveState={syncSpinTimer:null,fastPullTimer:null,installTimer:null};
    function n(v){const x=Number(String(v??'').replace(/,/g,''));return isFinite(x)?x:0}
    function text(v){return String(v??'').trim()}
    function db(){return load()}
    function write(dbx){saveAndSync(dbx); try{window.DB=dbx}catch(e){} return dbx}
    function coll(name){try{if(typeof window.collection==='function')return window.collection(name)}catch(e){} const d=db(); d[name]=Array.isArray(d[name])?d[name]:[]; return d[name]}
    function getCfg(){return window.CFG||window.PAGE_CONFIG||{}}
    function isPurchasePage(){const c=getCfg();return c.kind==='purchase_form'||/مشتريات|شراء/.test(String(c.title||location.pathname))}
    function isMobile(){return !window.matchMedia || window.matchMedia('(max-width:1099.98px)').matches}
    function isEditingNow(){const el=document.activeElement;const tag=String(el&&el.tagName||'').toLowerCase();return ['input','textarea','select'].includes(tag)||!!(el&&el.isContentEditable)}
    function syncBtn(){return document.querySelector('[onclick*="syncNow"],button[title*="مزامنة"],button[aria-label*="مزامنة"],.sync-btn,#syncBtn')}
    function startSpin(ms=1600){const b=syncBtn();if(!b)return;b.classList.add('oskar-syncing','syncing');clearTimeout(liveState.syncSpinTimer);liveState.syncSpinTimer=setTimeout(()=>{b.classList.remove('oskar-syncing','syncing')},ms)}
    function stopSpin(){const b=syncBtn();if(b)b.classList.remove('oskar-syncing','syncing')}
    window.oskarStartSyncSpin=startSpin;

    function injectStyle(){
      if(document.getElementById('oskar-live-unit-stock-style'))return;
      const css=`
@keyframes oskarSyncRotate{to{transform:rotate(360deg)}}
.oskar-syncing svg,.syncing svg{animation:oskarSyncRotate .75s linear infinite!important;transform-origin:center!important}
.oskar-syncing:not(:has(svg)),.syncing:not(:has(svg)){animation:oskarSyncRotate .9s linear infinite!important;transform-origin:center!important}
@media(max-width:1099.98px){
  html.oskar-mobile-boot-closed body .drawer{transition:none!important;transform:translateX(105%) translateZ(0)!important}
  html.oskar-mobile-boot-closed body .drawer.open{transform:translateX(105%) translateZ(0)!important}
  html.oskar-mobile-boot-closed body .drawer-overlay{display:none!important}
  body .drawer:not(.open){transform:translateX(105%) translateZ(0)!important;visibility:visible!important}
  body .drawer.open{transform:translateX(0) translateZ(0)!important;visibility:visible!important}
  body .drawer-overlay:not(.show){display:none!important}
  body .drawer-overlay.show{display:block!important}
}`;
      const st=document.createElement('style');st.id='oskar-live-unit-stock-style';st.textContent=css;(document.head||document.documentElement).appendChild(st);
    }

    function installDrawerFix(){
      injectStyle();
      const oldOpen=window.openDrawer, oldClose=window.closeDrawer;
      window.openDrawer=function(){
        document.documentElement.classList.remove('oskar-mobile-boot-closed');
        const d=document.getElementById('drawer')||document.querySelector('.drawer');
        const o=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay');
        if(d)d.classList.add('open'); if(o)o.classList.add('show');
        if(typeof oldOpen==='function'&&oldOpen!==window.openDrawer){try{}catch(e){}}
      };
      window.closeDrawer=function(){
        const d=document.getElementById('drawer')||document.querySelector('.drawer');
        const o=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay');
        if(d)d.classList.remove('open'); if(o)o.classList.remove('show');
        if(typeof oldClose==='function'&&oldClose!==window.closeDrawer){try{}catch(e){}}
      };
      function closeBoot(){
        if(!isMobile())return;
        const d=document.getElementById('drawer')||document.querySelector('.drawer');
        const o=document.getElementById('drawerOverlay')||document.querySelector('.drawer-overlay');
        if(d)d.classList.remove('open'); if(o)o.classList.remove('show');
      }
      [0,30,80,160].forEach(ms=>setTimeout(closeBoot,ms));
      setTimeout(()=>document.documentElement.classList.remove('oskar-mobile-boot-closed'),450);
    }

    function installSyncFix(){
      injectStyle();
      if(window.FirebaseBridge&&window.FirebaseBridge.queueSync&&!window.FirebaseBridge.queueSync.__oskarSpin){
        const oldQ=window.FirebaseBridge.queueSync;
        window.FirebaseBridge.queueSync=function(dbx,delay){startSpin((delay||400)+2200);return oldQ.call(this,dbx,Math.min(delay||350,500))};
        window.FirebaseBridge.queueSync.__oskarSpin=true;
      }
      if(typeof window.syncNow==='function'&&!window.syncNow.__oskarSpin){
        const old=window.syncNow;
        window.syncNow=async function(show=true){startSpin(4000);try{return await old.call(this,show)}finally{setTimeout(stopSpin,500)}};
        window.syncNow.__oskarSpin=true;
      }
      if(!liveState.fastPullTimer){
        liveState.fastPullTimer=setInterval(async()=>{
          if(!navigator.onLine||!window.FirebaseBridge||isEditingNow())return;
          try{const changed=await window.FirebaseBridge.livePull(); if(changed)startSpin(900)}catch(e){}
        },2600);
      }
    }

    function unitAliases(v){v=text(v);if(!v)return [''];if(['unit-piece','piece','عدد / وحدة','وحدة','قطعة'].includes(v))return ['وحدة','عدد / وحدة','unit-piece','قطعة'];if(['unit-carton','carton','كرتونة'].includes(v))return ['كرتونة','unit-carton'];return [v]}
    function getUnitOptions(p){
      p=p||{};const size=n(p.cartonSize||p.unitsPerCarton)||1;
      const unitSale=n(p.salePrice||p.unitSalePrice||p.unitSaleFromCarton||p.price);
      const unitPurchase=n(p.purchasePrice||p.unitPurchasePrice)||((n(p.cartonPurchasePrice||p.cartonWholesalePrice)&&size)?n(p.cartonPurchasePrice||p.cartonWholesalePrice)/size:0);
      const out=[];
      out.push({label:'وحدة',value:'وحدة',factor:1,price:isPurchasePage()?unitPurchase:unitSale,salePrice:unitSale,purchasePrice:unitPurchase});
      const hasCarton=text(p.hasCarton||'نعم')!=='لا' && size>1;
      if(hasCarton){
        const cartonSale=n(p.cartonSalePrice||p.cartonPrice)||(unitSale*size);
        const cartonPurchase=n(p.cartonPurchasePrice||p.cartonWholesalePrice)||(unitPurchase*size);
        out.push({label:'كرتونة',value:'كرتونة',factor:size,price:isPurchasePage()?cartonPurchase:cartonSale,salePrice:cartonSale,purchasePrice:cartonPurchase});
      }
      coll('units').forEach(u=>{const val=text(u.name||u.short||u.id);if(!val)return;if(['وحدة','عدد / وحدة','كرتونة'].includes(val))return;if(out.some(x=>x.value===val))return;const f=n(u.ratio)||1;out.push({label:val,value:val,factor:f,price:(isPurchasePage()?unitPurchase:unitSale)*f,salePrice:unitSale*f,purchasePrice:unitPurchase*f});});
      return out;
    }

    function installUnitCartFix(){
      window.productUnitOptions=function(p){return getUnitOptions(p)};
      window.addProductToCart=function(id){
        const p=coll('products').find(x=>String(x.id)===String(id));if(!p)return;
        const u=getUnitOptions(p)[0];
        window.cart=Array.isArray(window.cart)?window.cart:(typeof cart!=='undefined'?cart:[]);
        window.cart.push({productId:p.id,name:p.name,sku:p.sku,unit:u.value,factor:u.factor,qty:1,unitPrice:u.price,discount:0,total:u.price});
        try{cart=window.cart}catch(e){}
        if(typeof window.renderCart==='function')window.renderCart();
      };
      window.changeCartUnit=function(idx,val){
        const c=window.cart||cart||[];const it=c[idx];if(!it)return;const p=coll('products').find(x=>String(x.id)===String(it.productId))||{};
        const u=getUnitOptions(p).find(x=>x.value===val)||getUnitOptions(p)[0];it.unit=u.value;it.factor=u.factor;it.unitPrice=u.price;
        if(typeof window.renderCart==='function')window.renderCart();
      };
    }

    function selectHTML(f,val){
      const selectedAliases=unitAliases(val);
      let opts=[];
      if(f.dynamic){
        if(f.name==='unit'){
          opts=[{label:'اختر الوحدة',value:''},{label:'وحدة',value:'وحدة'},{label:'كرتونة',value:'كرتونة'}];
          coll('units').forEach(x=>{const label=text(x[f.dynamic.label]||x.name||x.short||x.id);const value=text(x[f.dynamic.value]||x.name||x.id);if(label&&!opts.some(o=>o.label===label||o.value===value))opts.push({label,value})});
        }else{
          opts=[{label:f.dynamic.empty||'يرجى الاختيار',value:''}].concat(coll(f.dynamic.source).map(x=>({label:x[f.dynamic.label]||x.name||x.id,value:x[f.dynamic.value]||x.id||x.name||''})));
        }
      }else{
        opts=(f.options||[]).map(o=>typeof o==='object'?o:{label:o,value:o});
      }
      return `<select name="${f.name}" ${f.required?'required':''}>${opts.map(o=>{const value=text(o.value),label=text(o.label);const sel=selectedAliases.includes(value)||selectedAliases.includes(label)||String(val)===value||String(val)===label;return `<option value="${value}" ${sel?'selected':''}>${label}</option>`}).join('')}</select>`;
    }
    function fieldHTMLFixed(f,val=''){
      const req=f.required?'required':''; const v=val??'';
      if(f.type==='textarea')return `<textarea name="${f.name}" ${req}>${v}</textarea>`;
      if(f.type==='select')return selectHTML(f,v);
      return `<input name="${f.name}" type="${f.type||'text'}" value="${v}" ${req}>`;
    }

    function normalizeProductData(data){
      ['stock','purchasePrice','salePrice','cartonPrice','cartonSize','unitsPerCarton','cartonPurchasePrice','cartonWholesalePrice','cartonSalePrice','unitPurchasePrice','unitSalePrice','unitSaleFromCarton','alertQty'].forEach(k=>{if(data[k]!==undefined&&data[k]!=='' )data[k]=n(data[k])});
      if(unitAliases(data.unit).includes('وحدة'))data.unit='وحدة';
      if(unitAliases(data.unit).includes('كرتونة'))data.unit='كرتونة';
      if(data.cartonSize&&!data.unitsPerCarton)data.unitsPerCarton=data.cartonSize;
      if(data.cartonWholesalePrice&&!data.cartonPurchasePrice)data.cartonPurchasePrice=data.cartonWholesalePrice;
      if(data.cartonSize&&data.cartonPurchasePrice&&!data.purchasePrice)data.purchasePrice=n(data.cartonPurchasePrice)/Math.max(1,n(data.cartonSize));
      if(data.cartonSize&&data.cartonSalePrice&&!data.salePrice)data.salePrice=n(data.unitSaleFromCarton)||(n(data.cartonSalePrice)/Math.max(1,n(data.cartonSize)));
      return data;
    }

    function installCrudFix(){
      window.fieldHTML=fieldHTMLFixed;
      if(typeof window.openForm==='function'&&!window.openForm.__oskarUnitFixed){
        window.openForm=function(editId=null){
          const c=getCfg(), fields=c.fields||[], rec=editId?coll(c.collection).find(x=>String(x.id)===String(editId)):{};
          const body=document.getElementById('modalBody'); if(!body)return;
          body.innerHTML=`<form id="crudForm" class="grid">${fields.map(f=>`<div class="field"><label>${f.label}${f.required?' *':''}</label>${fieldHTMLFixed(f,rec?.[f.name]??'')}</div>`).join('')}<div class="field" style="grid-column:1/-1"><label>ملاحظة</label><textarea name="note">${rec?.note||''}</textarea></div><input type="hidden" name="id" value="${editId||''}"></form>`;
          const title=document.getElementById('modalTitle'); if(title)title.textContent=editId?'تعديل':'إضافة';
          const modal=document.getElementById('modalBack'); if(modal)modal.style.display='flex';
        };
        window.openForm.__oskarUnitFixed=true;
      }
      window.saveCrud=function(){
        const form=document.getElementById('crudForm');const c=getCfg();const name=c.collection||'';if(!form||!name)return;
        const d=Object.fromEntries(new FormData(form).entries()); if(name==='products')normalizeProductData(d);
        if(name==='employees')d.permissions=[...form.querySelectorAll('[name=perm]:checked')].map(x=>x.value);
        const dbase=db(); const list=Array.isArray(dbase[name])?dbase[name]:(dbase[name]=[]); const t=nowText();
        if(d.id){const i=list.findIndex(x=>String(x.id)===String(d.id));if(i>=0)list[i]={...list[i],...d,updatedAt:t,_updatedAt:new Date().toISOString()};else{d.id=d.id||uid(name);d.createdAt=t;d.createdBy=currentUser().name;d._createdAt=new Date().toISOString();d._updatedAt=d._createdAt;list.unshift(d)};try{if(window.logAction)logAction('تعديل',c.title||name,d.name||d.id)}catch(e){}}
        else{d.id=uid(name);d.createdAt=t;d.createdBy=currentUser().name;d._createdAt=new Date().toISOString();d._updatedAt=d._createdAt;list.unshift(d);try{if(window.logAction)logAction('إضافة',c.title||name,d.name||d.id)}catch(e){}}
        write(dbase);startSpin(2200);try{if(window.closeModal)closeModal()}catch(e){};if(window.renderPage)allowRender(()=>renderPage());msg('تم الحفظ');
      };
      window.saveCrud.__oskarRobustSave=true;
    }

    function installPurchaseFix(){
      window.savePurchase=function(){
        const c=window.cart||cart||[]; if(!c.length){msg('أضف أصناف أولاً');return}
        const dbase=db(); ['purchases','products','stockMovements','debts','accountMovements'].forEach(k=>{dbase[k]=Array.isArray(dbase[k])?dbase[k]:[]}); try{window.DB=dbase}catch(e){}
        const total=c.reduce((s,i)=>s+n(i.total),0), paid=n(document.getElementById('payAmount')?.value);
        const supplier=dbase.suppliers?.find(x=>String(x.id)===String(document.getElementById('supplierId')?.value));
        const account=document.getElementById('accountId')?.value||'cash-main', due=Math.max(0,total-paid);
        const rec={id:uid('pur'),date:document.getElementById('purchaseDate')?.value||(typeof window.todayISO==='function'?window.todayISO():new Date().toISOString().slice(0,10)),referenceNo:document.getElementById('referenceNo')?.value||('PUR-'+Date.now()),supplierId:supplier?.id||'',supplierName:supplier?.name||'مورد غير محدد',branch:document.getElementById('branch')?.value||'',items:JSON.parse(JSON.stringify(c)),total,paid,due,paymentStatus:due>0?'مستحق':'مدفوع',purchaseStatus:document.getElementById('purchaseStatus')?.value,accountId:account,createdBy:currentUser().name,_createdAt:new Date().toISOString(),_updatedAt:new Date().toISOString()};
        dbase.purchases.unshift(rec);
        try{if(paid>0&&window.addMovement)addMovement(account,'out',paid,'مشتريات '+rec.referenceNo,document.getElementById('paymentNote')?.value,(typeof window.sourceKey==='function'?window.sourceKey('purchase',rec.id):'purchase:'+rec.id))}catch(e){}
        try{if(due>0&&window.addDebt)addDebt('supplier',supplier?.id||'',rec.supplierName,due,rec.referenceNo,'مستحق مورد',(typeof window.sourceKey==='function'?window.sourceKey('purchase',rec.id):'purchase:'+rec.id))}catch(e){}
        c.forEach(i=>{const p=dbase.products.find(x=>String(x.id)===String(i.productId));if(!p)return;const factor=Math.max(1,n(i.factor)||1);const qty=n(i.qty);const stockQty=qty*factor;p.stock=n(p.stock)+stockQty;p.purchasePrice=factor>1?n(i.unitPrice)/factor:n(i.unitPrice);if(i.unit==='كرتونة'){p.cartonSize=p.cartonSize||factor;p.unitsPerCarton=p.unitsPerCarton||factor;p.cartonPurchasePrice=n(i.unitPrice);p.cartonWholesalePrice=n(i.unitPrice)};p._updatedAt=new Date().toISOString();dbase.stockMovements.unshift({id:uid('stk'),date:nowText(),type:'شراء',product:p.name,productId:p.id,branch:rec.branch,qty:stockQty,unit:i.unit||'وحدة',factor,note:rec.referenceNo})});
        try{if(window.logAction)logAction('حفظ','مشتريات',rec.referenceNo)}catch(e){}
        write(dbase);startSpin(2500);window.cart=[];try{cart=window.cart}catch(e){};if(window.renderCart)renderCart();msg('تم حفظ المشتريات');
      };
    }

    function installAll(){installDrawerFix();installSyncFix();installUnitCartFix();installCrudFix();installPurchaseFix()}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAll,{once:true}); else installAll();
    [150,700,1800,3500,7000].forEach(ms=>setTimeout(installAll,ms));
    liveState.installTimer=setInterval(installAll,3000);setTimeout(()=>clearInterval(liveState.installTimer),30000);
  })();

})();
