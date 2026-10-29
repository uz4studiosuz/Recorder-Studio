# Recorder Studio 0.5.1: Windows qo‘llanmasi

## Yangi build

- `release/Recorder-Studio-Setup-0.5.1-x64.exe`: yangi Windows x64 installer.
- `release/win-unpacked/Recorder Studio.exe`: o‘rnatmasdan ishlatish; butun `win-unpacked` papkasi kerak.
- `release/Recorder-Studio-Portable-0.5.1-x64.exe`: bitta portable dastur.
- `npm run dist:portable`: portable build yaratadi.

Eski build avtomatik yangilanmaydi. Yangi installer’dan foydalaning. Build raqamli sertifikatsiz, shu sabab Windows publisherni tasdiqlay olmaydi. Ommaviy tarqatish uchun o‘z code-signing sertifikatingizni sozlang.

## Ishga tushirish va build

Windows 10/11 x64, Node 24 LTS x64 (minimum 22.12), npm, PowerShell, birinchi o‘rnatishda npm/GitHub internet kirishi va bir necha GB bo‘sh joy kerak.

```powershell
cd 'G:\Loyihalar\Recorder Studio'
npm ci
npm run setup:win
npm run dev
```

`dev` haqiqiy desktop oynani ochadi. `dev:web` brauzer preview’i: native yozuv va FFmpeg eksporti uchun desktop kerak.

`setup:win` runtime yetishmasa Electron va FFmpeg’ni o‘rnatilgan paketlarning rasmiy GitHub release’laridan yuklaydi, Electron SHA-256’ni tekshiradi va native modullarni yuklaydi. Bu komanda loyiha skriptini faqat child-process ichidagi execution-policy override bilan ishlatadi; Windows doimiy policy’sini o‘zgartirmaydi. Group Policy cheklovlari bo‘lsa tashkilot administratori bilan kelishing.

Tekshirish:

```powershell
npm run typecheck
npm test
npm run build
npm run test:desktop
```

Installer yaratish:

```powershell
npm run dist:win
```

Natija: `release/Recorder-Studio-Setup-0.5.1-x64.exe` va `release/Recorder-Studio-Portable-0.5.1-x64.exe`.

```powershell
npm run pack:win
npm run dist:portable
```

Birinchisi unpacked papkani, ikkinchisi `release/Recorder-Studio-Portable-0.5.1-x64.exe`ni yaratadi. Native modullar uchun x64 prebuild bor; boshqa arxitekturada manbadan build qilish zarur bo‘lsa Visual Studio Build Tools + Desktop development with C++ kerak bo‘lishi mumkin.

## Start menyu va fullscreen

Ilova **New recording** va **Import project** tugmalari hamda saqlangan loyihalar gridi bilan ochiladi. Editor ichidagi Home belgisi loyihani saqlab gridga qaytaradi. Davom ettirish uchun loyihaning rasmini bosing.

Preview expand tugmasi, **F** yoki **F11** fullscreen ochadi; **Esc** chiqadi. Preview Fit/+/- boshqaruvi timeline masshtabidan alohida.

## Yozuv va qurilmalar

1. New recording’ni oching.
2. Ekran/oyna thumbnail’ini tanlang. Katta preview qaysi manba tanlanganini ko‘rsatadi; Refresh yangi ko‘rinishni oladi.
3. Microphone, System audio va Webcam kerak bo‘lsa yoqing. Ular dastlab o‘chiq. Mikrofon/kamera uchun ro‘yxatdan kerakli qurilmani tanlang.
4. Start recording’ni bosing. Editor kichrayadi, Stop paneli chiqadi.
5. Stop yoki Ctrl+Shift+F9 bilan tugating. Yozuv avtomatik editorga ochiladi.

