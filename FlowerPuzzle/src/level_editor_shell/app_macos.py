from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

from level_editor_shell.file_api import FileApi


def runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        executable = Path(sys.executable).resolve()
        for parent in executable.parents:
            if parent.suffix.lower() == ".app":
                return parent.parent
        return executable.parent
    return Path(__file__).resolve().parents[2]


def page_url(root: Path) -> str:
    page = root / "index.html"
    if page.is_file():
        return page.resolve().as_uri()
    html = """<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0f131c;color:#fff;font:16px -apple-system;display:grid;place-items:center;height:100vh}
main{padding:32px;border:1px solid #292f3d;border-radius:12px}code{color:#8f86ff}</style>
<main><h2>无法启动游戏关卡编辑器</h2><p>请将 <code>index.html</code> 放在 FlowerPuzzle.app 同级目录。</p></main>"""
    return "data:text/html;charset=utf-8," + quote(html)


class Bridge:
    def __init__(self, root: Path) -> None:
        self.files = FileApi(root)


def window_options() -> dict:
    return {
        "width": 1500,
        "height": 960,
        "min_size": (1100, 700),
        "frameless": False,
        "resizable": True,
        "background_color": "#0f131c",
    }


def main() -> None:
    import webview

    root = runtime_root()
    webview.create_window(
        "花田工坊 — Flower Puzzle",
        page_url(root),
        js_api=Bridge(root),
        **window_options(),
    )
    webview.start(gui="cocoa", debug=False, http_server=True)


if __name__ == "__main__":
    main()
