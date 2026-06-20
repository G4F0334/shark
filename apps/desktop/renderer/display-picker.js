const api = window.desktop?.displayMediaPicker;

const elScroll = document.getElementById('scroll');
const elErr = document.getElementById('err');
const btnCancel = document.getElementById('btn-cancel');
const btnShare = document.getElementById('btn-share');
const btnShareLabel = document.getElementById('btn-share-label');

/** @type {string | null} */
let selectedId = null;
let isCancelling = false;

const ICONS = {
  monitor:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  window:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="9"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
};

function setError(text) {
  if (!text) {
    elErr.hidden = true;
    elErr.textContent = '';
    return;
  }

  elErr.hidden = false;
  elErr.textContent = text;
}

function setShareLoading(loading) {
  btnShare.classList.toggle('is-loading', loading);
  btnShareLabel.textContent = loading ? 'Запуск…' : 'Начать демонстрацию';
}

function renderSections(list) {
  elScroll.textContent = '';
  const screens = list.filter((s) => s.isScreen);
  const wins = list.filter((s) => !s.isScreen);

  if (screens.length === 0 && wins.length === 0) {
    elScroll.innerHTML =
      '<div class="empty">Нет доступных источников для демонстрации.</div>';
    return;
  }

  if (screens.length > 0) {
    elScroll.appendChild(section('Мониторы', ICONS.monitor, screens));
  }

  if (wins.length > 0) {
    elScroll.appendChild(section('Окна', ICONS.window, wins));
  }
}

/**
 * @param {string} title
 * @param {string} icon
 * @param {{ id: string; name: string; thumb: string; isScreen: boolean }[]} items
 */
function section(title, icon, items) {
  const wrap = document.createElement('section');
  wrap.className = 'section';

  const h = document.createElement('h2');
  h.className = 'section-title';
  h.innerHTML = `${icon}<span>${title}</span>`;

  const grid = document.createElement('div');
  grid.className = 'grid';

  for (const s of items) {
    grid.appendChild(card(s));
  }

  wrap.appendChild(h);
  wrap.appendChild(grid);
  return wrap;
}

/** @param {{ id: string; name: string; thumb: string }} s */
function card(s) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card';
  b.dataset.id = s.id;
  b.setAttribute('aria-pressed', s.id === selectedId ? 'true' : 'false');

  if (s.id === selectedId) {
    b.classList.add('selected');
  }

  const thumb = document.createElement('div');
  thumb.className = 'card-thumb';

  const img = document.createElement('img');
  img.src = s.thumb;
  img.alt = '';
  img.loading = 'lazy';
  thumb.appendChild(img);

  const check = document.createElement('div');
  check.className = 'card-check';
  check.innerHTML = ICONS.check;
  thumb.appendChild(check);

  const cap = document.createElement('div');
  cap.className = 'card-cap';
  cap.textContent = s.name || s.id;
  cap.title = s.name || s.id;

  b.appendChild(thumb);
  b.appendChild(cap);

  b.addEventListener('click', () => {
    selectedId = s.id;
    elScroll.querySelectorAll('.card').forEach((c) => {
      const isSelected = c.dataset.id === selectedId;
      c.classList.toggle('selected', isSelected);
      c.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
    btnShare.disabled = false;
  });

  b.addEventListener('dblclick', async () => {
    selectedId = s.id;
    await doSubmit();
  });

  return b;
}

async function load() {
  if (!api?.listSources) {
    elScroll.querySelector('#loading')?.remove();
    setError('Окружение Electron (preload) недоступно.');
    return;
  }

  try {
    const list = await api.listSources();
    elScroll.querySelector('#loading')?.remove();
    renderSections(list);
  } catch (e) {
    elScroll.querySelector('#loading')?.remove();
    setError(e instanceof Error ? e.message : String(e));
  }
}

async function doSubmit() {
  if (!selectedId || !api?.submit) return;

  setError('');
  btnShare.disabled = true;
  btnCancel.disabled = true;
  setShareLoading(true);

  try {
    const res = await api.submit({ sourceId: selectedId });

    if (!res?.ok) {
      setError(res?.error || 'Не удалось начать демонстрацию');
      btnShare.disabled = false;
      btnCancel.disabled = false;
      setShareLoading(false);
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    btnShare.disabled = false;
    btnCancel.disabled = false;
    setShareLoading(false);
  }
}

async function cancelPicker() {
  if (isCancelling) return;

  isCancelling = true;
  btnCancel.disabled = true;
  btnShare.disabled = true;
  setError('');

  try {
    await api?.cancel?.();
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    isCancelling = false;
    btnCancel.disabled = false;
    btnShare.disabled = !selectedId;
  }
}

btnCancel.addEventListener('click', () => {
  void cancelPicker();
});

btnShare.addEventListener('click', () => {
  void doSubmit();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    void cancelPicker();
    return;
  }

  if (event.key === 'Enter' && selectedId && !btnShare.disabled) {
    void doSubmit();
  }
});

void load();
