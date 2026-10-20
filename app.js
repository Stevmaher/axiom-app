// This script is now a standard (non-module) script to support local file execution (file:// protocol).

const TILE_IMAGES = {
  1: "./assets/tiles/tile-1.webp",
  2: "./assets/tiles/tile-2.webp",
  3: "./assets/tiles/tile-3.webp",
  4: "./assets/tiles/tile-4.webp",
  5: "./assets/tiles/tile-5.webp",
  6: "./assets/tiles/tile-6.webp",
  7: "./assets/tiles/tile-7.webp",
  8: "./assets/tiles/tile-8.webp",
  9: "./assets/tiles/tile-9.webp",
  10: "./assets/tiles/tile-10.webp",
};

const MOVE_NAMES = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
const boardEl = document.getElementById('board');
const boardShellEl = document.getElementById('boardShell');
const moveLayerEl = document.getElementById('moveLayer');
const statusEl = document.getElementById('status');
const chosenMoveEl = document.getElementById('chosenMove');
const selectedDirectionArrowEl = document.getElementById('selectedDirectionArrow');
const selectedDirectionTextEl = document.getElementById('selectedDirectionText');
const tilePickerEl = document.getElementById('tilePicker');
const btnAnalyze = document.getElementById('btnAnalyze');
const btnStep = document.getElementById('btnStep');
const btnReset = document.getElementById('btnReset');
const btnSave = document.getElementById('btnSave');
const btnUndo = document.getElementById('btnUndo');
const btnMode = document.getElementById('btnMode');
const toggleAutoStepAfterSpawn = document.getElementById('toggleAutoStepAfterSpawn');
const scoresEl = document.getElementById('scores');
const btnRescue = document.getElementById('btnRescue');
const rescueCardEl = document.getElementById('rescueCard');
const rescueDescEl = document.getElementById('rescueDesc');
const btnRescueSwap = document.getElementById('btnRescueSwap');
const btnRescueDelete = document.getElementById('btnRescueDelete');
const elevenStarsEl = document.getElementById('elevenStars');
const elevenStarEls = elevenStarsEl ? [...elevenStarsEl.querySelectorAll('.eleven-star')] : [];
const elevenStarsAnnounceEl = document.getElementById('elevenStarsAnnounce');

const state = {
  lastBestMove: -1,
  board: Array(16).fill(0),
  pendingBoard: null,
  waitingForSpawn: false,
  setupMode: true,
  selectedTile: 1,
  worker: null,
  analyze: null,
  autoStepAfterSpawn: true,
  history: [],
  animationMs: 200,
  animating: false,
  hiddenIndices: null,
  lang: 'ar',
  rescueSuggestion: null, // { swap: {...}|null, delete: {...}|null, recommended: 'swap'|'delete'|null }
  rescueHighlight: null, // { swap: [i1, i2] } | { delete: i } | null — cells to glow on the board
  rescueBusy: false, // true while the assistant is scoring candidates against the real solver
  elevenCount: 0, // how many level-11 merges completed this trial (max 3)
};

const TRANSLATIONS = {
  ar: {
    eyebrow: 'محاكمة الوحوش الأسطورية',
    title: 'Axiom',
    description: 'محرك حل يعمل داخل Web Worker بلغة JavaScript. تندمج المستويات المتساوية إلى المستوى التالي، وعند تكوين المستوى 11 يختفي من اللوحة.',
    statusTitle: 'الحالة:',
    statusLoading: 'جاري تحميل محرك الذكاء...',
    statusReady: 'جاهز. قم ببناء اللوحة، ثم اضغط تحليل أو خطوة.',
    statusEmpty: 'اللوحة فارغة. ضع بلاطة واحدة على الأقل أولاً.',
    statusNoMove: 'لا توجد حركة قانونية متاحة.',
    statusSpawnedManual: 'تم وضع البلاطة. قم بالتحليل مجدداً أو اتخذ الخطوة التالية.',
    statusSpawnedAuto: 'تم وضع البلاطة. جاري التحليل واللعب تلقائياً...',
    statusApplied: 'تم تنفيذ حركة {move}. الآن ضع البلاطة التالية.',
    statusWaitingSpawn: 'اختر موقع البلاطة التالية أولاً.',
    statusAnalysis: 'اكتمل التحليل في {time} مللي ثانية.',
    statusCleared: 'تم مسح اللوحة.',
    statusSetupMode: 'وضع الإعداد: اضغط على أي خلية ثم اختر الوحش.',
    statusPlayMode: 'وضع اللعب: استخدم تحليل / خطوة، ثم ضع البلاطة الناتجة يدوياً.',
    emptiesLabel: 'الفراغات:',
    tilePickerTitle: 'منتقي البلاطات',
    btnModePlay: 'التبديل لوضع اللعب',
    btnModeSetup: 'التبديل لوضع الإعداد',
    btnAnalyze: 'تحليل',
    btnStep: 'تنفيذ أفضل حركة',
    btnReset: 'إعادة ضبط',
    btnUndo: 'تراجع عن آخر حركة',
    toggleAuto: 'بعد وضع البلاطة التالية، قم بالتحليل واللعب تلقائياً',
    analysisTitle: 'التحليل',
    chosenMoveTitle: 'الحركة المختارة:',
    playDirectionLabel: 'العب في هذا الاتجاه',
    waiting: 'بانتظار التحليل',
    searchLabel: 'البحث:',
    depthLabel: 'العمق',
    nodesLabel: 'عقدة',
    cacheLabel: 'مرات استرجاع الذاكرة',
    partialLabel: 'جزئي',
    noneMove: 'لا يوجد',
    naScore: 'غير متاح',
    notesTitle: 'ملاحظات',
    notes1: 'يسمح لك وضع الإعداد ببناء أي موضع للوحة عن طريق النقر على الخلايا. في وضع اللعب، تقوم "خطوة" بتطبيق حركة المحلل، ثم تنتظر منك وضع البلاطة التالية يدوياً.',
    notes2: 'يعمل المحلل داخل Web Worker ويجمع بين البحث التقييمي ومحاكاة Monte Carlo للبقاء.',
    move0: 'يسار',
    move1: 'يمين',
    move2: 'فوق',
    move3: 'تحت',
    none: 'لا يوجد',
    na: 'غير متاح',
    btnRescue: '🆘 مساعد الذكاء',
    rescueTitle: 'مساعد الذكاء',
    rescueNotLocked: 'اللوحة لسه فيها حركات ممكنة — مش محتاج مساعدة دلوقتي. جرّب الزرار ده لما تتقفل.',
    rescueEmptyBoard: 'حط بعض البلاطات الأول، وبعدين اسأل المساعد لو اتقفلت.',
    rescueAnalyzing: 'المساعد بيقارن كل الاحتمالات باستخدام نفس محرك الحل الحقيقي... ثواني وهيجهز.',
    rescueSwapDesc: 'الاقتراح: بدّل البلاطة المتوهجة ① ({a}) بالبلاطة ② ({b}) — الخليتين متعلّمين على اللوحة. اضغط تأكيد تحت عشان ينفّذها.',
    rescueDeleteDesc: 'الاقتراح: احذف البلاطة المتوهجة بالأحمر ({a})، عشان تفتح مساحة. اضغط تأكيد تحت عشان ينفّذها.',
    rescueNoneDesc: 'اللوحة مقفلة ولم يتم إيجاد تبديل أو حذف يفتحها. جرّب إعادة الضبط.',
    rescueRecommendedTag: '⭐ أفضل اقتراح حسب المحرك: ',
    rescueSwapLabel: 'تبديل',
    rescueDeleteLabel: 'حذف',
    rescueSwapBtn: 'تأكيد: بدّل {a} ↔ {b}',
    rescueDeleteBtn: 'تأكيد: احذف {a}',
    rescueApplied: 'تم. اضغط تحليل أو خطوة مجدداً.',
    statusSolverError: 'تعذّر تحميل محرك الحل. أعد تحميل الصفحة وجرّب تاني.',
    logout: 'تسجيل خروج',
    elevenStarsLabel: 'دمجات المستوى 11',
    elevenStarsProgress: 'أكملت {n} من 3 دمجات للمستوى 11',
    elevenStarsNone: 'لسه مفيش دمج للمستوى 11 في المحاولة دي',
    btnSave: 'حفظ اللوحة',
    statusSaved: 'تم حفظ اللوحة. هتلاقيها جاهزة لما تفتح الصفحة تاني.',
    statusLoadedSaved: 'تم استرجاع آخر لوحة محفوظة.',
    statusSaveError: 'تعذّر حفظ اللوحة على الجهاز ده.',
  }
};

