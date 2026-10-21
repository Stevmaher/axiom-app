/* Axiom — النقاط · الأعلى · الحركات · أقوى · سجل الحدث · ترتيب اللاعبين
 * مأخوذة من فكرة Apex ومبنية لتعمل فوق Axiom بدون تعديل app.js.
 * مربوط بـ app.js عبر ثلاث استدعاءات: onMove(score, elevens) · onUndo(undidMove) · onReset().
 */
(function () {
  'use strict';

  var EV_DAYS = 5, TARGET = 11;
  var $ = function (id) { return document.getElementById(id); };

  /* ───────── اللغة ───────── */
  var TXT = {
    ar: { score: 'النقاط', best: 'الأعلى', moves: 'الحركات ✎', top: 'أقوى', lv: 'مستوى ',
      evTitle: 'سجل الحدث', evSub: 'عدد الـ11 في كل يوم · يبدأ تلقائياً من أول حركة',
      day: 'يوم ', today: 'اليوم', past: 'مضى',
      evStart: 'يبدأ اليوم 1 تلقائياً مع أول حركة', evEnd: 'انتهى الحدث · المجموع ',
      evOver: 'انتهى الحدث — لم يُسجَّل', evProg: function (c, a) { return 'اليوم ' + c + ' من ' + EV_DAYS + ' · المتوسط ' + a + ' يومياً'; },
      lbTitle: 'ترتيب اللاعبين', lbSub: 'عدد وحوش 11 التي وصل إليها كل لاعب', refresh: 'تحديث',
      tToday: 'اليوم', tAll: 'الحدث كله', needLogin: 'سجّل دخولك بحساب لتظهر في الترتيب',
      loading: 'جارٍ التحميل…', fail: 'تعذّر تحميل الترتيب', empty: 'لا يوجد أحد بعد — كن الأول! 🏆',
      editMoves: 'عدد الحركات الجديد', got11: '🏆 وحش 11 جديد!' },
    en: { score: 'Score', best: 'Best', moves: 'Moves ✎', top: 'Top', lv: 'Lv ',
      evTitle: 'Event log', evSub: 'Number of 11s per day · starts at your first move',
      day: 'Day ', today: 'today', past: 'past',
      evStart: 'Day 1 starts automatically with your first move', evEnd: 'Event ended · total ',
      evOver: 'Event ended — not recorded', evProg: function (c, a) { return 'Day ' + c + ' of ' + EV_DAYS + ' · avg ' + a + ' per day'; },
      lbTitle: 'Leaderboard', lbSub: 'How many 11s each player reached', refresh: 'Refresh',
      tToday: 'Today', tAll: 'Whole event', needLogin: 'Log in to appear on the leaderboard',
      loading: 'Loading…', fail: 'Could not load the leaderboard', empty: 'Nobody yet — be the first! 🏆',
      editMoves: 'New move count', got11: '🏆 New 11!' }
  };
  function lang() { return ((document.documentElement.lang || 'ar').slice(0, 2) === 'en') ? 'en' : 'ar'; }
  function T(k) { return TXT[lang()][k]; }
  function nf(n) { return Number(n).toLocaleString(lang() === 'en' ? 'en' : 'ar'); }

  /* ───────── قراءة اللوحة (للمستوى الأقوى فقط) ───────── */
  function currentBoard() {
    try { if (typeof state !== 'undefined' && state) return state.pendingBoard || state.board; } catch (e) {}
    return null;
  }
  function maxLevel() {
    var b = currentBoard(); if (!b || !b.length) return 0;
    return Math.max.apply(null, Array.prototype.slice.call(b).concat([0]));
  }

  /* ───────── الحالة والتخزين ───────── */
  var uid = 'guest', st = null;
  function key(k) { return 'axiom:' + uid + ':' + k; }
  function todayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function evDay() {
    if (!st.ev.start) return 0;
    var a = st.ev.start.split('-').map(Number), n = new Date();
    return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(a[0], a[1] - 1, a[2])) / 864e5) + 1;
  }
  function load() {
    st = { score: 0, moves: 0, best: 0, ev: { start: null, counts: [0, 0, 0, 0, 0] } };
    try {
      var o = JSON.parse(localStorage.getItem(key('stats')) || 'null');
      if (o) {
        st.score = o.score | 0; st.moves = o.moves | 0; st.best = o.best | 0;
        if (o.ev) { st.ev.start = o.ev.start || null; for (var i = 0; i < EV_DAYS; i++) st.ev.counts[i] = parseInt((o.ev.counts || [])[i]) || 0; }
      }
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(key('stats'), JSON.stringify(st)); } catch (e) {} }

  /* ───────── الرسم ───────── */
  function renderStats() {
    var set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    set('axsLScore', T('score')); set('axsLBest', T('best')); set('axsLMoves', T('moves')); set('axsLTop', T('top'));
    set('axsScore', nf(st.score)); set('axsBest', nf(st.best)); set('axsMoves', nf(st.moves));
    var m = maxLevel(); set('axsTop', m ? (m >= TARGET ? '★ ' : '') + T('lv') + nf(m) : '—');
  }
  function renderEvent() {
    var box = $('axsEvDays'); if (!box) return;
    $('axsEvTitle').textContent = T('evTitle'); $('axsEvSub').textContent = T('evSub');
    var cur = evDay(), max = Math.max.apply(null, [1].concat(st.ev.counts)), total = st.ev.counts.reduce(function (a, b) { return a + b; }, 0);
    box.textContent = '';
    for (var i = 0; i < EV_DAYS; i++) {
      var n = st.ev.counts[i], isToday = cur === i + 1, future = (!cur || cur < i + 1) && !isToday;
      var row = document.createElement('div'); row.className = 'axs-day' + (isToday ? ' today' : '') + (future && !n ? ' future' : '');
      var d = document.createElement('div'); d.className = 'axs-d'; d.textContent = T('day') + nf(i + 1);
      var sm = document.createElement('small'); sm.textContent = isToday ? T('today') : (cur > i + 1 ? T('past') : ''); d.appendChild(sm);
      var bar = document.createElement('div'); bar.className = 'axs-bar'; var fill = document.createElement('i'); fill.style.width = (100 * n / max).toFixed(0) + '%'; bar.appendChild(fill);
      var num = document.createElement('div'); num.className = 'axs-n'; num.textContent = nf(n);
      row.appendChild(d); row.appendChild(bar); row.appendChild(num); box.appendChild(row);
    }
    $('axsEvTotal').textContent = nf(total) + ' × 11';
    var s = $('axsEvSum');
    s.textContent = cur === 0 ? T('evStart') : cur > EV_DAYS ? T('evEnd') + nf(total)
      : T('evProg')(nf(cur), nf(+(total / Math.max(1, Math.min(cur, EV_DAYS))).toFixed(1)));
  }
  function renderStatic() {
    var s = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    s('axsLbTitle', T('lbTitle')); s('axsLbSub', T('lbSub')); s('axsLbRef', T('refresh'));
    s('axsLbT1', T('tToday')); s('axsLbT0', T('tAll'));
  }
  function renderAll() { renderStats(); renderEvent(); renderStatic(); }

  var toastT = 0;
  function toast(msg) {
    var t = $('axsToast');
    if (!t) { t = document.createElement('div'); t.id = 'axsToast'; t.className = 'axs-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ───────── Supabase ───────── */
  var own = null;
  function client() {
    var c = [
      function () { return typeof sb !== 'undefined' ? sb : null; },
      function () { return typeof supabaseClient !== 'undefined' ? supabaseClient : null; },
      function () { return typeof _supabase !== 'undefined' ? _supabase : null; },
      function () { return window.sb; }, function () { return window.supabaseClient; },
      function () { return window.axiomSupabase; }, function () { return window.supabase; }
    ];
    for (var i = 0; i < c.length; i++) {
      try { var x = c[i](); if (x && x.auth && typeof x.rpc === 'function') return x; } catch (e) {}
    }
    var url = window.SUPABASE_URL || (window.AXIOM_CONFIG && window.AXIOM_CONFIG.url),
        key = window.SUPABASE_ANON_KEY || window.SUPABASE_KEY || (window.AXIOM_CONFIG && window.AXIOM_CONFIG.anonKey);
    if (!own && url && key && window.supabase && window.supabase.createClient) own = window.supabase.createClient(url, key);
    return own;
  }
  function session() {
    var c = client(); if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (r) { return (r.data && r.data.session) || null; }, function () { return null; });
  }
  function uploadEleven(day) {
    session().then(function (ses) {
      if (!ses) return;
      return client().rpc('axiom_record_eleven', { p_day: day, p_moves: st.moves | 0, p_score: st.score | 0 });
    }).catch(function () {});
  }

  var lbDay = 1, lbBusy = false;
  function lbRow(box, x, me) {
    var d = document.createElement('div'); d.className = 'axs-lbrow' + (me ? ' me' : '');
    var a = document.createElement('span'); a.className = 'axs-pos'; a.textContent = nf(x.pos);
    var b = document.createElement('span'); b.className = 'axs-name'; b.textContent = x.username;
    var c = document.createElement('span'); c.className = 'axs-ln'; c.textContent = '🏆 ' + nf(x.elevens);
    d.appendChild(a); d.appendChild(b); d.appendChild(c); box.appendChild(d);
  }
  function lbMsg(box, t) { box.textContent = ''; var d = document.createElement('div'); d.className = 'axs-empty'; d.textContent = t; box.appendChild(d); }
  function lbLoad() {
    var box = $('axsLbList'); if (!box || lbBusy) return;
    lbBusy = true;
    session().then(function (ses) {
      if (!ses) { lbMsg(box, T('needLogin')); lbBusy = false; return; }
      lbMsg(box, T('loading'));
      var day = lbDay ? (evDay() || null) : null;
      return client().rpc('axiom_leaderboard', { p_day: day }).then(function (r) {
        lbBusy = false;
        if (r.error) { lbMsg(box, T('fail')); return; }
        var rows = r.data || [];
        if (!rows.length) { lbMsg(box, T('empty')); return; }
        var myId = ses.user && ses.user.id; box.textContent = '';
        rows.slice(0, 10).forEach(function (x) { lbRow(box, x, x.is_me); });
        var me = rows.find(function (x) { return x.is_me; });
        if (me && me.pos > 10) lbRow(box, me, true);
      });
    }).catch(function () { lbBusy = false; lbMsg(box, T('fail')); });
  }
  function lbTab(d) {
    lbDay = d;
    $('axsLbT1').classList.toggle('on', d === 1); $('axsLbT0').classList.toggle('on', d === 0);
    lbLoad();
  }

  /* ───────── منطق اللعب (يُستدعى من app.js) ───────── */
  var hist = [];
  function recordEleven() {
    var d = evDay();
    if (d < 1 || d > EV_DAYS) { if (d > EV_DAYS) toast(T('evOver')); return; }
    st.ev.counts[d - 1]++; toast(T('got11')); uploadEleven(d);
  }
  function onMove(gain, elevens) {
    if (!st.ev.start) st.ev.start = todayKey();           // أول حركة = اليوم 1
    hist.push({ score: st.score, moves: st.moves });
    if (hist.length > 40) hist.shift();
    st.moves++; st.score += (gain | 0);
    if (st.score > st.best) st.best = st.score;
    for (var i = 0; i < (elevens | 0); i++) recordEleven();
    save(); renderAll();
  }
  function onUndo(undidMove) {
    if (undidMove && hist.length) { var h = hist.pop(); st.score = h.score; st.moves = h.moves; save(); }
    renderAll();
  }
  function onReset() { st.score = 0; st.moves = 0; hist.length = 0; save(); renderAll(); }
  var lastMax = -1;
  function tick() { var m = maxLevel(); if (m !== lastMax) { lastMax = m; renderStats(); } }

  /* ───────── تشغيل ───────── */
  function init() {
    if (!$('axsStats')) return;
    load(); renderAll();
    var ms = $('axsMovesBox');
    if (ms) ms.addEventListener('click', function () {
      var v = prompt(T('editMoves'), st.moves); if (v === null) return;
      v = parseInt(v); if (isNaN(v) || v < 0) return;
      st.moves = v; save(); renderStats();
    });
    $('axsLbT1').addEventListener('click', function () { lbTab(1); });
    $('axsLbT0').addEventListener('click', function () { lbTab(0); });
    $('axsLbRef').addEventListener('click', lbLoad);

    setInterval(tick, 300);
    new MutationObserver(renderAll).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });

    session().then(function (ses) {
      var id = ses && ses.user && ses.user.id;
      if (id && id !== uid) { uid = id; load(); hist.length = 0; renderAll(); }
      lbLoad();
    });
    var c = client();
    if (c && c.auth && c.auth.onAuthStateChange) c.auth.onAuthStateChange(function () { setTimeout(lbLoad, 300); });
  }

  window.AxiomStats = { onMove: onMove, onUndo: onUndo, onReset: onReset, reload: lbLoad };
  load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
