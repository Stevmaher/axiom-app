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
  // The board index (0..15, row-major) holding the highest weight (15) in each
  // SNAKE orientation above — i.e. the "safe corner" that orientation protects.
  const CORNER_FOR_SNAKE = [0, 3, 12, 15];

  // Tuned by greedy self-play (survive + level-11 clears), then re-tuned for
  // dedicated Level 9 -> 10 -> 11 pathing. See --selfplay.
  const W = {
    empty: 3600,
    snake: 14,
    mono: 64,
    smooth: 30,
    corner: 180,

    mergePair: 24,
    closePair: 9,
    highPair: 70,

    pair10: 30000,
    edge10: 4200,
    pair9: 900,
    merge10Path: 5200,

    endgameEmpty: 5200,
    endgameBreak: 7000,

    dead: 130000,
    stuck: 65000,
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
    // Pass 1: fully populate LEFT_* for every row first. RIGHT_* (below)
    // reads LEFT_ROW[reverseRow(row)], and reverseRow(row) is very often a
    // larger index than `row` itself — so a single combined loop would read
    // still-unfilled (zero) entries for most rows, corrupting RIGHT_ROW /
    // RIGHT_MOVED and causing moves to be reported legal/illegal incorrectly.
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
    }

    // Pass 2: build RIGHT_* from the now-complete LEFT_ROW table.
    for (let row = 0; row < 65536; row++) {
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

  function highestTile(rows) {
    let m = 0;
    for (let i = 0; i < 16; i++) {
      const v = getCell(rows, i);
      if (v > m) m = v;
    }
    return m;
  }

  function countLegalMoves(rows) {
    let n = 0;
    for (let d = 0; d < 4; d++) {
      if (moveBoard(rows, d)[1]) n++;
    }
    return n;
  }

  // --- Deterministic PRNG (mix32) -------------------------------------------
  // Replaces Math.random() for anything that must be reproducible across runs
  // (Zobrist keys, chance-node sampling), so identical boards always hash and
  // sample the same way — important for benchmarking and TT reliability.
  function mix32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function makeDeterministicRng(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (state + 0x9e3779b9) >>> 0;
      return mix32(state);
    };
  }

  const ZOBRIST = new Array(16);
  (function buildZobrist() {
    const rng = makeDeterministicRng(0x2545f491 ^ 0xc0ffee);
    for (let i = 0; i < 16; i++) {
      ZOBRIST[i] = new Int32Array(12);
      for (let v = 0; v <= 11; v++) {
        ZOBRIST[i][v] = rng() & 0x7fffffff;
      }
    }
  })();

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
    TT.set(key, { depth, value, isPlayer });
  }

  // Returns which of the 4 SNAKE orientations best matches the current board,
  // so the "safe corner" / snake bonus adapts to where the high tiles actually
  // are instead of always assuming a fixed corner.
  function bestSnakeIndex(cells) {
    let bestS = 0;
    let bestSum = -Infinity;
    for (let s = 0; s < 4; s++) {
      const pat = SNAKE[s];
      let sum = 0;
      for (let i = 0; i < 16; i++) sum += cells[i] * pat[i];
      if (sum > bestSum) {
        bestSum = sum;
        bestS = s;
      }
    }
    return bestS;
  }

  function evaluate(rows) {
    const cells = unpackBoard(rows);
    const empties = emptyCount(rows);
    if (empties === 0 && !canMove(rows)) return -W.dead;

    let maxV = 0;
    let maxI = 0;
    for (let n = 0; n < 16; n++) {
      if (cells[n] > maxV) {
        maxV = cells[n];
        maxI = n;
      }
    }

    // Endgame mode: crowded board or a Level-10+ tile already on the board.
    // Empty cells matter a lot more here, and losing the safe-corner position
    // is penalized directly instead of relying only on the snake/corner terms.
    const endgameActive = maxV >= 10 || empties <= 4;
    const emptyWeight = endgameActive ? W.endgameEmpty : W.empty;
    let score = empties * emptyWeight;

    const bestS = bestSnakeIndex(cells);
    const pat = SNAKE[bestS];
    let snakeSum = 0;
    for (let i = 0; i < 16; i++) snakeSum += cells[i] * pat[i];
    score += snakeSum * W.snake;

    let pairs = 0;
    let count9 = 0;
    let count10 = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const i = r * 4 + c;
        const v = cells[i];
        if (!v) continue;
        if (v === 9) count9++;
        else if (v === 10) count10++;

        if (c + 1 < 4) {
          const right = cells[i + 1];
          if (right === v) {
            pairs += v * W.mergePair;
            if (v >= 8) pairs += v * W.highPair;
            if (v === 9) pairs += W.pair9;
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
            if (v === 9) pairs += W.pair9;
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

    // Level 9 -> 10 -> 11 path preservation: reward boards that keep a route
    // open to forming (or already holding) a second Level-10 tile, without
    // letting this dominate over raw score chasing.
    let merge10PathScore = 0;
    if (count10 >= 2) merge10PathScore = W.merge10Path;
    else if (count10 === 1 && count9 >= 1) merge10PathScore = W.merge10Path * 0.5;
    else if (count9 >= 2) merge10PathScore = W.merge10Path * 0.25;
    score += merge10PathScore;

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

    // Corner bonus is tied to the best-fit snake orientation rather than a
    // fixed corner: full bonus for sitting in that orientation's safe corner,
    // partial credit for merely being in *a* corner.
    const idealCorner = CORNER_FOR_SNAKE[bestS];
    if (maxI === idealCorner) {
      score += maxV * W.corner;
    } else if (maxI === 0 || maxI === 3 || maxI === 12 || maxI === 15) {
      score += maxV * W.corner * 0.35;
    }

    if (endgameActive && maxV >= 10 && maxI !== idealCorner) {
      score -= W.endgameBreak;
    }

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

  // Deterministic (board-seeded) chance-node sampling: same board -> same
  // sampled slots every time, instead of uncontrolled Math.random sampling.
  function selectEmptySlots(rows, empties, k) {
    if (empties.length <= k) return empties;
    const idxs = empties.slice();
    let state = (hashRows(rows) ^ 0x9e3779b9) >>> 0;
    for (let i = idxs.length - 1; i > 0; i--) {
      state = mix32(state + 0x9e3779b9);
      const j = state % (i + 1);
      const tmp = idxs[i];
      idxs[i] = idxs[j];
      idxs[j] = tmp;
    }
    return idxs.slice(0, k);
  }

  // Extra terms layered on top of evaluate() for ranking *moves* (root scoring
  // and move ordering): level-11 clears and level-10 potential are weighted
  // heavily so the solver doesn't pick a move just because it nets one merge.
  function extraMoveBonus(next, merges, elevens) {
    const cells = unpackBoard(next);
    const emptyAfter = emptyCount(next);
    const bestS = bestSnakeIndex(cells);
    const pat = SNAKE[bestS];
    let snakeSum = 0;
    for (let i = 0; i < 16; i++) snakeSum += cells[i] * pat[i];

    let count9 = 0;
    let count10 = 0;
    for (let i = 0; i < 16; i++) {
      if (cells[i] === 9) count9++;
      else if (cells[i] === 10) count10++;
    }
    const level10Potential = count10 >= 2 ? 2 : count10 === 1 ? 1 : count9 >= 2 ? 0.5 : 0;

    return (
      elevens * 20000 +
      merges * 80 +
      level10Potential * 6000 +
      emptyAfter * 50 +
      snakeSum * 2
    );
  }

  function moveOrderScore(next, merges, elevens) {
    return evaluate(next) + extraMoveBonus(next, merges, elevens);
  }

  function legalMovesOrdered(rows) {
    const moves = [];
    for (let d = 0; d < 4; d++) {
      const [next, moved, merges, elevens] = moveBoard(rows, d);
      if (!moved) continue;
      const h = moveOrderScore(next, merges, elevens);
      moves.push({ d, next, merges, elevens, h });
    }
    moves.sort((a, b) => b.h - a.h);
    return moves;
  }

  let searchNextTile = 0;
  // The board-seeded "next tile" hint is only true for the very first spawn
  // after the root move (that's what the game UI actually shows the
  // player). It must NOT be applied to deeper chance nodes, which represent
  // spawns several moves in the future and are genuinely random. Since depth
  // decreases monotonically on every recursive call, depth === searchRootDepth
  // holds exactly once per analyze() call: at the root chance node. That's
  // used below to scope the known-tile assumption correctly.
  let searchRootDepth = 0;
  // Soft wall-clock budget for a whole analyze() call. Certain board
  // structures (scattered low tiles with no natural merges) can blow up the
  // exhaustive chance-node branching combinatorially even at moderate depth
  // — this was already true of the original solver, and is a real risk for a
  // worker that must answer interactively. Once the deadline passes, deeper
  // nodes fall back to the static evaluator instead of recursing further, so
  // worst-case latency stays bounded without changing the API or game rules.
  let searchDeadline = Infinity;

  function expectimax(rows, depth, isPlayer) {
    if (depth <= 0 || Date.now() > searchDeadline) return evaluate(rows);
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
        // Only the root chance node (depth === searchRootDepth) may use the
        // known next-tile hint — every deeper chance node is a future spawn
        // that hasn't been revealed and must be treated as genuinely random.
        const knownTile = searchNextTile >= 1 && searchNextTile <= 7 && depth === searchRootDepth;
        const tiles = knownTile ? [searchNextTile] : SPAWN_VALS;
        const probs = knownTile ? [1] : SPAWN_P;

        // Exhaustive at shallow depth or when few empties remain (endgame
        // precision matters more than speed there); smart deterministic
        // sampling otherwise so we never miss a dangerous spawn silently.
        let slots;
        if (empties.length <= 6 || depth <= 2) {
          slots = empties;
        } else if (empties.length >= 11) {
          slots = selectEmptySlots(rows, empties, 6);
        } else {
          slots = selectEmptySlots(rows, empties, 8);
        }

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

  // 92% best move / 7% second-best / 1% random-among-top-3: strongly greedy
  // but never blindly so, since legalMovesOrdered() already folds in empty
  // cells, merge potential, Level 9/10/11 progress and snake preservation.
  function pickPolicyMove(rows) {
    const moves = legalMovesOrdered(rows);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];
    const r = Math.random();
    if (r < 0.92) return moves[0];
    if (r < 0.99) return moves[1];
    const poolSize = Math.min(3, moves.length);
    return moves[(Math.random() * poolSize) | 0];
  }

  // In the endgame (few empties left) treat spawn placement as something
  // worth evaluating rather than pure luck: place the most common tile at
  // each candidate empty and keep the most adversarial one, so rollouts give
  // a more honest (conservative) read of how safe a line really is.
  function chooseRolloutSpawnIndex(board, empties) {
    if (empties.length > 4) {
      return empties[(Math.random() * empties.length) | 0];
    }
    let bestIdx = empties[0];
    let bestScore = Infinity;
    // Test both value 1 and value 2 (the two most probable spawns) rather
    // than only 1: a "1" isn't always the worse placement — sometimes a "2"
    // is what blocks a merge the line was counting on. Keeping the worse of
    // the two gives rollouts a more honest read of endgame risk.
    for (let e = 0; e < empties.length; e++) {
      const idx = empties[e];
      for (const testVal of [1, 2]) {
        const trial = copyRows(board);
        setCell(trial, idx, testVal);
        const s = evaluate(trial);
        if (s < bestScore) {
          bestScore = s;
          bestIdx = idx;
        }
      }
    }
    return bestIdx;
  }

  function rollout(rows, steps, nextTile) {
    let board = copyRows(rows);
    let survived = 0;
    let mergesTotal = 0;
    let elevensTotal = 0;
    let maxLevelSeen = highestTile(board);
    for (let i = 0; i < steps; i++) {
      const choice = pickPolicyMove(board);
      if (!choice) break;
      board = choice.next;
      survived++;
      mergesTotal += choice.merges;
      elevensTotal += choice.elevens;
      const lvl = highestTile(board);
      if (lvl > maxLevelSeen) maxLevelSeen = lvl;
      const empties = emptyIndices(board);
      if (empties.length === 0) continue;
      const idx = chooseRolloutSpawnIndex(board, empties);
      const tile = i === 0 && nextTile >= 1 && nextTile <= 7 ? nextTile : spawnRandom();
      setCell(board, idx, tile);
    }
    const quality = evaluate(board);
    // Composite reward: survival + how high we got + merge activity, with a
    // very large bonus for actually clearing a Level 11, tempered by overall
    // board quality so a single lucky merge can't dominate the estimate.
    const composite =
      survived * 12 +
      maxLevelSeen * 500 +
      mergesTotal * 18 +
      elevensTotal * 60000 +
      quality * 0.015;
    return { survived, composite };
  }

  // Adaptive search depth/trials: driven by empties and highest tile.
  // Note: expectimax's chance nodes branch over all 7 spawn values whenever
  // the next tile isn't known in advance, so each extra ply is roughly an
  // order of magnitude more expensive in the low-empties regime. Depth is
  // therefore capped at 6 (as in the previous version) and the requested
  // extra rigor for critical endgame positions (maxTile >= 10, very few
  // empties) is delivered through more Monte Carlo trials/steps instead of a
  // 7th ply, per the explicit "adjust if too slow" allowance — measured
  // benchmarks showed depth 7 costing ~8x more per move for no measurable
  // decision-quality gain over depth 6 + heavier rollouts.
  function computeSearchParams(rows) {
    const empties = emptyCount(rows);
    const maxTile = highestTile(rows);
    let depth;
    let mcTrials;
    let mcSteps;
    if (maxTile >= 10 && empties <= 5) {
      depth = 6;
      mcTrials = 680;
      mcSteps = 40;
    } else if (empties <= 3) {
      depth = 6;
      mcTrials = 640;
      mcSteps = 40;
    } else if (empties <= 6) {
      depth = 5;
      mcTrials = 420;
      mcSteps = 34;
    } else if (empties <= 9) {
      depth = 5;
      mcTrials = 260;
      mcSteps = 28;
    } else {
      depth = 4;
      mcTrials = 180;
      mcSteps = 24;
    }

    const legalMoves = countLegalMoves(rows);
    const cells = unpackBoard(rows);
    let count10 = 0;
    for (let i = 0; i < 16; i++) if (cells[i] === 10) count10++;

    // Building the SECOND Level-10 tile (to merge into a Level-11 clear) is
    // the real bottleneck for ever reaching Level 11 — reaching a single
    // Level-10 tile is comparatively easy. Once one exists on the board,
    // spend noticeably more search budget hunting the merge than the
    // generic "few legal moves" case gets, since that case is about not
    // dying rather than about finishing the 10 -> 11 push.
    if (count10 >= 1) {
      mcTrials = Math.min(900, Math.round(mcTrials * 1.35));
      if (depth < 6) depth += 1;
    } else if (legalMoves <= 2) {
      mcTrials = Math.min(800, Math.round(mcTrials * 1.1));
    }

    return { depth, mcTrials, mcSteps };
  }

  function analyze(cells, nextTile) {
    const rows = packBoard(cells);
    const { depth, mcTrials, mcSteps } = computeSearchParams(rows);

    searchNextTile = nextTile | 0;
    searchRootDepth = depth;
    // The transposition table caches expectimax values that depend on
    // searchNextTile (chance nodes branch differently when the next tile is
    // known vs. unknown). Since searchNextTile changes on every analyze()
    // call but TT persists across calls, stale entries from a previous call
    // (with a different or no known next tile) could otherwise be reused for
    // a transposed board here and silently corrupt the search. Clearing per
    // call keeps every cached value valid for the current searchNextTile.
    TT.clear();

    // Budget covers the whole analyze() call, split evenly across the 4
    // directions. A single shared deadline processed left/right/up/down in
    // order would let earlier directions consume the whole budget and starve
    // later ones into a shallow evaluate() fallback — biasing move choice
    // toward whichever direction happens to be checked first rather than
    // whichever is actually best. An equal per-direction slice keeps the
    // comparison fair.
    const totalBudget = 3000;
    const perDirBudget = totalBudget / 4;

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

      searchDeadline = Date.now() + perDirBudget;

      // Root move scoring: deep expectimax value plus the same level-11 /
      // level-10 / merge / empty-cell / snake bonuses used for move ordering,
      // so a move isn't picked purely on score while ignoring path-to-11.
      const ex = expectimax(next, depth, false) + extraMoveBonus(next, merges, elevens);

      let mcSurvivalSum = 0;
      let mcCompositeSum = 0;
      let trialsRun = 0;
      for (let t = 0; t < mcTrials; t++) {
        if ((t & 31) === 0 && Date.now() > searchDeadline) break;
        const r = rollout(next, mcSteps, searchNextTile);
        mcSurvivalSum += r.survived;
        mcCompositeSum += r.composite;
        trialsRun++;
      }
      const denom = trialsRun || 1;
      const mcSurvival = mcSurvivalSum / denom;
      const mcComposite = mcCompositeSum / denom;
      const survival = ex * 0.58 + mcComposite * 0.3 + mcSurvival * 420 * 0.12;

      recs.push({
        direction: DIRS[d],
        survivalScore: survival,
        expectimaxScore: ex,
        monteCarloSurvival: mcSurvival,
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
      confidence = Math.min(99, confidence + emptyCount(rows) * 2);
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
    let maxLevel = 0;
    let reached10 = 0;
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
      const lvl = highestTile(rows);
      if (lvl > maxLevel) maxLevel = lvl;
      if (lvl >= 10) reached10 = 1;
      const empties = emptyIndices(rows);
      if (empties.length) setCell(rows, empties[(Math.random() * empties.length) | 0], spawnRandom());
    }
    const quality = evaluate(rows);
    // Composite self-play score: reaching Level 11 dominates, then Level 10,
    // then overall board quality/survival — matching the project's stated
    // priority order instead of rewarding raw move-count alone.
    return moves + elevens * 6000 + reached10 * 1200 + maxLevel * 150 + quality * 0.01;
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
          // Milder perturbation than a purely random search: keeps tuning
          // from swinging weights wildly between rounds.
          const factor = 0.85 + Math.random() * 0.3;
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
