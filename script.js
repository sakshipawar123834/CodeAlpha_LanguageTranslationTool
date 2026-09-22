/* =====================================================
   LinguaFlow — Translation Dashboard + Auth + Autocomplete
===================================================== */
'use strict';

/* =====================================================
   CONSTANTS
===================================================== */
const LANGUAGES = [
  {code:'en',name:'English'},   {code:'es',name:'Spanish'},   {code:'fr',name:'French'},
  {code:'de',name:'German'},    {code:'it',name:'Italian'},   {code:'pt',name:'Portuguese'},
  {code:'ru',name:'Russian'},   {code:'nl',name:'Dutch'},     {code:'pl',name:'Polish'},
  {code:'tr',name:'Turkish'},   {code:'ar',name:'Arabic'},    {code:'hi',name:'Hindi'},
  {code:'bn',name:'Bengali'},   {code:'ta',name:'Tamil'},     {code:'te',name:'Telugu'},
  {code:'mr',name:'Marathi'},   {code:'ur',name:'Urdu'},      {code:'zh',name:'Chinese'},
  {code:'ja',name:'Japanese'},  {code:'ko',name:'Korean'}
];

const MAX_BYTES      = 500;
const API_BASE       = 'https://api.mymemory.translated.net/get';
const SUGGEST_API    = 'https://api.datamuse.com/sug';
const MAX_HISTORY    = 100;
const DEBOUNCE_MS    = 220;

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23eef2ff'/><circle cx='50' cy='38' r='16' fill='%234f46e5'/><path d='M20 88c0-16 13-27 30-27s30 11 30 27z' fill='%234f46e5'/></svg>";

/* Fallback dictionary if Datamuse fails */
const FALLBACK_WORDS = [
  'hello','world','welcome','good','morning','evening','night','friend','family',
  'travel','translate','language','English','Spanish','French','German','Italian',
  'book','ticket','hotel','restaurant','station','airport','please','thanks',
  'sorry','question','answer','happy','sad','weather','help','beautiful','important',
  'country','city','street','water','food','coffee','tea','music','story','time'
];

const DEFAULTS = {
  theme:'light',
  source:'auto',
  target:'es',
  saveHistory:true,
  autoSpeak:false,
  autoSuggest:true
};

const VIEW_META = {
  translate:{title:'Translate', sub:'Translate text between 20+ languages instantly'},
  history:{title:'History',   sub:'Review, reuse and manage your past translations'},
  settings:{title:'Settings', sub:'Configure your translation workspace'}
};

/* =====================================================
   STORAGE
===================================================== */
const store = {
  getHistory(){
    try{ return JSON.parse(localStorage.getItem('lf_history') || '[]'); }
    catch{ return []; }
  },
  setHistory(v){ localStorage.setItem('lf_history', JSON.stringify(v)); },

  getSettings(){
    try{ return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('lf_settings') || '{}') }; }
    catch{ return { ...DEFAULTS }; }
  },
  setSettings(v){ localStorage.setItem('lf_settings', JSON.stringify(v)); },

  getProfile(){
    try{ return JSON.parse(localStorage.getItem('lf_profile') || 'null'); }
    catch{ return null; }
  },
  setProfile(v){ localStorage.setItem('lf_profile', JSON.stringify(v)); },
  clearProfile(){ localStorage.removeItem('lf_profile'); },

  clear(){
    localStorage.removeItem('lf_history');
    localStorage.removeItem('lf_settings');
  }
};

/* =====================================================
   STATE
===================================================== */
let settings = store.getSettings();
let history  = store.getHistory();
let profile  = store.getProfile();
let pendingAvatar = null;   // base64 for login preview