function updateLanguage(lang) {
  state.lang = lang;
  try {
    localStorage.setItem('axiom_lang', lang);
  } catch (e) {}
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === 'ar' ? 'rtl' : 'ltr');
  
  const strings = TRANSLATIONS[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (strings[key]) {
      el.textContent = strings[key];
    }
  });

  // Special cases for buttons and status
  btnMode.textContent = state.setupMode ? strings.btnModePlay : strings.btnModeSetup;
  if (!state.board.some(Boolean)) {
    statusEl.textContent = strings.statusReady;
  }
  rescueCardEl?.classList.remove('visible');
  renderElevenStars();
}

function moveArrow(move) {
  switch (move) {
    case 0: return '←';
    case 1: return '→';
    case 2: return '↑';
    case 3: return '↓';
    default: return '—';
  }
}

function renderSelectedDirection(move) {
  state.lastBestMove = move;
  const strings = TRANSLATIONS[state.lang];
  if (!selectedDirectionArrowEl || !selectedDirectionTextEl) return;
  if (move >= 0) {
    selectedDirectionArrowEl.textContent = moveArrow(move);
    selectedDirectionTextEl.textContent = strings[`move${move}`] || MOVE_NAMES[move];
  } else {
    selectedDirectionArrowEl.textContent = '—';
    selectedDirectionTextEl.textContent = strings.waiting;
  }
}

function renderElevenStars() {
  if (!elevenStarEls.length) return;
  elevenStarEls.forEach((el, idx) => {
    el.classList.toggle('filled', idx < state.elevenCount);
  });
  if (elevenStarsEl) {
    const strings = TRANSLATIONS[state.lang];
    const label = state.elevenCount > 0
      ? (strings.elevenStarsProgress || '').replace('{n}', state.elevenCount)
      : (strings.elevenStarsNone || '');
    elevenStarsEl.setAttribute('aria-label', `${strings.elevenStarsLabel || ''} — ${label}`.trim());
  }
}

// Called after a move resolves one or more level-11 merges (tiles that hit
// level 11 vanish from the board). Fills the next star(s) and pops it so the
// player notices their first/second/third completed merge of the trial.
function registerElevenMerges(count) {
  if (!count || count <= 0) return;
  const strings = TRANSLATIONS[state.lang];
  for (let i = 0; i < count && state.elevenCount < 3; i++) {
    state.elevenCount++;
    const starEl = elevenStarEls[state.elevenCount - 1];
    if (starEl) {
      starEl.classList.remove('star-pop');
      void starEl.offsetWidth; // restart the animation
      starEl.classList.add('star-pop');
    }
    if (elevenStarsAnnounceEl) {
      elevenStarsAnnounceEl.textContent = (strings.elevenStarsProgress || '').replace('{n}', state.elevenCount);
    }
  }
  renderElevenStars();
}

function displayValue(exp) {
  return exp === 0 ? '' : String(exp);
}

function queueAutoStepAfterSpawn() {
  window.setTimeout(async () => {
    if (state.setupMode) return;
    if (state.waitingForSpawn) return;
    if (!state.board.some(Boolean)) return;
    await stepBestMove();
  }, 0);
}

function emptyCount(board) {
  return board.filter(v => v === 0).length;
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

let cellEls = null;

// Build the 16 board cells once and reuse them on every render. Recreating
// all 16 buttons (and their <img> tags, forcing the browser to re-decode the
// tile artwork) on every single move is unnecessarily heavy — we only need
// to touch the cells whose value actually changed.
function ensureCellEls() {
  if (cellEls) return cellEls;
  boardEl.innerHTML = '';
  cellEls = [];
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.setAttribute('aria-label', 'Empty cell');
    cell.addEventListener('click', () => onCellClick(i));
    boardEl.appendChild(cell);
    cellEls.push(cell);
  }
  return cellEls;
}

