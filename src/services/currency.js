import { getJson } from './http.js';

let cache = { rates: null, fetchedAt: 0, base: 'USD' };

export async function rates(base = 'USD') {
  if (cache.rates && cache.base === base && Date.now() - cache.fetchedAt < 15 * 60_000) {
    return { source: 'cache', base, rates: cache.rates };
  }
  const res = await getJson(`https://open.er-api.com/v6/latest/${base}`, { fixture: 'fx.json' });
  cache = { rates: res.data.rates, fetchedAt: Date.now(), base };
  return { source: res.source, base, rates: res.data.rates };
}

/** Convert an amount written in one household currency to another. */
export async function convert(amount, from = 'USD', to = 'INR') {
  if (from === to) return { source: 'none', amount, from, to, converted: amount };
  const { rates: table, source } = await rates(from);
  const rate = table?.[to];
  if (!rate) throw new Error(`No exchange rate for ${from}->${to}`);
  return {
    source, amount, from, to, rate,
    converted: Math.round(amount * rate * 100) / 100,
    spoken: `${amount} ${from} is about ${Math.round(amount * rate)} ${to}`
  };
}