/* =====================================================
   DOM
===================================================== */
const $ = id => document.getElementById(id);
const els = {
  // Login
  loginScreen:  $('loginScreen'),
  loginForm:    $('loginForm'),
  avatarInput:  $('avatarInput'),
  avatarPreview:$('avatarPreview'),
  loginName:    $('loginName'),
  loginEmail:   $('loginEmail'),
  loginPass:    $('loginPassword'),
  rememberMe:   $('rememberMe'),

  // App
  app:          $('app'),
  sourceLang:   $('sourceLang'),
  targetLang:   $('targetLang'),
  input:        $('inputText'),
  output:       $('output'),
  translateBtn: $('translateBtn'),
  swapBtn:      $('swapBtn'),
  clearBtn:     $('clearBtn'),
  pasteBtn:     $('pasteBtn'),
  copyBtn:      $('copyBtn'),
  speakBtn:     $('speakBtn'),
  saveBtn:      $('saveBtn'),
  charCounter:  $('charCounter'),
  statusText:   $('statusText'),
  detectedBadge:$('detectedBadge'),
  targetBadge:  $('targetBadge'),
  histList:     $('histList'),
  histSearch:   $('histSearch'),
  navHistCount: $('navHistCount'),
  toasts:       $('toasts'),
  pageTitle:    $('pageTitle'),
  pageSub:      $('pageSub'),
  themeBtn:     $('themeBtn'),
  themeSeg:     $('themeSeg'),
  setSource:    $('setSource'),
  setTarget:    $('setTarget'),
  setSaveHist:  $('setSaveHist'),
  setAutoSpeak: $('setAutoSpeak'),
  setAutoSuggest:$('setAutoSuggest'),

  // Profile
  profileMenu:  $('profileMenu'),
  profileBtn:   $('profileBtn'),
  profileDrop:  $('profileDropdown'),
  topAvatar:    $('topAvatar'),
  topName:      $('topName'),
  pdAvatar:     $('pdAvatar'),
  pdName:       $('pdName'),
  pdEmail:      $('pdEmail'),
  pdUpload:     $('pdUpload'),
  pdSettings:   $('pdSettings'),
  pdSignout:    $('pdSignout'),
  avatarChanger:$('avatarChanger'),

  // Autocomplete
  suggestBox:   $('suggestBox'),
  suggestList:  $('suggestList'),
  phraseChips:  $('phraseChips')
};

/* =====================================================
   TOASTS
===================================================== */
function toast(message, type = 'info'){
  const ICONS = { info:'ℹ️', success:'✅', warn:'⚠️', error:'⛔' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = document.createElement('span'); icon.textContent = ICONS[type] || 'ℹ️';
  const msg  = document.createElement('span'); msg.textContent = message;
  el.append(icon, msg);
  els.toasts.appendChild(el);
  setTimeout(()=>{
    el.classList.add('hide');
    setTimeout(()=>el.remove(), 220);
  }, 3200);
}

/* =====================================================
   UTILITIES
===================================================== */
const byteLen  = str => new TextEncoder().encode(str).length;
const langName = code => (LANGUAGES.find(l => l.code === code) || {}).name || code;
const debounce = (fn, ms) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
};
const initials = name => name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();

function fillSelect(el, includeAuto){
  el.innerHTML = '';
  if(includeAuto){
    const o = document.createElement('option');
    o.value = 'auto'; o.textContent = 'Auto-detect';
    el.appendChild(o);
  }
  LANGUAGES.forEach(l=>{
    const o = document.createElement('option');
    o.value = l.code; o.textContent = l.name;
    el.appendChild(o);
  });
}