function render() {
  const source = state.pendingBoard ?? state.board;
  const cells = ensureCellEls();

  for (let i = 0; i < 16; i++) {
    const cell = cells[i];
    const value = source[i];

    if (cell.dataset.value !== String(value)) {
      cell.dataset.value = String(value);
      for (let v = 1; v <= 12; v++) cell.classList.remove(`v${v}`);
      if (value) cell.classList.add(`v${Math.min(value, 12)}`);

      if (value && TILE_IMAGES[value]) {
        let img = cell.querySelector('img.tile-icon');
        if (!img) {
          cell.textContent = '';
          img = document.createElement('img');
          img.className = 'tile-icon';
          img.draggable = false;
          cell.appendChild(img);
        }
        img.src = TILE_IMAGES[value];
        img.alt = String(value);
      } else {
        const img = cell.querySelector('img.tile-icon');
        if (img) img.remove();
        cell.textContent = displayValue(value);
      }
      cell.setAttribute('aria-label', value ? `Tile ${value}` : 'Empty cell');
    }

    cell.classList.toggle('hidden-source', !!state.hiddenIndices?.has(i));

    const hl = state.rescueHighlight;
    cell.classList.toggle('rescue-highlight-a', !!hl?.swap && hl.swap[0] === i);
    cell.classList.toggle('rescue-highlight-b', !!hl?.swap && hl.swap[1] === i);
    cell.classList.toggle('rescue-highlight-delete', hl?.delete === i);
  }

  if (moveLayerEl) moveLayerEl.innerHTML = '';
  document.getElementById('empties').textContent = String(emptyCount(state.board));
}

function tileLabel(value) {
  return String(value);
}

function clearRescueUI() {
  state.rescueSuggestion = null;
  state.rescueHighlight = null;
  if (btnRescueSwap) btnRescueSwap.style.display = 'none';
  if (btnRescueDelete) btnRescueDelete.style.display = 'none';
}

// The assistant is on-demand: pressing the button ranks every legal swap and
// delete that unlocks the board using the solver's real positional heuristic
// (one batched call), then re-checks the top candidate of each kind with the
// actual expectimax/Monte Carlo search the rest of the app uses — so the
// suggestion reflects what the AI itself thinks is strongest, not a
// stand-alone shortcut. The winning cells are also highlighted on the board
// itself so there's no ambiguity when several tiles share the same value.
async function runRescueAssistant() {
  if (!rescueCardEl) return;
  const strings = TRANSLATIONS[state.lang];
  clearRescueUI();
  render();

  if (state.setupMode || state.waitingForSpawn) {
    rescueCardEl.classList.add('visible');
    rescueDescEl.textContent = strings.rescueNotLocked;
    return;
  }

  if (!state.board.some(Boolean)) {
    rescueCardEl.classList.add('visible');
    rescueDescEl.textContent = strings.rescueEmptyBoard;
    return;
  }

  if (!isBoardLocked(state.board)) {
    rescueCardEl.classList.add('visible');
    rescueDescEl.textContent = strings.rescueNotLocked;
    return;
  }

  rescueCardEl.classList.add('visible');
  rescueDescEl.textContent = strings.rescueAnalyzing;
  state.rescueBusy = true;

  try {
    await ensureSolver();
    const suggestion = await computeRescueSuggestion(state.board);
    if (state.rescueBusy === false) return; // superseded by a later call
    state.rescueSuggestion = suggestion;

    if (!suggestion.swap && !suggestion.delete) {
      rescueDescEl.textContent = strings.rescueNoneDesc;
      return;
    }

    const lines = [];

    if (suggestion.swap) {
      const aLabel = tileLabel(suggestion.swap.v1);
      const bLabel = tileLabel(suggestion.swap.v2);
      let line = strings.rescueSwapDesc.replace('{a}', aLabel).replace('{b}', bLabel);
      if (suggestion.recommended === 'swap') line = strings.rescueRecommendedTag + strings.rescueSwapLabel + ' — ' + line;
      lines.push(line);
      btnRescueSwap.textContent = strings.rescueSwapBtn.replace('{a}', aLabel).replace('{b}', bLabel);
      btnRescueSwap.style.display = '';
    }

    if (suggestion.delete) {
      const aLabel = tileLabel(suggestion.delete.v);
      let line = strings.rescueDeleteDesc.replace('{a}', aLabel);
      if (suggestion.recommended === 'delete') line = strings.rescueRecommendedTag + strings.rescueDeleteLabel + ' — ' + line;
      lines.push(line);
      btnRescueDelete.textContent = strings.rescueDeleteBtn.replace('{a}', aLabel);
      btnRescueDelete.style.display = '';
    }

    rescueDescEl.textContent = lines.join('  ·  ');

    // Glow the actual cells on the board so the suggestion is unambiguous
    // even when duplicate tile values are present.
    state.rescueHighlight = suggestion.recommended === 'delete' && suggestion.delete
      ? { delete: suggestion.delete.i }
      : suggestion.swap
        ? { swap: [suggestion.swap.i1, suggestion.swap.i2] }
        : (suggestion.delete ? { delete: suggestion.delete.i } : null);
    render();
  } finally {
    state.rescueBusy = false;
  }
}

function applyRescueSuggestion(kind) {
  const suggestion = state.rescueSuggestion;
  if (!suggestion) return;
  if (state.animating || state.setupMode || state.waitingForSpawn) return;

  if (kind === 'swap') {
    if (!suggestion.swap) return;
    pushHistory();
    const { i1, i2 } = suggestion.swap;
    const tmp = state.board[i1];
    state.board[i1] = state.board[i2];
    state.board[i2] = tmp;
  } else if (kind === 'delete') {
    if (!suggestion.delete) return;
    pushHistory();
    state.board[suggestion.delete.i] = 0;
  } else {
    return;
  }

  clearRescueUI();
  render();
  rescueCardEl.classList.remove('visible');
  setStatus('rescueApplied');
}

