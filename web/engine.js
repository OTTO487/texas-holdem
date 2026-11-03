/* 德州扑克核心：牌型、状态机、AI（浏览器与单机共用） */
const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_CN = { s: "黑桃", h: "红桃", d: "方块", c: "梅花" };
const CATEGORY_NAMES = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"];

const rankOf = (c) => (c >> 2) + 2;
const suitOf = (c) => c & 3;
const cardText = (c) => RANKS[c >> 2] + SUIT_SYMBOL[SUITS[c & 3]];
const cardCn = (c) => SUIT_CN[SUITS[c & 3]] + RANKS[c >> 2];

function straightHigh(ranks) {
  const vals = [...new Set(ranks)].sort((a, b) => b - a);
  if (vals.includes(14)) vals.push(1);
  let run = 1;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] === vals[i - 1] - 1) {
      run++;
      if (run >= 5) return vals[i] + 4;
    } else {
      run = 1;
    }
  }
  return 0;
}

function evaluate5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const sh = straightHigh(ranks);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const grouped = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  if (flush && sh) return [8, [sh]];
  if (grouped[0][1] === 4) {
    const quad = grouped[0][0];
    return [7, [quad, Math.max(...ranks.filter((r) => r !== quad))]];
  }
  if (grouped[0][1] === 3 && grouped[1][1] === 2) return [6, [grouped[0][0], grouped[1][0]]];
  if (flush) return [5, ranks];
  if (sh) return [4, [sh]];
  if (grouped[0][1] === 3) {
    const trips = grouped[0][0];
    return [3, [trips, ...ranks.filter((r) => r !== trips).slice(0, 2)]];
  }
  if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    const pairs = [grouped[0][0], grouped[1][0]].sort((a, b) => b - a);
    return [2, [...pairs, Math.max(...ranks.filter((r) => !pairs.includes(r)))]];
  }
  if (grouped[0][1] === 2) {
    const pair = grouped[0][0];
    return [1, [pair, ...ranks.filter((r) => r !== pair).slice(0, 3)]];
  }
  return [0, ranks];
}

function cmpValue(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  const x = a[1], y = b[1];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const dx = x[i] || 0, dy = y[i] || 0;
    if (dx !== dy) return dx - dy;
  }
  return 0;
}

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combos(arr, k, i + 1, acc);
    acc.pop();
  }
}

function evaluate7(cards) {
  let best = [-1, []];
  for (const c of combos(cards, 5)) {
    const v = evaluate5(c);
    if (cmpValue(v, best) > 0) best = v;
  }
  return best;
}

function handName(v) {
  return CATEGORY_NAMES[v[0]];
}

function newDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor(players, sb = 5, bb = 10, button = null) {
    this.players = players; // {name, stack, ai}
    this.sb = sb;
    this.bb = bb;
    this.button = button === null ? Math.floor(Math.random() * players.length) : button;
    this.deck = [];
    this.board = [];
    this.pot = 0;
    this.phase = "idle";
    this.currentBet = 0;
    this.minRaise = bb;
    this.toAct = [];
    this.actor = -1;
    this.log = [];
    this.results = [];
    this.handNo = 0;
  }

  nextIdx(idx) {
    const n = this.players.length;
    for (let s = 1; s <= n; s++) {
      const j = (idx + s) % n;
      if (this.players[j].stack > 0) return j;
    }
    return idx;
  }

  orderFrom(start) {
    const out = [];
    let idx = start;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[idx].stack > 0) out.push(idx);
      idx = (idx + 1) % this.players.length;
    }
    return out;
  }

  addLog(t) {
    this.log.push(t);
    if (this.log.length > 200) this.log.splice(0, 100);
  }

  startHand() {
    const alive = this.players.filter((p) => p.stack > 0).length;
    if (alive < 2) { this.phase = "gameover"; return; }
    if (this.handNo > 0) this.button = this.nextIdx(this.button);
    while (this.players[this.button].stack <= 0) this.button = this.nextIdx(this.button);
    this.handNo++;
    this.deck = shuffle(newDeck());
    this.board = [];
    this.pot = 0;
    this.phase = "preflop";
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.toAct = [];
    this.results = [];
    this.log = [];
    for (const p of this.players) {
      p.hole = [];
      p.bet = 0;
      p.total = 0;
      p.folded = p.stack <= 0;
      p.allin = false;
      p.last = "";
      p.handValue = null;
    }
    for (let k = 0; k < 2; k++) {
      for (const i of this.orderFrom(this.nextIdx(this.button))) {
        this.players[i].hole.push(this.deck.pop());
      }
    }
    const order = this.orderFrom(this.nextIdx(this.button));
    let sbIdx, bbIdx;
    if (order.length === 2) { sbIdx = this.button; bbIdx = order[0]; }
    else { sbIdx = order[0]; bbIdx = order[1]; }
    this.postBlind(sbIdx, this.sb, "小盲");
    this.postBlind(bbIdx, this.bb, "大盲");
    this.currentBet = Math.max(...this.players.map((p) => p.bet));
    this.minRaise = this.bb;
    const inHand = this.players.map((p, i) => (!p.folded ? i : -1)).filter((i) => i >= 0);
    this.toAct = inHand.filter((i) => !this.players[i].allin);
    let first;
    if (inHand.length === 2) first = sbIdx;
    else first = this.nextIdx(bbIdx);
    this.actor = this.toAct.includes(first) ? first : (this.toAct[0] ?? -1);
    this.addLog(`—— 第 ${this.handNo} 手 · 按钮 ${this.players[this.button].name} ——`);
  }

  postBlind(i, amount, label) {
    const p = this.players[i];
    const pay = Math.min(amount, p.stack);
    p.stack -= pay; p.bet += pay; p.total += pay; p.last = label;
    if (p.stack === 0) p.allin = true;
  }

  toCall(i) { return Math.max(0, this.currentBet - this.players[i].bet); }

  legal(i) {
    const p = this.players[i];
    const call = Math.min(this.toCall(i), p.stack);
    const maxTo = p.bet + p.stack;
    let minTo = this.currentBet + Math.max(this.minRaise, this.bb);
    if (minTo > maxTo) minTo = maxTo;
    return {
      fold: true,
      check: this.toCall(i) === 0,
      call,
      call_amount: call,
      raise: maxTo > this.currentBet,
      min_raise_to: minTo,
      max_raise_to: maxTo,
      allin: p.stack > 0,
    };
  }

  act(i, action, amount = 0) {
    if (!["preflop", "flop", "turn", "river"].includes(this.phase)) return false;
    if (i !== this.actor || !this.toAct.includes(i)) return false;
    const p = this.players[i];
    const call = this.toCall(i);
    const legal = this.legal(i);

    if (action === "fold") {
      p.folded = true; p.last = "弃牌"; this.addLog(`${p.name} 弃牌`);
    } else if (action === "check") {
      if (call > 0) action = "call";
      else { p.last = "过牌"; this.addLog(`${p.name} 过牌`); }
    }
    if (action === "call") {
      const pay = Math.min(call, p.stack);
      p.stack -= pay; p.bet += pay; p.total += pay;
      if (p.stack === 0) p.allin = true;
      p.last = p.allin ? "全下" : `跟注 ${pay}`;
      this.addLog(`${p.name} ${p.allin ? "全下" : "跟注 " + pay}`);
    } else if (action === "raise") {
      let target = Math.max(parseInt(amount) || 0, legal.min_raise_to);
      target = Math.min(target, legal.max_raise_to);
      let pay = target - p.bet;
      if (pay >= p.stack) { target = p.bet + p.stack; pay = p.stack; }
      p.stack -= pay; p.bet += pay; p.total += pay;
      if (p.stack === 0) p.allin = true;
      const raiseSize = p.bet - this.currentBet;
      if (p.bet > this.currentBet) {
        if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
        this.currentBet = p.bet;
        this.toAct = this.orderFrom(this.nextIdx(i)).filter((j) => j !== i && !this.players[j].folded && !this.players[j].allin);
      }
      p.last = p.allin ? "全下" : `加注到 ${p.bet}`;
      this.addLog(`${p.name} ${p.allin ? "全下" : "加注到 " + p.bet}`);
    } else if (action === "allin") {
      return this.act(i, "raise", p.bet + p.stack);
    }

    if (this.toAct.includes(i)) this.toAct = this.toAct.filter((x) => x !== i);
    const alive = this.players.map((x, j) => (!x.folded ? j : -1)).filter((j) => j >= 0);
    if (alive.length === 1) { this.awardUncontested(alive[0]); return true; }
    if (this.toAct.length === 0) this.endRound();
    else this.actor = this.toAct[0];
    return true;
  }

  endRound() {
    this.pot += this.players.reduce((s, p) => s + p.bet, 0);
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.minRaise = this.bb;
    if (this.board.length === 5) { this.showdown(); return; }
    this.dealBoard();
    this.phase = ["preflop", "flop", "turn", "river"][ [0,3,4,5].indexOf(this.board.length) ];
    const alive = this.players.map((p, i) => (!p.folded ? i : -1)).filter((i) => i >= 0);
    if (alive.every((i) => this.players[i].allin || this.players[i].stack === 0)) {
      while (this.board.length < 5) this.dealBoard();
      this.phase = "river";
      this.showdown();
      return;
    }
    this.toAct = alive.filter((i) => !this.players[i].allin && this.players[i].stack > 0);
    const first = this.nextIdx(this.button);
    this.actor = this.toAct.includes(first) ? first : (this.toAct[0] ?? -1);
  }

  dealBoard() {
    const need = this.board.length === 0 ? 3 : 1;
    for (let i = 0; i < need; i++) this.board.push(this.deck.pop());
    this.addLog("公共牌：" + this.board.map(cardCn).join(" "));
  }

  awardUncontested(i) {
    const p = this.players[i];
    const amount = this.pot + this.players.reduce((s, x) => s + x.bet, 0);
    p.stack += amount;
    this.pot = 0;
    for (const x of this.players) x.bet = 0;
    this.phase = "over";
    this.results = [`${p.name} 收下底池 ${amount}（其他人都弃牌）`];
    this.addLog(this.results[0]);
  }

  showdown() {
    for (const p of this.players) if (!p.folded) p.handValue = evaluate7([...p.hole, ...this.board]);
    const levels = [...new Set(this.players.map((p) => p.total).filter((v) => v > 0))].sort((a, b) => a - b);
    let prev = 0;
    const pots = [];
    for (const level of levels) {
      let amount = 0;
      for (const p of this.players) amount += Math.max(0, Math.min(p.total, level) - Math.min(p.total, prev));
      const eligible = this.players.map((p, i) => (!p.folded && p.total >= level ? i : -1)).filter((i) => i >= 0);
      if (amount > 0 && eligible.length) pots.push([amount, eligible]);
      prev = level;
    }
    const summary = [];
    for (const [amount, eligible] of pots) {
      if (eligible.length === 1) {
        this.players[eligible[0]].stack += amount;
        continue;
      }
      let best = this.players[eligible[0]].handValue;
      for (const i of eligible) if (cmpValue(this.players[i].handValue, best) > 0) best = this.players[i].handValue;
      const winners = eligible.filter((i) => cmpValue(this.players[i].handValue, best) === 0);
      const share = Math.floor(amount / winners.length);
      for (const w of winners) this.players[w].stack += share;
      const extra = amount - share * winners.length;
      if (extra > 0) this.players[winners[0]].stack += extra;
      summary.push(`${winners.map((w) => this.players[w].name).join("、")} 以 ${handName(best)} 赢下 ${amount}`);
    }
    this.pot = 0;
    for (const p of this.players) p.bet = 0;
    this.phase = "over";
    this.results = ["摊牌：" + this.board.map(cardCn).join(" "), ...summary];
    for (const r of this.results) this.addLog(r);
  }

  potTotal() { return this.pot + this.players.reduce((s, p) => s + p.bet, 0); }
  activePlayers() { return this.players.map((p, i) => (!p.folded ? i : -1)).filter((i) => i >= 0); }
}

