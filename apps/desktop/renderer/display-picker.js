const api = window.desktop?.displayMediaPicker;

const elScroll = document.getElementById('scroll');
const elErr = document.getElementById('err');
const btnCancel = document.getElementById('btn-cancel');
const btnShare = document.getElementById('btn-share');

/** @type {string | null} */
let selectedId = null;

function setError(text) {
  if (!text) {
    elErr.hidden = true;
    elErr.textContent = '';
    return;
  }
  elErr.hidden = false;
  elErr.textContent = text;
}

function renderSections(list) {
  elScroll.textContent = '';
  const screens = list.filter((s) => s.isScreen);
  const wins = list.filter((s) => !s.isScreen);

  if (screens.length === 0 && wins.length === 0) {
    elScroll.innerHTML = '<div class="empty">Нет доступных источников.</div>';
    return;
  }

  if (screens.length > 0) {
    elScroll.appendChild(section('Мониторы', screens));
  }
  if (wins.length > 0) {
    elScroll.appendChild(section('Окна', wins));
  }
}

/**
 * @param {string} title
 * @param {{ id: string; name: string; thumb: string; isScreen: boolean }[]} items
 */
function section(title, items) {
  const wrap = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = title;
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
  if (s.id === selectedId) b.classList.add('selected');

  const img = document.createElement('img');
  img.src = s.thumb;
  img.alt = '';
  b.appendChild(img);

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = s.name || s.id;
  b.appendChild(cap);

  b.addEventListener('click', () => {
    selectedId = s.id;
    elScroll.querySelectorAll('.card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.id === selectedId);
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
    setError('Окружение Electron (preload) недоступно.');
    elScroll.querySelector('#loading')?.remove();
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
  try {
    const res = await api.submit({ sourceId: selectedId });
    if (!res?.ok) {
      setError(res?.error || 'Не удалось начать демонстрацию');
      btnShare.disabled = false;
      btnCancel.disabled = false;
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    btnShare.disabled = false;
    btnCancel.disabled = false;
  }
}

btnCancel.addEventListener('click', () => {
  api?.cancel?.();
});

btnShare.addEventListener('click', () => {
  void doSubmit();
});

void load();
