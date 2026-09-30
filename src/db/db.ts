import { openDatabaseSync } from 'expo-sqlite';

export const db = openDatabaseSync('travel.db');

const MIGRATIONS = [
  `
  CREATE TABLE trips (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    cover_photo_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE photos (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    asset_id TEXT,
    file TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    taken_at INTEGER,
    offset_min INTEGER NOT NULL DEFAULT 0,
    lat REAL,
    lng REAL,
    loc_estimated INTEGER NOT NULL DEFAULT 0,
    altitude REAL,
    place_name TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    exif_json TEXT,
    lighting_tag TEXT,
    analysis_json TEXT,
    batch_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    journal_included_at INTEGER
  );
  CREATE INDEX photos_trip ON photos(trip_id, taken_at);
  CREATE TABLE notes (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    lat REAL,
    lng REAL,
    place_name TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at INTEGER NOT NULL,
    journal_included_at INTEGER
  );
  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    journal_included_at INTEGER
  );
  CREATE TABLE days (
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    code INTEGER NOT NULL,
    tmax REAL NOT NULL,
    tmin REAL NOT NULL,
    PRIMARY KEY (trip_id, date)
  );
  CREATE TABLE journals (
    trip_id TEXT PRIMARY KEY NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    content_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  // Non-secret preferences too long for the secure store
  `
  CREATE TABLE prefs (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // Id of the last buddy message before the current conversation; earlier ones stay for the journal but leave the model's context
  `
  ALTER TABLE trips ADD COLUMN chat_since INTEGER NOT NULL DEFAULT 0;
  `,
];

export function migrate() {
  db.execSync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    db.withTransactionSync(() => db.execSync(MIGRATIONS[version]));
    version += 1;
    db.execSync(`PRAGMA user_version = ${version}`);
  }
}