/* ---------------- AI ---------------- */
function preflopStrength(hole) {
  const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  if (a === b) return Math.min(0.95, 0.45 + a / 28);
  let s = ((a + b) / 28) * 0.45;
  if (a === 14) s += 0.08;
  if (suited) s += 0.07;
  const gap = a - b;
  if (gap === 1) s += 0.06; else if (gap === 2) s += 0.03;
  if (a >= 10 && b >= 10) s += 0.06;
  return Math.min(0.9, s);
}

function postflopStrength(hole, board) {
  const all = [...hole, ...board];
  const v = evaluate7(all);
  let base = (v[0] / 8) * 0.85;
  if (v[0] === 0 && v[1].length) base += ((v[1][0] - 2) / 12) * 0.15;
  const suits = all.map(suitOf);
  let flushDraw = false;
  for (let s = 0; s < 4; s++) if (suits.filter((x) => x === s).length === 4) flushDraw = true;
  if (flushDraw && v[0] < 5) base += 0.12;
  const ranks = [...new Set(all.map(rankOf))];
  let straightDraw = false;
  for (let start = 2; start <= 10; start++) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    if (window.filter((r) => ranks.includes(r)).length === 4) { straightDraw = true; break; }
  }
  if (straightDraw) base += 0.08;
  if (board.length === 3) base += 0.03;
  return Math.min(0.98, base);
}

function aiDecide(game, i) {
  const p = game.players[i];
  const legal = game.legal(i);
  const strength = game.phase === "preflop" ? preflopStrength(p.hole) : postflopStrength(p.hole, game.board);
  const call = legal.call_amount;
  const pot = Math.max(1, game.potTotal());
  const odds = call > 0 ? call / (pot + call) : 0;
  const rnd = Math.random();
  if (legal.check) {
    if (strength > 0.62 && rnd < 0.65) return ["raise", Math.min(Math.max(legal.min_raise_to, Math.floor(pot * 0.55)), legal.max_raise_to)];
    if (strength < 0.28 && rnd < 0.12) return ["raise", Math.min(Math.max(legal.min_raise_to, Math.floor(pot * 0.45)), legal.max_raise_to)];
    return ["check", 0];
  }
  if (call >= p.stack) return (strength > 0.55 || (strength > odds * 1.25 && strength > 0.4)) ? ["call", 0] : ["fold", 0];
  if (strength > 0.78 && rnd < 0.7) {
    let target = Math.min(Math.max(legal.min_raise_to, Math.floor(pot * 0.8)), legal.max_raise_to);
    if (target - p.bet >= p.stack * 0.7) return ["allin", 0];
    return ["raise", target];
  }
  if (strength >= odds * 1.05 || (strength > 0.45 && call <= p.stack * 0.12)) return ["call", 0];
  if (strength < 0.25 && call < pot * 0.08 && rnd < 0.2) return ["call", 0];
  return ["fold", 0];
}

if (typeof module !== "undefined") module.exports = { Game, evaluate7, evaluate5, cmpValue, aiDecide, cardText, cardCn, RANKS, SUITS, SUIT_SYMBOL };
