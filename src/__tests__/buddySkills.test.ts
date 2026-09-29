import { describe, expect, it } from '@jest/globals';

import { buddySkills, destinationOf, lastPhotoSpot, skillPrompt } from '@/ai/buddySkills';
import type { Photo, Trip } from '@/db/types';

const trip = (end: string | null = null): Trip => ({ id: 't', title: '京都红叶', start_date: '2025-11-12', end_date: end, cover_photo_id: null, created_at: 0 });

function photo(id: string, over: Partial<Photo> = {}): Photo {
  return {
    id, trip_id: 't', asset_id: null, file: `${id}.jpg`, width: 1, height: 1, taken_at: Date.parse('2025-11-12T01:00:00Z'), offset_min: 540,
    lat: 34.967, lng: 135.7727, loc_estimated: 0, altitude: null, place_name: '伏见稻荷大社', country: null, region: null, city: '京都',
    exif_json: null, lighting_tag: null, analysis_json: null, batch_id: 'b', added_at: 0, journal_included_at: null, ...over,
  };
}

const ids = (t: Trip, ps: Photo[]) => buddySkills(t, ps).map((s) => s.id);

describe('buddy skills', () => {
  it('offers photo skills only when the trip has photos', () => {
    expect(ids(trip(), [])).not.toContain('story');
    expect(ids(trip(), [])).not.toContain('recap');
    expect(ids(trip(), [photo('a')])).toEqual(expect.arrayContaining(['guide', 'story', 'recap']));
  });

  it('drops planning once the trip has ended', () => {
    expect(ids(trip(), [])).toContain('plan');
    expect(ids(trip('2999-01-01'), [])).toContain('plan');
    expect(ids(trip('2025-11-15'), [])).not.toContain('plan');
  });

  it('picks the most photographed city as the destination', () => {
    const ps = [photo('a', { city: '大阪' }), photo('b'), photo('c')];
    expect(destinationOf(trip(), ps)).toBe('京都');
    expect(destinationOf(trip(), [])).toBe('「京都红叶」这趟的目的地');
  });

  it('uses the last located photo as the spot', () => {
    const ps = [photo('a'), photo('b', { place_name: '清水寺', lat: 34.9949, lng: 135.785 }), photo('c', { lat: null, lng: null })];
    expect(lastPhotoSpot(ps)).toMatchObject({ label: '清水寺，京都', live: false });
    expect(lastPhotoSpot([photo('x', { lat: null, lng: null })])).toBeNull();
  });

  it('names where the user is in place prompts', () => {
    const live = skillPrompt('guide', { trip: trip(), photos: [], spot: { label: '鸭川', lat: 35.01, lng: 135.77, live: true } });
    expect(live).toContain('我现在在鸭川（坐标 35.0100, 135.7700）');
    const past = skillPrompt('food', { trip: trip(), photos: [photo('a')], spot: lastPhotoSpot([photo('a')]) });
    expect(past).toContain('我最近到过伏见稻荷大社，京都');
    expect(skillPrompt('shots', { trip: trip(), photos: [photo('a')] })).toContain('我在京都');
  });
});
