import { db } from './db';
import type { ChatRow, DayWeather, JournalRow, Note, Photo, Trip } from './types';
import { notifyDbChange } from './useQuery';
import type { FootPhoto } from '@/stats/footprint';
import { newId } from '@/utils/id';

export type TripSummary = Trip & {
  photo_count: number;
  cover_file: string | null;
  has_journal: number;
  pending_count: number;
  first_taken: number | null;
  last_taken: number | null;
};

export function listTrips(): TripSummary[] {
  return db.getAllSync<TripSummary>(`
    SELECT t.*,
      (SELECT COUNT(*) FROM photos p WHERE p.trip_id = t.id) AS photo_count,
      COALESCE(
        (SELECT file FROM photos p WHERE p.id = t.cover_photo_id),
        (SELECT file FROM photos p WHERE p.trip_id = t.id ORDER BY taken_at LIMIT 1)
      ) AS cover_file,
      EXISTS (SELECT 1 FROM journals j WHERE j.trip_id = t.id) AS has_journal,
      (SELECT COUNT(*) FROM photos p WHERE p.trip_id = t.id AND p.journal_included_at IS NULL)
        + (SELECT COUNT(*) FROM notes n WHERE n.trip_id = t.id AND n.journal_included_at IS NULL) AS pending_count,
      (SELECT MIN(taken_at) FROM photos p WHERE p.trip_id = t.id) AS first_taken,
      (SELECT MAX(taken_at) FROM photos p WHERE p.trip_id = t.id) AS last_taken
    FROM trips t ORDER BY t.start_date DESC, t.created_at DESC`);
}

export function getTrip(id: string) {
  return db.getFirstSync<Trip>('SELECT * FROM trips WHERE id = ?', id);
}

export function createTrip(title: string, startDate: string, endDate: string | null) {
  const id = newId();
  db.runSync(
    'INSERT INTO trips (id, title, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?)',
    id, title, startDate, endDate, Date.now(),
  );
  notifyDbChange();
  return id;
}

export function updateTrip(id: string, fields: Partial<Pick<Trip, 'title' | 'end_date' | 'cover_photo_id'>>) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) return;
  db.runSync(
    `UPDATE trips SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map((k) => fields[k] ?? null), id,
  );
  notifyDbChange();
}

export function deleteTrip(id: string) {
  db.runSync('DELETE FROM trips WHERE id = ?', id);
  notifyDbChange();
}

export function listPhotos(tripId: string) {
  return db.getAllSync<Photo>('SELECT * FROM photos WHERE trip_id = ? ORDER BY taken_at, added_at', tripId);
}

export function countTrips() {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM trips')?.n ?? 0;
}

export function listAllLocatedPhotos() {
  return db.getAllSync<FootPhoto>(
    'SELECT trip_id, taken_at, offset_min, lat, lng, country, region, city FROM photos WHERE lat IS NOT NULL ORDER BY taken_at',
  );
}

export function insertPhotos(rows: Omit<Photo, 'journal_included_at'>[]) {
  db.withTransactionSync(() => {
    for (const r of rows) {
      db.runSync(
        `INSERT INTO photos (id, trip_id, asset_id, file, width, height, taken_at, offset_min, lat, lng, loc_estimated,
          altitude, place_name, country, region, city, exif_json, lighting_tag, analysis_json, batch_id, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, r.trip_id, r.asset_id, r.file, r.width, r.height, r.taken_at, r.offset_min, r.lat, r.lng, r.loc_estimated,
        r.altitude, r.place_name, r.country, r.region, r.city, r.exif_json, r.lighting_tag, r.analysis_json, r.batch_id, r.added_at,
      );
    }
  });
  notifyDbChange();
}

export type PhotoPatch = { id: string; fields: Partial<Photo> };

