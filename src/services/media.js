import { getJson } from './http.js';

/** Titles that must not reach a household with a child in it, or a shared living room. */
const BLOCKED = ['explicit', 'r', 'nc-17', 'tv-ma', 'tv-14', 'pg-13'];
/** Ratings that mean "no data" on the catalogue side - treated as allowed, but flagged. */
const UNKNOWN = ['', 'none', 'not rated', 'nr', 'approved', 'g', 'pg', 'tv-y', 'tv-y7', 'tv-g', 'all ages', 'clean'];

/** Catalogue lookup for movies / music / video. Apple retired `media=movie` search,
 *  so video comes through the generic search with an entity filter instead. */
export async function searchMedia({ term = 'family adventure', media = 'movie', limit = 8, country = 'us' } = {}) {
  const params = media === 'movie'
    ? { media: 'all', entity: 'movie,tvSeason,musicVideo' }
    : { media };
  const qs = Object.entries({ ...params, limit: Math.min(limit + 6, 40), country, term })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const res = await getJson(`https://itunes.apple.com/search?${qs}`, { fixture: `media-${media}.json` });
  const allowRemoteArt = process.env.AURA_ALLOW_REMOTE_ART === '1';

  const seen = new Set();
  const items = (res.data.results || []).map((r) => {
    const title = r.longDescription ? String(r.trackName || r.collectionName || '').trim() : String(r.trackName || r.collectionName || '').trim();
    const rating = String(r.contentAdvisoryRating || '').toLowerCase();
    return {
      id: `${media}-${r.trackId ?? r.collectionId}`,
      kind: r.kind || (media === 'movie' ? 'feature movie' : media),
      title: title || 'Untitled',
      subtitle: [r.artistName, r.primaryGenreName, (r.releaseDate || r.issueDate || '').slice(0, 4)].filter(Boolean).join(' • '),
      artwork: allowRemoteArt && r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '300x300bb') : `/art/${encodeURIComponent(title || 'aura')}.svg`,
      runtimeMin: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null,
      price: r.price ?? 0,
      currency: r.currency ?? 'USD',
      contentRating: r.contentAdvisoryRating || 'Not rated',
      ratingKnown: rating !== '' && !UNKNOWN.slice(1, 4).includes(rating),
      familySafe: !BLOCKED.includes(rating),
      url: r.trackViewUrl ?? r.collectionViewUrl
    };
  }).filter((i) => {
    const key = i.title.toLowerCase();
    if (!i.title || i.title === 'Untitled' || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);

  return {
    source: res.source, term, media, count: items.length, items,
    note: res.source !== 'live' ? 'catalogue served from the bundled fixture' : undefined
  };
}

/** Rough family-appropriateness gate used by the planner's substitution rule. */
export function isFamilySafe(item) {
  return item.familySafe !== false && !BLOCKED.includes(String(item.contentRating || '').toLowerCase());
}
