const LISTS = {
  inbox: '受信箱',
  next: '次にやる',
  waiting: '連絡待ち',
  someday: 'いつか',
  done: '完了',
};
const STATUS = { todo: '未着手', doing: '進行中' };
const DEFAULT_TAGS = ['自宅', '会社', 'PC', '外出先', '電話'];
const KEY = 'gtd-items-v1';
const TAG_KEY = 'gtd-tags-v1';

let items = load(KEY, []).map(normalize);
let tags = load(TAG_KEY, DEFAULT_TAGS);
let current = 'inbox';
let filterTag = null;
let openId = null;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(TAG_KEY, JSON.stringify(tags));
  } catch {}
}
function normalize(i) {
  return {
    tags: [], urgent: false, important: false, status: 'todo',
    createdAt: 0, updatedAt: 0, doneAt: 0, deleted: false,
    ...i,
  };
}

// 重要かつ緊急 > 重要のみ > 緊急のみ > どちらでもない
const rank = i => (i.important ? 2 : 0) + (i.urgent ? 1 : 0);
const RANK_LABEL = ['', '緊急', '重要', '緊急・重要'];

const $ = id => document.getElementById(id);
const tabs = $('tabs');
const filter = $('filter');
const list = $('list');
const form = $('form');
const input = $('input');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(label, fn, cls) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
function toggle(label, on, fn) {
  const b = btn(label, fn, 'chip');
  b.setAttribute('aria-pressed', on);
  return b;
}

function patch(id, fn) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  fn(it);
  it.updatedAt = Date.now();
  save(); render();
}

function render() {
  const live = items.filter(i => !i.deleted);

  tabs.innerHTML = '';
  for (const [id, label] of Object.entries(LISTS)) {
    const n = live.filter(i => i.list === id).length;
    const b = btn(`${label} ${n}`, () => { current = id; render(); });
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', id === current);
    tabs.appendChild(b);
  }

  filter.innerHTML = '';
  filter.appendChild(toggle('すべて', filterTag === null, () => { filterTag = null; render(); }));
  for (const t of tags) {
    filter.appendChild(toggle(t, filterTag === t, () => { filterTag = filterTag === t ? null : t; render(); }));
  }
  filter.appendChild(btn('＋タグ', addTag, 'chip add-tag'));

  let shown = live.filter(i => i.list === current && (!filterTag || i.tags.includes(filterTag)));
  if (current === 'inbox') shown.sort((a, b) => b.createdAt - a.createdAt);
  else if (current === 'done') shown.sort((a, b) => b.doneAt - a.doneAt);
  else shown.sort((a, b) => rank(b) - rank(a) || a.createdAt - b.createdAt);

  list.innerHTML = '';
  if (!shown.length) {
    list.appendChild(el('li', 'empty', filterTag ? `「${filterTag}」のタスクはありません。` : 'まだ何もありません。'));
  }
  for (const item of shown) list.appendChild(card(item));
}

function card(item) {
  const li = el('li');
  li.appendChild(el('div', 'text', item.text));

  const meta = el('div', 'meta');
  const r = rank(item);
  if (r) meta.appendChild(el('span', `badge r${r}`, RANK_LABEL[r]));
  if (item.list === 'next' && item.status === 'doing') meta.appendChild(el('span', 'badge doing', STATUS.doing));
  for (const t of item.tags) meta.appendChild(el('span', 'badge tag', t));
  if (meta.children.length) li.appendChild(meta);

  const row = el('div', 'row');
  if (item.list === 'done') {
    row.appendChild(btn('← 次にやる', () => patch(item.id, i => { i.list = 'next'; i.doneAt = 0; })));
  } else {
    for (const [id, label] of Object.entries(LISTS)) {
      if (id === 'inbox' || id === 'done' || id === item.list) continue;
      row.appendChild(btn(`→ ${label}`, () => patch(item.id, i => { i.list = id; })));
    }
    row.appendChild(btn('完了', () => patch(item.id, i => { i.list = 'done'; i.doneAt = Date.now(); })));
  }
  row.appendChild(btn(openId === item.id ? '閉じる' : '詳細', () => { openId = openId === item.id ? null : item.id; render(); }));
  li.appendChild(row);

  if (openId === item.id) li.appendChild(detail(item));
  return li;
}

function detail(item) {
  const d = el('div', 'detail');

  d.appendChild(el('div', 'label', '緊急度・重要度'));
  const pr = el('div', 'chips');
  pr.appendChild(toggle('緊急', item.urgent, () => patch(item.id, i => { i.urgent = !i.urgent; })));
  pr.appendChild(toggle('重要', item.important, () => patch(item.id, i => { i.important = !i.important; })));
  d.appendChild(pr);

  d.appendChild(el('div', 'label', '場所・状況'));
  const tg = el('div', 'chips');
  for (const t of tags) {
    tg.appendChild(toggle(t, item.tags.includes(t), () => patch(item.id, i => {
      i.tags = i.tags.includes(t) ? i.tags.filter(x => x !== t) : [...i.tags, t];
    })));
  }
  d.appendChild(tg);

  if (item.list === 'next') {
    d.appendChild(el('div', 'label', '進捗'));
    const st = el('div', 'chips');
    for (const [k, v] of Object.entries(STATUS)) {
      st.appendChild(toggle(v, item.status === k, () => patch(item.id, i => { i.status = k; })));
    }
    d.appendChild(st);
  }

  d.appendChild(btn('削除', () => {
    if (confirm('このタスクを削除します。よろしいですか？')) patch(item.id, i => { i.deleted = true; });
  }, 'danger'));
  return d;
}

function addTag() {
  const name = (prompt('新しい場所・状況の名前') || '').trim();
  if (!name || tags.includes(name)) return;
  tags.push(name);
  save(); render();
}

form.onsubmit = e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const now = Date.now();
  items.unshift(normalize({
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    text, list: 'inbox', createdAt: now, updatedAt: now,
  }));
  input.value = '';
  current = 'inbox';
  save(); render();
};

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
