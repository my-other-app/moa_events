import React, { useEffect, useRef, useState } from "react";
import { eventsApi } from "@/api/events";
import { picksTotal } from "../utils/picks";

/**
 * What the event sells with its ticket. Each item takes a quantity (and a
 * size when it has sizes); the picks go with the registration and are paid
 * in the same checkout. Nothing shows when the event sells nothing.
 */
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function MerchPicker({ eventId, picks, onChange, onItems }) {
  const [items, setItems] = useState(null);
  // The parent's callback, read through a ref so a new function each render does not refetch.
  const onItemsRef = useRef(onItems);
  onItemsRef.current = onItems;

  useEffect(() => {
    let alive = true;
    eventsApi.fetchStoreCatalog(eventId).then((cat) => {
      if (!alive) return;
      const list = cat && cat.enabled ? cat.items : [];
      setItems(list);
      if (onItemsRef.current) onItemsRef.current(list);
    });
    return () => {
      alive = false;
    };
  }, [eventId]);

  if (!items || items.length === 0) return null;

  const set = (id, patch) => onChange({ ...picks, [id]: { qty: 0, variant_id: null, ...(picks[id] || {}), ...patch } });
  const total = picksTotal(items, picks);

  return (
    <div className="merch-picker" data-testid="merch-picker">
      <div className="merch-picker-head">
        <h3>Add to your ticket</h3>
        <p>Paid together with the registration. Collect at the door.</p>
      </div>
      {items.map((item) => {
        const p = picks[item.id] || { qty: 0, variant_id: null };
        const left = item.variants.length > 0 ? (item.variants.find((v) => v.id === p.variant_id)?.left ?? 10) : item.left ?? 10;
        const max = Math.max(0, Math.min(10, left));
        return (
          <div className="merch-item" key={item.id}>
            {item.photo_url ? <img src={item.photo_url} alt="" className="merch-item-photo" /> : <div className="merch-item-photo merch-item-photo--empty" />}
            <div className="merch-item-body">
              <div className="merch-item-name">{item.name}</div>
              {item.description ? <div className="merch-item-desc">{item.description}</div> : null}
              <div className="merch-item-price">{item.price > 0 ? `${INR.format(item.price)} each` : "Free with your ticket"}</div>
            </div>
            <div className="merch-item-controls">
              {item.variants.length > 0 ? (
                <select aria-label={`${item.name} size`} value={p.variant_id || ""} onChange={(e) => set(item.id, { variant_id: e.target.value || null, qty: e.target.value ? Math.max(1, p.qty) : 0 })}>
                  <option value="">Size</option>
                  {item.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {v.left <= 5 ? ` · ${v.left} left` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="merch-qty">
                <button type="button" aria-label={`One less ${item.name}`} onClick={() => set(item.id, { qty: Math.max(0, p.qty - 1) })} disabled={p.qty === 0}>
                  −
                </button>
                <span aria-label={`${item.name} quantity`}>{p.qty}</span>
                <button type="button" aria-label={`One more ${item.name}`} onClick={() => set(item.id, { qty: Math.min(max, p.qty + 1) })} disabled={p.qty >= max || (item.variants.length > 0 && !p.variant_id)}>
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {total > 0 ? (
        <div className="merch-picker-total">
          <span>Merchandise</span>
          <strong>{INR.format(total)}</strong>
        </div>
      ) : null}
    </div>
  );
}
