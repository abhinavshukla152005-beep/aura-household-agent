import { getJson } from './http.js';

const COOL_TOPICS = [
  'space', 'science', 'technology', 'history', 'nature', 'programming',
  'medicine', 'architecture', 'mathematics', 'geography', 'music', 'astronomy'
];

export async function headlines(limit = 5) {
  const res = await getJson(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`,
    { fixture: 'news.json' }
  );
  const items = (res.data.hits || []).slice(0, limit).map((h) => ({
    id: `hn-${h.objectID}`,
    title: h.title,
    source: h.url ? new URL(h.url).hostname.replace('www.', '') : 'news.ycombinator.com',
    points: h.points,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`
  })).filter((i) => i.title);
  return { source: res.source, count: items.length, items };
}

/** One facts-for-cards call: keeps a spoken summary short but the visual rich. */
export async function factOfTheDay(topic) {
  const t = COOL_TOPICS.includes(String(topic || '').toLowerCase()) ? topic : 'space';
  const res = await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`,
    { fixture: 'fact.json' }
  );
  return {
    source: res.source,
    topic: t,
    title: res.data.title || t,
    text: (res.data.extract || 'No summary available.').split('. ').slice(0, 2).join('. '),
    image: res.data.thumbnail?.source || null,
    url: res.data.content_urls?.desktop?.page || 'https://en.wikipedia.org'
  };
}

export const topics = COOL_TOPICS;
