import { fieldId, questionControl } from "@/utils/register";

/**
 * The form's controls, in the site's look: a label over the control, a hint
 * under it, and the error beside it once there is one. Every control is a
 * real input, so autofill, the phone's keyboards and screen readers just work.
 */

function Label({ htmlFor, required, children, as = "label", id }) {
  const Tag = as;
  return (
    <Tag className="rg-label" htmlFor={as === "label" ? htmlFor : undefined} id={id}>
      {children}
      {required ? (
        <span className="rg-req" aria-hidden="true">
          *
        </span>
      ) : (
        <span className="rg-opt">Optional</span>
      )}
    </Tag>
  );
}

function ErrorText({ id, error }) {
  return (
    <p id={id} className="rg-error" aria-live="polite">
      {error ? (
        <>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <rect x="7.1" y="3.8" width="1.8" height="5.4" rx="0.9" fill="#fff" />
            <circle cx="8" cy="11.6" r="1.05" fill="#fff" />
          </svg>
          <span>{error}</span>
        </>
      ) : null}
    </p>
  );
}

const describedBy = (...ids) => ids.filter(Boolean).join(" ") || undefined;

/** A text box (or a textarea), with its label, hint and error. `extra` sits under the hint (the email typo fix). */
export function TextField({ name, label, required, hint, error, value, onChange, onBlur, multiline = false, extra = null, inputProps = {} }) {
  const id = fieldId(name);
  const hintId = hint ? `${id}-hint` : null;
  const errId = `${id}-err`;
  const common = {
    id,
    name,
    value: value || "",
    onChange: (e) => onChange(e.target.value),
    onBlur,
    required,
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(hintId, errId),
  };
  return (
    <div className={`rg-field${error ? " is-invalid" : ""}`}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {multiline ? <textarea className="rg-input rg-textarea" rows={4} {...common} {...inputProps} /> : <input className="rg-input" {...common} {...inputProps} />}
      <ErrorText id={errId} error={error} />
      {hint ? (
        <p id={hintId} className="rg-hint">
          {hint}
        </p>
      ) : null}
      {extra}
    </div>
  );
}

/** A native select: the phone's own picker is the best one there is. */
export function SelectField({ name, label, required, error, value, options, onChange, onBlur }) {
  const id = fieldId(name);
  const errId = `${id}-err`;
  return (
    <div className={`rg-field${error ? " is-invalid" : ""}`}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div className="rg-select">
        <select
          id={id}
          name={name}
          className={`rg-input${value ? "" : " is-empty"}`}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={errId}
        >
          <option value="">Choose an option</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <svg className="rg-select-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <ErrorText id={errId} error={error} />
    </div>
  );
}

/** Pick one, as a list of rows big enough for a thumb. */
export function ChoiceField({ name, label, required, error, value, options, onChange, onBlur }) {
  const id = fieldId(name);
  const legendId = `${id}-legend`;
  const errId = `${id}-err`;
  return (
    <fieldset className={`rg-field rg-fieldset${error ? " is-invalid" : ""}`} aria-describedby={errId}>
      <Label as="legend" id={legendId} required={required}>
        {label}
      </Label>
      <div className="rg-choices">
        {options.map((o, i) => {
          const checked = value === o;
          return (
            <label key={o} className={`rg-choice${checked ? " is-on" : ""}`}>
              <input
                type="radio"
                id={i === 0 ? id : undefined}
                name={name}
                value={o}
                checked={checked}
                onChange={() => onChange(o)}
                onBlur={onBlur}
                aria-invalid={error ? true : undefined}
              />
              <span className="rg-choice-mark" aria-hidden="true" />
              <span className="rg-choice-text">{o}</span>
            </label>
          );
        })}
      </div>
      <ErrorText id={errId} error={error} />
    </fieldset>
  );
}

/** One tick box ("I agree to the rules"): ticked means the option's own text is the answer. */
export function CheckField({ name, label, required, error, value, option, onChange, onBlur }) {
  const id = fieldId(name);
  const errId = `${id}-err`;
  const checked = value === option;
  const sameText = option.trim().toLowerCase() === label.trim().toLowerCase() || option === "Yes";
  return (
    <div className={`rg-field${error ? " is-invalid" : ""}`}>
      <label className={`rg-choice rg-check${checked ? " is-on" : ""}`} htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? option : "")}
          onBlur={onBlur}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={errId}
        />
        <span className="rg-check-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
            <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="rg-choice-text">
          <span className="rg-check-label">
            {label}
            {required ? (
              <span className="rg-req" aria-hidden="true">
                *
              </span>
            ) : null}
          </span>
          {!sameText ? <span className="rg-check-option">{option}</span> : null}
        </span>
      </label>
      <ErrorText id={errId} error={error} />
    </div>
  );
}

/** One of the organiser's questions, with the control its type calls for. */
export function QuestionField({ question: q, value, error, onChange, onBlur }) {
  const control = questionControl(q);
  const name = `q:${q.key}`;
  const props = { name, label: q.label, required: q.required, error, value, onChange, onBlur };
  switch (control.kind) {
    case "select":
      return <SelectField {...props} options={q.options} />;
    case "choice":
      return <ChoiceField {...props} options={q.options} />;
    case "check":
      return <CheckField {...props} option={control.value} />;
    case "textarea":
      return <TextField {...props} multiline inputProps={{ maxLength: 2000 }} />;
    default: {
      // eslint-disable-next-line no-unused-vars
      const { kind, ...inputProps } = control;
      return <TextField {...props} inputProps={inputProps} />;
    }
  }
}
