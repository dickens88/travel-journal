export type Trip = {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  cover_photo_id: string | null;
  created_at: number;
  chat_since: number;
};

export type Photo = {
  id: string;
  trip_id: string;
  asset_id: string | null;
  file: string;
  width: number;
  height: number;
  taken_at: number | null;
  offset_min: number;
  lat: number | null;
  lng: number | null;
  loc_estimated: number;
  altitude: number | null;
  place_name: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  exif_json: string | null;
  lighting_tag: string | null;
  analysis_json: string | null;
  batch_id: string;
  added_at: number;
  journal_included_at: number | null;
};

export type Note = {
  id: string;
  trip_id: string;
  text: string;
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  source: 'manual' | 'buddy';
  created_at: number;
  journal_included_at: number | null;
};

export type ChatRow = {
  id: number;
  trip_id: string;
  role: 'user' | 'assistant';
  content_json: string;
  created_at: number;
  journal_included_at: number | null;
};

export type DayWeather = { trip_id: string; date: string; code: number; tmax: number; tmin: number };

export type JournalRow = {
  trip_id: string;
  content_json: string;
  updated_at: number;
};
