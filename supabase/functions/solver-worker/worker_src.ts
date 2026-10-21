export const WORKER_SRC: string = String.raw`// Apex engine (verbatim logic, comments stripped) + AXIOM message bridge. Full commented source: solver_worker.source.js
var ENG = (function(){
  var P = {
    empty: 270, merges: 700, monoW: 47, monoP: 4, sumW: 11, sumP: 3.5, lost: 200000,
    deadPerim: 0, deadComp: 0, deadClus: 0, deadCorner: 0,
    c11: 0,          // value of each 11 on the board (leaf)
    d11: 0,          // extra value per 11 when the position is lost
    deadVal: 0,      // base value of a lost position
    cprob: 0.0001
  };
  var LEFT = new Uint16Array(65536), RIGHT = new Uint16Array(65536);
  var HROW = new Float64Array(65536), MASK11 = new Uint8Array(16 * 16 * 16 * 16);
  var DEADPEN = new Float64Array(65536);
  var POP = new Uint8Array(65536);
  var P1 = 0.9, P2 = 0.1;
  function rev(idx){ return ((idx & 15) << 12) | (((idx >> 4) & 15) << 8) | (((idx >> 8) & 15) << 4) | (idx >> 12); }
  function buildMoveTables(){
    for(var idx = 0; idx < 65536; idx++){
      var t = [], v;
      for(var k = 0; k < 4; k++){ v = (idx >> (4 * k)) & 15; if(v) t.push(v); }
      var out = [], i = 0;
      while(i < t.length){
        if(i + 1 < t.length && t[i] === t[i + 1] && t[i] < 11){ out.push(t[i] + 1); i += 2; }
        else { out.push(t[i]); i++; }
      }
      while(out.length < 4) out.push(0);
      LEFT[idx] = out[0] | (out[1] << 4) | (out[2] << 8) | (out[3] << 12);
    }
    for(idx = 0; idx < 65536; idx++) RIGHT[idx] = rev(LEFT[rev(idx)]);
    for(idx = 0; idx < 65536; idx++){ var p = 0, x = idx; while(x){ p += x & 1; x >>= 1; } POP[idx] = p; }
  }
  function buildHeuristic(){
    for(var idx = 0; idx < 65536; idx++){
      var r = [idx & 15, (idx >> 4) & 15, (idx >> 8) & 15, (idx >> 12) & 15];
      var mk = 0; for(var q = 0; q < 4; q++) if(r[q] === 11) mk |= (1 << q);
      MASK11[idx] = mk;
      var sum = 0, empty = 0, merges = 0, prev = 0, counter = 0;
      for(var i = 0; i < 4; i++){
        var rank = r[i];
        sum += Math.pow(rank, P.sumP);
        if(rank === 0){ empty++; }
        else {
          if(prev === rank){ if(rank < 11) counter++; }
          else if(counter > 0){ merges += 1 + counter; counter = 0; }
          prev = rank;
        }
      }
      if(counter > 0) merges += 1 + counter;
      var ml = 0, mr = 0;
      for(i = 1; i < 4; i++){
        if(r[i - 1] > r[i]) ml += Math.pow(r[i - 1], P.monoP) - Math.pow(r[i], P.monoP);
        else mr += Math.pow(r[i], P.monoP) - Math.pow(r[i - 1], P.monoP);
      }
      HROW[idx] = P.lost + P.empty * empty + P.merges * merges - P.monoW * Math.min(ml, mr) - P.sumW * sum;
    }
  }
  function buildDeadPenalty(){
    var CORNERS = (1 << 0) | (1 << 3) | (1 << 12) | (1 << 15);
    function comps(maskSet){
      var seen = 0, n = 0;
      for(var s = 0; s < 16; s++){
        if(!((maskSet >> s) & 1) || ((seen >> s) & 1)) continue;
        n++; var st = [s]; seen |= (1 << s);
        while(st.length){
          var c = st.pop(), r = (c / 4) | 0, col = c % 4, nb = [];
          if(r > 0) nb.push(c - 4); if(r < 3) nb.push(c + 4); if(col > 0) nb.push(c - 1); if(col < 3) nb.push(c + 1);
          for(var j = 0; j < nb.length; j++){ var d = nb[j]; if(((maskSet >> d) & 1) && !((seen >> d) & 1)){ seen |= (1 << d); st.push(d); } }
        }
      }
      return n;
    }
    for(var m = 0; m < 65536; m++){
      if(m === 0){ DEADPEN[m] = 0; continue; }
      var perim = 0;
      for(var c = 0; c < 16; c++){
        if(!((m >> c) & 1)) continue;
        var r = (c / 4) | 0, col = c % 4;
        if(r > 0 && !((m >> (c - 4)) & 1)) perim++;
        if(r < 3 && !((m >> (c + 4)) & 1)) perim++;
        if(col > 0 && !((m >> (c - 1)) & 1)) perim++;
        if(col < 3 && !((m >> (c + 1)) & 1)) perim++;
      }
      var free = (~m) & 0xFFFF;
      var cf = free ? comps(free) : 1, cd = comps(m);
      DEADPEN[m] = P.deadPerim * perim + P.deadComp * Math.max(0, cf - 1) + P.deadClus * (cd - 1) + ((m & CORNERS) ? 0 : P.deadCorner);
    }
  }
  function move(b, dir, o){
    var changed = false, i, c, idx, res;
    if(dir === 0){
      for(i = 0; i < 16; i += 4){
        idx = b[i] | (b[i + 1] << 4) | (b[i + 2] << 8) | (b[i + 3] << 12); res = LEFT[idx]; if(res !== idx) changed = true;
        o[i] = res & 15; o[i + 1] = (res >> 4) & 15; o[i + 2] = (res >> 8) & 15; o[i + 3] = res >> 12;
      }
    } else if(dir === 1){
      for(i = 0; i < 16; i += 4){
        idx = b[i] | (b[i + 1] << 4) | (b[i + 2] << 8) | (b[i + 3] << 12); res = RIGHT[idx]; if(res !== idx) changed = true;
        o[i] = res & 15; o[i + 1] = (res >> 4) & 15; o[i + 2] = (res >> 8) & 15; o[i + 3] = res >> 12;
      }
    } else if(dir === 2){
      for(c = 0; c < 4; c++){
        idx = b[c] | (b[c + 4] << 4) | (b[c + 8] << 8) | (b[c + 12] << 12); res = LEFT[idx]; if(res !== idx) changed = true;
        o[c] = res & 15; o[c + 4] = (res >> 4) & 15; o[c + 8] = (res >> 8) & 15; o[c + 12] = res >> 12;
      }
    } else {
      for(c = 0; c < 4; c++){
        idx = b[c] | (b[c + 4] << 4) | (b[c + 8] << 8) | (b[c + 12] << 12); res = RIGHT[idx]; if(res !== idx) changed = true;
        o[c] = res & 15; o[c + 4] = (res >> 4) & 15; o[c + 8] = (res >> 8) & 15; o[c + 12] = res >> 12;
      }
    }
    return changed;
  }
  function evalBoard(b){
    var r0 = b[0] | (b[1] << 4) | (b[2] << 8) | (b[3] << 12),
        r1 = b[4] | (b[5] << 4) | (b[6] << 8) | (b[7] << 12),
        r2 = b[8] | (b[9] << 4) | (b[10] << 8) | (b[11] << 12),
        r3 = b[12] | (b[13] << 4) | (b[14] << 8) | (b[15] << 12),
        c0 = b[0] | (b[4] << 4) | (b[8] << 8) | (b[12] << 12),
        c1 = b[1] | (b[5] << 4) | (b[9] << 8) | (b[13] << 12),
        c2 = b[2] | (b[6] << 4) | (b[10] << 8) | (b[14] << 12),
        c3 = b[3] | (b[7] << 4) | (b[11] << 8) | (b[15] << 12);
    var s = HROW[r0] + HROW[r1] + HROW[r2] + HROW[r3] + HROW[c0] + HROW[c1] + HROW[c2] + HROW[c3];
    var mask = MASK11[r0] | (MASK11[r1] << 4) | (MASK11[r2] << 8) | (MASK11[r3] << 12);
    if(mask) s += P.c11 * POP[mask] - DEADPEN[mask];
    return s;
  }
  function lostValue(b){
    var n = 0; for(var i = 0; i < 16; i++) if(b[i] === 11) n++;
    return P.deadVal + P.d11 * n;
  }
  var TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  var ttLo = new Int32Array(TT_SIZE), ttHi = new Int32Array(TT_SIZE), ttVal = new Float64Array(TT_SIZE),
      ttDepth = new Int8Array(TT_SIZE), ttStamp = new Uint32Array(TT_SIZE);
  var stamp = 1;
  var scratch = [], emps = [];
  for(var dd = 0; dd < 24; dd++){ scratch.push(new Uint8Array(16)); emps.push(new Uint8Array(16)); }
  var nodes = 0, deadline = 0, aborted = false, CPROB = 0.0001;
  function chanceNode(b, depth, cprob){
    if(depth <= 0 || cprob < CPROB) return evalBoard(b);
    if((++nodes & 2047) === 0 && deadline && Date.now() > deadline) aborted = true;
    if(aborted) return 0;
    var lo = b[0] | (b[1] << 4) | (b[2] << 8) | (b[3] << 12) | (b[4] << 16) | (b[5] << 20) | (b[6] << 24) | (b[7] << 28);
    var hi = b[8] | (b[9] << 4) | (b[10] << 8) | (b[11] << 12) | (b[12] << 16) | (b[13] << 20) | (b[14] << 24) | (b[15] << 28);
    var h = (Math.imul(lo, 0x9E3779B1) ^ Math.imul(hi, 0x85EBCA6B)) >>> (32 - TT_BITS);
    if(ttStamp[h] === stamp && ttLo[h] === lo && ttHi[h] === hi && ttDepth[h] >= depth) return ttVal[h];
    var emp = emps[depth], n = 0, i;
    for(i = 0; i < 16; i++) if(b[i] === 0) emp[n++] = i;
    if(n === 0) return lostValue(b);
    var cp = cprob / n, sum = 0, e;
    for(e = 0; e < n; e++){
      i = emp[e];
      b[i] = 1; sum += P1 * moveNode(b, depth, cp * P1);
      b[i] = 2; sum += P2 * moveNode(b, depth, cp * P2);
      b[i] = 0;
    }
    var v = sum / n;
    if(!aborted){ ttStamp[h] = stamp; ttLo[h] = lo; ttHi[h] = hi; ttDepth[h] = depth; ttVal[h] = v; }
    return v;
  }
  function moveNode(b, depth, cprob){
    var best = -Infinity, nb = scratch[depth], d, v;
    for(d = 0; d < 4; d++){
      if(move(b, d, nb)){ v = chanceNode(nb, depth - 1, cprob); if(v > best) best = v; }
    }
    return best === -Infinity ? lostValue(b) : best;
  }
  function choose(board16, opts){
    opts = opts || {};
    if(opts.p1 !== undefined){ P1 = opts.p1; P2 = 1 - P1; }
    CPROB = opts.cprob || P.cprob;
    var maxDepth = opts.maxDepth || 12, timeMs = opts.timeMs || 0;
    var root = new Uint8Array(16); for(var i = 0; i < 16; i++) root[i] = board16[i] | 0;
    stamp++; if(stamp > 4000000000) { stamp = 1; ttStamp.fill(0); }
    nodes = 0; aborted = false; deadline = timeMs ? Date.now() + timeMs : 0;
    function popCount(a){ var n = 0; for(var i = 0; i < 16; i++) if(a[i]) n++; return n; }
    var after = [], valid = [];
    for(var d = 0; d < 4; d++){ var nb = new Uint8Array(16); if(move(root, d, nb)){ after[d] = nb; valid.push(d); } else after[d] = null; }
    if(!valid.length) return { dir: -1, depth: 0, values: [], nodes: 0 };
    if(valid.length === 1) return { dir: valid[0], depth: 0, values: [], nodes: 0 };
    var maxLvl = 0; for(var mi = 0; mi < 16; mi++) if(root[mi] > maxLvl) maxLvl = root[mi];
    var MERGE_BONUS = 2500 + maxLvl * 300;   // ~2800 early game → ~5800 once an 11 is on board
    var rootPop = popCount(root), mergedNow = [];
    for(var mk = 0; mk < valid.length; mk++){ var mdir = valid[mk]; mergedNow[mdir] = rootPop - popCount(after[mdir]); }
    var bestDir = valid[0], bestVals = [], doneDepth = 0;
    for(var D = 0; D <= maxDepth; D++){
      var vals = [], bd = -1, bv = -Infinity;
      for(var k = 0; k < valid.length; k++){
        var dir = valid[k], copy = after[dir].slice();
        var v = chanceNode(copy, D, 1);
        if(aborted) break;
        v += mergedNow[dir] * MERGE_BONUS;
        vals[dir] = v; if(v > bv){ bv = v; bd = dir; }
      }
      if(aborted) break;
      bestDir = bd; bestVals = vals; doneDepth = D;
      if(!timeMs && D >= maxDepth) break;
    }
    return { dir: bestDir, depth: doneDepth, values: bestVals, nodes: nodes };
  }
  var DEFAULTS = {}; for(var k0 in P) DEFAULTS[k0] = P[k0];
  function init(params){
    for(var k1 in DEFAULTS) P[k1] = DEFAULTS[k1];          // always start from the defaults
    if(params) for(var k in params) P[k] = params[k];
    buildMoveTables(); buildHeuristic(); buildDeadPenalty();
  }
  function getParams(){ var o = {}; for(var k in P) o[k] = P[k]; return o; }
  function evaluate(b16){
    var root = new Uint8Array(16), nb = new Uint8Array(16), legal = 0, d;
    for(var i = 0; i < 16; i++) root[i] = b16[i] | 0;
    for(d = 0; d < 4; d++) if(move(root, d, nb)) legal++;
    return { score: legal ? evalBoard(root) : lostValue(root), legalMoves: legal, locked: legal === 0 };
  }
  return { init: init, choose: choose, move: move, evaluate: evaluate, params: getParams };
})();
var AXIOM_DIRS = ["left", "right", "up", "down"];
var ENG_TIME_MS = 600, ENG_MAX_DEPTH = 10, ENG_READY = false;
var ENG_PARAMS = {"empty":557.1044228736097,"merges":401.7038675898317,"monoW":31.8806315950676,"monoP":3.306857574916566,"sumW":11,"sumP":3.3393767217454866,"c11":33271,"deadPerim":6000,"deadCorner":30000,"deadComp":20000};
function engInit(){ if(!ENG_READY){ ENG.init(ENG_PARAMS); ENG_READY = true; } }
function axiomAnalyze(board){
  engInit();
  var flat = new Array(16);
  for(var i = 0; i < 16; i++) flat[i] = (board && board[i]) | 0;
  var r = ENG.choose(flat, { timeMs: ENG_TIME_MS, maxDepth: ENG_MAX_DEPTH, p1: 0.9 });
  var legal = [false, false, false, false], nb = new Uint8Array(16), root = Uint8Array.from(flat), d;
  for(d = 0; d < 4; d++) legal[d] = ENG.move(root, d, nb);
  var recs = [], vals = [];
  for(d = 0; d < 4; d++){
    var has = legal[d] && r.values && r.values[d] !== undefined;
    if(!legal[d]) recs.push({ direction: AXIOM_DIRS[d], survivalScore: 0, expectimaxScore: -Infinity, monteCarloSurvival: 0, valid: false });
    else {
      var v = has ? r.values[d] : 0;
      recs.push({ direction: AXIOM_DIRS[d], survivalScore: v, expectimaxScore: v, monteCarloSurvival: 0, valid: true });
      if(has) vals.push(v);
    }
  }
  var best = r.dir;
  var nLegal = legal.filter(Boolean).length, conf = 5;
  if(best >= 0){
    if(nLegal === 1) conf = 55;
    else {
      vals.sort(function(a, b){ return b - a; });
      var gap = vals.length > 1 ? vals[0] - vals[1] : 0;
      conf = Math.round(Math.min(95, Math.max(10, 35 + 60 * (1 - Math.exp(-gap / 4000)))));
    }
  }
  return { recommendations: recs, bestMove: best >= 0 ? AXIOM_DIRS[best] : "none", confidence: conf, depth: r.depth || 0, engine: "apex" };
}
function axiomEvaluate(candidates){
  engInit();
  return { results: (candidates || []).map(function(c){ return ENG.evaluate(c); }) };
}
if(typeof self !== "undefined" && typeof self.postMessage === "function"){
  self.onmessage = function(e){
    var m = e.data || {};
    try {
      if(m.type === "analyze") self.postMessage({ type: "result", data: axiomAnalyze(m.board), requestId: m.requestId });
      else if(m.type === "evaluateCandidates") self.postMessage({ type: "result", data: axiomEvaluate(m.candidates), requestId: m.requestId });
    } catch(err){
      self.postMessage({ type: "error", message: String(err), requestId: m.requestId });
    }
  };
}
`;
