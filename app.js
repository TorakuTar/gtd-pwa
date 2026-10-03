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
    delegateChecked: false, delegateTo: '',
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
  if (item.delegateTo) meta.appendChild(el('span', 'badge doing', `依頼先: ${item.delegateTo}`));
  for (const t of item.tags) meta.appendChild(el('span', 'badge tag', t));
  if (meta.children.length) li.appendChild(meta);

  const row = el('div', 'row');
  if (item.list === 'inbox' && !item.delegateChecked) {
    // 受信箱に入ったものは、まず「他の人に頼めないか」を答えるまで先へ進めない
    li.appendChild(el('div', 'ask', 'これは、他の人に頼めませんか？'));
    row.appendChild(btn('頼む（連絡待ちへ）', () => delegate(item.id), 'primary'));
    row.appendChild(btn('自分でやる', () => patch(item.id, i => { i.delegateChecked = true; })));
  } else if (item.list === 'done') {
    row.appendChild(btn('← 次にやる', () => patch(item.id, i => { i.list = 'next'; i.doneAt = 0; })));
  } else {
    for (const [id, label] of Object.entries(LISTS)) {
      if (id === 'inbox' || id === 'done' || id === item.list) continue;
      row.appendChild(btn(`→ ${label}`, id === 'waiting'
        ? () => delegate(item.id)
        : () => patch(item.id, i => { i.list = id; })));
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

function delegate(id) {
  const who = prompt('誰に頼みますか？（空欄でも可）');
  if (who === null) return;
  patch(id, i => { i.list = 'waiting'; i.delegateTo = who.trim(); i.delegateChecked = true; });
}

// ---- PCからの取り込み・書き出し ----
function parseTable(text) {
  text = text.replace(/^﻿/, '');
  const d = text.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (q) {
      if (c === '"') { if (text[k + 1] === '"') { cell += '"'; k++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[k + 1] === '\n') k++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

function importText(text) {
  const rows = parseTable(text);
  if (!rows.length) { alert('取り込める行がありません。'); return; }
  let cols = ['タスク', 'タグ', '緊急', '重要', '依頼先'];
  if (rows[0][0].trim() === 'タスク') cols = rows.shift().map(s => s.trim());
  const get = (r, name) => (r[cols.indexOf(name)] || '').trim();
  const yes = v => /^(1|○|〇|◯|はい|y|yes|true|高)$/i.test(v);
  const now = Date.now();

  const made = [];
  rows.forEach((r, n) => {
    const text = get(r, 'タスク');
    if (!text) return;
    const who = get(r, '依頼先');
    made.push(normalize({
      id: (now - n).toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      tags: get(r, 'タグ').split(/[|｜、]/).map(s => s.trim()).filter(Boolean),
      urgent: yes(get(r, '緊急')),
      important: yes(get(r, '重要')),
      list: who ? 'waiting' : 'inbox',
      delegateTo: who,
      delegateChecked: !!who,
      createdAt: now - n, updatedAt: now,
    }));
  });
  if (!made.length) { alert('タスク名のある行がありません。'); return; }

  const sample = made.slice(0, 3).map(m => `・${m.text}`).join('\n');
  if (!confirm(`${made.length}件を取り込みます。\n${sample}${made.length > 3 ? '\n…' : ''}`)) return;

  for (const m of made) for (const t of m.tags) if (!tags.includes(t)) tags.push(t);
  items.unshift(...made);
  current = 'inbox';
  save(); render();
  $('paste').value = '';
  $('tools').open = false;
}

async function readFile(f) {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('shift_jis').decode(buf); } // Excel既定のCSV
}

function downloadCSV(rows, name) {
  const esc = v => {
    v = String(v ?? '');
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCSV() {
  const head = ['タスク', 'タグ', '緊急', '重要', '依頼先', 'リスト', '進捗'];
  downloadCSV([head, ...items.filter(i => !i.deleted).map(i => [
    i.text, i.tags.join('|'), i.urgent ? '○' : '', i.important ? '○' : '',
    i.delegateTo, LISTS[i.list], i.list === 'next' ? STATUS[i.status] : '',
  ])], `gtd-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadTemplate() {
  downloadCSV([
    ['タスク', 'タグ', '緊急', '重要', '依頼先'],
    ['（例）見積書を作る', '会社|PC', '○', '○', ''],
    ['（例）歯医者を予約する', '電話', '', '○', ''],
    ['（例）資料を印刷する', '会社', '', '', '佐藤さん'],
  ], 'gtd-template.csv');
}

$('file').onchange = async e => {
  const f = e.target.files[0];
  if (f) $('paste').value = await readFile(f);
  e.target.value = '';
};
$('doImport').onclick = () => importText($('paste').value);
$('doExport').onclick = exportCSV;
$('doTemplate').onclick = downloadTemplate;

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
