"""德州扑克 · 单机入口。"""

import os
import sys

# 打包成 --windowed 时 stdout/stderr 为 None，pygame 导入会因此报错
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")


def smoke():
    os.environ["SDL_VIDEODRIVER"] = "dummy"
    import pygame
    import ui

    app = ui.PokerUI()
    app._set_count(6)
    app._start_game()
    for _ in range(40):
        app._update_ai(pygame.time.get_ticks())
        app.draw()
    out = os.path.join(os.path.dirname(os.path.abspath(sys.executable)), "smoke.png")
    pygame.image.save(app.screen, out)
    with open(out + ".txt", "w", encoding="utf-8") as f:
        f.write(f"ok phase={app.game.phase} players={len(app.game.players)}")
    pygame.quit()


def main():
    if "--smoke" in sys.argv:
        smoke()
        return
    import ui

    ui.PokerUI().run()


if __name__ == "__main__":
    main()
