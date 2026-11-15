(() => {
  const site = window.SITE ?? { links: {} };

  // ---- Static links ----
  const applyLinks = links => {
    for (const a of document.querySelectorAll('[data-link]')) {
      const url = links[a.dataset.link];
      if (url) a.href = url;
      if (['github', 'releases', 'issues', 'license'].includes(a.dataset.link)) { a.target = '_blank'; a.rel = 'noopener'; }
    }
  };
  applyLinks(site.links ?? {});
  document.querySelectorAll('[data-year]').forEach(n => { n.textContent = new Date().getFullYear(); });

  // ---- Translations ----
  const uz = {
    'nav.features': 'Imkoniyatlar', 'nav.layouts': 'Kamera', 'nav.reels': 'Reels', 'nav.shortcuts': 'Tugmalar', 'nav.faq': 'Savollar', 'nav.download': 'Yuklab olish',
    'hero.pill': 'Mini recorder, GPU eksport, Reels',
    'hero.title': 'Chiroyli ekran yozuvlari.<br><span class="gradient">Butunlay bepul.</span>',
    'hero.lead': 'Ekran, kamera va ovozingizni yozing, so‘ng silliq kursor, avtomatik yaqinlashtirish, kamera joylashuvlari va 9:16 Reels format bilan tahrirlang. GPU orqali tez eksport. Akkaunt kerak emas, hech narsa yuklanmaydi.',
    'cta.windows': 'Windows uchun yuklab olish', 'cta.portable': 'Portable .exe', 'cta.source': 'GitHub’dagi kod',
    'hero.meta': 'Windows 10 / 11 · 64-bit · MIT litsenziya', 'hero.all': 'Barcha versiyalar',
    'stats.export': '1080p60 da real vaqtdan ~2 baravar tez eksport', 'stats.layouts': 'kamera joylashuvi, yozgandan keyin ham o‘zgaradi', 'stats.uploads': 'yuklash, akkaunt yoki kuzatuv', 'stats.license': 'bepul va ochiq kodli',
    'features.eyebrow': 'Hammasi bir joyda', 'features.title': 'Video muharrirsiz yozing, bezang va ulashing.',
    'f1.t': 'Mini recorder', 'f1.d': 'Ishga tushganda kichik suzuvchi panel ochiladi. Ekranni jonli rasmlardan tanlang, kamera va mikrofonni tekshiring, Record bosing.',
    'f2.t': '3-2-1 sanash', 'f2.d': 'Yozish boshlanishidan oldin tayyorlaning. 0, 3 yoki 5 soniya — sanoqning o‘zi videoga tushmaydi.',
    'f3.t': 'Kino uslubidagi kursor', 'f3.d': 'Tizim kursori o‘rniga silliq vektor kursor: bosish to‘lqinlari, yoritish va harakatsiz bo‘lganda yashirish.',
    'f4.t': 'Avtomatik yaqinlashtirish', 'f4.d': 'Bosishlar timeline’da tahrirlanadigan silliq zoom bo‘laklariga aylanadi, o‘zingiz ham qo‘sha olasiz.',
    'f5.t': 'Tez to‘xtatish va eksport', 'f5.d': 'Yozishda NVENC, Quick Sync yoki AMF; eksportda WebCodecs GPU kodlash. Kerak bo‘lsa CPU’ga o‘tadi.',
    'f6.t': 'Haqiqiy tahrir', 'f6.d': 'Kesish, qisqartirish, o‘chirish, joyini almashtirish va bekor qilish. Har bir klipga alohida ko‘rinish, avtomatik saqlash.',
    'f7.t': 'Ekranda tugmalar', 'f7.d': 'Qisqa tugmalar va yozilayotgan matn chiroyli pufakchalarda — darsliklar uchun ayni muddao.',
    'f8.t': 'Maxfiylik birinchi', 'f8.d': 'Server ham, analitika ham yo‘q. Kamera fonini olib tashlash ham kompyuteringizda bajariladi.',
    'layouts.eyebrow': 'Kamera joylashuvlari', 'layouts.title': 'O‘zingizni ko‘rsatishning besh usuli — xohlagan payt almashtiring.',
    'layouts.sub': 'Ekran va kamera alohida yoziladi, shuning uchun joylashuv yozish paytida emas, tahrirda tanlanadi.',
    'l.screen': 'Faqat ekran', 'l.overlay': 'Kamera ustida', 'l.split': 'Ikkiga bo‘lingan', 'l.camera': 'To‘liq kamera', 'l.cutout': 'Fonsiz kamera',
    'reels.eyebrow': 'Reels · Shorts · TikTok', 'reels.title': '16:9 da bir marta yozing. 9:16 da joylang.',
    'reels.sub': 'Loyihani 9:16 ga o‘tkazing — kadr kursoringizni kuzatadi, matn butun ekran kichrayib ketmasdan katta ko‘rinadi. Split rejimida kamera pastda turadi va ekran ham kursorni kuzatadi. Reels’da click zoom to‘xtaydi, 16:9 ga qaytsangiz yana ishlaydi.',
    'reels.c1': 'Kursorni kuzatuvchi silliq kadr', 'reels.c2': '720×1280 dan 2160×3840 gacha eksport', 'reels.c3': 'Yoki yozishda faqat 9:16 hududni oling',
    'how.eyebrow': 'Qanday ishlaydi', 'how.title': 'G‘oyadan eksportgacha uch qadam.',
    'how.s1t': 'Yozing', 'how.s1d': 'Ekran yoki oynani tanlang, kamera, mikrofon yoki tizim ovozini yoqing va Record bosing.',
    'how.s2t': 'Tahrirlang', 'how.s2d': 'Yozuv muharrirda ochiladi. Kesing, joylashuvni tanlang, fon va ramkani bezang.',
    'how.s3t': 'Eksport qiling', 'how.s3d': '4K 60 fps gacha MP4 yoki GIF — faylga yoki to‘g‘ridan-to‘g‘ri clipboard’ga.',
    'sc.eyebrow': 'Klaviatura tugmalari', 'sc.title': 'Tez qo‘llar, tez videolar.', 'sc.rec': 'Yozish paytida', 'sc.edit': 'Muharrirda',
    'sc.stop': 'To‘xtatish va muharrirni ochish', 'sc.marker': 'Kursor joyiga zoom belgisi', 'sc.hide': 'Yozish panelini yashirish / ko‘rsatish',
    'sc.play': 'Ijro / pauza', 'sc.split': 'Playhead joyida kesish', 'sc.delete': 'Tanlanganni o‘chirish', 'sc.undo': 'Bekor qilish (Ctrl+Y qaytarish)', 'sc.full': 'To‘liq ekran preview',
    'faq.title': 'Savollarga javoblar.',
    q1: 'Haqiqatan ham bepulmi?', a1: 'Ha. Recorder Studio MIT litsenziyasidagi ochiq kodli dastur — watermark, obuna yoki vaqt cheklovi yo‘q.',
    q2: 'Nega Windows SmartScreen ogohlantiradi?', a2: 'Installer hali raqamli imzolanmagan. “Qo‘shimcha ma’lumot”, so‘ng “Baribir ishga tushirish” ni bosing. Kod GitHub’da ochiq.',
    q3: 'Kuchli videokarta kerakmi?', a3: 'Yo‘q. H.264 apparat kodlashli istalgan GPU (so‘nggi 10 yildagi ko‘p Intel, NVIDIA, AMD) to‘xtatish va eksportni tezlashtiradi; aks holda avtomatik CPU ishlatiladi.',
    q4: 'Yozuvlarim biror joyga yuklanadimi?', a4: 'Hech qachon. Yozuvlar, loyihalar va eksportlar kompyuteringizdagi Videos\\Recorder Studio papkasida qoladi.',
    q5: 'Yozgandan keyin kamera joylashuvini o‘zgartirsa bo‘ladimi?', a5: 'Ha. Ekran va kamera alohida treklar, shuning uchun muharrirda overlay, split, to‘liq kamera, fonsiz yoki faqat ekranga o‘tasiz.',
    'final.title': 'Keyingi videongiz ajoyib chiqsin.', 'final.sub': 'Windows 10 va 11 uchun bepul.',
    'footer.license': 'MIT litsenziya', 'footer.releases': 'Versiyalar', 'footer.issues': 'Xato haqida xabar', 'footer.lic': 'Litsenziya',
  };
  const captions = {
    en: { screen: 'Just your screen, with the smooth cursor and zooms.', overlay: 'A camera bubble in any corner — it can move aside when your cursor comes close.', split: 'Screen and camera side by side; in 9:16 the camera stacks underneath.', camera: 'Talk straight to the viewer with a full-frame camera.', cutout: 'Your background removed on-device, placed over the screen.' },
    uz: { screen: 'Faqat ekran — silliq kursor va zoom bilan.', overlay: 'Istalgan burchakdagi kamera pufakchasi — kursor yaqinlashsa chetga suriladi.', split: 'Ekran va kamera yonma-yon; 9:16 da kamera pastga tushadi.', camera: 'To‘liq kadrli kamera bilan tomoshabinga to‘g‘ridan-to‘g‘ri gapiring.', cutout: 'Foningiz kompyuterda olib tashlanib, ekran ustiga qo‘yiladi.' },
  };
  const english = new Map();
  document.querySelectorAll('[data-i18n]').forEach(node => english.set(node, node.innerHTML));
  let lang = 'en';
  const setLang = next => {
    lang = next === 'uz' ? 'uz' : 'en';
    document.documentElement.lang = lang;
    for (const [node, html] of english) {
      const key = node.dataset.i18n;
      node.innerHTML = lang === 'uz' && uz[key] ? uz[key] : html;
    }
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    updateCaption(); renderAssets();
    try { localStorage.setItem('rs-lang', lang); } catch { /* preference only */ }
  };
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));

  // ---- Layout demo ----
  const stage = document.querySelector('.layout-stage'), caption = document.querySelector('[data-caption]');
  const tabs = [...document.querySelectorAll('[data-layout]')];
  let mode = 'overlay', timer;
  function updateCaption() { if (caption) caption.textContent = captions[lang][mode]; }
  const show = next => {
    mode = next; stage.dataset.mode = next;
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.layout === next)));
    updateCaption();
  };
  const cycle = () => { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => show(tabs[(tabs.findIndex(t => t.dataset.layout === mode) + 1) % tabs.length].dataset.layout), 4200); };
  tabs.forEach(t => t.addEventListener('click', () => { show(t.dataset.layout); cycle(); }));
  cycle();

  // ---- Latest release from GitHub ----
  let release = null;
  const formatSize = bytes => bytes > 0 ? `${(bytes / 1048576).toFixed(0)} MB` : '';
  function renderAssets() {
    const labels = lang === 'uz' ? { installer: 'O‘rnatuvchi', portable: 'O‘rnatmasdan' } : { installer: 'Installer', portable: 'No install' };
    for (const node of document.querySelectorAll('[data-asset]')) {
      const kind = node.dataset.asset, asset = release?.[kind];
      node.textContent = [labels[kind], release?.tag, asset ? formatSize(asset.size) : 'x64'].filter(Boolean).join(' · ');
    }
    document.querySelectorAll('[data-version]').forEach(n => { n.textContent = release?.tag ?? `v${site.version}`; });
  }
  setLang((() => { try { return localStorage.getItem('rs-lang') ?? (navigator.language?.toLowerCase().startsWith('uz') ? 'uz' : 'en'); } catch { return 'en'; } })());
  if (site.owner && site.repo) {
    fetch(`https://api.github.com/repos/${site.owner}/${site.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then(data => {
        const find = pattern => data.assets?.find(asset => pattern.test(asset.name));
        const installer = find(/setup.*\.exe$/i), portable = find(/portable.*\.exe$/i);
        release = { tag: data.tag_name, installer, portable };
        applyLinks({ installer: installer?.browser_download_url, portable: portable?.browser_download_url, releases: data.html_url });
        renderAssets();
      })
      .catch(() => { /* keep the stable latest/download links */ });
  }
})();
