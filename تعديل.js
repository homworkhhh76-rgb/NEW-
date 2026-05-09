// تعديل.js - ملف تصحيح عام لكل الصفحات بدون تغيير التصميم
(function(){
  'use strict';
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
})();
