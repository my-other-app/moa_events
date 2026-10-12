/** The shelf picks, as the registration sends them, and what they add up to. */
export function picksToPayload(items, picks) {
  const out = [];
  for (const item of items) {
    const p = picks[item.id];
    if (!p || !p.qty) continue;
    if (item.variants.length > 0 && !p.variant_id) continue;
    out.push({ item_id: item.id, variant_id: item.variants.length > 0 ? p.variant_id : null, qty: p.qty });
  }
  return out;
}

export function picksTotal(items, picks) {
  return items.reduce((sum, item) => {
    const p = picks[item.id];
    return p && p.qty ? sum + item.price * p.qty : sum;
  }, 0);
}