function timeAgo(ts){
  const s = Math.floor((Date.now()-ts)/1000);
  if(s < 60)     return 'just now';
  if(s < 3600)   return `${Math.floor(s/60)}m ago`;
  if(s < 86400)  return `${Math.floor(s/3600)}h ago`;
  if(s < 604800) return `${Math.floor(s/86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

/* =====================================================
   LOGIN
===================================================== */
function initLogin(){
  // If already logged in, skip login
  if(profile && profile.email){
    showApp();
  } else {
    els.loginScreen.classList.remove('hide');
    els.app.hidden = true;
  }

  // Avatar preview on file select
  els.avatarInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      pendingAvatar = ev.target.result;
      els.avatarPreview.src = pendingAvatar;
    };
    reader.readAsDataURL(file);
  });

  // Submit login
  els.loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const name  = els.loginName.value.trim();
    const email = els.loginEmail.value.trim();
    const pass  = els.loginPass.value;

    if(!name){ toast('Please enter your name.', 'warn'); els.loginName.focus(); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      toast('Please enter a valid email.', 'warn'); els.loginEmail.focus(); return;
    }
    if(pass.length < 4){
      toast('Password must be at least 4 characters.', 'warn'); els.loginPass.focus(); return;
    }

    const btn = els.loginForm.querySelector('button[type="submit"]');
    btn.classList.add('is-loading');
    btn.disabled = true;

    setTimeout(()=>{
      profile = {
        name, email,
        avatar: pendingAvatar || DEFAULT_AVATAR,
        loginAt: Date.now()
      };
      store.setProfile(profile);
      pendingAvatar = null;
      btn.classList.remove('is-loading');
      btn.disabled = false;
      showApp();
      toast(`Welcome, ${name.split(' ')[0]}!`, 'success');
    }, 550);
  });

  // Change photo from profile menu
  els.avatarChanger.addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file || !profile) return;
    const reader = new FileReader();
    reader.onload = ev => {
      profile.avatar = ev.target.result;
      store.setProfile(profile);
      applyProfileUI();
      toast('Profile picture updated.', 'success');
    };
    reader.readAsDataURL(file);
  });
}

function showApp(){
  els.loginScreen.classList.add('hide');
  els.app.hidden = false;
  applyProfileUI();
  initDashboard();
}

function applyProfileUI(){
  if(!profile) return;
  const avatar = profile.avatar || DEFAULT_AVATAR;
  els.topAvatar.src = avatar;
  els.pdAvatar.src  = avatar;
  els.topName.textContent = profile.name;
  els.pdName.textContent  = profile.name;
  els.pdEmail.textContent = profile.email;
}

/* =====================================================
   PROFILE MENU
===================================================== */
function initProfileMenu(){
  els.profileBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = els.profileDrop.classList.toggle('open');
    els.profileBtn.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', e => {
    if(!els.profileMenu.contains(e.target)){
      els.profileDrop.classList.remove('open');
      els.profileBtn.setAttribute('aria-expanded', 'false');
    }
  });

  els.pdUpload.addEventListener('click', () => {
    els.profileDrop.classList.remove('open');
    els.avatarChanger.click();
  });

  els.pdSettings.addEventListener('click', () => {
    els.profileDrop.classList.remove('open');
    switchView('settings');
  });

  els.pdSignout.addEventListener('click', () => {
    els.profileDrop.classList.remove('open');
    if(!confirm('Sign out of LinguaFlow?')) return;
    store.clearProfile();
    profile = null;
    els.loginForm.reset();
    els.avatarPreview.src = DEFAULT_AVATAR;
    els.app.hidden = true;
    els.loginScreen.classList.remove('hide');
    toast('Signed out.', 'info');
  });
}

/* =====================================================
   AUTOCOMPLETE / WORD SUGGESTIONS
===================================================== */
let suggestState = {
  items: [],
  index: -1,
  wordStart: 0,
  wordEnd: 0,
  currentWord: ''
};

/* Extract the word being typed at the caret */
function getCurrentWord(textarea){
  const pos = textarea.selectionStart;
  const text = textarea.value;
  // Find word boundary (letters, digits, apostrophes)
  let start = pos;
  while(start > 0 && /[A-Za-z0-9'’]/.test(text[start - 1])) start--;
  let end = pos;
  while(end < text.length && /[A-Za-z0-9'’]/.test(text[end])) end++;
  return { word: text.slice(start, end), start, end };
}

async function fetchSuggestions(prefix){
  const p = prefix.toLowerCase();
  if(p.length < 2) return [];

  // Try Datamuse API
  try{
    const url = `${SUGGEST_API}?s=${encodeURIComponent(p)}&max=8`;
    const res = await fetch(url);
    if(res.ok){
      const data = await res.json();
      if(Array.isArray(data) && data.length){
        return data.map(d => d.word).filter(w => w.toLowerCase() !== p);
      }
    }
  }catch{ /* fall through to local */ }

  // Fallback dictionary
  return FALLBACK_WORDS
    .filter(w => w.toLowerCase().startsWith(p) && w.toLowerCase() !== p)
    .slice(0, 8);
}

function renderSuggestions(items){
  suggestState.items = items;
  suggestState.index = -1;
  els.suggestList.innerHTML = '';

  if(!items.length){
    els.suggestBox.hidden = true;
    return;
  }

  const typed = suggestState.currentWord.toLowerCase();

  items.forEach((word, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');

    // Highlight the typed prefix in the suggestion
    const prefixLen = word.toLowerCase().startsWith(typed) ? typed.length : 0;
    const typedSpan = document.createElement('span');
    typedSpan.className = 'word';
    typedSpan.textContent = word.slice(0, prefixLen);

    const restSpan = document.createElement('span');
    restSpan.className = 'rest';
    restSpan.textContent = word.slice(prefixLen);

    li.append(typedSpan, restSpan);

    li.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent textarea blur
      acceptSuggestion(i);
    });
    li.addEventListener('mouseenter', () => setActiveSuggestion(i));
    els.suggestList.appendChild(li);
  });

  els.suggestBox.hidden = false;
}

function setActiveSuggestion(i){
  const lis = els.suggestList.querySelectorAll('li');
  lis.forEach(li => li.classList.remove('active'));
  if(i >= 0 && i < lis.length){
    lis[i].classList.add('active');
    lis[i].scrollIntoView({ block:'nearest' });
  }
  suggestState.index = i;
}

function acceptSuggestion(i){
  const word = suggestState.items[i];
  if(!word) return;

  const ta = els.input;
  const text = ta.value;
  const { start, end } = suggestState;

  // Replace current word with suggested one + trailing space
  const before = text.slice(0, start);
  const after  = text.slice(end);
  const insert = word + ' ';
  ta.value = before + insert + after;

  const newPos = before.length + insert.length;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();

  hideSuggestions();
  updateCounter();
}

function hideSuggestions(){
  els.suggestBox.hidden = true;
  suggestState.items = [];
  suggestState.index = -1;
}

const debouncedFetch = debounce(async (prefix) => {
  if(!settings.autoSuggest) return;
  const items = await fetchSuggestions(prefix);
  // Only render if the user is still on the same word
  const still = getCurrentWord(els.input);
  if(still.word.toLowerCase().startsWith(prefix.toLowerCase())){
    renderSuggestions(items);
  }
}, DEBOUNCE_MS);

function handleInputForSuggestions(){
  if(!settings.autoSuggest){ hideSuggestions(); return; }

  const { word, start, end } = getCurrentWord(els.input);
  suggestState.currentWord = word;
  suggestState.wordStart = start;
  suggestState.wordEnd = end;

  if(word.length < 2){
    hideSuggestions();
    return;
  }

  debouncedFetch(word);
}

function initAutocomplete(){
  els.input.addEventListener('input', handleInputForSuggestions);

  // Reposition when typing
  els.input.addEventListener('click', () => {
    if(!els.suggestBox.hidden){
      const { word } = getCurrentWord(els.input);
      if(word.length < 2) hideSuggestions();
    }
  });

  // Keyboard navigation
  els.input.addEventListener('keydown', e => {
    if(els.suggestBox.hidden) return;
    const lis = els.suggestList.querySelectorAll('li');
    if(!lis.length) return;

    if(e.key === 'ArrowDown'){
      e.preventDefault();
      setActiveSuggestion((suggestState.index + 1) % lis.length);
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      setActiveSuggestion((suggestState.index - 1 + lis.length) % lis.length);
    } else if(e.key === 'Tab' && suggestState.index >= 0){
      e.preventDefault();
      acceptSuggestion(suggestState.index);
    } else if(e.key === 'Enter' && suggestState.index >= 0 && !e.ctrlKey){
      e.preventDefault();
      acceptSuggestion(suggestState.index);
    } else if(e.key === 'Escape'){
      hideSuggestions();
    }
  });

  // Hide when focus leaves
  els.input.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
  });

  // Phrase chips
  els.phraseChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if(!chip) return;
    const text = chip.dataset.text;
    els.input.value = els.input.value ? els.input.value + ' ' + text : text;
    els.input.focus();
    updateCounter();
  });
}

/* =====================================================
   CHUNKING
===================================================== */
function splitIntoChunks(line, maxBytes){
  if(byteLen(line) <= maxBytes) return [line];
  const chunks = [];
  const sentences = line.match(/[^.!?]+[.!?]*/g) || [line];
  let current = '';

  for(const sentence of sentences){
    const candidate = current + sentence;
    if(byteLen(candidate) <= maxBytes){ current = candidate; continue; }
    if(current) chunks.push(current.trim());

    if(byteLen(sentence) > maxBytes){
      let wordChunk = '';
      for(const word of sentence.split(/\s+/)){
        const cand = wordChunk ? wordChunk + ' ' + word : word;
        if(byteLen(cand) <= maxBytes){ wordChunk = cand; continue; }
        if(wordChunk) chunks.push(wordChunk.trim());

        if(byteLen(word) > maxBytes){
          let charChunk = '';
          for(const ch of word){
            if(byteLen(charChunk + ch) <= maxBytes) charChunk += ch;
            else { chunks.push(charChunk); charChunk = ch; }
          }
          wordChunk = charChunk;
        } else { wordChunk = word; }
      }
      if(wordChunk) chunks.push(wordChunk.trim());
      current = '';
    } else { current = sentence; }
  }
  if(current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/* =====================================================
   TRANSLATION
===================================================== */
async function translateChunk(text, from, to){
  const src = from === 'auto' ? 'Autodetect' : from;
  const url = `${API_BASE}?q=${encodeURIComponent(text)}&langpair=${src}|${to}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Network error (${res.status})`);
  const data = await res.json();
  if(data.responseStatus !== 200){
    throw new Error(data.responseDetails || 'Translation service unavailable');
  }
  return {
    text: data.responseData.translatedText,
    detected: data.responseData.detectedLanguage || null
  };
}

async function translateText(text, from, to){
  const lines = text.split('\n');
  const out = [];
  let detected = null;
  for(const line of lines){
    if(!line.trim()){ out.push(''); continue; }
    const parts = [];
    for(const chunk of splitIntoChunks(line, MAX_BYTES)){
      const r = await translateChunk(chunk, from, to);
      if(r.detected && !detected) detected = r.detected;
      parts.push(r.text);
    }
    out.push(parts.join(' '));
  }
  return { text: out.join('\n'), detected };
}

function setLoading(on){
  els.translateBtn.classList.toggle('is-loading', on);
  els.translateBtn.disabled = on;
  els.statusText.textContent = on ? 'Translating…' : 'Ready';
  if(on){
    els.output.className = 'output';
    els.output.innerHTML = '';
    const sk = document.createElement('div');
    sk.className = 'skeleton';
    [92, 78, 85].forEach(w => {
      const line = document.createElement('div');
      line.className = 'sk-line';
      line.style.width = w + '%';
      sk.appendChild(line);
    });
    els.output.appendChild(sk);
  }
}

function updateCounter(){
  const text = els.input.value;
  const bytes = byteLen(text);
  els.charCounter.textContent = `${text.length} chars · ${bytes} bytes`;
  els.charCounter.classList.toggle('over', bytes > MAX_BYTES);
}

function updateTargetBadge(){
  els.targetBadge.textContent = langName(els.targetLang.value);
}

async function handleTranslate(){
  const text = els.input.value.trim();
  const from = els.sourceLang.value;
  const to   = els.targetLang.value;

  if(!text){ toast('Please enter some text to translate.', 'warn'); els.input.focus(); return; }
  if(from === to){ toast('Source and target languages are the same.', 'warn'); return; }

  hideSuggestions();
  setLoading(true);
  els.detectedBadge.style.display = 'none';

  try{
    const result = await translateText(text, from, to);
    els.output.className = 'output';
    els.output.textContent = result.text;
    els.statusText.textContent = 'Completed';

    if(result.detected && from === 'auto'){
      els.detectedBadge.textContent = `Detected: ${result.detected.toUpperCase()}`;
      els.detectedBadge.style.display = 'inline-block';
    }

    addToHistory(from, to, text, result.text);
    renderStats();

    if(settings.autoSpeak) speak();
    toast('Translation completed successfully.', 'success');
  }
  catch(err){
    console.error(err);
    els.output.className = 'output error';
    els.output.textContent = 'Translation failed. Please try again.';
    els.statusText.textContent = 'Failed';
    toast(err.message || 'Translation failed.', 'error');
  }
  finally{
    setLoading(false);
  }
}

/* =====================================================
   HISTORY
===================================================== */
function addToHistory(source, target, input, output){
  if(!settings.saveHistory) return;
  history.unshift({
    id: Date.now()+'-'+Math.random().toString(36).slice(2,7),
    source, target, input, output, ts: Date.now(), saved:false
  });
  if(history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  store.setHistory(history);
  renderHistory();
  renderStats();
}

function renderHistory(filter = ''){
  const q = filter.trim().toLowerCase();
  const items = q
    ? history.filter(h =>
        h.input.toLowerCase().includes(q) ||
        h.output.toLowerCase().includes(q) ||
        langName(h.target).toLowerCase().includes(q))
    : history;

  els.histList.innerHTML = '';

  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'empty';
    const icon = document.createElement('div');
    icon.className = 'empty-icon'; icon.textContent = '📭';
    const title = document.createElement('div');
    title.className = 'empty-title';
    title.textContent = q ? 'No matching translations' : 'No translations yet';
    const desc = document.createElement('div');
    desc.textContent = q ? 'Try a different search term.' : 'Your translated texts will appear here.';
    empty.append(icon, title, desc);
    els.histList.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'hist-item' + (item.saved ? ' saved' : '');

    const top = document.createElement('div');
    top.className = 'hist-top';

    const langs = document.createElement('span');
    langs.className = 'hist-langs';
    langs.textContent = `${item.source === 'auto' ? 'AUTO' : item.source.toUpperCase()} → ${item.target.toUpperCase()}`;

    const time = document.createElement('span');
    time.className = 'hist-time';
    time.textContent = timeAgo(item.ts);

    const actions = document.createElement('div');
    actions.className = 'hist-actions';

    const mkBtn = (label, title, handler) => {
      const b = document.createElement('button');
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = label; b.title = title;
      b.addEventListener('click', handler);
      return b;
    };

    actions.appendChild(mkBtn(item.saved ? '⭐' : '☆', 'Star', () => {
      item.saved = !item.saved;
      store.setHistory(history);
      renderHistory(els.histSearch.value);
      renderStats();
    }));

    actions.appendChild(mkBtn('↩️', 'Reuse as input', () => {
      els.input.value      = item.input;
      els.sourceLang.value = item.source;
      els.targetLang.value = item.target;
      updateCounter(); updateTargetBadge();
      switchView('translate');
      toast('Loaded into the translator.', 'info');
    }));

    actions.appendChild(mkBtn('📋', 'Copy translation', () => copyText(item.output)));

    actions.appendChild(mkBtn('🗑️', 'Delete', () => {
      history = history.filter(h => h.id !== item.id);
      store.setHistory(history);
      renderHistory(els.histSearch.value);
      renderStats();
      toast('Entry deleted.', 'info');
    }));

    top.append(langs, time, actions);

    const src = document.createElement('div');
    src.className = 'hist-src'; src.textContent = item.input;

    const out = document.createElement('div');
    out.className = 'hist-out'; out.textContent = item.output;

    card.append(top, src, out);
    els.histList.appendChild(card);
  });
}

/* =====================================================
   STATS
===================================================== */
function renderStats(){
  const total = history.length;
  const chars = history.reduce((s,h) => s + h.input.length, 0);
  const langs = new Set(history.map(h => h.target)).size;
  const saved = history.filter(h => h.saved).length;

  $('statTotal').textContent = total.toLocaleString();
  $('statChars').textContent = chars > 9999 ? (chars/1000).toFixed(1)+'k' : chars.toLocaleString();
  $('statLangs').textContent = langs;
  $('statSaved').textContent = saved;
  els.navHistCount.textContent = total;
}

/* =====================================================
   COPY / SPEAK
===================================================== */
async function copyText(text){
  if(!text) return;
  try{
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard.', 'success');
  }catch{
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Copied to clipboard.', 'success');
  }
}

function speak(){
  const text = els.output.textContent;
  if(!text || els.output.classList.contains('placeholder') || els.output.classList.contains('error')) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = els.targetLang.value;
  const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith(els.targetLang.value));
  if(voice) u.voice = voice;
  speechSynthesis.speak(u);
}

/* =====================================================
   VIEWS
===================================================== */
function switchView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  els.pageTitle.textContent = VIEW_META[name].title;
  els.pageSub.textContent   = VIEW_META[name].sub;
  if(name === 'history') renderHistory(els.histSearch.value);
}

/* =====================================================
   THEME
===================================================== */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  els.themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  els.themeSeg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.themeVal === theme);
  });
  settings.theme = theme;
  store.setSettings(settings);
}

function syncSettingsUI(){
  els.setSource.value      = settings.source;
  els.setTarget.value      = settings.target;
  els.setSaveHist.checked  = settings.saveHistory;
  els.setAutoSpeak.checked = settings.autoSpeak;
  els.setAutoSuggest.checked = settings.autoSuggest;
  applyTheme(settings.theme);
}

/* =====================================================
   DASHBOARD INIT
===================================================== */
let dashboardInited = false;
function initDashboard(){
  if(dashboardInited) return;
  dashboardInited = true;

  fillSelect(els.sourceLang, true);
  fillSelect(els.targetLang, false);
  fillSelect(els.setSource, true);
  fillSelect(els.setTarget, false);

  els.sourceLang.value = settings.source;
  els.targetLang.value = settings.target;

  updateTargetBadge();
  updateCounter();
  renderStats();
  renderHistory();
  syncSettingsUI();

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  els.translateBtn.addEventListener('click', handleTranslate);
  els.input.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
      e.preventDefault(); handleTranslate();
    }
  });
  els.input.addEventListener('input', updateCounter);
  els.targetLang.addEventListener('change', updateTargetBadge);

  els.swapBtn.addEventListener('click', () => {
    const s = els.sourceLang.value, t = els.targetLang.value;
    if(s === 'auto'){ els.sourceLang.value = t; els.targetLang.value = 'en'; }
    else { els.sourceLang.value = t; els.targetLang.value = s; }
    updateTargetBadge();
  });

  els.clearBtn.addEventListener('click', () => {
    els.input.value = '';
    els.output.className = 'output placeholder';
    els.output.textContent = 'Your translation will appear here.';
    els.detectedBadge.style.display = 'none';
    els.statusText.textContent = 'Ready';
    hideSuggestions();
    updateCounter(); els.input.focus();
  });

  els.pasteBtn.addEventListener('click', async () => {
    try{
      const text = await navigator.clipboard.readText();
      if(!text){ toast('Clipboard is empty.', 'warn'); return; }
      els.input.value = text;
      updateCounter();
      toast('Pasted from clipboard.', 'success');
    }catch{
      toast('Clipboard access denied by browser.', 'error');
    }
  });

  els.copyBtn.addEventListener('click', () => copyText(els.output.textContent));
  els.speakBtn.addEventListener('click', speak);

  els.saveBtn.addEventListener('click', () => {
    const text = els.output.textContent;
    if(!text || els.output.classList.contains('placeholder')){
      toast('Nothing to save yet.', 'warn'); return;
    }
    const latest = history[0];
    if(latest && latest.output === text){
      latest.saved = true;
      store.setHistory(history);
      renderHistory(els.histSearch.value);
      renderStats();
      toast('Saved to favourites.', 'success');
    } else { toast('Translate something first to save it.', 'warn'); }
  });

  els.histSearch.addEventListener('input', e => renderHistory(e.target.value));

  $('exportBtn').addEventListener('click', () => {
    if(!history.length){ toast('No history to export.', 'warn'); return; }
    const blob = new Blob([JSON.stringify(history, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linguaflow-history-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('History exported.', 'success');
  });

  $('clearHistBtn').addEventListener('click', () => {
    if(!history.length){ toast('History is already empty.', 'warn'); return; }
    if(!confirm('Delete all translation history? This cannot be undone.')) return;
    history = [];
    store.setHistory(history);
    renderHistory(); renderStats();
    toast('History cleared.', 'success');
  });

  els.themeBtn.addEventListener('click', () => {
    applyTheme(settings.theme === 'dark' ? 'light' : 'dark');
  });
  els.themeSeg.addEventListener('click', e => {
    const btn = e.target.closest('button[data-theme-val]');
    if(btn) applyTheme(btn.dataset.themeVal);
  });

  els.setSource.addEventListener('change', () => {
    settings.source = els.setSource.value; store.setSettings(settings);
    els.sourceLang.value = settings.source;
  });
  els.setTarget.addEventListener('change', () => {
    settings.target = els.setTarget.value; store.setSettings(settings);
    els.targetLang.value = settings.target;
    updateTargetBadge();
  });
  els.setSaveHist.addEventListener('change', () => {
    settings.saveHistory = els.setSaveHist.checked; store.setSettings(settings);
  });
  els.setAutoSpeak.addEventListener('change', () => {
    settings.autoSpeak = els.setAutoSpeak.checked; store.setSettings(settings);
  });
  els.setAutoSuggest.addEventListener('change', () => {
    settings.autoSuggest = els.setAutoSuggest.checked; store.setSettings(settings);
    if(!settings.autoSuggest) hideSuggestions();
  });

  $('resetBtn').addEventListener('click', () => {
    if(!confirm('Reset all data and preferences? This cannot be undone.')) return;
    store.clear();
    history = [];
    settings = { ...DEFAULTS };
    els.input.value = '';
    els.output.className = 'output placeholder';
    els.output.textContent = 'Your translation will appear here.';
    syncSettingsUI(); renderStats(); renderHistory(); updateCounter(); updateTargetBadge();
    toast('All data has been reset.', 'success');
  });

  initAutocomplete();
  if(window.speechSynthesis) speechSynthesis.getVoices();
}

/* =====================================================
   BOOT
===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initProfileMenu();
});