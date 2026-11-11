"use client";

import { useState } from "react";
import Link from "next/link";
import { supportApi } from "@/api/support";
import { SitePage } from "../discover/chrome";
import Icon from "../discover/icons";
import { SurveyBox } from "./thread";

/**
 * /help/survey/{token}: "Did we solve it?" from the email we send when a
 * request is solved (POST /api/v1/support/survey/{token} {solved, comment?};
 * the token is the link's only credential). The email's two buttons may
 * open it as `?solved=yes` or `?solved=no`: that answer is picked, but
 * nothing is sent until the person presses Send (mail scanners open links
 * too). Answered already (409): thanks all the same. Not a link of ours
 * (404): said kindly.
 */
export default function SurveyPage({ token, solved = null }) {
  const [done, setDone] = useState(null);

  let body;
  if (done?.gone) {
    body = (
      <div className="rg-closed" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="comment" size={26} />
        </span>
        <h1 className="rg-h1">This link isn&rsquo;t valid</h1>
        <p className="rg-closed-text">{done.message} Need more help? Ask us again from the help page.</p>
        <div className="rg-closed-actions">
          <Link className="dc-btn" href="/help">
            Go to Help
          </Link>
        </div>
      </div>
    );
  } else if (done) {
    body = (
      <div className="rg-closed is-good" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <h1 className="rg-h1">Thank you</h1>
        <p className="rg-closed-text">
          {done.already
            ? "You've already told us how it went."
            : done.solved
              ? "Glad it's sorted. Your answer helps us get better at this."
              : "Sorry it isn't sorted yet. We'll look at it again and write to you."}
        </p>
        <div className="rg-closed-actions">
          <Link className="dc-btn dc-btn--ghost" href="/help">
            Go to Help
          </Link>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="rg-closed hp-survey-page">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="comment" size={26} />
        </span>
        <h1 className="rg-h1">How did we do?</h1>
        <p className="rg-closed-text">We marked your request as solved. Tell us if it is, in a tap.</p>
        <SurveyBox send={(b) => supportApi.survey(token, b)} initial={solved} onDone={setDone} />
      </div>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap hp hp-page">{body}</div>
    </SitePage>
  );
}
