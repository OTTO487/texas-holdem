"""德州扑克核心：座位、下注轮、边池、摊牌结算。"""

from __future__ import annotations

import random

import cards


class Player:
    def __init__(self, name: str, stack: int, ai: bool = True):
        self.name = name
        self.stack = stack
        self.ai = ai
        self.hole: list[int] = []
        self.bet = 0          # 本轮已下注
        self.total = 0        # 本手累计投入
        self.folded = False
        self.allin = False
        self.acted = False
        self.last_action = ""
        self.hand_value = None
        self.won = 0

    @property
    def active(self) -> bool:
        return not self.folded and self.stack > 0 or (not self.folded and self.allin)

    @property
    def in_hand(self) -> bool:
        return not self.folded


class Game:
    def __init__(self, players: list[Player], sb: int = 5, bb: int = 10, seed=None):
        self.players = players
        self.sb = sb
        self.bb = bb
        self.rng = random.Random(seed)
        self.button = self.rng.randrange(len(players))
        self.deck: list[int] = []
        self.board: list[int] = []
        self.pot = 0
        self.phase = "idle"
        self.current_bet = 0
        self.min_raise = bb
        self.to_act: list[int] = []
        self.actor = -1
        self.log: list[str] = []
        self.results: list[str] = []
        self.hand_no = 0

    # ---------- 基础 ----------
    def alive(self) -> list[int]:
        return [i for i, p in enumerate(self.players) if p.stack > 0 or p.in_hand]

    def next_idx(self, idx: int) -> int:
        n = len(self.players)
        for step in range(1, n + 1):
            j = (idx + step) % n
            if self.players[j].stack > 0:
                return j
        return idx

    def _order_from(self, start: int) -> list[int]:
        out = []
        idx = start
        for _ in range(len(self.players)):
            if self.players[idx].stack > 0:
                out.append(idx)
            idx = (idx + 1) % len(self.players)
        return out

    def add_log(self, text: str):
        self.log.append(text)
        if len(self.log) > 200:
            del self.log[:100]

    # ---------- 开手 ----------
    def start_hand(self):
        alive = [i for i, p in enumerate(self.players) if p.stack > 0]
        if len(alive) < 2:
            self.phase = "gameover"
            return
        if self.hand_no > 0:
            self.button = self.next_idx(self.button)
        while self.players[self.button].stack <= 0:
            self.button = self.next_idx(self.button)
        self.hand_no += 1
        self.deck = cards.deck()
        self.rng.shuffle(self.deck)
        self.board = []
        self.pot = 0
        self.phase = "preflop"
        self.current_bet = 0
        self.min_raise = self.bb
        self.to_act = []
        self.results = []
        self.log = []
        for p in self.players:
            p.hole = []
            p.bet = 0
            p.total = 0
            p.folded = p.stack <= 0
            p.allin = False
            p.acted = False
            p.last_action = ""
            p.hand_value = None
            p.won = 0

        # 发底牌
        for _ in range(2):
            for i in self._order_from(self.next_idx(self.button)):
                self.players[i].hole.append(self.deck.pop())

        order = self._order_from(self.next_idx(self.button))
        if len(order) == 2:
            # 单挑：按钮位就是小盲
            sb_idx = self.button
            bb_idx = order[0]
        else:
            sb_idx = order[0]
            bb_idx = order[1] if len(order) > 1 else order[0]
        self._post_blind(sb_idx, self.sb, "小盲")
        self._post_blind(bb_idx, self.bb, "大盲")
        self.current_bet = max(p.bet for p in self.players)
        self.min_raise = self.bb

        in_hand = [i for i, p in enumerate(self.players) if not p.folded]
        self.to_act = [i for i in in_hand if not self.players[i].allin]
        if len(in_hand) == 2:
            first = sb_idx
        else:
            first = self.next_idx(bb_idx)
        self.actor = first if first in self.to_act else (self.to_act[0] if self.to_act else -1)
        self.add_log(f"—— 第 {self.hand_no} 手 · 按钮 {self.players[self.button].name} ——")

    def _post_blind(self, idx: int, amount: int, label: str):
        p = self.players[idx]
        pay = min(amount, p.stack)
        p.stack -= pay
        p.bet += pay
        p.total += pay
        p.last_action = label
        if p.stack == 0:
            p.allin = True

    # ---------- 合法动作 ----------
    def to_call(self, idx: int) -> int:
        return max(0, self.current_bet - self.players[idx].bet)

    def legal(self, idx: int) -> dict:
        p = self.players[idx]
        call = min(self.to_call(idx), p.stack)
        max_to = p.bet + p.stack
        min_to = self.current_bet + max(self.min_raise, self.bb)
        if min_to > max_to:
            min_to = max_to
        return {
            "fold": True,
            "check": self.to_call(idx) == 0,
            "call": call,
            "call_amount": call,
            "raise": max_to > self.current_bet,
            "min_raise_to": min_to,
            "max_raise_to": max_to,
            "allin": p.stack > 0,
        }

    # ---------- 动作 ----------
    def act(self, idx: int, action: str, amount: int = 0) -> bool:
        if self.phase not in ("preflop", "flop", "turn", "river"):
            return False
        if idx != self.actor or idx not in self.to_act:
            return False
        p = self.players[idx]
        call = self.to_call(idx)
        legal = self.legal(idx)

        if action == "fold":
            p.folded = True
            p.last_action = "弃牌"
            self.add_log(f"{p.name} 弃牌")
        elif action == "check":
            if call > 0:
                action = "call"
            else:
                p.last_action = "过牌"
                self.add_log(f"{p.name} 过牌")
        if action == "call":
            pay = min(call, p.stack)
            p.stack -= pay
            p.bet += pay
            p.total += pay
            if p.stack == 0:
                p.allin = True
            p.last_action = "全下" if p.allin else f"跟注 {pay}"
            self.add_log(f"{p.name} {'全下' if p.allin else f'跟注 {pay}'}")
        elif action == "raise":
            target = max(int(amount), legal["min_raise_to"])
            target = min(target, legal["max_raise_to"])
            pay = target - p.bet
            if pay >= p.stack:
                target = p.bet + p.stack
                pay = p.stack
            p.stack -= pay
            p.bet += pay
            p.total += pay
            if p.stack == 0:
                p.allin = True
            raise_size = p.bet - self.current_bet
            if p.bet > self.current_bet:
                if raise_size >= self.min_raise:
                    self.min_raise = raise_size
                self.current_bet = p.bet
                self.to_act = [
                    i for i in self._order_from(self.next_idx(idx))
                    if i != idx and not self.players[i].folded and not self.players[i].allin
                ]
            p.last_action = "全下" if p.allin else f"加注到 {p.bet}"
            self.add_log(f"{p.name} {'全下' if p.allin else f'加注到 {p.bet}'}")
        elif action == "allin":
            target = p.bet + p.stack
            return self.act(idx, "raise", target)

        if idx in self.to_act:
            self.to_act.remove(idx)
        p.acted = True

        # 只剩一人
        alive = [i for i, x in enumerate(self.players) if not x.folded]
        if len(alive) == 1:
            self._award_uncontested(alive[0])
            return True

        # 本轮结束？
        if not self.to_act:
            self._end_round()
        else:
            self.actor = self.to_act[0]
        return True

    # ---------- 轮次 ----------
    def _end_round(self):
        self.pot += sum(p.bet for p in self.players)
        for p in self.players:
            p.bet = 0
        self.current_bet = 0
        self.min_raise = self.bb

        if len(self.board) == 5:
            self._showdown()
            return

        self._deal_board()
        self.phase = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}[len(self.board)]
        alive = [i for i, p in enumerate(self.players) if not p.folded]
        if all(self.players[i].allin or self.players[i].stack == 0 for i in alive):
            # 全部全下，直接发完
            while len(self.board) < 5:
                self._deal_board()
            self.phase = "river"
            self._showdown()
            return
        self.to_act = [i for i in alive if not self.players[i].allin and self.players[i].stack > 0]
        if len(alive) == 2:
            first = self.next_idx(self.button)
        else:
            first = self.next_idx(self.button)
        self.actor = first if first in self.to_act else (self.to_act[0] if self.to_act else -1)

    def _deal_board(self):
        need = 3 if len(self.board) == 0 else 1
        for _ in range(need):
            self.board.append(self.deck.pop())
        self.add_log("公共牌：" + " ".join(cards.card_cn(c) for c in self.board))

    # ---------- 结算 ----------
    def _award_uncontested(self, idx: int):
        p = self.players[idx]
        amount = self.pot + sum(x.bet for x in self.players)
        p.stack += amount
        p.won = amount
        self.pot = 0
        for x in self.players:
            x.bet = 0
        self.phase = "over"
        self.results = [f"{p.name} 收下底池 {amount}（其他人都弃牌）"]
        self.add_log(self.results[0])

    def _showdown(self):
        for p in self.players:
            if not p.folded:
                p.hand_value = cards.evaluate7(p.hole + self.board)
        total_contrib = {i: p.total for i, p in enumerate(self.players)}
        levels = sorted({v for v in total_contrib.values() if v > 0})
        prev = 0
        pots: list[tuple[int, list[int]]] = []
        for level in levels:
            amount = 0
            for i, p in enumerate(self.players):
                amount += max(0, min(p.total, level) - min(p.total, prev))
            eligible = [i for i, p in enumerate(self.players) if not p.folded and p.total >= level]
            if amount > 0 and eligible:
                pots.append((amount, eligible))
            prev = level

        summary: list[str] = []
        for amount, eligible in pots:
            if len(eligible) == 1:
                winner = eligible[0]
                self.players[winner].stack += amount
                self.players[winner].won += amount
                continue
            best = max(self.players[i].hand_value for i in eligible)
            winners = [i for i in eligible if self.players[i].hand_value == best]
            share = amount // len(winners)
            for w in winners:
                self.players[w].stack += share
                self.players[w].won += share
            extra = amount - share * len(winners)
            if extra:
                self.players[winners[0]].stack += extra
                self.players[winners[0]].won += extra
            names = "、".join(self.players[w].name for w in winners)
            best_name = cards.hand_name(best)
            summary.append(f"{names} 以 {best_name} 赢下 {amount}")

        self.pot = 0
        for p in self.players:
            p.bet = 0
        self.phase = "over"
        board_txt = " ".join(cards.card_cn(c) for c in self.board)
        self.results = [f"摊牌：{board_txt}"] + summary
        for line in self.results:
            self.add_log(line)

    # ---------- 查询 ----------
    def pot_total(self) -> int:
        return self.pot + sum(p.bet for p in self.players)

    def status_text(self) -> str:
        return f"底池 {self.pot_total()} · {self.phase}"

    def active_players(self) -> list[int]:
        return [i for i, p in enumerate(self.players) if not p.folded]

