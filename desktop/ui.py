"""Pygame 界面：菜单（选人数）+ 牌桌。"""

import math
import os

import pygame

import cards
import engine
import ai

W, H = 1280, 800
GREEN = (18, 92, 64)
FELT = (24, 116, 82)
DARK = (18, 28, 24)
WHITE = (245, 245, 240)
GRAY = (150, 155, 150)
GOLD = (232, 190, 90)
RED = (200, 50, 55)
BLACK = (25, 25, 30)
BLUE = (52, 120, 200)

FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"


def load_font(size):
    if os.path.exists(FONT_PATH):
        return pygame.font.Font(FONT_PATH, size)
    return pygame.font.SysFont("microsoftyahei", size)


class Button:
    def __init__(self, rect, label, callback, color=BLUE, text_color=WHITE, size=20):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.callback = callback
        self.color = color
        self.text_color = text_color
        self.size = size
        self.enabled = True
        self.hover = False

    def draw(self, surf, font):
        color = self.color if self.enabled else (80, 85, 80)
        if self.hover and self.enabled:
            color = tuple(min(255, c + 25) for c in color)
        pygame.draw.rect(surf, color, self.rect, border_radius=10)
        pygame.draw.rect(surf, (230, 230, 220), self.rect, 2, border_radius=10)
        text = font.render(self.label, True, self.text_color if self.enabled else (170, 170, 170))
        surf.blit(text, text.get_rect(center=self.rect.center))

    def handle(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.hover = self.rect.collidepoint(event.pos)
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.enabled and self.rect.collidepoint(event.pos):
                self.callback()
                return True
        return False


class Slider:
    def __init__(self, rect):
        self.rect = pygame.Rect(rect)
        self.min = 0
        self.max = 100
        self.value = 0
        self.dragging = False
        self.enabled = True

    def set_range(self, lo, hi, value=None):
        self.min = lo
        self.max = max(lo + 1, hi)
        self.value = max(lo, min(self.max, self.value if value is None else value))

    def _from_x(self, x):
        t = (x - self.rect.x) / max(1, self.rect.width)
        t = max(0.0, min(1.0, t))
        return int(round(self.min + t * (self.max - self.min)))

    def handle(self, event):
        if not self.enabled:
            return
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and self.rect.inflate(0, 20).collidepoint(event.pos):
            self.dragging = True
            self.value = self._from_x(event.pos[0])
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.dragging = False
        elif event.type == pygame.MOUSEMOTION and self.dragging:
            self.value = self._from_x(event.pos[0])

    def draw(self, surf):
        pygame.draw.rect(surf, (70, 80, 75), self.rect, border_radius=6)
        t = (self.value - self.min) / max(1, self.max - self.min)
        x = int(self.rect.x + t * self.rect.width)
        pygame.draw.circle(surf, GOLD, (x, self.rect.centery), 10)
        pygame.draw.circle(surf, (30, 30, 30), (x, self.rect.centery), 10, 2)


class PokerUI:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("德州扑克 · 单机")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.font_s = load_font(16)
        self.font_m = load_font(20)
        self.font_l = load_font(28)
        self.font_xl = load_font(44)
        try:
            self.font_suit = pygame.font.Font(r"C:\Windows\Fonts\seguisym.ttf", 26)
        except Exception:
            self.font_suit = self.font_m
        self.state = "menu"
        self.player_count = 4
        self.chips = 1000
        self.sb, self.bb = 5, 10
        self.game = None
        self.players = []
        self.hero = 0
        self.next_ai = 0
        self.message = ""
        self.menu_buttons = []
        self.action_buttons = []
        self.slider = Slider((940, 470, 300, 10))
        self.raise_label = ""
        self._build_menu()

    # ---------- 菜单 ----------
    def _build_menu(self):
        self.menu_buttons = []
        for i, n in enumerate(range(2, 10)):
            rect = (330 + i * 78, 300, 66, 50)
            self.menu_buttons.append(Button(rect, str(n), lambda n=n: self._set_count(n), BLUE if n == self.player_count else (60, 70, 80)))
        self.menu_buttons.append(Button((470, 470, 200, 56), "开始游戏", self._start_game, (200, 120, 40), size=24))

    def _set_count(self, n):
        self.player_count = n
        self._build_menu()

    def _start_game(self):
        self.players = []
        for i in range(self.player_count):
            name = "你" if i == 0 else f"电脑{'ABCDEFGH'[i - 1]}"
            self.players.append(engine.Player(name, self.chips, ai=(i != 0)))
        self.game = engine.Game(self.players, self.sb, self.bb)
        self.hero = 0
        self.state = "game"
        self.new_hand()

    def new_hand(self):
        g = self.game
        g.start_hand()
        self.message = ""
        self.next_ai = pygame.time.get_ticks() + 600
        self._build_actions()

    # ---------- 动作面板 ----------
    def _build_actions(self):
        g = self.game
        self.action_buttons = []
        if not g or g.phase not in ("preflop", "flop", "turn", "river"):
            return
        hero = self.hero
        legal = g.legal(hero)
        hero_turn = g.actor == hero and self.state == "game"
        self.action_buttons.append(Button((930, 530, 140, 50), "弃牌", lambda: self._act("fold"), (150, 60, 60)))
        call_label = "过牌" if legal["check"] else f"跟注 {legal['call_amount']}"
        self.action_buttons.append(Button((1085, 530, 155, 50), call_label, lambda: self._act("check" if legal["check"] else "call"), (60, 110, 160)))
        self.action_buttons.append(Button((930, 595, 140, 50), "加注", self._raise, (170, 120, 40)))
        self.action_buttons.append(Button((1085, 595, 155, 50), "全下", lambda: self._act("allin"), (160, 60, 120)))
        for b in self.action_buttons:
            b.enabled = hero_turn
        if legal["raise"]:
            self.slider.set_range(legal["min_raise_to"], legal["max_raise_to"], legal["min_raise_to"])
        self.slider.enabled = hero_turn and legal["raise"]

    def _act(self, action):
        g = self.game
        if g.actor != self.hero:
            return
        ok = g.act(self.hero, action)
        if not ok:
            return
        self._after_action()

    def _raise(self):
        g = self.game
        if g.actor != self.hero:
            return
        if g.act(self.hero, "raise", self.slider.value):
            self._after_action()

    def _after_action(self):
        self.message = ""
        self._build_actions()
        self.next_ai = pygame.time.get_ticks() + 450

    def _update_ai(self, now):
        g = self.game
        if not g or self.state != "game":
            return
        if g.phase in ("over", "gameover", "idle"):
            return
        if g.actor < 0 or g.actor not in g.to_act:
            return
        p = g.players[g.actor]
        if not p.ai:
            return
        if now < self.next_ai:
            return
        action, amount = ai.decide(g, g.actor)
        g.act(g.actor, action, amount)
        self._build_actions()
        self.next_ai = now + 450

    # ---------- 事件 ----------
    def handle(self, event):
        if event.type == pygame.QUIT:
            return False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                return False
            if self.state == "game" and self.game.phase in ("preflop", "flop", "turn", "river"):
                if event.key == pygame.K_f:
                    self._act("fold")
                elif event.key == pygame.K_c:
                    self._act("check" if self.game.legal(self.hero)["check"] else "call")
                elif event.key == pygame.K_r:
                    self._raise()
                elif event.key == pygame.K_a:
                    self._act("allin")
        if self.state == "menu":
            for b in self.menu_buttons:
                if b.handle(event):
                    break
        else:
            for b in self.action_buttons:
                if b.handle(event):
                    break
            self.slider.handle(event)
            if event.type == pygame.MOUSEBUTTONDOWN and self.game.phase in ("over", "gameover"):
                if self._over_button_rect().collidepoint(event.pos):
                    if self.game.phase == "gameover":
                        self.state = "menu"
                        self._build_menu()
                    else:
                        self.new_hand()
            if event.type == pygame.MOUSEBUTTONDOWN and self.game.phase == "over":
                if self._over_button_rect().collidepoint(event.pos):
                    self.new_hand()
        return True

    def _over_button_rect(self):
        return pygame.Rect(540, 520, 200, 56)

    # ---------- 绘制 ----------
    def draw(self):
        self.screen.fill(DARK)
        if self.state == "menu":
            self._draw_menu()
        else:
            self._draw_table()
        pygame.display.flip()

    def _draw_menu(self):
        s = self.screen
        s.fill((16, 24, 20))
        title = self.font_xl.render("德州扑克 · 单机", True, GOLD)
        s.blit(title, title.get_rect(center=(640, 120)))
        sub = self.font_m.render("你 vs 电脑，2~9 人自由选择", True, WHITE)
        s.blit(sub, sub.get_rect(center=(640, 185)))
        label = self.font_l.render("玩家人数", True, WHITE)
        s.blit(label, label.get_rect(center=(640, 260)))
        for b in self.menu_buttons:
            b.draw(s, self.font_m)
        chips = self.font_m.render(f"初始筹码 {self.chips}    盲注 {self.sb}/{self.bb}", True, GRAY)
        s.blit(chips, chips.get_rect(center=(640, 400)))
        hint = self.font_s.render("F 弃牌 · C 跟注/过牌 · R 加注 · A 全下 · Esc 退出", True, GRAY)
        s.blit(hint, hint.get_rect(center=(640, 740)))

    def _draw_table(self):
        s = self.screen
        s.fill((12, 20, 16))
        pygame.draw.rect(s, GREEN, (30, 40, 890, 720), border_radius=120)
        pygame.draw.rect(s, (10, 60, 40), (30, 40, 890, 720), 8, border_radius=120)
        pygame.draw.ellipse(s, FELT, (120, 150, 710, 420))
        pygame.draw.ellipse(s, (8, 70, 50), (120, 150, 710, 420), 6)

        g = self.game
        self._draw_board(g)
        self._draw_seats(g)
        self._draw_panel(g)
        if g.phase in ("over", "gameover"):
            self._draw_overlay(g)

    def _seat_positions(self, n):
        cx, cy = 475, 360
        rx, ry = 330, 235
        pos = [(cx, cy + ry)]
        if n == 2:
            angles = [270]
        elif n == 3:
            angles = [150, 30]
        elif n == 4:
            angles = [180, 270, 0]
        else:
            angles = [90 + i * 360 / n for i in range(1, n)]
        for a in angles:
            r = math.radians(a)
            pos.append((cx + rx * math.cos(r), cy + ry * math.sin(r)))
        return pos

    def _draw_seats(self, g):
        n = len(g.players)
        pos = self._seat_positions(n)
        for i, p in enumerate(g.players):
            x, y = pos[i]
            is_hero = i == self.hero
            box = pygame.Rect(0, 0, 150, 64)
            box.center = (int(x), int(y) + (30 if is_hero else 0))
            color = (30, 50, 45) if not p.folded else (30, 35, 35)
            if g.actor == i and g.phase in ("preflop", "flop", "turn", "river"):
                color = (60, 90, 70)
            pygame.draw.rect(self.screen, color, box, border_radius=10)
            pygame.draw.rect(self.screen, (100, 110, 100), box, 1, border_radius=10)
            name = self.font_s.render(p.name, True, WHITE if not p.folded else GRAY)
            self.screen.blit(name, (box.x + 8, box.y + 6))
            stack = self.font_s.render(f"{p.stack}", True, GOLD)
            self.screen.blit(stack, (box.x + 8, box.y + 32))
            if p.last_action:
                act = self.font_s.render(p.last_action, True, (220, 220, 160))
                self.screen.blit(act, act.get_rect(midtop=(box.centerx, box.bottom + 2)))

            card_y = box.top - 70 if not is_hero else box.top - 82
            self._draw_hole(p, box.centerx, card_y, is_hero)
            if g.button == i:
                pygame.draw.circle(self.screen, WHITE, (box.right - 14, box.top + 14), 11)
                d = self.font_s.render("D", True, BLACK)
                self.screen.blit(d, d.get_rect(center=(box.right - 14, box.top + 14)))
            if p.bet > 0 and not p.folded:
                btxt = self.font_s.render(f"下注 {p.bet}", True, (255, 230, 120))
                self.screen.blit(btxt, btxt.get_rect(center=(int(x), int(y) + 92)))

    def _draw_hole(self, p, cx, cy, is_hero):
        if not p.hole:
            return
        reveal = is_hero or self.game.phase in ("over", "gameover")
        w, h = 54, 76
        xs = [cx - w - 4, cx + 4]
        for j, c in enumerate(p.hole[:2]):
            rect = pygame.Rect(xs[j], cy, w, h)
            if reveal and not p.folded:
                self._draw_card(rect, c)
            else:
                self._draw_back(rect)

    def _draw_board(self, g):
        cx, cy = 475, 360
        w, h, gap = 62, 88, 10
        total = 5 * w + 4 * gap
        x0 = cx - total // 2
        for i in range(5):
            rect = pygame.Rect(x0 + i * (w + gap), cy - h // 2, w, h)
            if i < len(g.board):
                self._draw_card(rect, g.board[i])
            else:
                pygame.draw.rect(self.screen, (20, 70, 55), rect, border_radius=8)
                pygame.draw.rect(self.screen, (60, 120, 95), rect, 1, border_radius=8)
        pot = self.font_l.render(f"底池 {g.pot_total()}", True, GOLD)
        self.screen.blit(pot, pot.get_rect(center=(cx, cy - 90)))
        phase_cn = {"preflop": "翻牌前", "flop": "翻牌", "turn": "转牌", "river": "河牌", "over": "本手结束", "gameover": "游戏结束"}
        pt = self.font_m.render(phase_cn.get(g.phase, ""), True, WHITE)
        self.screen.blit(pt, pt.get_rect(center=(cx, cy + 70)))

    def _draw_card(self, rect, card):
        pygame.draw.rect(self.screen, WHITE, rect, border_radius=7)
        pygame.draw.rect(self.screen, (40, 40, 40), rect, 1, border_radius=7)
        rank = cards.RANKS[card // 4]
        suit = cards.SUITS[card % 4]
        color = RED if suit in "hd" else BLACK
        rank_txt = cards.RANK_CN[rank]
        fs = self.font_m if len(rank_txt) < 2 else self.font_s
        t = fs.render(rank_txt, True, color)
        self.screen.blit(t, (rect.x + 5, rect.y + 4))
        st = self.font_suit.render(cards.SUIT_SYMBOL[suit], True, color)
        self.screen.blit(st, st.get_rect(center=(rect.centerx, rect.centery + 8)))

    def _draw_back(self, rect):
        pygame.draw.rect(self.screen, (30, 60, 120), rect, border_radius=7)
        pygame.draw.rect(self.screen, (200, 210, 230), rect, 2, border_radius=7)
        for k in range(1, 4):
            pygame.draw.line(self.screen, (70, 100, 170), (rect.x + 6, rect.y + k * 18), (rect.right - 6, rect.y + k * 18), 2)

    def _draw_panel(self, g):
        s = self.screen
        pygame.draw.rect(s, (18, 30, 26), (920, 40, 330, 720), border_radius=12)
        log_title = self.font_m.render("牌桌记录", True, GOLD)
        s.blit(log_title, (940, 55))
        lines = g.log[-11:]
        y = 90
        for line in lines:
            txt = self.font_s.render(line[:34], True, (200, 210, 200))
            s.blit(txt, (940, y))
            y += 22

        # 动作面板
        pygame.draw.line(s, (60, 80, 70), (930, 430), (1240, 430), 1)
        hero_legal = g.legal(self.hero) if g.phase in ("preflop", "flop", "turn", "river") else None
        if hero_legal:
            label = self.font_m.render(f"加注到 {self.slider.value}", True, WHITE)
            s.blit(label, (940, 436))
            self.slider.draw(s)
        for b in self.action_buttons:
            b.draw(s, self.font_m)
        if g.phase in ("preflop", "flop", "turn", "river") and g.actor == self.hero:
            hint = self.font_s.render("轮到你了", True, GOLD)
            s.blit(hint, (940, 660))

    def _draw_overlay(self, g):
        s = self.screen
        overlay = pygame.Surface((W, H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 150))
        s.blit(overlay, (0, 0))
        panel = pygame.Rect(360, 220, 560, 400)
        pygame.draw.rect(s, (20, 36, 30), panel, border_radius=16)
        pygame.draw.rect(s, (200, 180, 100), panel, 3, border_radius=16)
        title = "本手结束" if g.phase == "over" else "游戏结束"
        t = self.font_xl.render(title, True, GOLD)
        s.blit(t, t.get_rect(center=(panel.centerx, panel.y + 60)))
        y = panel.y + 120
        for line in g.results[:5]:
            txt = self.font_m.render(line[:30], True, WHITE)
            s.blit(txt, txt.get_rect(center=(panel.centerx, y)))
            y += 34
        if g.phase == "gameover":
            winner = max(g.players, key=lambda p: p.stack)
            w = self.font_l.render(f"最终赢家：{winner.name}（{winner.stack}）", True, GOLD)
            s.blit(w, w.get_rect(center=(panel.centerx, y + 10)))
        btn = self._over_button_rect()
        pygame.draw.rect(s, (200, 120, 40), btn, border_radius=10)
        label = "返回菜单" if g.phase == "gameover" else "下一手"
        b = self.font_l.render(label, True, WHITE)
        s.blit(b, b.get_rect(center=btn.center))

    # ---------- 主循环 ----------
    def run(self):
        running = True
        while running:
            now = pygame.time.get_ticks()
            for event in pygame.event.get():
                if not self.handle(event):
                    running = False
            if self.state == "game":
                self._update_ai(now)
                g = self.game
                if g.phase == "gameover" or (g.phase == "over" and sum(1 for p in g.players if p.stack > 0) < 2):
                    if g.phase == "over":
                        g.phase = "gameover"
            self.draw()
            self.clock.tick(60)
        pygame.quit()
