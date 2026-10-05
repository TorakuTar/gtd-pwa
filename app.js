const LISTS = {
  inbox: '受信箱',
  next: '次にやる',
  waiting: '連絡待ち',
  someday: 'いつか',
  done: '完了',
};
const STATUS = { todo: '未着手', doing: '進行中' };
const DEFAULT_TAGS = ['自宅', '会社(オフィス)', '会社(現場)', 'PC', '外出先', '電話'];
// 分割済みのタグ。古いタグ名は、新しい名前すべてに置き換える（取り込み時も同様）
const SPLIT_TAGS = { '会社': ['会社(オフィス)', '会社(現場)'] };
const KEY = 'gtd-items-v1';
const TAG_KEY = 'gtd-tags-v1';

const expandTags = arr => [...new Set(arr.flatMap(t => SPLIT_TAGS[t] || [t]))];

let items = load(KEY, []).map(normalize);
let tags = expandTags(load(TAG_KEY, DEFAULT_TAGS));
for (const i of items) {
  if (i.tags.some(t => SPLIT_TAGS[t])) { i.tags = expandTags(i.tags); i.updatedAt = Date.now(); }
}
save();
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
      tags: expandTags(get(r, 'タグ').split(/[|｜、]/).map(s => s.trim()).filter(Boolean)),
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
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
}

function exportCSV() {
  const head = ['タスク', 'タグ', '緊急', '重要', '依頼先', 'リスト', '進捗'];
  downloadCSV([head, ...items.filter(i => !i.deleted).map(i => [
    i.text, i.tags.join('|'), i.urgent ? '○' : '', i.important ? '○' : '',
    i.delegateTo, LISTS[i.list], i.list === 'next' ? STATUS[i.status] : '',
  ])], `gtd-${new Date().toISOString().slice(0, 10)}.csv`);
}

$('file').onchange = async e => {
  const f = e.target.files[0];
  if (f) $('paste').value = await readFile(f);
  e.target.value = '';
};
$('doImport').onclick = () => importText($('paste').value);
$('doExport').onclick = exportCSV;
// ダウンロードできない環境向け：見出し行をコピーし、ExcelのA1セルへ貼り付ければ5列に分かれる
$('copyHead').onclick = async () => {
  const head = ['タスク', 'タグ', '緊急', '重要', '依頼先'].join('\t');
  try {
    await navigator.clipboard.writeText(head);
    alert('見出しをコピーしました。Excelの A1 セルに貼り付けてください。');
  } catch {
    $('paste').value = head;
    $('paste').select();
    alert('コピーできませんでした。下の入力欄に見出しを出したので、手動でコピーしてください。');
  }
};

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

// ---- クラウド同期（Firebase）----
// 設定値は公開前提の情報。データを守るのはログインと、Firestore側のセキュリティルール。
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAFtaFQl_O1IVHRjBPIvOdC4zYWUgfkNTo',
  authDomain: 'gtd-app-7ede9.firebaseapp.com',
  projectId: 'gtd-app-7ede9',
  storageBucket: 'gtd-app-7ede9.firebasestorage.app',
  messagingSenderId: '394864348244',
  appId: '1:394864348244:web:1be1ba294e5cacfdd8b1c1',
};
const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.14.1/';
const SYNC_KEY = 'gtd-last-sync';
let fb = null;

// 同じタスクは「更新が新しいほう」を採用する。削除も印（deleted）として同期される。
function mergeItems(local, remote) {
  const rm = new Map(remote.map(r => [r.id, r]));
  const lm = new Map(local.map(l => [l.id, l]));
  const merged = [], push = [];
  let pulled = 0;
  for (const l of local) {
    const r = rm.get(l.id);
    if (!r || l.updatedAt > r.updatedAt) { merged.push(l); push.push(l); }
    else if (r.updatedAt > l.updatedAt) { merged.push(normalize(r)); pulled++; }
    else merged.push(l);
  }
  for (const r of remote) {
    if (!lm.has(r.id)) { merged.push(normalize(r)); pulled++; }
  }
  return { merged, push, pulled };
}

// オフラインでもアプリが開けるよう、同期ボタンを押したときだけ読み込む
async function loadFirebase() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all([
    import(SDK_BASE + 'firebase-app.js'),
    import(SDK_BASE + 'firebase-auth.js'),
    import(SDK_BASE + 'firebase-firestore.js'),
  ]);
  const a = app.initializeApp(FIREBASE_CONFIG);
  fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), A: auth, F: fs };
  return fb;
}

function syncStatus(msg) { $('syncStatus').textContent = msg; }
function lastSyncText() {
  const t = Number(localStorage.getItem(SYNC_KEY));
  if (!t) return '未同期';
  const d = new Date(t);
  return `最終同期 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function syncNow() {
  if (!navigator.onLine) { syncStatus('オフラインです'); return; }
  const btn = $('syncBtn');
  btn.disabled = true;
  syncStatus('同期中…');
  try {
    const { auth, db, A, F } = await loadFirebase();
    await auth.authStateReady();
    if (!auth.currentUser) await A.signInWithPopup(auth, new A.GoogleAuthProvider());
    const uid = auth.currentUser.uid;

    const col = F.collection(db, 'users', uid, 'items');
    const remote = (await F.getDocs(col)).docs.map(d => d.data());
    const { merged, push, pulled } = mergeItems(items, remote);
    for (let k = 0; k < push.length; k += 400) {
      const batch = F.writeBatch(db);
      for (const it of push.slice(k, k + 400)) batch.set(F.doc(col, it.id), it);
      await batch.commit();
    }

    const tagRef = F.doc(db, 'users', uid, 'meta', 'tags');
    const snap = await F.getDoc(tagRef);
    const remoteTags = snap.exists() ? snap.data().list : [];
    const mergedTags = [...new Set([...tags, ...remoteTags])];
    if (mergedTags.length !== remoteTags.length) await F.setDoc(tagRef, { list: mergedTags });

    items = merged;
    tags = mergedTags;
    save(); render();
    localStorage.setItem(SYNC_KEY, String(Date.now()));
    syncStatus(`同期しました（送信${push.length}件・受信${pulled}件）`);
  } catch (e) {
    syncStatus(`同期に失敗しました：${e.code || e.message}`);
  } finally {
    btn.disabled = false;
  }
}

$('syncBtn').onclick = syncNow;
syncStatus(lastSyncText());

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
