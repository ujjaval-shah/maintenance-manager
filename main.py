import logging
import os
from pathlib import Path

import webview

from app.api import Api
from app.db import init_schema

WEB_DIR = Path(__file__).resolve().parent / "web"


def main():
    logging.basicConfig(level=logging.INFO)
    init_schema()
    webview.create_window(
        "Maintenance Manager",
        str(WEB_DIR / "index.html"),
        js_api=Api(),
        width=1280,
        height=820,
        min_size=(960, 640),
    )
    webview.start(debug=os.environ.get("MAINT_DEBUG") == "1")


if __name__ == "__main__":
    main()
