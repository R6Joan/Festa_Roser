// main.js
document.addEventListener('DOMContentLoaded', async () => {
  // ======================
  // Scroll suave
  // ======================
// ======================
// Scroll suave (robusto)
// ======================
document.querySelectorAll('a[href*="#"]:not([href="#"])').forEach(link => {
  link.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    const id = href.split('#')[1];

    if (!id) return;

    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    // Mantiene el hash en la URL
    history.pushState(null, '', `#${id}`);
  });
});


  const socket = io();

  // ======================
  // Constantes / helpers
  // ======================
  const AFTER_LOGIN_KEY = 'afterLoginAction';

  async function isLoggedIn() {
    try {
      const res = await fetch('/me', { method: 'GET' });
      return res.ok; // 200 => logged, 401 => not
    } catch (err) {
      console.error('Error comprovant login:', err);
      return false;
    }
  }

  // 🔹 Comprobamos una vez al cargar si el usuario está logueado
  const initialLoggedIn = await isLoggedIn();
  console.log('[AUTH] initialLoggedIn =', initialLoggedIn);

  // ======================
  // Modal login
  // ======================
  const loginModal = document.getElementById('login-modal');
  const loginModalOverlay = document.getElementById('login-modal-overlay');
  const loginModalClose = document.getElementById('login-modal-close');
  const loginGoogleBtn = document.getElementById('login-google-btn');
  const loginFacebookBtn = document.getElementById('login-facebook-btn');

  function openLoginModal() {
    if (!loginModal) return;
    loginModal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeLoginModal() {
    if (!loginModal) return;
    loginModal.classList.remove('visible');
    document.body.style.overflow = '';
  }

  if (loginModalClose) loginModalClose.addEventListener('click', closeLoginModal);
  if (loginModalOverlay) loginModalOverlay.addEventListener('click', closeLoginModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loginModal?.classList.contains('visible')) {
      closeLoginModal();
    }
  });

  // ✅ Ir a OAuth (la intención la marcamos fuera: upload o vote)
  function goAuth(provider) {
    window.location.href = provider === 'google' ? '/auth/google' : '/auth/facebook';
  }

  if (loginGoogleBtn) loginGoogleBtn.addEventListener('click', () => goAuth('google'));
  if (loginFacebookBtn) loginFacebookBtn.addEventListener('click', () => goAuth('facebook'));

  // ======================
  // Estado inicial de votos
  // ======================
  let votesState = {};
  try {
    const response = await fetch('/votes');
    if (response.ok) {
      votesState = await response.json();
    } else {
      console.error('Error carregant vots inicials:', response.statusText);
    }
  } catch (err) {
    console.error('Error carregant vots inicials:', err);
  }

  // ======================
  // Votos en cards
  // ======================
  function renderCard(card, data) {
    const btn = card.querySelector('.vote-btn');
    const countSpan = card.querySelector('.vote-count');
    const heart = btn?.querySelector('.heart-icon');

    if (!btn || !countSpan) return;

    countSpan.textContent = data.votes ?? 0;

    if (data.voted) {
      btn.classList.add('voted');
      if (heart) heart.classList.add('voted');
    } else {
      btn.classList.remove('voted');
      if (heart) heart.classList.remove('voted');
    }
  }

  function attachVoteToCard(card) {
    const id = card.dataset.id;
    const btn = card.querySelector('.vote-btn');
    const countSpan = card.querySelector('.vote-count');
    const heart = btn?.querySelector('.heart-icon');

    if (!btn || !countSpan) return;

    const initialData = votesState[id] || { votes: 0, voted: false };
    renderCard(card, initialData);

    // evitar duplicar listeners
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;

      const logged = await isLoggedIn();
      if (!logged) {
        localStorage.setItem(AFTER_LOGIN_KEY, 'vote');
        openLoginModal();
        btn.disabled = false;
        return;
      }

      if (heart) {
        heart.style.transform = 'scale(1.3)';
        setTimeout(() => { heart.style.transform = ''; }, 300);
      }

      try {
        const res = await fetch('/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_id: id })
        });

        const updatedData = await res.json();

        if (!res.ok) {
          console.error('Error votant:', updatedData.error || res.statusText);
          return;
        }

        votesState[id] = updatedData;
        renderCard(card, updatedData);

        countSpan.classList.remove('voted', 'unvoted');
        void countSpan.offsetWidth;
        countSpan.classList.add(updatedData.voted ? 'voted' : 'unvoted');

        setTimeout(() => {
          countSpan.classList.remove('voted', 'unvoted');
        }, 400);

      } catch (err) {
        console.error('Error votant:', err);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ======================
  // Cargar galería desde /photos
  // ======================
  const feed = document.querySelector('.photo-feed');

  if (feed) {
    try {
      const photosRes = await fetch('/photos');
      if (photosRes.ok) {
        const photos = await photosRes.json();

        // limpiamos las cards del HTML (las 3 iniciales hardcodeadas)
        feed.innerHTML = '';

        photos.forEach(photo => {
          const card = document.createElement('div');
          card.className = 'photo-card';
          card.dataset.id = photo.id;

          card.innerHTML = `
            <img src="${photo.src}" alt="Foto">
            <button class="vote-btn" aria-label="Votar">
              <svg class="heart-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
                a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
                1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
            <span class="vote-count">0</span>
          `;

          feed.appendChild(card);
          attachVoteToCard(card);
        });

        // ✅ Forzar que en móvil el carrusel empiece en la primera foto
// ✅ Forzar que en móvil el carrusel empiece en la PRIMERA foto de verdad
        if (window.matchMedia('(max-width: 48rem)').matches) {
          setTimeout(() => {
            const firstCard = feed.querySelector('.photo-card');
            if (!firstCard) return;

            // Usamos offsetLeft para compensar márgenes/padding
            const offset = firstCard.offsetLeft;
            feed.scrollTo({ left: offset, behavior: 'auto' });
          }, 50);
        }

      } else {
        console.error('Error carregant fotos:', photosRes.statusText);
      }
    } catch (err) {
      console.error('Error carregant fotos:', err);
    }
  }

  // Por si quedara alguna .photo-card suelta en el HTML
  document.querySelectorAll('.photo-card').forEach(card => attachVoteToCard(card));

  // ======================
  // WebSocket: actualizar número de vots global
  // ======================
  socket.on('voteUpdated', ({ photo_id, data }) => {
    const card = document.querySelector(`.photo-card[data-id="${photo_id}"]`);
    if (!card) return;
    const countSpan = card.querySelector('.vote-count');
    if (countSpan) countSpan.textContent = data.votes;

    votesState[photo_id] = votesState[photo_id] || { votes: 0, voted: false };
    votesState[photo_id].votes = data.votes;
  });

  // ======================
  // WebSocket: quan pugen una foto nova
  // ======================
  socket.on('photoAdded', (photo) => {
    const feed = document.querySelector('.photo-feed');
    if (!feed) return;

    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.id = photo.id;

    card.innerHTML = `
      <img src="${photo.src}" alt="Foto">
      <button class="vote-btn" aria-label="Votar">
        <svg class="heart-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
          a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
          1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </button>
      <span class="vote-count">${photo.votes ?? 0}</span>
    `;

    feed.prepend(card);

    votesState[photo.id] = { votes: photo.votes ?? 0, voted: false };
    attachVoteToCard(card);
  });


  // ======================
  // Upload minimal + login check + after-login auto-open
  // ======================
  const uploadInput = document.getElementById('upload-input');
  const uploadTrigger = document.getElementById('upload-trigger');
  const uploadSubmit = document.querySelector('.upload-submit');

  console.log('[UPLOAD] init', { uploadInput: !!uploadInput, uploadTrigger: !!uploadTrigger });

  // Si venimos de login con intención "upload", intentamos abrir selector
  const pendingAction = localStorage.getItem(AFTER_LOGIN_KEY);
  console.log('[UPLOAD] pendingAction:', pendingAction);

  if (pendingAction === 'upload') {
    if (initialLoggedIn && uploadInput) {
      try {
        console.log('[UPLOAD] auto-opening file selector after login (puede fallar en móvil)');
        uploadInput.click();
      } catch (e) {
        console.warn('[UPLOAD] auto-open blocked:', e);
      }
    }
    localStorage.removeItem(AFTER_LOGIN_KEY);
  }

  if (uploadTrigger && uploadInput) {
    uploadTrigger.addEventListener('click', (event) => {
      console.log('[UPLOAD] click on trigger, initialLoggedIn =', initialLoggedIn);

      if (!initialLoggedIn) {
        // No estaba logeado cuando se cargó la página:
        // bloqueamos el comportamiento del label (abrir selector)
        event.preventDefault();
        event.stopPropagation();

        console.log('[UPLOAD] not logged, opening login modal and setting afterLoginAction=upload');
        localStorage.setItem(AFTER_LOGIN_KEY, 'upload');
        openLoginModal();
        return; // NO abrimos el selector
      }

      // Si sí estaba logeado al cargar, NO hacemos preventDefault:
      // el <label for="upload-input"> abrirá el selector de forma nativa
    });

    uploadInput.addEventListener('change', () => {
      console.log('[UPLOAD] input change, files length =', uploadInput.files?.length || 0);

      if (uploadInput.files && uploadInput.files.length > 0) {
        if (uploadSubmit) uploadSubmit.hidden = false;
        uploadTrigger.textContent = 'Canviar foto';
      } else {
        if (uploadSubmit) uploadSubmit.hidden = true;
        uploadTrigger.textContent = 'Pujar foto';
      }
    });
  } else {
    console.warn('[UPLOAD] uploadTrigger or uploadInput not found in DOM');
  }


  // =============================
  // PHOTO VIEWER (delegation + swipe)
  // =============================
  const viewer = document.getElementById("photo-viewer");
  const viewerImg = document.getElementById("photo-viewer-img");
  const closeBtn = document.querySelector(".photo-viewer-close");
  const overlay = document.querySelector(".photo-viewer-overlay");
  const prevBtn = document.querySelector(".photo-viewer-arrow.prev");
  const nextBtn = document.querySelector(".photo-viewer-arrow.next");

  let currentIndex = -1;

  function getImages() {
    return Array.from(document.querySelectorAll(".photo-card img"));
  }

  function openViewerByIndex(index) {
    const images = getImages();
    if (!viewer || !viewerImg) return;
    if (index < 0 || index >= images.length) return;
    currentIndex = index;
    viewerImg.src = images[currentIndex].src;
    viewer.classList.add("visible");
    document.body.style.overflow = "hidden";
  }

  function closeViewer() {
    if (!viewer || !viewerImg) return;
    viewer.classList.remove("visible");
    viewerImg.src = "";
    document.body.style.overflow = "";
    currentIndex = -1;
  }

  function showNext() {
    const images = getImages();
    if (images.length === 0) return;
    openViewerByIndex((currentIndex + 1) % images.length);
  }

  function showPrev() {
    const images = getImages();
    if (images.length === 0) return;
    openViewerByIndex((currentIndex - 1 + images.length) % images.length);
  }

  document.addEventListener("click", (e) => {
    const img = e.target.closest(".photo-card img");
    if (!img) return;

    const images = getImages();
    const idx = images.indexOf(img);
    if (idx !== -1) openViewerByIndex(idx);
  });

  if (closeBtn) closeBtn.addEventListener("click", closeViewer);
  if (overlay) overlay.addEventListener("click", closeViewer);
  if (prevBtn) prevBtn.addEventListener("click", (e) => { e.stopPropagation(); showPrev(); });
  if (nextBtn) nextBtn.addEventListener("click", (e) => { e.stopPropagation(); showNext(); });

  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  function isMobileViewport() {
    return window.matchMedia("(max-width: 48rem)").matches;
  }

  if (viewerImg) {
    viewerImg.addEventListener("touchstart", (e) => {
      if (!isMobileViewport()) return;
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isSwiping = true;
    });

    viewerImg.addEventListener("touchend", (e) => {
      if (!isMobileViewport() || !isSwiping) return;
      isSwiping = false;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const HORIZONTAL_THRESHOLD = 50;

      if (absX > HORIZONTAL_THRESHOLD && absX > absY) {
        if (deltaX < 0) showNext();
        else showPrev();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!viewer?.classList.contains("visible")) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight") showNext();
    if (e.key === "ArrowLeft") showPrev();
  });

  // ======================
// Igualar altura de TODAS las cards al máximo (global)
// ======================
function equalizeCardHeights() {
  const cards = document.querySelectorAll('.cards .card');
  if (!cards.length) return;

  // reset para medir natural
  cards.forEach(card => {
    card.style.height = 'auto';
  });

  // medir máximo
  let max = 0;
  cards.forEach(card => {
    const h = card.getBoundingClientRect().height;
    if (h > max) max = h;
  });

  // aplicar máximo a todas
  cards.forEach(card => {
    card.style.height = `${Math.ceil(max)}px`;
  });
}

// al cargar
equalizeCardHeights();

// en resize/orientación (debounce)
let eqT;
window.addEventListener('resize', () => {
  clearTimeout(eqT);
  eqT = setTimeout(equalizeCardHeights, 150);
});

// si se cargan imágenes después, recalcula
window.addEventListener('load', equalizeCardHeights);

});
