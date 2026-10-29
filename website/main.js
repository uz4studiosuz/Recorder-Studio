(() => {
  const site = window.SITE ?? { links: {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ---- Config-driven links and text ----
  for (const a of document.querySelectorAll('[data-link]')) {
    const url = site.links?.[a.dataset.link];
    if (url) a.href = url;
    if (['installer', 'portable', 'checksums'].includes(a.dataset.link) && url) a.setAttribute('download', '');
  }
  const set = (key, value) => document.querySelectorAll(`[data-text="${key}"]`).forEach(n => { n.textContent = value; });
  if (site.version) { set('version', `v${site.version.replace(/\.0$/, '')}`); set('version-number', site.version); }
  if (site.repo) set('repo', site.repo);
  document.querySelectorAll('[data-year]').forEach(n => { n.textContent = new Date().getFullYear(); });

  // ---- Media slots: drop a file at data-src, or see a labelled placeholder ----
  const placeholder = slot => {
    slot.classList.add('is-empty'); slot.replaceChildren();
    const box = document.createElement('div'); box.className = 'slot-empty';
    const isVideo = /\.(mp4|webm|mov)$/i.test(slot.dataset.src);
    box.innerHTML = `<span class="slot-icon">${isVideo ? '▶' : '▧'}</span><strong></strong><code></code>`;
    box.querySelector('strong').textContent = slot.dataset.label || (isVideo ? 'Video' : 'Screenshot');
    box.querySelector('code').textContent = `website/${slot.dataset.src}`;
    slot.append(box);
  };
  const videos = [];
  for (const slot of document.querySelectorAll('.slot')) {
    const src = slot.dataset.src; if (!src) { placeholder(slot); continue; }
    if (/\.(mp4|webm|mov)$/i.test(src)) {
      const video = document.createElement('video');
      Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'metadata' });
      video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
      if (slot.dataset.poster) video.poster = slot.dataset.poster;
      video.addEventListener('error', () => placeholder(slot), { once: true });
      video.src = src; slot.append(video); videos.push(video);
    } else {
      const img = new Image(); img.alt = slot.dataset.label || ''; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => placeholder(slot), { once: true });
      img.src = src; slot.append(img);
    }
  }
  // Videos play only while visible.
  const playing = new IntersectionObserver(entries => {
    for (const e of entries) { const v = e.target; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }
  }, { threshold: 0.25 });
  videos.forEach(v => playing.observe(v));

  // ---- Reveal on scroll ----
  const reveal = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); reveal.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(n => reveal.observe(n));

  // ---- Count-up stats ----
  const count = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue; count.unobserve(e.target);
      const n = e.target, to = Number(n.dataset.count), pre = n.dataset.prefix ?? '', suf = n.dataset.suffix ?? '', start = performance.now();
      const step = now => { const t = clamp((now - start) / 1200), v = Math.round(to * (1 - Math.pow(1 - t, 3))); n.textContent = pre + v + suf; if (t < 1) requestAnimationFrame(step); };
      reduced ? n.textContent = pre + to + suf : requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach(n => count.observe(n));

  // ---- Tabs with auto-advance ----
  for (const tabs of document.querySelectorAll('[data-tabs]')) {
    const buttons = [...tabs.querySelectorAll('[role=tab]')], panels = [...tabs.querySelectorAll('[role=tabpanel]')], indicator = tabs.querySelector('.tab-indicator');
    let index = 0, timer;
    const show = i => {
      index = i;
      buttons.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      panels.forEach((p, k) => p.classList.toggle('is-active', k === i));
      const b = buttons[i]; indicator.style.width = `${b.offsetWidth}px`; indicator.style.transform = `translateX(${b.offsetLeft - 4}px)`;
      panels[i].querySelector('video')?.play().catch(() => {});
    };
    const schedule = () => { clearInterval(timer); if (!reduced) timer = setInterval(() => show((index + 1) % buttons.length), Number(tabs.dataset.autoplay) || 6000); };
    buttons.forEach((b, i) => b.addEventListener('click', () => { show(i); schedule(); }));
    addEventListener('resize', () => show(index));
    requestAnimationFrame(() => show(0)); schedule();
  }

  // ---- Copy build commands ----
  document.querySelector('[data-copy]')?.addEventListener('click', async event => {
    const text = [...document.querySelectorAll('.terminal code')].map(n => n.innerText).join('\n').split('\n').filter(l => l.startsWith('>')).map(l => l.slice(2)).join('\n');
    try { await navigator.clipboard.writeText(text); event.currentTarget.textContent = 'Copied'; } catch { event.currentTarget.textContent = 'Select & copy'; }
    setTimeout(() => { event.target.textContent = 'Copy'; }, 1600);
  });

  // ---- Scroll-driven scenes ----
  const progressBar = document.querySelector('.progress-bar'), nav = document.querySelector('.nav');
  const hero = document.querySelector('[data-hero]');
  const zoom = document.querySelector('[data-zoom-scroll]'), zoomInner = zoom?.querySelector('.zoom-inner'), zoomCursor = zoom?.querySelector('.zoom-cursor'), zoomValue = zoom?.querySelector('.zoom-value');
  const steps = document.querySelector('[data-steps]'), stepItems = steps ? [...steps.querySelectorAll('.steps li')] : [], stepMedia = steps ? [...steps.querySelectorAll('.step-media')] : [], stepBar = steps?.querySelector('.steps-progress i');
  const ratios = document.querySelector('[data-ratios]'), ratioFrame = ratios?.querySelector('.ratio-frame'), ratioLabels = ratios ? [...ratios.querySelectorAll('.ratio-labels span')] : [];
  // Progress of a tall section through the viewport: 0 when its top reaches the top, 1 when its bottom reaches the bottom.
  const sceneProgress = el => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
  const ease = t => t * t * (3 - 2 * t);
  let activeStep = -1, ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    nav.classList.toggle('is-scrolled', scrollY > 12);
    if (reduced) return;
    if (hero) {
      const r = hero.getBoundingClientRect(), t = clamp(1 - (r.top - innerHeight * 0.15) / (innerHeight * 0.7));
      hero.style.setProperty('--tilt', `${(1 - ease(t)) * 24}deg`);
      hero.style.setProperty('--scale', String(0.88 + ease(t) * 0.12));
    }
    if (zoom) {
      const p = sceneProgress(zoom), up = ease(clamp(p / 0.45)), down = ease(clamp((p - 0.6) / 0.35)), amount = up * (1 - down), scale = 1 + amount * 1.6;
      // Pan towards a point right of centre, like an automatic zoom on a click.
      zoomInner.style.transform = `scale(${scale}) translate(${-amount * 14}%, ${-amount * 8}%)`;
      zoomCursor.style.transform = `translate(${48 + Math.sin(p * Math.PI) * 14}%, ${42 + amount * 8}%) scale(${1 + amount * 0.5})`;
      zoomValue.textContent = `${scale.toFixed(1)}×`;
    }
    if (steps && stepItems.length) {
      const p = sceneProgress(steps), i = Math.min(stepItems.length - 1, Math.floor(p * stepItems.length));
      stepBar.style.transform = `scaleY(${p})`;
      if (i !== activeStep) {
        activeStep = i;
        stepItems.forEach((li, k) => li.classList.toggle('is-active', k === i));
        stepMedia.forEach((m, k) => { m.classList.toggle('is-active', k === i); const v = m.querySelector('video'); if (v) k === i ? v.play().catch(() => {}) : v.pause(); });
      }
    }
    if (ratios && ratioFrame) {
      // 16:9 → 1:1 → 9:16 as you scroll.
      const p = sceneProgress(ratios), a = ease(clamp(p / 0.4)), b = ease(clamp((p - 0.5) / 0.4));
      const ratio = (16 / 9) * (1 - a) + 1 * a, final = ratio * (1 - b) + (9 / 16) * b;
      ratioFrame.style.setProperty('--ratio', String(final));
      const label = p < 0.33 ? 0 : p < 0.72 ? 1 : 2;
      ratioLabels.forEach((s, k) => s.classList.toggle('is-active', k === label));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); update();

  // Steps are clickable too.
  stepItems.forEach((li, k) => li.addEventListener('click', () => {
    const r = steps.getBoundingClientRect(), top = scrollY + r.top + (r.height - innerHeight) * ((k + 0.5) / stepItems.length);
    scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }));
})();
