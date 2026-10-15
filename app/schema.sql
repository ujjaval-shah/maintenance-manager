-- Maintenance Manager schema. Money is stored as integer paise.

CREATE TABLE IF NOT EXISTS complex (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    address     TEXT NOT NULL,
    gst_number  TEXT
);

CREATE TABLE IF NOT EXISTS financial_year (
    id                  INTEGER PRIMARY KEY,
    complex_id          INTEGER NOT NULL REFERENCES complex(id) ON DELETE RESTRICT,
    label               TEXT NOT NULL,              -- e.g. '2026-27'
    start_date          TEXT NOT NULL,              -- ISO yyyy-mm-dd
    end_date            TEXT NOT NULL,
    rate_paise_per_sqft INTEGER NOT NULL CHECK (rate_paise_per_sqft > 0),
    receipt_seq         INTEGER NOT NULL DEFAULT 0,
    UNIQUE (complex_id, label)
);

CREATE TABLE IF NOT EXISTS shop (
    id           INTEGER PRIMARY KEY,
    fy_id        INTEGER NOT NULL REFERENCES financial_year(id) ON DELETE RESTRICT,
    shop_number  TEXT NOT NULL,
    owner_name   TEXT NOT NULL,
    owner_phone  TEXT,
    owner_gst    TEXT,
    area_sqft    REAL NOT NULL CHECK (area_sqft > 0),
    UNIQUE (fy_id, shop_number)
);

CREATE TABLE IF NOT EXISTS collection (
    id               INTEGER PRIMARY KEY,
    fy_id            INTEGER NOT NULL REFERENCES financial_year(id) ON DELETE RESTRICT,
    receipt_seq      INTEGER NOT NULL,
    receipt_no       TEXT NOT NULL,
    main_shop_id     INTEGER NOT NULL REFERENCES shop(id) ON DELETE RESTRICT,
    payment_date     TEXT NOT NULL,
    amount_paise     INTEGER NOT NULL CHECK (amount_paise > 0),
    calculated_paise INTEGER NOT NULL,
    mode             TEXT NOT NULL CHECK (mode IN ('CASH', 'CHEQUE')),
    cheque_number    TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (fy_id, receipt_no),
    CHECK (mode = 'CASH' OR (cheque_number IS NOT NULL AND cheque_number <> ''))
);

-- Every shop covered by a collection, including the main shop (is_main = 1).
CREATE TABLE IF NOT EXISTS collection_shop (
    collection_id INTEGER NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
    shop_id       INTEGER NOT NULL REFERENCES shop(id) ON DELETE RESTRICT,
    is_main       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, shop_id)
);

CREATE INDEX IF NOT EXISTS ix_collection_report ON collection (fy_id, mode, payment_date);
CREATE INDEX IF NOT EXISTS ix_collection_shop_shop ON collection_shop (shop_id);
