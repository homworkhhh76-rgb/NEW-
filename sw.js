const CACHE='pos-ar-v1';
const ASSETS=["index.html", "firebase.js", "manifest.webmanifest", "icon.svg", "qr.mp3", "لوحة-المتابعة.html", "إضافة-صنف.html", "كل-الأصناف.html", "نقل-مخزني.html", "المخزون-التالف.html", "طباعة-الملصقات.html", "وحدات-الأصناف.html", "مجموعات-الأصناف.html", "تحديث-الأسعار.html", "مجموعات-الأسعار.html", "ماركات-الأصناف.html", "ضمانات-الأصناف.html", "متغيرات-الأصناف.html", "استيراد-بيانات-الأصناف.html", "استيراد-كميات-افتتاحية.html", "حركات-الأصناف.html", "تقرير-المخزون.html", "إضافة-مبيعات.html", "كل-المبيعات.html", "سجل-الكاشير.html", "الكاشير.html", "مسودات-البيع.html", "عروض-الأسعار.html", "مرجع-المبيعات.html", "الشحن-والتوصيل.html", "خصومات-ترويجية.html", "استيراد-بيانات-المبيعات.html", "تقرير-المبيعات-مفصل.html", "إضافة-مشتريات.html", "كل-المشتريات.html", "مرجع-المشتريات.html", "تقرير-المشتريات.html", "قائمة-المصاريف.html", "إضافة-المصاريف.html", "فئات-المصاريف.html", "تقرير-المصاريف.html", "الموردين.html", "العملاء.html", "مندوبي-المبيعات.html", "الموظفين.html", "مجموعات-العملاء.html", "تقرير-العملاء-والموردين.html", "تقرير-مناوبة-الموظفين.html", "تقرير-مندوبي-المبيعات.html", "استيراد-العملاء-والموردين.html", "إدارة-الحسابات.html", "سجل-الحسابات.html", "تحويل-مالي.html", "تقرير-الحسابات.html", "تقرير-الأرباح.html", "تقرير-الديون.html", "سجل-نشاطات-الموظفين.html", "الإعدادات.html", "فروع-مخازن.html", "شكل-الفاتورة.html", "إعدادات-الباركود.html", "طابعات-الإيصالات.html", "معدلات-الضرائب.html"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{
    const clone=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,clone)).catch(()=>{}); return res;
  }).catch(()=>{
    if(e.request.mode==='navigate') return caches.match('index.html');
    return cached;
  })));
});