function setStatus(key, data = {}) {
  const strings = TRANSLATIONS[state.lang];
  let text = strings[key] || key;
  for (const k in data) {
    let val = data[k];
    if (k === 'move') {
      const idx = MOVE_NAMES.indexOf(val);
      if (idx !== -1 && strings[`move${idx}`]) val = strings[`move${idx}`];
    }
    text = text.replace(`{${k}}`, val);
  }
  statusEl.textContent = text;
}

function makeTilePicker(targetEl) {
  targetEl.innerHTML = '';
  for (let value = 1; value <= 10; value++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick';
    if (TILE_IMAGES[value]) {
      const img = document.createElement('img');
      img.src = TILE_IMAGES[value];
      img.className = 'tile-icon';
      img.alt = String(value);
      img.draggable = false;
      btn.appendChild(img);
    } else {
      btn.textContent = String(value);
    }
    if (value === state.selectedTile) btn.classList.add('active');
    btn.setAttribute('aria-pressed', value === state.selectedTile ? 'true' : 'false');
    btn.addEventListener('click', () => {
      state.selectedTile = value;
      syncTilePickers();
    });
    targetEl.appendChild(btn);
  }
}

function syncTilePickers() {
  for (const container of [tilePickerEl]) {
    [...container.children].forEach((child, idx) => {
      child.classList.toggle('active', idx + 1 === state.selectedTile);
      child.setAttribute('aria-pressed', idx + 1 === state.selectedTile ? 'true' : 'false');
    });
  }
}

function cloneBoard(board) {
  return board.slice();
}

function compressLine(line) {
  const arr = line.filter(v => v !== 0);
  const compact = [];
  let score = 0;
  let elevens = 0;

  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
      const nextValue = arr[i] + 1;
      if (nextValue !== 11) {
        compact.push(nextValue);
        score += nextValue;
      } else {
        score += 11;
        elevens++;
      }
      i++;
    } else {
      compact.push(arr[i]);
    }
  }

  while (compact.length < 4) compact.push(0);
  return { line: compact, score, elevens };
}

function rows(board) {
  return [0, 1, 2, 3].map(r => board.slice(r * 4, r * 4 + 4));
}

function fromRows(r) {
  return r.flat();
}

function transpose(board) {
  const out = Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = board[r * 4 + c];
  return out;
}

function reverseRows(board) {
  return fromRows(rows(board).map(r => r.slice().reverse()));
}

function moveLeft(board) {
  const rs = rows(board);
  let moved = false;
  let score = 0;
  let elevens = 0;
  const out = rs.map(r => {
    const before = r.join(',');
    const res = compressLine(r);
    if (res.line.join(',') !== before) moved = true;
    score += res.score;
    elevens += res.elevens;
    return res.line;
  });
  return { board: fromRows(out), moved, score, elevens };
}

function moveRight(board) {
  const rev = reverseRows(board);
  const res = moveLeft(rev);
  return { board: reverseRows(res.board), moved: res.moved, score: res.score, elevens: res.elevens };
}

function moveUp(board) {
  const t = transpose(board);
  const res = moveLeft(t);
  return { board: transpose(res.board), moved: res.moved, score: res.score, elevens: res.elevens };
}

function moveDown(board) {
  const t = transpose(board);
  const rev = reverseRows(t);
  const res = moveLeft(rev);
  return { board: transpose(reverseRows(res.board)), moved: res.moved, score: res.score, elevens: res.elevens };
}

const MOVE_FNS = [moveLeft, moveRight, moveUp, moveDown];

function isBoardLocked(board) {
  return !MOVE_FNS.some((fn) => fn(board).moved);
}

function countLegalMoves(board) {
  let n = 0;
  for (const fn of MOVE_FNS) if (fn(board).moved) n++;
  return n;
}

// Enumerate every swap of two differently-valued tiles that unlocks the
// board. Each candidate carries the trial board so it can be scored in one
// batched call to the solver's real heuristic instead of a cheap stand-in.
function enumerateSwapCandidates(board) {
  const tiles = board.map((v, i) => ({ v, i })).filter((t) => t.v !== 0);
  const out = [];
  for (let a = 0; a < tiles.length; a++) {
    for (let b = a + 1; b < tiles.length; b++) {
      const { v: v1, i: i1 } = tiles[a];
      const { v: v2, i: i2 } = tiles[b];
      if (v1 === v2) continue; // swapping equal values changes nothing useful
      const trial = board.slice();
      trial[i1] = v2;
      trial[i2] = v1;
      if (isBoardLocked(trial)) continue;
      out.push({ i1, i2, v1, v2, trial });
    }
  }
  return out;
}

// Enumerate every single-tile removal that unlocks the board, each carrying
// its trial board for the same real-heuristic scoring pass.
function enumerateDeleteCandidates(board) {
  const tiles = board.map((v, i) => ({ v, i })).filter((t) => t.v !== 0);
  const out = [];
  for (const { v, i } of tiles) {
    const trial = board.slice();
    trial[i] = 0;
    if (isBoardLocked(trial)) continue;
    out.push({ i, v, trial });
  }
  return out;
}

