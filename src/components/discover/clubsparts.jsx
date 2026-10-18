import { CLUBS_URL, CONTACT_EMAIL } from "@/config";
import { clubFaq } from "@/content/forclubs";
import { contactUrl, loginUrl, signupUrl } from "@/utils/pricing";
import { Inline } from "./legalpage";
import Icon from "./icons";

/** Where "Start free" goes. */
const START_FREE_URL = signupUrl(CLUBS_URL, "free", "monthly");

/** The questions organisers ask, each one opening in place. */
export function ClubFaq({ yearlyMonthsFree = null }) {
  const items = clubFaq({ yearlyMonthsFree, contactEmail: CONTACT_EMAIL });
  return (
    <section className="fc-faq" aria-labelledby="fc-faq-title">
      <div className="fc-faq-head">
        <p className="dc-eyebrow">Questions</p>
        <h2 id="fc-faq-title">Questions, answered</h2>
        <p>
          Something else on your mind? Write to us at{" "}
          <a className="dc-link" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
      <div className="fc-faq-list">
        {items.map((item) => (
          <details key={item.id} id={`faq-${item.id}`} className="fc-qa">
            <summary>
              <span>{item.q}</span>
              <Icon name="plus" size={20} className="fc-qa-icon" />
            </summary>
            <div className="fc-qa-a">
              {item.a.map((text, i) => (
                <p key={i}>
                  <Inline text={text} />
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The last word on both pages: start free, talk to us, or log in. */
export function ClubsCta() {
  return (
    <section className="fc-cta" aria-labelledby="fc-cta-title">
      <div className="fc-cta-copy">
        <h2 id="fc-cta-title">
          Bring your club to <em>MyOtherApp.</em>
        </h2>
        <p>Start on the Free plan today, and run your next event from one place.</p>
      </div>
      <div className="fc-cta-actions">
        <div className="fc-cta-buttons">
          <a className="dc-btn dc-btn--accent fc-btn-lg" href={START_FREE_URL}>
            Start free <Icon name="arrowRight" size={18} />
          </a>
          <a className="dc-btn fc-btn-ondark fc-btn-lg" href={contactUrl(CONTACT_EMAIL)}>
            Talk to us
          </a>
        </div>
        <p className="fc-cta-login">
          Already on MyOtherApp? <a href={loginUrl(CLUBS_URL)}>Log in to the clubs dashboard</a>
        </p>
      </div>
    </section>
  );
}
