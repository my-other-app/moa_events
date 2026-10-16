import { picksTotal } from "@/utils/picks";
import { rupees } from "@/utils/register";

/**
 * What the event sells with its ticket. Each item takes a quantity (and a
 * size first, when it has sizes); the picks go with the registration and are
 * paid in the same checkout. The flow fetches the shelf and only shows this
 * step when there is something on it.
 */
const MAX_EACH = 10;

function Photo({ item }) {
  return item.photo_url ? (
    <img className="rg-merch-photo" src={item.photo_url} alt="" loading="lazy" decoding="async" width="88" height="88" />
  ) : (
    <span className="rg-merch-photo rg-merch-photo--empty" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" focusable="false">
        <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function MerchPicker({ items, picks, onChange }) {
  if (!items || items.length === 0) return null;

  const set = (id, patch) => onChange({ ...picks, [id]: { qty: 0, variant_id: null, ...(picks[id] || {}), ...patch } });
  const total = picksTotal(items, picks);

  return (
    <div className="rg-merch" data-testid="merch-picker">
      <ul className="rg-merch-list">
        {items.map((item) => {
          const p = picks[item.id] || { qty: 0, variant_id: null };
          const sized = item.variants.length > 0;
          const variant = sized ? item.variants.find((v) => v.id === p.variant_id) : null;
          const left = sized ? (variant ? variant.left ?? MAX_EACH : MAX_EACH) : item.left ?? MAX_EACH;
          const max = Math.max(0, Math.min(MAX_EACH, left));
          const soldOut = !sized && item.left === 0;
          const needSize = sized && !p.variant_id;
          const groupId = `rg-size-${item.id}`;
          return (
            <li className={`rg-merch-item${p.qty > 0 ? " is-picked" : ""}`} key={item.id}>
              <Photo item={item} />
              <div className="rg-merch-body">
                <p className="rg-merch-name">{item.name}</p>
                {item.description ? <p className="rg-merch-desc">{item.description}</p> : null}
                <p className="rg-merch-price">
                  {item.price > 0 ? (
                    <>
                      <strong>{rupees(item.price)}</strong> each
                    </>
                  ) : (
                    <strong>Free with your ticket</strong>
                  )}
                  {soldOut ? <span className="rg-merch-low">Sold out</span> : !sized && item.left !== null && item.left !== undefined && item.left <= 5 ? <span className="rg-merch-low">Only {item.left} left</span> : null}
                </p>

                {sized ? (
                  <fieldset className="rg-sizes">
                    <legend className="rg-sizes-legend" id={groupId}>
                      Size<span className="dc-sr"> for {item.name}</span>
                    </legend>
                    <div className="rg-sizes-row">
                      {item.variants.map((v) => {
                        const out = v.left !== null && v.left !== undefined && v.left <= 0;
                        const on = p.variant_id === v.id;
                        return (
                          <label key={v.id} className={`rg-size${on ? " is-on" : ""}${out ? " is-out" : ""}`}>
                            <input
                              type="radio"
                              name={`rg-size-${item.id}`}
                              value={v.id}
                              checked={on}
                              disabled={out}
                              onChange={() => set(item.id, { variant_id: v.id, qty: Math.min(Math.max(1, p.qty), Math.min(MAX_EACH, v.left ?? MAX_EACH)) })}
                            />
                            <span>{v.label}</span>
                            {out ? <small>Sold out</small> : v.left !== null && v.left !== undefined && v.left <= 5 ? <small>{v.left} left</small> : null}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
              </div>

              <div className="rg-merch-qty">
                <div className="rg-stepper" role="group" aria-label={`How many ${item.name}`}>
                  <button type="button" aria-label={`One less ${item.name}`} onClick={() => set(item.id, { qty: Math.max(0, p.qty - 1) })} disabled={p.qty === 0}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <output aria-label={`${item.name} quantity`} aria-live="polite">
                    {p.qty}
                  </output>
                  <button
                    type="button"
                    aria-label={`One more ${item.name}`}
                    onClick={() => set(item.id, { qty: Math.min(max, p.qty + 1) })}
                    disabled={soldOut || p.qty >= max || needSize}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {needSize ? <p className="rg-merch-need">Pick a size first</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`rg-merch-total${total > 0 ? " is-on" : ""}`} aria-live="polite">
        <span>Add-ons</span>
        <strong>{total > 0 ? rupees(total) : "None yet"}</strong>
      </p>
    </div>
  );
}