// Picks the best rescue suggestion by (1) scoring every legal swap/delete
// candidate against the solver's real positional heuristic in a single
// batched worker call, then (2) running the actual expectimax + Monte Carlo
// search (the same one "Analyze" uses) on the resulting board for the top
// candidate of each kind, so the final pick — and which of swap/delete is
// marked as recommended — reflects the AI's genuine best judgment rather
// than a simplified stand-in.
async function computeRescueSuggestion(board) {
  if (!board.some(Boolean)) return { swap: null, delete: null, recommended: null };
  if (!isBoardLocked(board)) return { swap: null, delete: null, recommended: null };

  const swapCandidates = enumerateSwapCandidates(board);
  const deleteCandidates = enumerateDeleteCandidates(board);
  const allTrials = [...swapCandidates, ...deleteCandidates].map((c) => c.trial);

  if (!allTrials.length) return { swap: null, delete: null, recommended: null };

  let scores;
  try {
    const { results } = await state.evaluateCandidates(allTrials);
    scores = results;
  } catch (e) {
    scores = null; // solver unavailable — fall back to "more legal moves is better"
  }

  const scoreOf = (idx, trial) => scores
    ? scores[idx].score
    : countLegalMoves(trial) * 1000;

  let bestSwap = null;
  swapCandidates.forEach((c, idx) => {
    const score = scoreOf(idx, c.trial);
    if (!bestSwap || score > bestSwap.score) bestSwap = { ...c, score };
  });

  let bestDelete = null;
  deleteCandidates.forEach((c, idx) => {
    const score = scoreOf(swapCandidates.length + idx, c.trial);
    if (!bestDelete || score > bestDelete.score) bestDelete = { ...c, score };
  });

  // Confirm the top candidate(s) with the real search so the recommendation
  // is grounded in the same engine that drives "Analyze" / "Step best move".
  let swapSurvival = -Infinity;
  let deleteSurvival = -Infinity;
  try {
    if (bestSwap) {
      const r = await state.analyze(Uint8Array.from(bestSwap.trial));
      swapSurvival = Math.max(...r.recommendations.filter((m) => m.valid).map((m) => m.survivalScore), -Infinity);
    }
    if (bestDelete) {
      const r = await state.analyze(Uint8Array.from(bestDelete.trial));
      deleteSurvival = Math.max(...r.recommendations.filter((m) => m.valid).map((m) => m.survivalScore), -Infinity);
    }
  } catch (e) {
    // If the deep confirmation pass fails, fall back to the fast heuristic
    // scores already computed above rather than leaving no recommendation.
    swapSurvival = bestSwap ? bestSwap.score : -Infinity;
    deleteSurvival = bestDelete ? bestDelete.score : -Infinity;
  }

  let recommended = null;
  if (bestSwap && bestDelete) recommended = swapSurvival >= deleteSurvival ? 'swap' : 'delete';
  else if (bestSwap) recommended = 'swap';
  else if (bestDelete) recommended = 'delete';

  return { swap: bestSwap, delete: bestDelete, recommended };
}

function lineIndices(move, line) {
  switch (move) {
    case 0: return [line * 4, line * 4 + 1, line * 4 + 2, line * 4 + 3];
    case 1: return [line * 4 + 3, line * 4 + 2, line * 4 + 1, line * 4];
    case 2: return [line, line + 4, line + 8, line + 12];
    case 3: return [line + 12, line + 8, line + 4, line];
    default: return [];
  }
}

function buildMoveAnimation(board, move) {
  const instructions = [];
  const destinationCounts = new Map();

  for (let line = 0; line < 4; line++) {
    const indices = lineIndices(move, line);
    const tiles = indices
      .map((idx) => ({ idx, value: board[idx] }))
      .filter((tile) => tile.value !== 0);

    let target = 0;
    for (let i = 0; i < tiles.length; i++) {
      const current = tiles[i];
      const next = tiles[i + 1];
      const to = indices[target];

      if (next && current.value === next.value) {
        instructions.push({ from: current.idx, to, value: current.value, merging: true });
        instructions.push({ from: next.idx, to, value: next.value, merging: true });
        destinationCounts.set(to, (destinationCounts.get(to) || 0) + 2);
        i++;
      } else {
        instructions.push({ from: current.idx, to, value: current.value, merging: false });
        destinationCounts.set(to, (destinationCounts.get(to) || 0) + 1);
      }

      target++;
    }
  }

  const filtered = instructions.filter((item) => item.from !== item.to || (destinationCounts.get(item.to) || 0) > 1);
  const mergeDestinations = [...destinationCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([idx]) => idx);

  return { instructions: filtered, mergeDestinations };
}

function spawnMergeBurst(rect, layerRect) {
  const burst = document.createElement('div');
  burst.className = 'merge-burst';
  const size = rect.width * 1.25;
  burst.style.left = `${rect.left - layerRect.left + rect.width / 2 - size / 2}px`;
  burst.style.top = `${rect.top - layerRect.top + rect.height / 2 - size / 2}px`;
  burst.style.width = `${size}px`;
  burst.style.height = `${size}px`;
  return burst;
}

function triggerMergePops(indices) {
  if (!indices || !indices.length) return;
  const cells = [...boardEl.children];
  for (const idx of indices) {
    const cell = cells[idx];
    if (!cell) continue;
    cell.classList.remove('merge-pop');
    // Force reflow so the animation restarts even if it was just applied.
    void cell.offsetWidth;
    cell.classList.add('merge-pop');
    cell.addEventListener('animationend', () => cell.classList.remove('merge-pop'), { once: true });
  }
}

async function animateMoveTransition(fromBoard, moveIndex) {
  if (!moveLayerEl || !boardShellEl) return [];

  const { instructions, mergeDestinations } = buildMoveAnimation(fromBoard, moveIndex);
  if (!instructions.length) return [];

  state.hiddenIndices = new Set(instructions.map((item) => item.from));
  render();
  await nextFrame();

  const cells = [...boardEl.children];
  const layerRect = moveLayerEl.getBoundingClientRect();
  const fragments = [];

  for (const item of instructions) {
    const fromRect = cells[item.from].getBoundingClientRect();
    const toRect = cells[item.to].getBoundingClientRect();
    const tile = document.createElement('div');
    tile.className = `moving-tile v${Math.min(item.value, 12)}`;
    if (item.merging) tile.classList.add('merging-tile');
    if (TILE_IMAGES[item.value]) {
      const img = document.createElement('img');
      img.src = TILE_IMAGES[item.value];
      img.className = 'tile-icon';
      img.alt = String(item.value);
      img.draggable = false;
      tile.appendChild(img);
    } else {
      tile.textContent = displayValue(item.value);
    }
    tile.style.left = `${fromRect.left - layerRect.left}px`;
    tile.style.top = `${fromRect.top - layerRect.top}px`;
    tile.style.width = `${fromRect.width}px`;
    tile.style.height = `${fromRect.height}px`;
    tile.dataset.dx = String(toRect.left - fromRect.left);
    tile.dataset.dy = String(toRect.top - fromRect.top);
    fragments.push(tile);
    moveLayerEl.appendChild(tile);
  }

  await nextFrame();
  for (const tile of fragments) {
    tile.style.transform = `translate(${tile.dataset.dx}px, ${tile.dataset.dy}px)`;
  }

  // Fire the impact burst right as the slide lands.
  await sleep(state.animationMs);
  for (const idx of mergeDestinations) {
    const toRect = cells[idx].getBoundingClientRect();
    moveLayerEl.appendChild(spawnMergeBurst(toRect, layerRect));
  }
  // Let the short burst (~260ms) finish before cleanup.
  await sleep(260);

  moveLayerEl.innerHTML = '';
  state.hiddenIndices = null;
  return mergeDestinations;
}

