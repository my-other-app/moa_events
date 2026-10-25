import { CREDITS_MODEL, packChannelTitle, packPrice, packQuantity, packUnit, packsFinePrint } from "@/utils/pricing";

/**
 * "Need more messages? Top-up packs": the email and WhatsApp packs a club
 * can buy past its plan's monthly allowance, from GET /api/v1/credit-packs
 * (parseCreditPacks' result, read on the server). Nothing at all when there
 * are none to show or the API couldn't say: the page never prints prices of
 * its own. Plain markup, no state: it renders on the server.
 */
export function CreditPacks({ data = null }) {
  if (!data?.channels?.length) return null;
  const { currency } = data;
  return (
    <section id="top-ups" className="pr-packs" aria-labelledby="pr-packs-title">
      <div className="pr-compare-head">
        <p className="dc-eyebrow">Top-up packs</p>
        <h2 id="pr-packs-title">Need more messages?</h2>
        <p>{CREDITS_MODEL.join(" ")}</p>
      </div>
      <div className={`pr-packs-grid pr-packs-grid--${data.channels.length}`}>
        {data.channels.map((c) => (
          <div key={c.channel} className="pr-packs-channel">
            <h3 id={`pr-packs-${c.channel}`}>{packChannelTitle(c.channel)}</h3>
            <ul aria-labelledby={`pr-packs-${c.channel}`}>
              {c.packs.map((p) => (
                <li key={`${p.quantity}:${p.price}`} className="pr-pack">
                  <span className="pr-pack-qty">{packQuantity(p)}</span>
                  <span className="pr-pack-price">{packPrice(p, currency)}</span>
                  <span className="pr-pack-unit">{packUnit(p, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="pr-fineprint">{packsFinePrint(data)}</p>
    </section>
  );
}
