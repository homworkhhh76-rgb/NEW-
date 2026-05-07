const CACHE_NAME = "cashier-multipage-ar-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./firebase-config.js",
  "./manifest.json",
  "./qr.mp3",
  "./الرئيسية.html",
  "./لوحة-المتابعة.html",
  "./إضافة-صنف.html",
  "./كل-الأصناف.html",
  "./نقل-مخزني.html",
  "./المخزون-التالف.html",
  "./طلبات-الأصناف.html",
  "./وحدات-الأصناف.html",
  "./مجموعات-الأصناف.html",
  "./تحديث-الأسعار.html",
  "./مجموعات-الأسعار.html",
  "./حركات-الأصناف.html",
  "./ضمانات-الأصناف.html",
  "./تقارير-الأصناف.html",
  "./استيراد-بيانات-الأصناف.html",
  "./استيراد-كميات-افتتاحية.html",
  "./إضافة-مبيعات.html",
  "./كل-المبيعات.html",
  "./سجل-الكاشير.html",
  "./الكاشير.html",
  "./مسودات-البيع.html",
  "./عروض-الأسعار.html",
  "./مرجع-المبيعات.html",
  "./الشحن-والتوصيل.html",
  "./خصومات-ترويجية.html",
  "./استيراد-بيانات-المبيعات.html",
  "./تقرير-المبيعات-مفصل.html",
  "./إضافة-مشتريات.html",
  "./كل-المشتريات.html",
  "./مرجع-المشتريات.html",
  "./تقرير-المشتريات.html",
  "./قائمة-المصاريف.html",
  "./إضافة-المصاريف.html",
  "./فئات-المصاريف.html",
  "./تقرير-المصاريف.html",
  "./المستخدمين.html",
  "./إضافة-موظف.html",
  "./كل-الموظفين.html",
  "./صلاحيات-الموظفين.html",
  "./سجل-نشاطات-الموظفين.html",
  "./إدارة-الحسابات.html",
  "./إضافة-حساب.html",
  "./سجل-أرصدة-الحسابات.html",
  "./حركة-الحسابات.html",
  "./العملاء.html",
  "./إضافة-عميل.html",
  "./ديون-العملاء.html",
  "./دفعات-العملاء.html",
  "./الموردين.html",
  "./إضافة-مورد.html",
  "./دفعات-التجار.html",
  "./تقارير-إضافية.html",
  "./تقرير-الأرباح.html",
  "./تقرير-المخزون.html",
  "./تقرير-الديون.html",
  "./تقرير-الحسابات.html",
  "./الإعدادات.html",
  "./الإعدادات-الرئيسية.html",
  "./فروع-المخازن.html",
  "./شكل-الفاتورة.html",
  "./إعدادات-الباركود.html",
  "./طابعات-الإيصالات.html",
  "./معدلات-الضرائب.html"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com') || (url.hostname.includes('gstatic.com') && url.pathname.includes('firebase'))) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({offline:true}), {status:503, headers:{'Content-Type':'application/json'}})));
    return;
  }
  if(req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => { const c=res.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(req,c)); return res; }).catch(async()=> (await caches.match(req)) || (await caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => { const c=res.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(req,c)); return res; }).catch(() => cached || new Response('',{status:504}))));
});
self.addEventListener('message', event => { if(event.data && event.data.type==='CLEAR_CACHE') event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k))))); });
