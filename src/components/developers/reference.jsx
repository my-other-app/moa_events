import { Fragment } from "react";
import { apiContext, curlFor, fieldRows, groupByTag, listOperations, listWebhooks, objectsOf, pretty, sentWhen, sharedWebhookDescription, typeLabel } from "@/developers/openapi";
import { CodeBlock, Inline, SmartLink } from "./blocks";

/*
 * The API reference, rendered on the server from the OpenAPI document:
 * every operation (method, path, scopes, who may call it, parameters, the
 * request body's fields, a curl example, the success response's example
 * and the errors), every webhook, and every object they use. Plain HTML in
 * the site's own style: no third-party renderer, nothing run in the browser
 * but the copy buttons.
 */

const AUDIENCE = {
  all: "API keys and partner apps",
  partner: "Partner apps only, with the app's own token",
  public: "Anyone: no key needed",
};

const STATUS_WORDS = { 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", "2XX": "Success" };

/** An operation's description without the "Needs one of: …" a generator adds (the Scope row says it). */
const withoutScopeLine = (text) => String(text || "").replace(/\s*Needs one of: [^\n]*\s*$/, "");

/** Paragraphs of an OpenAPI description, with its `code`, **bold** and links; lines inside a paragraph run together. */
function Description({ text }) {
  if (!text) return null;
  return withoutScopeLine(text)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((p, i) => (
      <p key={i}>
        <Inline text={p} />
      </p>
    ));
}

/** Words that name error codes (ALREADY_EXISTS…), each linked to the Errors page. */
function CodedWords({ text }) {
  return String(text || "")
    .split(/(\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b(?:VALIDATION|CONFLICT|FORBIDDEN|INTERNAL|UNAUTHENTICATED)\b)/)
    .map((part, i) =>
      i % 2 ? (
        <SmartLink key={i} href="/developers/errors#codes">
          <code>{part}</code>
        </SmartLink>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    );
}

export function MethodBadge({ method }) {
  return <span className={`dv-method dv-method--${method.toLowerCase()}`}>{method}</span>;
}

/** A type in words, the names of objects described below linked to them. */
function TypeText({ label, objects }) {
  const parts = String(label).split(/(\b[A-Z][A-Za-z0-9]*\b)/);
  return (
    <span className="dv-type">
      {parts.map((part, i) =>
        objects.has(part) ? (
          <a key={i} href={`#obj-${part}`}>
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </span>
  );
}

/** A scope's row on the Scopes page: "scope-events-read". */
export const scopeAnchor = (name) => `scope-${String(name).replace(/[^a-z0-9]+/gi, "-")}`;

const valueList = (values) => values.map((v) => `\`${typeof v === "string" ? v : JSON.stringify(v)}\``).join(", ");

function FieldTable({ rows, objects, caption }) {
  if (!rows.length) return null;
  return (
    <div className="dv-table" role="region" aria-label={caption} tabIndex={0}>
      <table className="dv-fields">
        <caption className="dc-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Type</th>
            <th scope="col">What it is</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th scope="row">
                <code>{r.name}</code>
                {r.required ? <span className="dv-flag dv-flag--req">required</span> : null}
                {r.readOnly ? <span className="dv-flag">read only</span> : null}
              </th>
              <td>
                <TypeText label={r.type} objects={objects} />
              </td>
              <td>
                {r.description ? <span>{r.description}</span> : null}
                {r.values.length ? (
                  <span className="dv-values">
                    {" "}
                    One of: <Inline text={valueList(r.values)} />.
                  </span>
                ) : null}
                {r.default !== undefined && r.default !== null ? (
                  <span className="dv-values">
                    {" "}
                    Default: <code>{JSON.stringify(r.default)}</code>.
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParamTable({ params, objects, caption }) {
  return (
    <div className="dv-table" role="region" aria-label={caption} tabIndex={0}>
      <table className="dv-fields">
        <caption className="dc-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">In</th>
            <th scope="col">Type</th>
            <th scope="col">What it is</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={`${p.in}:${p.name}`}>
              <th scope="row">
                <code>{p.name}</code>
                {p.required ? <span className="dv-flag dv-flag--req">required</span> : null}
              </th>
              <td>{p.in}</td>
              <td>
                <TypeText label={p.type} objects={objects} />
              </td>
              <td>
                {p.description}
                {p.values.length ? (
                  <span className="dv-values">
                    {" "}
                    One of: <Inline text={valueList(p.values)} />.
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The errors an operation can answer with: each code its examples name, else the status and its words. */
function ErrorTable({ responses, caption }) {
  const rows = [];
  for (const r of responses.filter((x) => /^[45]/.test(x.status))) {
    if (r.errors.length) for (const e of r.errors) rows.push({ status: r.status, code: e.code, when: e.summary || e.message || r.description });
    else rows.push({ status: r.status, code: null, when: r.description });
  }
  if (!rows.length) return null;
  const coded = rows.some((r) => r.code);
  return (
    <div className="dv-table" role="region" aria-label={caption} tabIndex={0}>
      <table className="dv-fields dv-errors">
        <caption className="dc-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            {coded ? <th scope="col">Code</th> : null}
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <th scope="row">{row.status}</th>
              {coded ? <td>{row.code ? <SmartLink href="/developers/errors#codes">{<code>{row.code}</code>}</SmartLink> : "—"}</td> : null}
              <td>
                <CodedWords text={row.when} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectRef({ name, objects }) {
  if (!name) return null;
  return objects.has(name) ? (
    <a href={`#obj-${name}`}>
      <code>{name}</code>
    </a>
  ) : (
    <code>{name}</code>
  );
}

export function Operation({ op, doc, api, objects }) {
  const successes = op.responses.filter((r) => /^2/.test(r.status));
  const title = `${op.anchor}-title`;
  return (
    <section className="dv-op" id={op.anchor} aria-labelledby={title}>
      <h3 id={title} className="dv-op-title">
        {op.summary}
      </h3>
      <p className="dv-op-line">
        <MethodBadge method={op.method} />
        <code className="dv-op-path">{op.path}</code>
        {op.deprecated ? <span className="dv-flag">deprecated</span> : null}
      </p>
      <Description text={op.description} />
      <dl className="dv-op-meta">
        <div>
          <dt>{op.scopes && op.scopes.length > 1 ? "Scopes (any one)" : "Scope"}</dt>
          <dd>
            {op.scopes === null ? (
              "None"
            ) : op.scopes.length ? (
              op.scopes.map((s, i) => (
                <Fragment key={s}>
                  {i ? <span className="dv-or"> or </span> : null}
                  <SmartLink className="dv-scope" href={`/developers/scopes#${scopeAnchor(s)}`}>
                    <code>{s}</code>
                  </SmartLink>
                </Fragment>
              ))
            ) : (
              "Any key or token"
            )}
          </dd>
        </div>
        <div>
          <dt>Who can call it</dt>
          <dd>{AUDIENCE[op.audience] || AUDIENCE.all}</dd>
        </div>
      </dl>

      {op.parameters.length ? (
        <>
          <h4>Parameters</h4>
          <ParamTable params={op.parameters} objects={objects} caption={`${op.summary}: parameters`} />
        </>
      ) : null}

      {op.requestBody ? (
        <>
          <h4>
            Request body{op.requestBody.schemaName ? <> · <ObjectRef name={op.requestBody.schemaName} objects={objects} /></> : null}
          </h4>
          <FieldTable rows={op.requestBody.schema ? fieldRows(doc, op.requestBody.schema, { depth: 1, open: true }) : []} objects={objects} caption={`${op.summary}: request body`} />
        </>
      ) : null}

      <h4>Example request</h4>
      <CodeBlock lang="bash" code={curlFor(op, { baseUrl: api.baseUrl })} title="curl" />

      {successes.map((r, i) => (
        <Fragment key={r.status}>
          <h4>
            Response <code>{r.status}</code> {STATUS_WORDS[r.status] || ""}
            {r.schemaName ? <> · <ObjectRef name={r.schemaName} objects={objects} /></> : null}
          </h4>
          {r.description ? <p className="dv-op-resp">{r.description}</p> : null}
          {r.example !== undefined && r.status !== "204" && !(i > 0 && pretty(r.example) === pretty(successes[0].example)) ? <CodeBlock lang="json" code={pretty(r.example)} title={`${r.status} response`} /> : null}
        </Fragment>
      ))}

      {op.responses.some((r) => /^[45]/.test(r.status)) ? (
        <>
          <h4>Errors</h4>
          <ErrorTable responses={op.responses} caption={`${op.summary}: errors`} />
        </>
      ) : null}
    </section>
  );
}

function Webhook({ wh, objects, shared }) {
  const body = wh.requestBody;
  const title = `${wh.anchor}-title`;
  return (
    <section className="dv-op dv-op--webhook" id={wh.anchor} aria-labelledby={title}>
      <h3 id={title} className="dv-op-title">
        <code>{wh.path}</code>
      </h3>
      <Description text={sentWhen(wh)} />
      {wh.description && wh.description !== shared && sentWhen(wh) !== wh.description ? <Description text={wh.description} /> : null}
      {wh.object ? (
        <p className="dv-op-resp">
          <code>data.object</code>: <ObjectRef name={wh.object} objects={objects} />
        </p>
      ) : null}
      {body?.example !== undefined ? (
        <details className="dv-example">
          <summary>Example body</summary>
          <CodeBlock lang="json" code={pretty(body.example)} title={`${wh.path} body`} />
        </details>
      ) : null}
    </section>
  );
}

function ObjectSection({ obj, doc, objects }) {
  const title = `${obj.anchor}-title`;
  const schema = doc.components.schemas[obj.name];
  return (
    <section className="dv-op dv-object" id={obj.anchor} aria-labelledby={title}>
      <h3 id={title} className="dv-op-title">
        <code>{obj.name}</code>
      </h3>
      {obj.description ? <p>{obj.description}</p> : null}
      {obj.rows.length ? (
        <FieldTable rows={obj.rows} objects={objects} caption={`${obj.name}: fields`} />
      ) : obj.enum ? (
        <p>
          One of: <Inline text={valueList(obj.enum)} />.
        </p>
      ) : (
        <p>
          <TypeText label={typeLabel(doc, schema)} objects={objects} />
        </p>
      )}
    </section>
  );
}

/** The table of contents the left-hand menu shows for the reference: each tag, the webhooks and the objects. */
export function referenceToc(doc) {
  const groups = groupByTag(doc, listOperations(doc));
  return [...groups.map((g) => ({ id: g.slug, heading: g.label })), ...(listWebhooks(doc).length ? [{ id: "webhook-payloads", heading: "Webhooks" }] : []), { id: "objects", heading: "Objects" }];
}

export function Reference({ doc, source }) {
  const api = apiContext(doc);
  const operations = listOperations(doc);
  const webhooks = listWebhooks(doc);
  const groups = groupByTag(doc, operations);
  const list = objectsOf(doc, [...operations, ...webhooks]);
  const objects = new Set(list.map((o) => o.name));
  return (
    <div className="dv-ref" data-source={source} data-operations={operations.length}>
      {groups.map((g) => (
        <section key={g.slug} id={g.slug} className="dv-ref-group" aria-labelledby={`${g.slug}-title`}>
          <h2 id={`${g.slug}-title`}>{g.label}</h2>
          {g.description ? <p className="dv-ref-lede">{g.description}</p> : null}
          {g.operations.map((op) => (
            <Operation key={op.anchor} op={op} doc={doc} api={api} objects={objects} />
          ))}
        </section>
      ))}
      {webhooks.length ? (
        <section id="webhook-payloads" className="dv-ref-group" aria-labelledby="webhook-payloads-title">
          <h2 id="webhook-payloads-title">Webhooks</h2>
          <p className="dv-ref-lede">
            What we POST to your endpoints, signed: see <SmartLink href="/developers/webhooks">Webhooks</SmartLink> for the headers, signatures and retries.
          </p>
          {sharedWebhookDescription(webhooks) ? (
            <div className="dv-ref-lede">
              <Description text={sharedWebhookDescription(webhooks)} />
            </div>
          ) : null}
          {webhooks.map((wh) => (
            <Webhook key={wh.anchor} wh={wh} objects={objects} shared={sharedWebhookDescription(webhooks)} />
          ))}
        </section>
      ) : null}
      <section id="objects" className="dv-ref-group" aria-labelledby="objects-title">
        <h2 id="objects-title">Objects</h2>
        <p className="dv-ref-lede">What the calls take and return. A field marked read only is set by MyOtherApp: leave it out when you write.</p>
        {list.map((obj) => (
          <ObjectSection key={obj.name} obj={obj} doc={doc} objects={objects} />
        ))}
      </section>
    </div>
  );
}

/** The webhook types as a table: type (linked to its payload), when it is sent, and its data.object. */
export function WebhookTypes({ doc }) {
  const webhooks = listWebhooks(doc);
  if (!webhooks.length) return null;
  return (
    <div className="dv-table" role="region" aria-label="Webhook types" tabIndex={0}>
      <table className="dv-fields">
        <caption className="dc-sr">Every webhook type</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Sent when</th>
            <th scope="col">
              <code>data.object</code>
            </th>
          </tr>
        </thead>
        <tbody>
          {webhooks.map((wh) => (
            <tr key={wh.anchor}>
              <th scope="row">
                <SmartLink href={`/developers/reference#${wh.anchor}`}>
                  <code>{wh.path}</code>
                </SmartLink>
              </th>
              <td>{sentWhen(wh)}</td>
              <td>{wh.object ? <SmartLink href={`/developers/reference#obj-${wh.object}`}>{wh.object}</SmartLink> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every scope: what it allows, and the endpoints that need it (linked into the reference). */
export function ScopesTable({ scopes }) {
  return (
    <div className="dv-table" role="region" aria-label="Scopes" tabIndex={0}>
      <table className="dv-fields dv-scopes">
        <caption className="dc-sr">Every scope, what it allows and the endpoints that need it</caption>
        <thead>
          <tr>
            <th scope="col">Scope</th>
            <th scope="col">What it allows</th>
            <th scope="col">Endpoints</th>
          </tr>
        </thead>
        <tbody>
          {scopes.map((s) => (
            <tr key={s.name} id={scopeAnchor(s.name)}>
              <th scope="row">
                <code>{s.name}</code>
              </th>
              <td>{s.description}</td>
              <td>
                {s.operations.length ? (
                  <ul className="dv-scope-ops">
                    {s.operations.map((o) => (
                      <li key={o.anchor}>
                        <SmartLink href={`/developers/reference#${o.anchor}`}>
                          <code>
                            {o.method} {o.path}
                          </code>
                        </SmartLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="dv-muted">{s.name === "attendees:read" ? "Adds names, contact details and answers to registrations, certificates and webhooks." : "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
