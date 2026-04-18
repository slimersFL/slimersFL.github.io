/* ==================================================
   SLIMERS — app.js
   Drawer, reduce-motion, player, shows fetcher,
   gallery lightbox, forms (with honeypot), booking CTA.
   ================================================== */
(function () {
  'use strict';

  // =====================================================
  // CONFIG — band replaces these before deploying
  // =====================================================
  const CONFIG = {
    // Formspree endpoints (get at https://formspree.io/)
    FORMSPREE_NEWSLETTER: 'https://formspree.io/f/REPLACE_WITH_NEWSLETTER_ID',
    FORMSPREE_CONTACT:    'https://formspree.io/f/REPLACE_WITH_CONTACT_ID',

    // Google Sheet published as CSV:
    //   File → Share → Publish to web → select sheet → CSV → publish
    // Paste the resulting CSV URL here.
    // Required columns (case-sensitive): date, venue, city, ticket_url, notes
    //   date must be in YYYY-MM-DD
    SHOWS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdVgfHtCQcuzgaLXXKBUYTFKT3y_zcDob6qAi84X-F94bKBjFBoy2vfz8i6LcKdp0Vco3pBLfwfD6w/pub?gid=0&single=true&output=csv',
  };

  // =====================================================
  // ALBUM DATA (real tracklist from Bandcamp)
  // =====================================================
  // Filenames assume audio files live in /audio/ with the naming convention below.
  // The band drops in their MP3s using these exact filenames and the player works.
  const ALBUM_TRACKS = [
    { n:  1, title: "I'm a Slimer (Part 1)", duration: 91,  file: 'audio/01-im-a-slimer-part-1.mp3' },
    { n:  2, title: "down low TOO S L O W", duration: 98,  file: 'audio/02-down-low-too-slow.mp3' },
    { n:  3, title: "Puppy Love",           duration: 96,  file: 'audio/03-puppy-love.mp3' },
    { n:  4, title: "Dumb Enough",          duration: 138, file: 'audio/04-dumb-enough.mp3' },
    { n:  5, title: "No Frillz",            duration: 110, file: 'audio/05-no-frillz.mp3' },
    { n:  6, title: "Crime2Slime",          duration: 137, file: 'audio/06-crime2slime.mp3' },
    { n:  7, title: "Lemmy is God",         duration: 106, file: 'audio/07-lemmy-is-god.mp3' },
    { n:  8, title: "Banana Bread",         duration: 59,  file: 'audio/08-banana-bread.mp3' },
    { n:  9, title: "Right On Slime",       duration: 107, file: 'audio/09-right-on-slime.mp3' },
    { n: 10, title: "I'm a Slimer (Part 2)",duration: 167, file: 'audio/10-im-a-slimer-part-2.mp3' },
    { n: 11, title: "Dutchman's Key",       duration: 85,  file: 'audio/11-dutchmans-key.mp3' },
    { n: 12, title: "Partyin With Slimer",  duration: 152, file: 'audio/12-partyin-with-slimer.mp3' },
  ];

  // =====================================================
  // GALLERY DATA (placeholder — band replaces with real photos)
  // =====================================================
  const GALLERY_ITEMS = [
    { caption: 'J-Slime · drums', src: '', sticker: 'LIVE!' },
    { caption: 'T-Slime · bass',  src: '', sticker: '' },
    { caption: 'Backyard show',   src: '', sticker: 'SLIMED' },
    { caption: 'Pit full of slime', src: '', sticker: '' },
    { caption: 'Merch table',     src: '', sticker: 'MERCH' },
    { caption: 'Sound check',     src: '', sticker: '' },
    { caption: 'Recording day',   src: '', sticker: 'STUDIO' },
    { caption: 'Post-show pizza', src: '', sticker: '' },
    { caption: 'Tour van',        src: '', sticker: 'ROAD' },
  ];

  // =====================================================
  // RECOGNITION (placeholder — band replaces with real)
  // =====================================================
  const CLIPPINGS = [
    {
      source: 'BANDCAMP · TAGS',
      headline: 'Slimepunk. Egg Punk. Florida.',
      quote: 'Slimey egg punk duo formed in the gargling bogs of the Everglades. 2 dudes, 1 mission, 0 brains.',
      attribution: '— SLIMERS, on themselves'
    },
    {
      source: 'LOCAL ZINE',
      headline: 'Two-Piece Chaos Engine',
      quote: 'A short, sharp riot of ramonescore riffage with toy piano and saxophone crashes that shouldn\'t work but absolutely do.',
      attribution: '— Show review, TBD'
    },
    {
      source: 'BANDCAMP DAILY',
      headline: 'Album Out Now: "SLIMERS"',
      quote: '12 tracks. 22 minutes. Released Dec 12, 2025. Cameos by Oscar, Lou Boy, and @johnrobertbridgesiii.',
      attribution: '— Slimers Bandcamp'
    },
    {
      source: 'SOUTH FLORIDA DIY',
      headline: 'Everglades Royalty',
      quote: 'If you see something, say something. If you smell something, it\'s probably them.',
      attribution: '— House show flyer'
    },
    {
      source: 'RADIO AIRPLAY',
      headline: 'Spun on College Radio',
      quote: 'Added to rotation on independent stations across Florida. [TODO: band adds specific call-letters]',
      attribution: '— placeholder'
    },
    {
      source: 'FESTIVAL BILL',
      headline: 'Played With The Greats',
      quote: '[TODO: band adds notable shared bills — e.g. opened for X, played Y Fest, toured with Z].',
      attribution: '— placeholder'
    },
  ];

  // =====================================================
  // FALLBACK SHOWS (used if CSV url is not configured / fails)
  // =====================================================
  const FALLBACK_SHOWS = [
    { date: '', venue: 'No upcoming shows right now', city: 'Check back soon or sign up for Goo News', ticket_url: '', notes: 'Booking inquiries welcome.' },
  ];

  // =====================================================
  // UTILITIES
  // =====================================================
  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  }

  // Simple CSV parser (handles quoted fields, commas inside quotes, escaped quotes)
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { inQuote = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuote = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else { field += c; }
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length && r.some(v => v !== ''));
  }

  function csvToObjects(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const header = rows[0].map(h => h.trim().toLowerCase());
    return rows.slice(1).map(r => {
      const o = {};
      header.forEach((k, i) => { o[k] = (r[i] || '').trim(); });
      return o;
    });
  }

  // =====================================================
  // DRAWER
  // =====================================================
  const drawer = $('#drawer');
  const drawerToggle = $('#drawerToggle');
  const drawerClose = $('#drawerClose');
  const drawerScrim = $('#drawerScrim');
  let lastFocusBeforeDrawer = null;

  function openDrawer() {
    lastFocusBeforeDrawer = document.activeElement;
    drawer.setAttribute('aria-hidden', 'false');
    drawerScrim.classList.add('visible');
    drawerToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    // focus first link
    const firstLink = $('.drawer-link', drawer);
    if (firstLink) firstLink.focus();
  }
  function closeDrawer() {
    drawer.setAttribute('aria-hidden', 'true');
    drawerScrim.classList.remove('visible');
    drawerToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocusBeforeDrawer) lastFocusBeforeDrawer.focus();
  }

  drawerToggle.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerScrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.getAttribute('aria-hidden') === 'false') closeDrawer();
  });

  // Smooth scroll + close drawer for nav links
  $$('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;

      // handle booking prefill
      const isBooking = link.hasAttribute('data-booking') || href.includes('booking=1');
      const targetId = href.replace(/^#/, '').split('?')[0];
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        closeDrawer();
        // slight delay so drawer-close doesn't fight the scroll
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (isBooking) prefillBooking();
        }, 50);
      }
    });
  });

  function prefillBooking() {
    const msg = $('#contactMessage');
    if (!msg) return;
    if (!msg.value || !msg.value.startsWith('[BOOKING INQUIRY')) {
      msg.value = '[BOOKING INQUIRY] — Venue: \nCity: \nDate: \nExpected attendance: \nPayment/guarantee: \n\nMore details: ';
    }
    setTimeout(() => msg.focus(), 500);
  }

  // =====================================================
  // REDUCE MOTION
  // =====================================================
  const reduceMotionToggle = $('#reduceMotionToggle');
  const STORAGE_KEY_REDUCE = 'slimers_reduce_motion';
  if (localStorage.getItem(STORAGE_KEY_REDUCE) === '1') {
    document.body.classList.add('reduce-motion');
    reduceMotionToggle.checked = true;
  }
  reduceMotionToggle.addEventListener('change', () => {
    if (reduceMotionToggle.checked) {
      document.body.classList.add('reduce-motion');
      localStorage.setItem(STORAGE_KEY_REDUCE, '1');
    } else {
      document.body.classList.remove('reduce-motion');
      localStorage.removeItem(STORAGE_KEY_REDUCE);
    }
  });

  // =====================================================
  // FLOATING GAME LAUNCHER
  // =====================================================
  $('#gameLauncher').addEventListener('click', () => {
    const target = $('#game');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        const canvas = $('#gameCanvas');
        if (canvas) canvas.focus();
      }, 700);
    }
  });

  // =====================================================
  // MUSIC PLAYER
  // =====================================================
  const audio = $('#audioEl');
  const tracklistEl = $('#tracklist');
  const playerTitle = $('#playerTitle');
  const playerPlay = $('#playerPlay');
  const playerPrev = $('#playerPrev');
  const playerNext = $('#playerNext');
  const playerTime = $('#playerTime');
  const playerProgress = $('#playerProgress');
  const playerProgressWrap = $('#playerProgressWrap');
  let currentIndex = -1;

  function renderTracklist() {
    tracklistEl.innerHTML = '';
    ALBUM_TRACKS.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'track-item';
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.setAttribute('data-index', i);
      li.innerHTML = `
        <span class="track-num">${String(t.n).padStart(2, '0')}</span>
        <span class="track-title">${t.title}</span>
        <span class="track-duration">${fmtTime(t.duration)}</span>
      `;
      li.addEventListener('click', () => playTrack(i));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTrack(i); }
      });
      tracklistEl.appendChild(li);
    });
  }

  function playTrack(i) {
    if (i < 0 || i >= ALBUM_TRACKS.length) return;
    const track = ALBUM_TRACKS[i];
    if (currentIndex !== i) {
      currentIndex = i;
      audio.src = track.file;
    }
    audio.play().catch(err => {
      // likely because MP3 file missing. show a friendly status.
      playerTitle.textContent = `⚠ "${track.title}" — audio file not found (${track.file})`;
      console.warn('Audio play failed:', err);
    });
    updatePlayingState();
    playerTitle.textContent = `${String(track.n).padStart(2, '0')}. ${track.title}`;
  }

  function togglePlay() {
    if (currentIndex === -1) { playTrack(0); return; }
    if (audio.paused) audio.play().catch(e => console.warn(e));
    else audio.pause();
  }

  function updatePlayingState() {
    $$('.track-item', tracklistEl).forEach((el, idx) => {
      el.classList.toggle('playing', idx === currentIndex);
    });
    playerPlay.textContent = audio.paused ? '▶' : '⏸';
    playerPlay.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }

  playerPlay.addEventListener('click', togglePlay);
  playerPrev.addEventListener('click', () => playTrack(Math.max(0, currentIndex - 1)));
  playerNext.addEventListener('click', () => playTrack(Math.min(ALBUM_TRACKS.length - 1, currentIndex + 1)));

  audio.addEventListener('play', updatePlayingState);
  audio.addEventListener('pause', updatePlayingState);
  audio.addEventListener('ended', () => {
    if (currentIndex < ALBUM_TRACKS.length - 1) playTrack(currentIndex + 1);
    else { currentIndex = -1; updatePlayingState(); playerTitle.textContent = '— album end · play again? —'; }
  });
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    playerProgress.style.width = pct + '%';
    playerTime.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;
  });
  audio.addEventListener('loadedmetadata', () => {
    playerTime.textContent = `0:00 / ${fmtTime(audio.duration)}`;
  });
  audio.addEventListener('error', () => {
    const track = ALBUM_TRACKS[currentIndex];
    if (track) {
      playerTitle.textContent = `⚠ "${track.title}" audio not found — drop MP3 at ${track.file}`;
    }
  });
  playerProgressWrap.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = playerProgressWrap.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  renderTracklist();

  // =====================================================
  // SHOWS (Google Sheet CSV)
  // =====================================================
  const showsList = $('#showsList');
  const WEEKDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  function formatShowDate(isoish) {
    if (!isoish) return { pretty: 'TBD', weekday: '' };
    const d = new Date(isoish);
    if (isNaN(d.getTime())) return { pretty: isoish, weekday: '' };
    const month = MONTHS[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    const wd = WEEKDAYS[d.getDay()];
    return { pretty: `${month} ${day}, ${year}`, weekday: wd, date: d };
  }

  function renderShows(shows) {
    showsList.innerHTML = '';
    if (!shows || shows.length === 0) {
      showsList.innerHTML = `<div class="shows-empty"><strong>NO UPCOMING SHOWS</strong>Check back soon or sign up for Goo News.</div>`;
      return;
    }
    shows.forEach(show => {
      const { pretty, weekday } = formatShowDate(show.date);
      const card = document.createElement('article');
      card.className = 'show-card';
      card.innerHTML = `
        <div class="show-date">${pretty}</div>
        ${weekday ? `<div class="show-weekday">${weekday}</div>` : ''}
        <div class="show-venue">${escapeHTML(show.venue || 'TBA')}</div>
        <div class="show-city">${escapeHTML(show.city || '')}</div>
        ${show.notes ? `<div class="show-notes">${escapeHTML(show.notes)}</div>` : ''}
        ${show.ticket_url ? `<a class="show-ticket" href="${escapeAttr(show.ticket_url)}" target="_blank" rel="noopener">GET TICKETS →</a>` : ''}
      `;
      showsList.appendChild(card);
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

  async function loadShows() {
    const url = CONFIG.SHOWS_CSV_URL;
    if (!url || url.startsWith('REPLACE_')) {
      // No sheet configured — render fallback
      renderShows(FALLBACK_SHOWS);
      return;
    }
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = csvToObjects(text);
      const now = Date.now();
      const upcoming = rows
        .filter(r => r.date && new Date(r.date).getTime() >= now - 86400000) // include today
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      renderShows(upcoming.length ? upcoming : FALLBACK_SHOWS);
    } catch (err) {
      console.warn('Shows fetch failed:', err);
      showsList.innerHTML = `<div class="shows-error">Couldn't load the gig list right now. <a href="mailto:slimersmusic@gmail.com">Email us</a> for the latest, or try again soon.</div>`;
    }
  }
  loadShows();

  // =====================================================
  // GALLERY (polaroid scatter + lightbox)
  // =====================================================
  const polaroidScatter = $('#polaroidScatter');
  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightboxImg');
  const lightboxCaption = $('#lightboxCaption');
  const lightboxClose = $('#lightboxClose');
  const lightboxPrev = $('#lightboxPrev');
  const lightboxNext = $('#lightboxNext');
  let lightboxIndex = -1;

  function renderPolaroids() {
    polaroidScatter.innerHTML = '';
    GALLERY_ITEMS.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'polaroid';
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', `Open photo: ${item.caption}`);
      div.style.setProperty('--rot', `${(Math.random() * 10 - 5).toFixed(2)}deg`);
      const imgStyle = item.src ? `background-image:url('${escapeAttr(item.src)}')` : '';
      div.innerHTML = `
        ${item.sticker ? `<span class="sticker">${escapeHTML(item.sticker)}</span>` : ''}
        <div class="polaroid-img" style="${imgStyle}">${item.src ? '' : '[ PHOTO TBD ]'}</div>
        <div class="polaroid-caption">${escapeHTML(item.caption)}</div>
      `;
      div.addEventListener('click', () => openLightbox(i));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(i); }
      });
      polaroidScatter.appendChild(div);
    });
  }

  function openLightbox(i) {
    if (i < 0 || i >= GALLERY_ITEMS.length) return;
    lightboxIndex = i;
    const item = GALLERY_ITEMS[i];
    lightboxImg.style.backgroundImage = item.src ? `url('${item.src}')` : 'none';
    lightboxImg.textContent = item.src ? '' : '[ PHOTO TBD — band adds real photos ]';
    lightboxCaption.textContent = item.caption || '';
    lightbox.setAttribute('aria-hidden', 'false');
    lightboxClose.focus();
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function lightboxNav(dir) {
    const next = (lightboxIndex + dir + GALLERY_ITEMS.length) % GALLERY_ITEMS.length;
    openLightbox(next);
  }
  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => lightboxNav(-1));
  lightboxNext.addEventListener('click', () => lightboxNav(1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (lightbox.getAttribute('aria-hidden') === 'false') {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxNav(-1);
      else if (e.key === 'ArrowRight') lightboxNav(1);
    }
  });

  // Swipe support on lightbox
  let touchStartX = 0;
  lightbox.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) lightboxNav(dx < 0 ? 1 : -1);
  }, { passive: true });

  renderPolaroids();

  // =====================================================
  // RECOGNITION (newspaper clippings)
  // =====================================================
  const clippingsEl = $('#clippings');
  function renderClippings() {
    clippingsEl.innerHTML = '';
    CLIPPINGS.forEach((c, i) => {
      const art = document.createElement('article');
      art.className = 'clipping';
      art.style.setProperty('--rot', `${(Math.random() * 5 - 2.5).toFixed(2)}deg`);
      art.innerHTML = `
        <div class="clipping-source">${escapeHTML(c.source)}</div>
        <h3 class="clipping-headline">${escapeHTML(c.headline)}</h3>
        <div class="clipping-quote">${escapeHTML(c.quote)}</div>
        <div class="clipping-attribution">${escapeHTML(c.attribution)}</div>
      `;
      clippingsEl.appendChild(art);
    });
  }
  renderClippings();

  // =====================================================
  // FORMS (Formspree + honeypot)
  // =====================================================
  function makeFormHandler(form, statusEl, endpoint, successMsg) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusEl.textContent = '';
      statusEl.className = 'form-status';

      // Honeypot
      const honey = form.querySelector('input[name="slime_trap"]');
      if (honey && honey.value) {
        // bot — silently "succeed"
        statusEl.textContent = successMsg;
        statusEl.classList.add('success');
        form.reset();
        return;
      }

      // Not configured? Short-circuit with a helpful dev message
      if (!endpoint || endpoint.startsWith('https://formspree.io/f/REPLACE_')) {
        statusEl.textContent = '⚠ Form endpoint not configured yet. Band: set Formspree URLs in app.js.';
        statusEl.classList.add('error');
        return;
      }

      const data = new FormData(form);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          statusEl.textContent = successMsg;
          statusEl.classList.add('success');
          form.reset();
        } else {
          const j = await res.json().catch(() => ({}));
          statusEl.textContent = j.error || 'Something went wrong. Try emailing us instead.';
          statusEl.classList.add('error');
        }
      } catch (err) {
        statusEl.textContent = 'Network error. Try again or email slimersmusic@gmail.com.';
        statusEl.classList.add('error');
      }
    });
  }
  makeFormHandler($('#gooNewsForm'), $('#gooNewsStatus'), CONFIG.FORMSPREE_NEWSLETTER, "YOU'VE BEEN SLIMED. WELCOME TO THE GOO NEWS.");
  makeFormHandler($('#contactForm'), $('#contactStatus'), CONFIG.FORMSPREE_CONTACT, 'TRANSMISSION RECEIVED. WE’LL BE IN TOUCH.');

  // =====================================================
  // TOUCH DEVICE DETECTION (show game mobile controls)
  // =====================================================
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch-device');

  // =====================================================
  // FOOTER YEAR
  // =====================================================
  const footerYear = $('#footerYear');
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // =====================================================
  // Handle URL hash with ?booking=1 on load
  // =====================================================
  window.addEventListener('load', () => {
    if (window.location.hash.includes('booking=1') || window.location.search.includes('booking=1')) {
      setTimeout(() => {
        const contact = $('#contact');
        if (contact) contact.scrollIntoView({ behavior: 'smooth' });
        prefillBooking();
      }, 400);
    }
  });

})();