async function ensureSolver() {
  if (state.worker) return;
  setStatus('statusLoading');

  try {
    // الـ solver بيتحمّل من Edge Function بعد التحقق من الـ JWT والاشتراك (مفيش ملف ثابت)
    if (window.axiomReady) await window.axiomReady;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('no session');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/solver-worker`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) throw new Error(`solver ${res.status}`);
    const workerUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'application/javascript' }));
    state.worker = new Worker(workerUrl);
    let nextRequestId = 1;
    const pending = new Map();

    state.worker.addEventListener('message', (event) => {
      const payload = event.data || {};
      const requestId = payload.requestId;
      if (!pending.has(requestId)) return;
      const handlers = pending.get(requestId);
      pending.delete(requestId);

      if (payload.type === 'result') {
        handlers.resolve(payload.data);
      } else {
        handlers.reject(new Error(payload.message || 'Worker error'));
      }
    });

    state.worker.addEventListener('error', (event) => {
      for (const { reject } of pending.values()) {
        reject(event.error || new Error(event.message || 'Worker error'));
      }
      pending.clear();
    });

    state.analyze = (cells) => new Promise((resolve, reject) => {
      const requestId = nextRequestId++;
      pending.set(requestId, { resolve, reject });
      state.worker.postMessage({
        type: 'analyze',
        board: Array.from(cells),
        requestId,
      });
    });

    // Fast batch scoring (no expectimax/Monte Carlo) used to rank many
    // candidate boards at once — e.g. every possible rescue swap/delete —
    // against the solver's real positional heuristic instead of a cheap
    // ad-hoc score.
    state.evaluateCandidates = (candidateBoards) => new Promise((resolve, reject) => {
      const requestId = nextRequestId++;
      pending.set(requestId, { resolve, reject });
      state.worker.postMessage({
        type: 'evaluateCandidates',
        candidates: candidateBoards.map((b) => Array.from(b)),
        requestId,
      });
    });

    setStatus('statusReady');
  } catch (err) {
    console.warn('AI Solver unavailable.', err);
    setStatus('statusSolverError');
  }
}

const SAVED_BOARD_KEY = 'axiom_saved_state';

function saveBoard() {
  try {
    const payload = {
      board: state.board,
      pendingBoard: state.pendingBoard,
      waitingForSpawn: state.waitingForSpawn,
      setupMode: state.setupMode,
      selectedTile: state.selectedTile,
      autoStepAfterSpawn: state.autoStepAfterSpawn,
      elevenCount: state.elevenCount,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVED_BOARD_KEY, JSON.stringify(payload));
    setStatus('statusSaved');
  } catch (e) {
    setStatus('statusSaveError');
  }
}

// Returns true if a valid saved board was found and restored into `state`.
function loadSavedBoard() {
  let raw;
  try {
    raw = localStorage.getItem(SAVED_BOARD_KEY);
  } catch (e) {
    return false;
  }
  if (!raw) return false;

  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.board) || data.board.length !== 16) return false;

    state.board = data.board;
    state.pendingBoard = Array.isArray(data.pendingBoard) && data.pendingBoard.length === 16
      ? data.pendingBoard
      : null;
    state.waitingForSpawn = !!data.waitingForSpawn;
    state.setupMode = typeof data.setupMode === 'boolean' ? data.setupMode : state.setupMode;
    state.selectedTile = Number.isInteger(data.selectedTile) ? data.selectedTile : state.selectedTile;
    state.autoStepAfterSpawn = typeof data.autoStepAfterSpawn === 'boolean'
      ? data.autoStepAfterSpawn
      : state.autoStepAfterSpawn;
    state.elevenCount = Number.isInteger(data.elevenCount)
      ? Math.min(Math.max(data.elevenCount, 0), 3)
      : 0;
    state.history = [];
    return true;
  } catch (e) {
    return false;
  }
}

function pushHistory() {
  state.history.push({
    board: cloneBoard(state.board),
    pendingBoard: state.pendingBoard ? cloneBoard(state.pendingBoard) : null,
    waitingForSpawn: state.waitingForSpawn,
    elevenCount: state.elevenCount,
  });
  // Keep history to max 20 states to avoid memory issues
  if (state.history.length > 20) {
    state.history.shift();
  }
}

function undoMove() {
  if (state.animating || state.history.length === 0) return;
  const prev = state.history.pop();
  state.board = prev.board;
  state.pendingBoard = prev.pendingBoard;
  state.waitingForSpawn = prev.waitingForSpawn;
  state.elevenCount = prev.elevenCount ?? state.elevenCount;
  renderElevenStars();
  clearRescueUI();
  rescueCardEl?.classList.remove('visible');
  render();
  if (state.waitingForSpawn) {
    setStatus('statusWaitingSpawn');
  } else {
    setStatus('statusReady');
  }
}

function directionToIndex(direction) {
  return { left: 0, right: 1, up: 2, down: 3 }[direction] ?? -1;
}

function adaptWorkerResult(result) {
  const moves = (result.recommendations || []).map((entry) => ({
    move: directionToIndex(entry.direction),
    legal: !!entry.valid,
    score: Number(entry.survivalScore || 0),
    expectimaxScore: Number(entry.expectimaxScore || 0),
    monteCarloSurvival: Number(entry.monteCarloSurvival || 0),
  }));

  return {
    moves,
    bestMove: directionToIndex(result.bestMove),
    confidence: Number(result.confidence || 0),
  };
}

function refreshScores(data, elapsedMs) {
  const strings = TRANSLATIONS[state.lang];
  scoresEl.innerHTML = '';

  for (const move of data.moves) {
    const row = document.createElement('div');
    row.className = 'score-row';
    const moveName = strings[`move${move.move}`] || MOVE_NAMES[move.move] || strings.noneMove;
    const scoreText = move.legal
      ? (move.monteCarloSurvival > 0
          ? `${move.score.toFixed(1)} · E ${move.expectimaxScore.toFixed(1)} · MC ${move.monteCarloSurvival.toFixed(1)}`
          : `${Math.round(move.score).toLocaleString('en-US')}`)
      : strings.naScore;
    row.innerHTML = `<span>${moveName}</span><span>${scoreText}</span>`;
    if (move.move === data.bestMove) row.classList.add('best');
    scoresEl.appendChild(row);
  }

  chosenMoveEl.textContent = data.bestMove >= 0 ? (strings[`move${data.bestMove}`] || MOVE_NAMES[data.bestMove]) : strings.noneMove;
  renderSelectedDirection(data.bestMove);
}

async function analyzeBoard() {
  await ensureSolver();
  if (!state.board.some(Boolean)) {
    setStatus('statusEmpty');
    return null;
  }

  const started = performance.now();
  const rawResult = await state.analyze(Uint8Array.from(state.board));
  const elapsed = performance.now() - started;
  const result = adaptWorkerResult(rawResult);
  refreshScores(result, elapsed);
  setStatus('statusAnalysis', { time: elapsed.toFixed(1) });
  return result;
}

async function stepBestMove() {
  if (state.animating) return;
  if (state.waitingForSpawn) {
    setStatus('statusWaitingSpawn');
    return;
  }
  const result = await analyzeBoard();
  if (!result || result.bestMove < 0) {
    setStatus('statusNoMove');
    return;
  }

  // Find the best legal move (fallback if AI's top pick is illegal)
  let moveIndex = result.bestMove;
  const bestLegalMove = result.moves.find(m => m.move === moveIndex && m.legal);
  if (!bestLegalMove) {
    // AI's top pick is illegal; pick the highest-scoring legal move
    const legalMoves = result.moves.filter(m => m.legal);
    if (legalMoves.length === 0) {
      setStatus('statusNoMove');
      return;
    }
    legalMoves.sort((a, b) => b.score - a.score);
    moveIndex = legalMoves[0].move;
  }

  pushHistory();
  const move = MOVE_FNS[moveIndex](state.board);
  if (!move.moved) {
    // Shouldn't happen since we checked legal, but guard anyway
    setStatus('statusNoMove');
    return;
  }
  state.animating = true;
  const mergeDestinations = await animateMoveTransition(state.board, moveIndex);
  state.pendingBoard = move.board;
  state.animating = false;
  state.waitingForSpawn = true;
  render();
  triggerMergePops(mergeDestinations);
  registerElevenMerges(move.elevens);
  setStatus('statusApplied', { move: MOVE_NAMES[moveIndex] });
}

// Tapping a cell opens the beast chooser sheet; the chosen beast is then applied.
function onCellClick(index) {
  if (state.setupMode) {
    if (state.animating) return;
    openTileSheet(index);
    return;
  }

  if (!state.waitingForSpawn || !state.pendingBoard) return;
  if (state.pendingBoard[index] !== 0) return;
  openTileSheet(index);
}

// value === 0 clears the cell (setup mode only).
function applyCellTile(index, value) {
  if (state.setupMode) {
    if (state.animating) return;
    pushHistory();
    state.board[index] = value;
    render();
    return;
  }

  if (!state.waitingForSpawn || !state.pendingBoard || !value) return;
  if (state.pendingBoard[index] !== 0) return;
  pushHistory();
  state.pendingBoard[index] = value;
  state.board = cloneBoard(state.pendingBoard);
  state.pendingBoard = null;
  state.waitingForSpawn = false;
  render();

  if (state.autoStepAfterSpawn) {
    setStatus('statusSpawnedAuto');
    queueAutoStepAfterSpawn();
  } else {
    setStatus('statusSpawnedManual');
  }
}

// ---------- Beast chooser sheet ----------
const tileSheetEl = document.getElementById('tileSheet');
const tileSheetPanelEl = document.getElementById('tileSheetPanel');
const tileSheetGridEl = document.getElementById('tileSheetGrid');
const tileSheetClearEl = document.getElementById('tileSheetClear');
const tileSheetTitleEl = document.getElementById('tileSheetTitle');
const tileSheetCloseEl = document.getElementById('tileSheetClose');
const tileSheetDragEl = document.getElementById('tileSheetDrag');

const SHEET_STRINGS = {
  ar: { title: 'اختر الوحش', clear: 'إفراغ الخلية', close: 'إغلاق' },
  en: { title: 'Choose a beast', clear: 'Clear cell', close: 'Close' },
};

let sheetTarget = -1;
let sheetHideTimer = 0;

function buildTileSheet() {
  if (!tileSheetGridEl) return;
  tileSheetGridEl.innerHTML = '';
  for (let value = 1; value <= 10; value++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sheet-tile';
    btn.dataset.value = String(value);
    btn.style.setProperty('--i', String(value - 1));
    btn.setAttribute('aria-label', String(value));
    if (TILE_IMAGES[value]) {
      const img = document.createElement('img');
      img.src = TILE_IMAGES[value];
      img.className = 'tile-icon';
      img.alt = '';
      img.draggable = false;
      btn.appendChild(img);
    }
    const num = document.createElement('span');
    num.className = 'sheet-num';
    num.textContent = String(value);
    btn.appendChild(num);
    btn.addEventListener('click', () => chooseSheetTile(value));
    tileSheetGridEl.appendChild(btn);
  }
}

function openTileSheet(index) {
  if (!tileSheetEl) return;
  window.clearTimeout(sheetHideTimer);
  closeSheetTargetMark();
  sheetTarget = index;

  const strings = SHEET_STRINGS[state.lang] || SHEET_STRINGS.en;
  tileSheetTitleEl.textContent = strings.title;
  tileSheetClearEl.textContent = strings.clear;
  tileSheetCloseEl.setAttribute('aria-label', strings.close);

  const source = state.pendingBoard ?? state.board;
  const current = source[index] || 0;
  // Highlight the cell's current beast, or the last one used for empty cells.
  const highlight = current || state.selectedTile;
  let activeBtn = null;
  for (const btn of tileSheetGridEl.children) {
    const on = Number(btn.dataset.value) === highlight;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) activeBtn = btn;
  }

  tileSheetClearEl.hidden = !(state.setupMode && current !== 0);

  if (cellEls && cellEls[index]) cellEls[index].dataset.targeted = '1';
  tileSheetPanelEl.style.transform = '';
  tileSheetEl.classList.remove('instant');
  tileSheetEl.hidden = false;
  document.body.classList.add('sheet-open');
  void tileSheetEl.offsetWidth; // flush so the open transition plays
  tileSheetEl.classList.add('open');
  (activeBtn || tileSheetGridEl.firstElementChild)?.focus({ preventScroll: true });
}

function closeSheetTargetMark() {
  if (!cellEls) return;
  for (const c of cellEls) delete c.dataset.targeted;
}

function closeTileSheet(restoreFocus = true, instant = false) {
  if (!tileSheetEl || tileSheetEl.hidden) return;
  const idx = sheetTarget;
  tileSheetEl.classList.remove('open');
  tileSheetPanelEl.classList.remove('dragging');
  tileSheetPanelEl.style.transform = '';
  document.body.classList.remove('sheet-open');
  closeSheetTargetMark();
  sheetTarget = -1;
  window.clearTimeout(sheetHideTimer);
  if (instant) {
    tileSheetEl.classList.add('instant');
    tileSheetEl.hidden = true;
  } else {
    sheetHideTimer = window.setTimeout(() => { tileSheetEl.hidden = true; }, 190);
  }
  if (restoreFocus && cellEls && cellEls[idx]) cellEls[idx].focus({ preventScroll: true });
}

function chooseSheetTile(value) {
  const idx = sheetTarget;
  if (idx < 0) return;
  state.selectedTile = value;
  syncTilePickers();
  closeTileSheet(false, true);
  applyCellTile(idx, value);
}

function initTileSheet() {
  if (!tileSheetEl) return;
  buildTileSheet();

  tileSheetEl.querySelectorAll('[data-sheet-close]').forEach(el =>
    el.addEventListener('click', () => closeTileSheet()));

  tileSheetClearEl.addEventListener('click', () => {
    const idx = sheetTarget;
    if (idx < 0) return;
    closeTileSheet(false, true);
    applyCellTile(idx, 0);
  });

  document.addEventListener('keydown', (e) => {
    if (tileSheetEl.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeTileSheet(); return; }
    if (e.key === 'Tab') {
      const items = [...tileSheetEl.querySelectorAll('button:not([hidden])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe down on the handle/header to dismiss (mobile).
  let startY = 0, dragging = false, dy = 0;
  tileSheetDragEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (window.matchMedia('(min-width: 700px)').matches) return;
    dragging = true; startY = e.clientY; dy = 0;
    tileSheetPanelEl.classList.add('dragging');
    tileSheetDragEl.setPointerCapture(e.pointerId);
  });
  tileSheetDragEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    tileSheetPanelEl.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    tileSheetPanelEl.classList.remove('dragging');
    if (dy > 90) closeTileSheet();
    else tileSheetPanelEl.style.transform = '';
  };
  tileSheetDragEl.addEventListener('pointerup', endDrag);
  tileSheetDragEl.addEventListener('pointercancel', endDrag);
}

function resetBoard() {
  state.board = Array(16).fill(0);
  state.pendingBoard = null;
  state.waitingForSpawn = false;
  state.history = [];
  scoresEl.innerHTML = '';
  chosenMoveEl.textContent = '—';
  renderSelectedDirection(-1);
  state.hiddenIndices = null;
  clearRescueUI();
  state.elevenCount = 0;
  renderElevenStars();
  rescueCardEl?.classList.remove('visible');
  setStatus('statusCleared');
  render();
}

function toggleMode() {
  state.setupMode = !state.setupMode;
  const strings = TRANSLATIONS[state.lang];
  btnMode.textContent = state.setupMode ? strings.btnModePlay : strings.btnModeSetup;
  setStatus(state.setupMode ? 'statusSetupMode' : 'statusPlayMode');
  clearRescueUI();
  rescueCardEl?.classList.remove('visible');
  render();
}

function init() {
  if (!boardEl || !btnAnalyze) {
    console.warn('UI elements missing; init skipped.');
    return;
  }

  const restored = loadSavedBoard();

  btnAnalyze.addEventListener('click', analyzeBoard);
  btnStep.addEventListener('click', stepBestMove);
  btnReset.addEventListener('click', resetBoard);
  btnMode.addEventListener('click', toggleMode);

  if (toggleAutoStepAfterSpawn) {
    toggleAutoStepAfterSpawn.checked = state.autoStepAfterSpawn;
    toggleAutoStepAfterSpawn.addEventListener('change', (e) => {
      state.autoStepAfterSpawn = e.target.checked;
    });
  }

  makeTilePicker(tilePickerEl);
  syncTilePickers();
  initTileSheet();
  renderSelectedDirection(-1);
  renderElevenStars();
  render();
  ensureSolver();

  if (btnUndo) {
    btnUndo.addEventListener('click', undoMove);
  }

  if (btnSave) {
    btnSave.addEventListener('click', saveBoard);
  }

  if (btnRescue) {
    btnRescue.addEventListener('click', runRescueAssistant);
  }
  if (btnRescueSwap) {
    btnRescueSwap.addEventListener('click', () => applyRescueSuggestion('swap'));
  }
  if (btnRescueDelete) {
    btnRescueDelete.addEventListener('click', () => applyRescueSuggestion('delete'));
  }

  updateLanguage(state.lang);
  if (restored) {
    setStatus('statusLoadedSaved');
  }
}

// Support both direct script loading and asynchronous loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}