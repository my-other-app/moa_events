import { jsonForScript } from "./jsonld";

/** Structured data in the page: one <script type="application/ld+json"> per object, safe for any text inside. */
export function JsonLd({ data }) {
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean);
  return items.map((item, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(item) }} />);
}