**NotFoundError:** yo‘q yoki uzilgan qurilma nomi bilan aniq xabar chiqadi. Kamera/mikrofon bo‘lmasa, toggle yonida buning sababi ko‘rsatiladi. Input tayyorlash vaqtida ayrim qurilma ishlamasa, **Continue with available inputs** orqali qolganlari bilan yozing yoki **Change devices** bilan qayting. Yo‘q kamerani dasturiy tarzda yaratib bo‘lmaydi.

Permission uchun Windows Settings → Privacy & security → Camera / Microphone → desktop app access’ni tekshiring. Qurilma band bo‘lsa, undan foydalanayotgan boshqa ilovani yoping. System audio uchun faol Windows output qurilmasi kerak; u mikrofon borligiga bog‘liq emas.

Fayllar **Videos/Recorder Studio/** ichida alohida sessiya papkasida saqlanadi: `raw.mp4`, `recording.mp4`, `telemetry.json`, `capture.json`; audio/webcam yoqilgan bo‘lsa ularning fayllari ham. Xatoda raw fayllar saqlanadi.

## CapCut uslubidagi cut

- Timeline ruler ustiga bosing yoki playhead tutqichini sudrab kerakli joyga o‘ting.
- **Ctrl+B** yoki Scissors: haqiqiy alohida klipga ajratish.
- Klipni bosing: kontur, trim tutqichlari va Selected clip parametrlari chiqadi.
- **Delete**: tanlangan bo‘lakni olib tashlash va bo‘shliqni yopish. Qolgan bo‘laklar video/audio bilan birga ketma-ket eksport qilinadi.
- **Ctrl+Z** undo; **Ctrl+Shift+Z** yoki **Ctrl+Y** redo.
- Chet tutqichlari yoki Source in/out maydonlari: trim.
- Kliplarni surib yoki Move earlier/later bilan tartibini almashtiring.
- **Ctrl +/−**, **Ctrl+wheel**: timeline zoom; **Ctrl+0**: fit.
- **Space**: play/pause; **0.25×–4×**: tezlik, audio ham moslashadi.
- Reset cuts barcha kesishlarni tiklaydi.

Bitta source videodan bir nechta kesilgan va qayta tartiblangan bo‘laklar qo‘llanadi. Turli mustaqil video fayllarni bitta multitrack loyihaga qo‘shish hozircha mavjud emas.

## Zoom va tanlash

Zoom yo‘lagiga ikki marta bosing yoki + tugmasidan foydalaning. Zoom blokini sudrang, edge tutqichlari bilan uzunligini o‘zgartiring. Inspector’da 1.2×–3× va focus X/Y bor. Preview’ga bosish fokusni o‘zgartiradi. Arrow tugmalari zoomni siljitadi, Delete o‘chiradi.

Video, webcam yoki fonni preview’dan tanlang; kontur va Selected yorlig‘i chiqadi. Inspector tepasidagi Video/Webcam/Canvas orqali ham tanlash mumkin. Tanlangan klip/zoom parametrlari inspector boshida ko‘rsatiladi.

## Webcam

Audio / Cam ichida **Circle, Squircle, Rounded, Wide** shakllari, o‘lcham, corner va **Smooth cursor avoidance** bor. Cursor yaqinlashganda webcam silliq chetga suriladi. Native telemetriyadagi harakat eksportga ham qo‘llanadi; preview ustidagi oddiy hover yozuv telemetriyasini o‘zgartirmaydi.

## Reels, Shorts va Stories

**Reels region:** New recording → manbani tanlang → Reels region → 9:16 hududni suring va Region size’ni sozlang → Start. Faqat shu hudud yoziladi.

**Reels follow:** manba to‘liq yoziladi, editor 9:16 ichida cursor atrofidagi ish qismini kuzatadi. Bu keng desktopni kichkina landscape tasma qilib qo‘yish o‘rniga matnni yirikroq saqlaydi.

**Tayyor landscape video:** 9:16 → Fill frame / crop → horizontal/vertical focus. Native telemetriya bo‘lsa Fill & follow cursor’ni tanlang. Fit complete video ham mavjud. Keng ekranning hamma qismini bir vaqtning o‘zida 9:16 ichida yirik ko‘rsatib bo‘lmaydi; region/crop usuli kerakli qismni tanlaydi.

Export’da **720×1280**, **1080×1920** yoki **2160×3840** tanlanadi. Safe-area chiziqlari faqat preview’da, eksportda yo‘q.

## Eksport va loyihalar

Export → MP4 yoki GIF → resolution → destination.

- MP4: H.264, 24/30/60 FPS; AAC audio va ixtiyoriy click taps. Studio/Social Media/Web/Web (Low) mos ravishda CRF 18/22/26/30. Advanced ichida CRF 14–35.
- GIF: 15/20/30 FPS, audio yo‘q, eng ko‘pi 60 soniya.
- Qolgan kliplar aynan timeline tartibida render bo‘ladi; kesilgan audio ham chiqariladi.
- Progress va Cancel bor. Qisman fayl faqat muvaffaqiyatli tugaganda yakuniy nomga o‘tadi.
- Eksport kompyuterga qarab real vaqtdan sekinroq ishlashi mumkin.
- Save yoki Ctrl+S `.recorder.json` saqlaydi. Project original media’ni nusxalamaydi; yozuv papkasini saqlang. 0.1 loyihalari yangi formatga moslashtirib ochiladi.

## Integratsion test va diagnostic

```powershell
npm run test:integration
```

Bu test qisqa ekran, oyna va portrait region yozuvi oladi. Sintetik audio/webcam, real cut-and-join eksport, Reels va Cancel tekshiriladi. Fayllar faqat loyiha ichidagi `.integration/`ga yoziladi. Ekran shu lokal test uchun tayyor bo‘lganda ishlating.

```powershell
$process = Start-Process -FilePath '.\release\win-unpacked\Recorder Studio.exe' -ArgumentList '--verify-install' -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput '.\release\diagnostics.log'
$process.ExitCode
Get-Content '.\release\diagnostics.log'
```

Exit code 0, `packaged: true`, `hook: true`, `ffmpeg: true`, `modelPixels: 4096`, version 0.5.1 kutiladi. Diagnostic ekran yozmaydi.

## Chegaralar

Windows screen/window/portrait capture va sintetik media/eksport sinovdan o‘tgan. Haqiqiy mikrofon/kamera/loopback qurilmalari, mixed-DPI, uzoq sessiyalar, protected/GPU oynalar va macOS uchun qo‘lda sinov kerak. GDI qora kadr bersa oddiy Screen manbasini sinang; yozilayotgan oynani minimizatsiya yoki resize qilmang. Bir xil nomli bir nechta oynalar bo‘lsa Screen rejimini tanlang.

`FFmpeg missing` yoki `Electron missing` bo‘lsa `npm run setup:win`. Native modullar uchun x64 Node ishlating, zarur bo‘lsa `npm rebuild koffi uiohook-napi`. Port 5173 band bo‘lsa oldingi dev serverni to‘xtating. FFmpeg GPLv3 tarqatish shartlari [THIRD_PARTY.md](THIRD_PARTY.md)da.

## 0.3: kompozitsiya va fon

New recording → Composition yoki editor → Frame → Composition:

- Screen only: ekran ko‘rinadi.
- Full screen camera: kamera butun sahnani egallaydi.
- Split screen: keng formatda yonma-yon, Reels’da yuqorida ekran, pastda kamera.
- Camera overlay: shakli va corner’i sozlanadigan kamera oynasi.
- Camera cutout: kamera fonini lokal model olib tashlaydi. Model/WASM build ichida, internet shart emas. Yorug‘lik va fon kontrasti natijaga ta’sir qiladi.

Kamera rejimlari yozilgan webcam track’ni talab qiladi. Full screen camera — kompozitsiya rejimi: alohida ekran va kamera track’lari saqlanadi, keyin boshqa layout’ga o‘tish mumkin.

Frame → Background → Color: rang tanlash. Image: PNG/JPEG/WebP fayl (20 MB gacha). Browse Unsplash rasmiy saytni ochadi; rasmdagi Copy image address orqali `https://images.unsplash.com/photo-...` manzilini joylashtiring va Use Unsplash image bosing. Yoki rasmni yuklab, Choose image from computer orqali tanlang. Rasm project ichiga saqlanadi va keyin offline ishlaydi. Bu API kalitsiz qo‘lda tanlash usuli; ichki Unsplash API qidiruvi yo‘q.

## Yozuv paytidagi shortcutlar

- **Ctrl+Shift+F9**: tugatish va editorga o‘tish.
- **Ctrl+Shift+M**: manba ichidagi cursor joyiga auto-zoom marker qo‘shish; HUD’dagi Marker ham shu vazifani bajaradi.
- **Ctrl+Shift+H**: recording bar’ni yashirish/ko‘rsatish.

Hotkey boshqa ilovada band bo‘lsa, HUD tugmalaridan foydalaning.

## Yangilangan eksport oynasi

720p/1080p/4K, FPS va Compression tanlang. 4K kichik source’dan yo‘qolgan detallarni tiklamaydi. File bo‘lsa saqlash oynasi chiqadi. Clipboard bo‘lsa haqiqiy video fayl reference’i Windows clipboard’iga qo‘yiladi, fayl Videos/Recorder Studio/Exports ichida qoladi. Fayl qabul qiladigan ilovaga Ctrl+V qiling; barcha ilova buni qo‘llamaydi. Taxminiy hajm kontentga qarab o‘zgaradi, qolgan vaqt render tezligidan hisoblanadi.

Shareable link uchun hosting/back-end ulanmagan; ilova videoni avtomatik serverga yuklamaydi.

Installer va portable build ichida lokal cutout modeli ham bor. Manbadan build qilganda `public/vision/` papkasini saqlang; MediaPipe versiyasini almashtirsangiz unga mos WASM fayllarini ham yangilang.

## 0.4: Start’dan oldingi preview

Webcam’ni yoqing va qurilmani tanlang: Composition preview’da kamera jonli ko‘rinadi. Overlay, Split screen, Full camera yoki Cutout’ni tanlab o‘zingiz qanday chiqishingizni tekshiring. Mikrofon yoqilganda gapirib level meter’ni tekshiring. Qurilma tayyor bo‘lmaguncha Start kutadi; xato bo‘lsa qurilmani o‘chiring yoki Refresh qiling. Kamera preview stream’i yozuvga clone qilinadi, shu USB kamera qayta ochilmaydi.

Ekran tasviri hozir manbaning snapshot’i; Refresh yangilaydi. Kamera esa jonli. Reels follow harakati yozilgan cursor telemetriyasi asosida editorda qo‘llanadi.

## 0.4: Stop’dan keyingi kutish va tiklash

Stop ekran yozuvini darhol to‘xtatadi va ilovani qaytaradi. Saving oynasida spinner, joriy bosqich, kutish vaqti va bosqich foizi ko‘rinadi. Kamera/audio chunk’lari yopiladi, ekran yakunlanadi, audio qo‘shiladi va kamera tayyorlanadi. Tayyorlash yozuv uzunligi va kompyuter tezligiga bog‘liq.

Kutilmaganda uzoq davom etsa **Keep raw files & stop processing** bilan ishlovni bekor qiling. **Open recording folder** orqali `raw.mp4`, `audio.webm`, `webcam.webm` va offset JSON fayllariga kiring. Bu tugma raw fayllarni o‘chirmaydi. FFmpeg, encoder va disk yozuvlari uchun vaqt chegaralari bor; xatoda UI cheksiz bloklanib qolmaydi.

## 0.4: editor qulayliklari

- **S**: snapping yoqish/o‘chirish; masshtabga mos 10 px masofada playhead/trim chegaralarga yopishadi.
- Trim paytida **Alt**: vaqtincha snapping’siz sudrash.
- **↑ / ↓**: oldingi/keyingi cut’ga o‘tish.
- Klipda **o‘ng tugma**: split, source in/out’ga o‘tish, delete va bo‘shliqni yopish.

Snapping OpenCut Classic algoritmidan MIT litsenziya asosida moslashtirilgan. Litsenziya build ichidagi THIRD_PARTY_OPENCUT_LICENSE faylida.


## 0.5 dagi ishlash tartibi

Ilova boshida faqat **New recording** va **Import project** bor. Oldingi loyihalar pastda rasmlari bilan grid bo‘lib turadi. Import project orqali `.rsproject`, loyiha JSON yoki videoni oching. Har yangi yozuv/import alohida loyiha yaratadi; sozlamalar bir soniyalik tanaffusdan keyin avtomatik saqlanadi. Projects tugmasi ham chiqishdan oldin joriy loyihani saqlaydi. Grid asl media fayliga bog‘lanadi; faylni boshqa kompyuterga ko‘chirish uchun **Export project** bilan `.rsproject` yarating.

New recording katta alohida sahifa. Kamerani yoqing, Composition tanlang va o‘ng paneldan Camera, Frame, background, o‘lcham/joylashuvni sozlang. Mikrofonda indikator va **Record 5-second mic test** bor: yozib, audio player orqali eshiting. Kamera jonli, ekran esa tanlangan manbaning snapshot’i; Refresh uni yangilaydi. Reels follow yozuvdan keyin haqiqiy kursor harakatini kuzatadi.

Split screen ekranni va kamerani bir xil balandlikdagi joylarga to‘ldiradi; keng ekranning chetlari crop bo‘ladi. Camera share, side va Frame focus bilan sozlang. Portrait split vertikal joylashadi. Overlay holatida kamera shakli/o‘lchami/joyi o‘zgartiriladi. Preview safe-area belgisi eksportga yozilmaydi.

Bo‘sh workspace’ga bosish yoki Escape element tanlovini bekor qiladi. Audio tabida faqat audio sozlamalari ko‘rinadi. Click sounds yoqilgan native yozuvda bosish ovozi va drag paytida sintetik chalkboard scrape qo‘shiladi; import qilingan oddiy videoda mouse telemetry mavjud bo‘lmaydi.

Stop’dan so‘ng audio va kamera parallel tayyorlanadi; loading oynasi jarayonni ko‘rsatadi. Eksportda ishlayotgan encoder va render FPS chiqadi. Tayyor eksport xabaridagi **Open Folder** faylni Explorer’da ko‘rsatadi. Tezlik kamera cutout’i, resolution va GPU’ga bog‘liq; 4K yoki cutout uchun 30 FPS tezroq bo‘lishi mumkin.


## 0.5.1: kesish va pauzadagi kadr tuzatishi

Pauzada playhead?ni sursangiz, tanlangan soniyadagi ekran va kamera kadri yangilanadi. Oddiy split?dan o?tganda bitta video/audio decoder davom etadi. Olib tashlangan yoki joyi almashtirilgan bo?lak orasidan o?tishda yangi kadr tayyor bo?lgach playback davom etadi. Tez-tez surishda oxirgi tanlov ustun keladi. Media fayllar endi to?g?ri byte-range javoblari orqali o?qiladi; avval seek nolga cheklanib qolishi mumkin edi.

Editor ichidagi **New recording** tugmasi olib tashlandi. Yangi yozuvni boshlash uchun Home ? New recording?dan foydalaning. Bu tuzatish uchun eski build?ni yoping va **0.5.1** installer/portable?ni oching; mavjud loyihani qayta yozib olish talab qilinmaydi.

Maxsus tekshiruv: `npm run test:playback`. Rangli video va sun?iy audio bilan kadrlar hamda kesishdan keyingi haqiqiy PCM audio tekshiriladi. Bu test ekranni yozmaydi; to?liq `test:integration` esa qisqa native ekran yozuvi ham qiladi.
