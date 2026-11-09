-- One row per admission "class". Each shift of a class is its own row with its own seat count
-- (e.g. "Class 6 - Morning Shift" and "Class 6 - Day Shift" are two rows).
CREATE TABLE classes (
    id          text        PRIMARY KEY,
    name        text        NOT NULL CHECK (length(btrim(name)) > 0),
    total_seats integer     NOT NULL CHECK (total_seats > 0),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per application. A row is created as HELD and moves exactly once to
-- CONFIRMED, CANCELLED or EXPIRED. Rows are never deleted, so the history stays visible.
CREATE TABLE holds (
    id           text        PRIMARY KEY,
    class_id     text        NOT NULL REFERENCES classes (id),
    student_id   text        NOT NULL CHECK (student_id ~ '^[0-9]{17}$'),
    status       text        NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    confirmed_at timestamptz,
    cancelled_at timestamptz
);

-- Safety net for "one active application or confirmed admission per student per class".
-- The application code already checks this while holding the class lock; the database refuses
-- a duplicate even if that code is ever bypassed.
CREATE UNIQUE INDEX ux_holds_one_active_per_student_per_class
    ON holds (class_id, student_id)
    WHERE status IN ('HELD', 'CONFIRMED');

-- Seat counting per class only ever looks at HELD and CONFIRMED rows.
CREATE INDEX ix_holds_class_occupied
    ON holds (class_id, status)
    WHERE status IN ('HELD', 'CONFIRMED');

-- "My applications" list, newest first.
CREATE INDEX ix_holds_student ON holds (student_id, created_at DESC);

-- Lets the expiry sweeper find overdue holds without scanning the whole table.
CREATE INDEX ix_holds_pending_expiry ON holds (expires_at) WHERE status = 'HELD';
