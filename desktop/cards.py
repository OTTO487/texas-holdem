"""扑克牌与牌型评估（7 选 5）。"""

from itertools import combinations

RANKS = "23456789TJQKA"
SUITS = "shdc"
RANK_CN = {
    "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8",
    "9": "9", "T": "10", "J": "J", "Q": "Q", "K": "K", "A": "A",
}
SUIT_SYMBOL = {"s": "♠", "h": "♥", "d": "♦", "c": "♣"}
SUIT_CN = {"s": "黑桃", "h": "红桃", "d": "方块", "c": "梅花"}
SUIT_COLOR = {"s": (30, 30, 40), "h": (200, 40, 50), "d": (200, 40, 50), "c": (30, 30, 40)}

CATEGORY_NAMES = [
    "高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺",
]


def make_card(rank_idx: int, suit_idx: int) -> int:
    return rank_idx * 4 + suit_idx


def card_rank(card: int) -> int:
    """返回 2..14 的牌面值。"""
    return card // 4 + 2


def card_suit(card: int) -> int:
    return card % 4


def card_str(card: int) -> str:
    return RANKS[card // 4] + SUITS[card % 4]


def card_text(card: int) -> str:
    return RANK_CN[RANKS[card // 4]] + SUIT_SYMBOL[SUITS[card % 4]]


def card_cn(card: int) -> str:
    """中文牌名，用于日志（避免字体缺符号）。"""
    return SUIT_CN[SUITS[card % 4]] + RANK_CN[RANKS[card // 4]]


def _straight_high(ranks: list[int]) -> int:
    """ranks 为降序去重牌面值；返回顺子最高牌，无顺子返回 0。"""
    values = sorted(set(ranks), reverse=True)
    if 14 in values:
        values.append(1)
    run = 1
    for i in range(1, len(values)):
        if values[i] == values[i - 1] - 1:
            run += 1
            if run >= 5:
                return values[i] + 4
        else:
            run = 1
    return 0


def evaluate5(cards: list[int]):
    """返回 (category, tiebreak tuple)，可直接比较大小。"""
    ranks = sorted((card_rank(c) for c in cards), reverse=True)
    suits = [card_suit(c) for c in cards]
    counts: dict[int, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    grouped = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    flush = len(set(suits)) == 1
    straight = _straight_high(ranks)

    if flush and straight:
        return 8, (straight,)
    if grouped[0][1] == 4:
        quad = grouped[0][0]
        kicker = max(r for r in ranks if r != quad)
        return 7, (quad, kicker)
    if grouped[0][1] == 3 and grouped[1][1] == 2:
        return 6, (grouped[0][0], grouped[1][0])
    if flush:
        return 5, tuple(ranks)
    if straight:
        return 4, (straight,)
    if grouped[0][1] == 3:
        trips = grouped[0][0]
        kickers = sorted((r for r in ranks if r != trips), reverse=True)[:2]
        return 3, (trips, *kickers)
    if grouped[0][1] == 2 and grouped[1][1] == 2:
        pairs = sorted((grouped[0][0], grouped[1][0]), reverse=True)
        kicker = max(r for r in ranks if r not in pairs)
        return 2, (pairs[0], pairs[1], kicker)
    if grouped[0][1] == 2:
        pair = grouped[0][0]
        kickers = sorted((r for r in ranks if r != pair), reverse=True)[:3]
        return 1, (pair, *kickers)
    return 0, tuple(ranks)


def evaluate7(cards: list[int]):
    best = (-1, ())
    for combo in combinations(cards, 5):
        value = evaluate5(list(combo))
        if value > best:
            best = value
    return best


def hand_name(value) -> str:
    cat, tie = value
    name = CATEGORY_NAMES[cat]
    if cat in (8, 4) and tie and tie[0] == 5:
        return "轮子顺" if cat == 4 else "同花顺"
    return name


def describe_hand(cards: list[int]) -> str:
    if len(cards) < 5:
        return "—"
    return hand_name(evaluate7(cards))


def deck() -> list[int]:
    return list(range(52))


def remove_cards(remaining: list[int], used: list[int]) -> None:
    for c in used:
        try:
            remaining.remove(c)
        except ValueError:
            pass
