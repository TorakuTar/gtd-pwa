const LISTS = {
  inbox: '受信箱',
  next: '次にやる',
  waiting: '連絡待ち',
  someday: 'いつか',
};
const KEY = 'gtd-items-v1';

let items = load();
let current = 'inbox';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}

const tabs = document.getElementById('tabs');
const list = document.getElementById('list');
const form = document.getElementById('form');
const input = document.getElementById('input');

function render() {
  tabs.innerHTML = '';
  for (const [id, label] of Object.entries(LISTS)) {
    const n = items.filter(i => i.list === id).length;
    const b = document.createElement('button');
    b.textContent = `${label} ${n}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', id === current);
    b.onclick = () => { current = id; render(); };
    tabs.appendChild(b);
  }

  list.innerHTML = '';
  const shown = items.filter(i => i.list === current);
  if (!shown.length) {
    const p = document.createElement('li');
    p.className = 'empty';
    p.textContent = current === 'inbox' ? '受信箱は空です。' : 'まだ何もありません。';
    list.appendChild(p);
  }
  for (const item of shown) {
    const li = document.createElement('li');
    const t = document.createElement('div');
    t.className = 'text';
    t.textContent = item.text;
    const row = document.createElement('div');
    row.className = 'row';
    for (const [id, label] of Object.entries(LISTS)) {
      if (id === 'inbox' || id === item.list) continue;
      row.appendChild(btn(`→ ${label}`, () => move(item.id, id)));
    }
    row.appendChild(btn('完了', () => remove(item.id)));
    li.append(t, row);
    list.appendChild(li);
  }
}

function btn(label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  return b;
}

function move(id, to) {
  const it = items.find(i => i.id === id);
  if (it) it.list = to;
  save(); render();
}
function remove(id) {
  items = items.filter(i => i.id !== id);
  save(); render();
}

form.onsubmit = e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  items.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, list: 'inbox' });
  input.value = '';
  current = 'inbox';
  save(); render();
};

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
