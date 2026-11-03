"""简易德州 AI：牌力 + 底池赔率 + 一点随机。"""

import random

import cards


def preflop_strength(hole: list[int]) -> float:
    r1, r2 = sorted((cards.card_rank(c) for c in hole), reverse=True)
    s1, s2 = cards.card_suit(hole[0]), cards.card_suit(hole[1])
    pair = r1 == r2
    suited = s1 == s2
    gap = r1 - r2
    if pair:
        return min(0.95, 0.45 + r1 / 28)
    score = (r1 + r2) / 28 * 0.45
    if r1 == 14:
        score += 0.08
    if suited:
        score += 0.07
    if gap == 1:
        score += 0.06
    elif gap == 2:
        score += 0.03
    if r1 >= 10 and r2 >= 10:
        score += 0.06
    return min(0.9, score)


def postflop_strength(hole: list[int], board: list[int]) -> float:
    all_cards = hole + board
    cat, tie = cards.evaluate7(all_cards)
    base = cat / 8 * 0.85
    if cat == 0 and tie:
        base += (tie[0] - 2) / 12 * 0.15
    # 听牌加成
    suits = [cards.card_suit(c) for c in all_cards]
    flush_draw = any(suits.count(s) == 4 for s in range(4)) and cat < 5
    ranks = sorted({cards.card_rank(c) for c in all_cards})
    straight_draw = False
    for start in range(2, 11):
        window = set(range(start, start + 5))
        have = len(window & set(ranks))
        if have == 4:
            straight_draw = True
            break
    if flush_draw:
        base += 0.12
    if straight_draw:
        base += 0.08
    if len(board) == 3:
        base += 0.03
    return min(0.98, base)


def decide(game, idx: int):
    p = game.players[idx]
    legal = game.legal(idx)
    rng = random.Random()
    if game.phase == "preflop":
        strength = preflop_strength(p.hole)
    else:
        strength = postflop_strength(p.hole, game.board)

    call = legal["call_amount"]
    pot = max(1, game.pot_total())
    odds = call / (pot + call) if call > 0 else 0.0
    aggressive = 0.55 + rng.random() * 0.2

    # 无需跟注
    if legal["check"]:
        if strength > 0.62 and rng.random() < 0.65:
            target = int(max(legal["min_raise_to"], pot * 0.55))
            return "raise", min(target, legal["max_raise_to"])
        if strength < 0.28 and rng.random() < 0.12:
            target = int(max(legal["min_raise_to"], pot * 0.45))
            return "raise", min(target, legal["max_raise_to"])
        return "check", 0

    # 面对下注
    if call >= p.stack:
        # 全下跟注：只用手牌不错时
        if strength > 0.55 or (strength > odds * 1.25 and strength > 0.4):
            return "call", 0
        return "fold", 0

    if strength > 0.78 and rng.random() < aggressive:
        target = int(max(legal["min_raise_to"], pot * 0.8))
        target = min(target, legal["max_raise_to"])
        if target - p.bet >= p.stack * 0.7:
            return "allin", 0
        return "raise", target

    if strength >= odds * 1.05 or (strength > 0.45 and call <= p.stack * 0.12):
        return "call", 0

    if strength < 0.25 and call < pot * 0.08 and rng.random() < 0.2:
        return "call", 0
    return "fold", 0
