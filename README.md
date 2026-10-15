# Maintenance Manager

A desktop app built with PyWebView and SQLite for recording maintenance collected from the shops of a business complex, one financial year at a time.

## Run

```
pip install -r requirements.txt
python seed.py --reset     # optional: load sample data
python main.py
```

Optional environment variables:
- `MAINT_DB=path\to\file.db` uses a different database. The default is `data/maintenance.db`.
- `MAINT_DEBUG=1` opens the WebView dev tools.

## Tests

```
python -m unittest -v
```

## Layout
- `app/services/*` holds the business rules (complexes, financial years, shops, collections, reports).
- `app/api.py` exposes the JS bridge (`window.pywebview.api`).
- `web/` contains the single-page UI. `css/print.css` makes receipts and reports printable.