export function updatePhotos(patches: PhotoPatch[]) {
  if (!patches.length) return;
  db.withTransactionSync(() => {
    for (const { id, fields } of patches) {
      const keys = Object.keys(fields) as (keyof Photo)[];
      if (!keys.length) continue;
      db.runSync(`UPDATE photos SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k] ?? null), id);
    }
  });
  notifyDbChange();
}

export function listNotes(tripId: string) {
  return db.getAllSync<Note>('SELECT * FROM notes WHERE trip_id = ? ORDER BY created_at', tripId);
}

export function addNote(note: Omit<Note, 'id' | 'journal_included_at'>) {
  const id = newId();
  db.runSync(
    'INSERT INTO notes (id, trip_id, text, lat, lng, place_name, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, note.trip_id, note.text, note.lat, note.lng, note.place_name, note.source, note.created_at,
  );
  notifyDbChange();
  return id;
}

export function deleteNote(id: string) {
  db.runSync('DELETE FROM notes WHERE id = ?', id);
  notifyDbChange();
}

export function listChat(tripId: string) {
  return db.getAllSync<ChatRow>('SELECT * FROM chat_messages WHERE trip_id = ? ORDER BY id', tripId);
}

export function addChatMessage(tripId: string, role: ChatRow['role'], content: unknown) {
  db.runSync(
    'INSERT INTO chat_messages (trip_id, role, content_json, created_at) VALUES (?, ?, ?, ?)',
    tripId, role, JSON.stringify(content), Date.now(),
  );
  notifyDbChange();
}

export function listDays(tripId: string) {
  return db.getAllSync<DayWeather>('SELECT * FROM days WHERE trip_id = ? ORDER BY date', tripId);
}

export function upsertDays(tripId: string, days: Omit<DayWeather, 'trip_id'>[]) {
  db.withTransactionSync(() => {
    for (const d of days) {
      db.runSync(
        'INSERT OR REPLACE INTO days (trip_id, date, code, tmax, tmin) VALUES (?, ?, ?, ?, ?)',
        tripId, d.date, d.code, d.tmax, d.tmin,
      );
    }
  });
  notifyDbChange();
}

export function getJournal(tripId: string) {
  return db.getFirstSync<JournalRow>('SELECT * FROM journals WHERE trip_id = ?', tripId);
}

export function saveJournal(tripId: string, content: unknown) {
  db.runSync(
    'INSERT OR REPLACE INTO journals (trip_id, content_json, updated_at) VALUES (?, ?, ?)',
    tripId, JSON.stringify(content), Date.now(),
  );
  notifyDbChange();
}

// Mark every item that existed when the journal run started as written into it
export function markIncluded(tripId: string, before: number) {
  const now = Date.now();
  db.withTransactionSync(() => {
    db.runSync('UPDATE photos SET journal_included_at = ? WHERE trip_id = ? AND journal_included_at IS NULL AND added_at <= ?', now, tripId, before);
    db.runSync('UPDATE notes SET journal_included_at = ? WHERE trip_id = ? AND journal_included_at IS NULL AND created_at <= ?', now, tripId, before);
    db.runSync('UPDATE chat_messages SET journal_included_at = ? WHERE trip_id = ? AND journal_included_at IS NULL AND created_at <= ?', now, tripId, before);
  });
  notifyDbChange();
}

export function pendingCounts(tripId: string) {
  return db.getFirstSync<{ photos: number; notes: number; chats: number }>(
    `SELECT
      (SELECT COUNT(*) FROM photos WHERE trip_id = ?1 AND journal_included_at IS NULL) AS photos,
      (SELECT COUNT(*) FROM notes WHERE trip_id = ?1 AND journal_included_at IS NULL) AS notes,
      (SELECT COUNT(*) FROM chat_messages WHERE trip_id = ?1 AND role = 'user' AND journal_included_at IS NULL
        AND content_json NOT LIKE '[{"type":"tool_result"%') AS chats`,
    tripId,
  ) ?? { photos: 0, notes: 0, chats: 0 };
}
