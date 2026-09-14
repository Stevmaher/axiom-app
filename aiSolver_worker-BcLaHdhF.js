(function () {
  "use strict";

  const DIRS = ["left", "right", "up", "down"];
  const SPAWN_VALS = [1, 2, 3, 4, 5, 6, 7];
  const SPAWN_P = [0.3, 0.25, 0.18, 0.12, 0.08, 0.05, 0.02];
  const SNAKE = [
    [15, 14, 13, 12, 8, 9, 10, 11, 7, 6, 5, 4, 0, 1, 2, 3],
    [12, 13, 14, 15, 11, 10, 9, 8, 4, 5, 6, 7, 3, 2, 1, 0],
    [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12],
    [3, 2, 1, 0, 4, 5, 6, 7, 11, 10, 9, 8, 12, 13, 14, 15],
  ];

  // Tuned by greedy self-play (survive + level-11 clears). See --selfplay.
  const W = {
    empty: 3400,
    snake: 11,
    mergePair: 20,
    closePair: 7,
    highPair: 55,
    pair10: 22000,
    edge10: 2500,
    mono: 52,
    smooth: 26,
    corner: 160,
    dead: 100000,
    stuck: 50000,
  };

  const LEFT_ROW = new Uint16Array(65536);
  const RIGHT_ROW = new Uint16Array(65536);
  const LEFT_MERGES = new Uint8Array(65536);
  const RIGHT_MERGES = new Uint8Array(65536);
  const LEFT_ELEVEN = new Uint8Array(65536);
  const RIGHT_ELEVEN = new Uint8Array(65536);
  const LEFT_MOVED = new Uint8Array(65536);
  const RIGHT_MOVED = new Uint8Array(65536);

  function reverseRow(row) {
    return ((row & 0xf) << 12) | ((row & 0xf0) << 4) | ((row & 0xf00) >> 4) | ((row & 0xf000) >> 12);
  }

  function slideLine(a, b, c, d) {
    const src = [];
    if (a) src.push(a);
    if (b) src.push(b);
    if (c) src.push(c);
    if (d) src.push(d);
    const out = [];
    let merges = 0;
    let elevens = 0;
    let i = 0;
    while (i < src.length) {
      if (i + 1 < src.length && src[i] === src[i + 1]) {
        const next = src[i] + 1;
        if (next === 11) elevens++;
        else out.push(next);
        merges++;
        i += 2;
      } else {
        out.push(src[i]);
        i++;
      }
    }
    while (out.length < 4) out.push(0);
    return { line: out, merges, elevens };
  }

  function packRow(line) {
    return line[0] | (line[1] << 4) | (line[2] << 8) | (line[3] << 12);
  }

  (function buildMoveTables() {
    for (let row = 0; row < 65536; row++) {
      const a = row & 15;
      const b = (row >> 4) & 15;
      const c = (row >> 8) & 15;
      const d = (row >> 12) & 15;
      const left = slideLine(a, b, c, d);
      const packed = packRow(left.line);
      LEFT_ROW[row] = packed;
      LEFT_MERGES[row] = left.merges;
      LEFT_ELEVEN[row] = left.elevens;
      LEFT_MOVED[row] = packed !== row ? 1 : 0;

      const rev = reverseRow(row);
      const rightPacked = reverseRow(LEFT_ROW[rev]);
      RIGHT_ROW[row] = rightPacked;
      RIGHT_MERGES[row] = LEFT_MERGES[rev];
      RIGHT_ELEVEN[row] = LEFT_ELEVEN[rev];
      RIGHT_MOVED[row] = rightPacked !== row ? 1 : 0;
    }
  })();

  function copyRows(rows) {
    return [rows[0], rows[1], rows[2], rows[3]];
  }

  function packBoard(cells) {
    const rows = [0, 0, 0, 0];
    for (let i = 0; i < 16; i++) {
      const v = cells[i] & 15;
      rows[i >> 2] |= v << ((i & 3) << 2);
    }
    return rows;
  }

  function unpackBoard(rows) {
    const cells = new Array(16);
    for (let r = 0; r < 4; r++) {
      const row = rows[r];
      cells[r * 4] = row & 15;
      cells[r * 4 + 1] = (row >> 4) & 15;
      cells[r * 4 + 2] = (row >> 8) & 15;
      cells[r * 4 + 3] = (row >> 12) & 15;
    }
    return cells;
  }

  function getCell(rows, i) {
    return (rows[i >> 2] >> ((i & 3) << 2)) & 15;
  }

  function setCell(rows, i, v) {
    const r = i >> 2;
    const shift = (i & 3) << 2;
    rows[r] = (rows[r] & ~(15 << shift)) | ((v & 15) << shift);
  }

  function emptyCount(rows) {
    let n = 0;
    for (let r = 0; r < 4; r++) {
      const row = rows[r];
      if ((row & 15) === 0) n++;
      if ((row & 0xf0) === 0) n++;
      if ((row & 0xf00) === 0) n++;
      if ((row & 0xf000) === 0) n++;
    }
    return n;
  }

  function emptyIndices(rows) {
    const out = [];
    for (let i = 0; i < 16; i++) if (getCell(rows, i) === 0) out.push(i);
    return out;
  }

  function colRow(rows, c) {
    return (
      ((rows[0] >> (c << 2)) & 15) |
      (((rows[1] >> (c << 2)) & 15) << 4) |
      (((rows[2] >> (c << 2)) & 15) << 8) |
      (((rows[3] >> (c << 2)) & 15) << 12)
    );
  }

  function writeCol(rows, c, packed) {
    const shift = c << 2;
    const mask = ~(15 << shift);
    rows[0] = (rows[0] & mask) | ((packed & 15) << shift);
    rows[1] = (rows[1] & mask) | (((packed >> 4) & 15) << shift);
    rows[2] = (rows[2] & mask) | (((packed >> 8) & 15) << shift);
    rows[3] = (rows[3] & mask) | (((packed >> 12) & 15) << shift);
  }

  function moveBoard(rows, dir) {
    const next = copyRows(rows);
    let moved = 0;
    let merges = 0;
    let elevens = 0;
    if (dir === 0) {
      for (let r = 0; r < 4; r++) {
        const row = next[r];
        merges += LEFT_MERGES[row];
        elevens += LEFT_ELEVEN[row];
        moved |= LEFT_MOVED[row];
        next[r] = LEFT_ROW[row];
      }
    } else if (dir === 1) {
      for (let r = 0; r < 4; r++) {
        const row = next[r];
        merges += RIGHT_MERGES[row];
        elevens += RIGHT_ELEVEN[row];
        moved |= RIGHT_MOVED[row];
        next[r] = RIGHT_ROW[row];
      }
    } else if (dir === 2) {
      for (let c = 0; c < 4; c++) {
        const col = colRow(next, c);
        merges += LEFT_MERGES[col];
        elevens += LEFT_ELEVEN[col];
        moved |= LEFT_MOVED[col];
        writeCol(next, c, LEFT_ROW[col]);
      }
    } else {
      for (let c = 0; c < 4; c++) {
        const col = colRow(next, c);
        merges += RIGHT_MERGES[col];
        elevens += RIGHT_ELEVEN[col];
        moved |= RIGHT_MOVED[col];
        writeCol(next, c, RIGHT_ROW[col]);
      }
    }
    return [next, moved !== 0, merges, elevens];
  }

  function canMove(rows) {
    for (let d = 0; d < 4; d++) {
      const moved = moveBoard(rows, d)[1];
      if (moved) return true;
    }
    return false;
  }

  const ZOBRIST = new Array(16);
  for (let i = 0; i < 16; i++) {
    ZOBRIST[i] = new Int32Array(12);
    for (let v = 0; v <= 11; v++) ZOBRIST[i][v] = (Math.random() * 0x7fffffff) | 0;
  }

  function hashRows(rows) {
    let h = 0;
    for (let i = 0; i < 16; i++) h ^= ZOBRIST[i][getCell(rows, i)];
    return h >>> 0;
  }

  const TT = new Map();
  const TT_MAX = 400000;

  function ttGet(hash, depth, isPlayer) {
    const key = hash * 2 + (isPlayer ? 1 : 0);
    const entry = TT.get(key);
    if (!entry) return null;
    TT.delete(key);
    TT.set(key, entry);
    return entry.depth >= depth ? entry.value : null;
  }

  function ttSet(hash, depth, isPlayer, value) {
    const key = hash * 2 + (isPlayer ? 1 : 0);
    if (TT.has(key)) TT.delete(key);
    else if (TT.size >= TT_MAX) TT.delete(TT.keys().next().value);
    TT.set(key, { depth, value });
  }

  function evaluate(rows) {
    const cells = unpackBoard(rows);
    const empties = emptyCount(rows);
    if (empties === 0 && !canMove(rows)) return -W.dead;

    let score = empties * W.empty;

    let snakeBest = -Infinity;
    for (let s = 0; s < 4; s++) {
      let sum = 0;
      const pat = SNAKE[s];
      for (let i = 0; i < 16; i++) sum += cells[i] * pat[i];
      if (sum > snakeBest) snakeBest = sum;
    }
    score += snakeBest * W.snake;

    let pairs = 0;
    let maxV = 0;
    let maxI = 0;
    for (let n = 0; n < 16; n++) {
      if (cells[n] > maxV) {
        maxV = cells[n];
        maxI = n;
      }
    }

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const i = r * 4 + c;
        const v = cells[i];
        if (!v) continue;
        if (c + 1 < 4) {
          const right = cells[i + 1];
          if (right === v) {
            pairs += v * W.mergePair;
            if (v >= 8) pairs += v * W.highPair;
            if (v === 10) {
              pairs += W.pair10;
              if (c === 0 || c === 2) pairs += W.edge10;
            }
          } else if (right > 0 && Math.abs(right - v) === 1) {
            pairs += v * W.closePair;
          }
        }
        if (r + 1 < 4) {
          const down = cells[i + 4];
          if (down === v) {
            pairs += v * W.mergePair;
            if (v >= 8) pairs += v * W.highPair;
            if (v === 10) {
              pairs += W.pair10;
              if (r === 0 || r === 2) pairs += W.edge10;
            }
          } else if (down > 0 && Math.abs(down - v) === 1) {
            pairs += v * W.closePair;
          }
        }
      }
    }
    score += pairs;

    let mono = 0;
    for (let r = 0; r < 4; r++) {
      let inc = 0;
      let dec = 0;
      for (let c = 0; c < 3; c++) {
        const a = cells[r * 4 + c];
        const b = cells[r * 4 + c + 1];
        if (a > b) dec += b - a;
        else inc += a - b;
      }
      mono += Math.max(inc, dec);
    }
    for (let c = 0; c < 4; c++) {
      let inc = 0;
      let dec = 0;
      for (let r = 0; r < 3; r++) {
        const a = cells[r * 4 + c];
        const b = cells[(r + 1) * 4 + c];
        if (a > b) dec += b - a;
        else inc += a - b;
      }
      mono += Math.max(inc, dec);
    }
    score += mono * W.mono;

    let smooth = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const v = cells[r * 4 + c];
        if (!v) continue;
        if (c + 1 < 4 && cells[r * 4 + c + 1]) smooth -= Math.abs(v - cells[r * 4 + c + 1]);
        if (r + 1 < 4 && cells[(r + 1) * 4 + c]) smooth -= Math.abs(v - cells[(r + 1) * 4 + c]);
      }
    }
    score += smooth * W.smooth;

    if (maxI === 0 || maxI === 3 || maxI === 12 || maxI === 15) score += maxV * W.corner;
    return score;
  }

  function spawnRandom() {
    const x = Math.random();
    let acc = 0;
    for (let i = 0; i < SPAWN_VALS.length; i++) {
      acc += SPAWN_P[i];
      if (x < acc) return SPAWN_VALS[i];
    }
    return 1;
  }

  function sampleEmpties(empties, k) {
    if (empties.length <= k) return empties;
    const copy = empties.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, k);
  }

  function legalMovesOrdered(rows) {
    const moves = [];
    for (let d = 0; d < 4; d++) {
      const [next, moved, merges, elevens] = moveBoard(rows, d);
      if (!moved) continue;
      const h = evaluate(next) + elevens * 18000 + merges * 80;
      moves.push({ d, next, merges, elevens, h });
    }
    moves.sort((a, b) => b.h - a.h);
    return moves;
  }

  let searchNextTile = 0;

  function expectimax(rows, depth, isPlayer) {
    if (depth <= 0) return evaluate(rows);
    const hsh = hashRows(rows);
    const cached = ttGet(hsh, depth, isPlayer);
    if (cached !== null) return cached;

    let value;
    if (isPlayer) {
      const moves = legalMovesOrdered(rows);
      if (moves.length === 0) {
        value = evaluate(rows) - W.stuck;
      } else {
        value = -Infinity;
        for (let i = 0; i < moves.length; i++) {
          const v = expectimax(moves[i].next, depth - 1, false);
          if (v > value) value = v;
        }
      }
    } else {
      const empties = emptyIndices(rows);
      if (empties.length === 0) {
        value = expectimax(rows, depth - 1, true);
      } else {
        const tiles = searchNextTile >= 1 && searchNextTile <= 7
          ? [searchNextTile]
          : SPAWN_VALS;
        const probs = searchNextTile >= 1 && searchNextTile <= 7
          ? [1]
          : SPAWN_P;
        const slots = depth <= 2 ? empties : sampleEmpties(empties, Math.max(4, Math.min(empties.length, 8)));
        let sum = 0;
        let weight = 0;
        const slotW = 1 / slots.length;
        for (let s = 0; s < slots.length; s++) {
          const idx = slots[s];
          for (let t = 0; t < tiles.length; t++) {
            const child = copyRows(rows);
            setCell(child, idx, tiles[t]);
            const p = slotW * probs[t];
            sum += expectimax(child, depth - 1, true) * p;
            weight += p;
          }
        }
        value = weight > 0 ? sum / weight : evaluate(rows);
      }
    }

    ttSet(hsh, depth, isPlayer, value);
    return value;
  }

  function pickPolicyMove(rows) {
    const moves = legalMovesOrdered(rows);
    if (moves.length === 0) return null;
    if (Math.random() < 0.8) return moves[0];
    return moves[(Math.random() * moves.length) | 0];
  }

  function rollout(rows, steps, nextTile) {
    let board = copyRows(rows);
    let survived = 0;
    for (let i = 0; i < steps; i++) {
      const choice = pickPolicyMove(board);
      if (!choice) return survived;
      board = choice.next;
      survived++;
      const empties = emptyIndices(board);
      if (empties.length === 0) continue;
      const idx = empties[(Math.random() * empties.length) | 0];
      const tile = i === 0 && nextTile >= 1 && nextTile <= 7 ? nextTile : spawnRandom();
      setCell(board, idx, tile);
    }
    return survived;
  }

  function analyze(cells, nextTile) {
    const rows = packBoard(cells);
    const empties = emptyCount(rows);
    let depth;
    let mcTrials;
    let mcSteps;
    if (empties <= 3) {
      depth = 6;
      mcTrials = 640;
      mcSteps = 40;
    } else if (empties <= 6) {
      depth = 5;
      mcTrials = 360;
      mcSteps = 32;
    } else {
      depth = 4;
      mcTrials = 180;
      mcSteps = 24;
    }

    searchNextTile = nextTile | 0;
    const recs = [];
    for (let d = 0; d < 4; d++) {
      const [next, moved, merges, elevens] = moveBoard(rows, d);
      if (!moved) {
        recs.push({
          direction: DIRS[d],
          survivalScore: 0,
          expectimaxScore: -Infinity,
          monteCarloSurvival: 0,
          valid: false,
        });
        continue;
      }
      const ex = expectimax(next, depth, false) + elevens * 12000 + merges * 40;
      let mcSum = 0;
      for (let t = 0; t < mcTrials; t++) mcSum += rollout(next, mcSteps, searchNextTile);
      const mc = mcSum / mcTrials;
      const survival = ex * 0.62 + mc * 420 * 0.38;
      recs.push({
        direction: DIRS[d],
        survivalScore: survival,
        expectimaxScore: ex,
        monteCarloSurvival: mc,
        valid: true,
      });
    }

    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < recs.length; i++) {
      if (recs[i].valid && recs[i].survivalScore > bestScore) {
        bestScore = recs[i].survivalScore;
        best = i;
      }
    }

    let confidence = 5;
    if (best >= 0) {
      const valid = recs.filter((r) => r.valid);
      if (valid.length === 1) confidence = 55;
      else if (valid.length > 1) {
        const sorted = valid.map((r) => r.survivalScore).sort((a, b) => b - a);
        const gap = sorted[0] - sorted[1];
        const scale = Math.abs(sorted[0]) || 1;
        confidence = Math.min(
          95,
          Math.max(10, 42 + (gap / scale) * 50 + (recs[best].monteCarloSurvival / mcSteps) * 30)
        );
      }
      confidence = Math.min(99, confidence + empties * 2);
    }

    return {
      recommendations: recs,
      bestMove: best >= 0 ? DIRS[best] : "none",
      confidence: Math.round(confidence),
    };
  }

  function playGreedyGame(maxMoves) {
    const rows = [0, 0, 0, 0];
    for (let i = 0; i < 2; i++) {
      const empties = emptyIndices(rows);
      setCell(rows, empties[(Math.random() * empties.length) | 0], spawnRandom());
    }
    let moves = 0;
    let elevens = 0;
    for (let m = 0; m < maxMoves; m++) {
      const choice = pickPolicyMove(rows);
      if (!choice) break;
      elevens += choice.elevens;
      const next = choice.next;
      rows[0] = next[0];
      rows[1] = next[1];
      rows[2] = next[2];
      rows[3] = next[3];
      moves++;
      const empties = emptyIndices(rows);
      if (empties.length) setCell(rows, empties[(Math.random() * empties.length) | 0], spawnRandom());
    }
    return moves + elevens * 40;
  }

  function selfPlayTune(rounds, games, maxMoves) {
    const keys = Object.keys(W);
    const base = { ...W };
    let best = { ...W };
    let bestScore = -Infinity;
    for (let r = 0; r < rounds; r++) {
      const trial = { ...base };
      if (r > 0) {
        for (const k of keys) {
          const factor = 0.72 + Math.random() * 0.56;
          trial[k] = Math.round(base[k] * factor);
        }
      }
      Object.assign(W, trial);
      let sum = 0;
      for (let g = 0; g < games; g++) sum += playGreedyGame(maxMoves);
      const avg = sum / games;
      if (avg > bestScore) {
        bestScore = avg;
        best = { ...trial };
      }
    }
    Object.assign(W, best);
    return { weights: best, score: bestScore };
  }

  if (typeof self !== "undefined" && typeof self.postMessage === "function") {
    self.onmessage = function (event) {
      const { type, board, requestId, nextTile } = event.data || {};
      if (type !== "analyze") return;
      try {
        const data = analyze(board, nextTile || 0);
        self.postMessage({ type: "result", data, requestId });
      } catch (err) {
        self.postMessage({ type: "error", message: String(err), requestId });
      }
    };
  }

  if (typeof process !== "undefined" && process.argv && process.argv.includes("--selfplay")) {
    const result = selfPlayTune(18, 28, 180);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
})();
