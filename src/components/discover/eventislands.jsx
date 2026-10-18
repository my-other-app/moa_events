"use client";

/**
 * The event page's client islands: the small parts that need the browser.
 * Everything else on the page is server-rendered (eventparts.jsx). Each
 * takes only plain data, so the page sends little besides its HTML.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { liveApi } from "@/api/live";
import { competitionApi } from "@/api/competition";
import { roomIsActive } from "@/utils/live";
import { calendarLinks } from "@/utils/calendar";
import { eventPath } from "@/utils/eventpage";
import { EpIcon, RichText } from "./eventbits";

/* ---------- share and calendar ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no clipboard API, or not allowed: try the old way */
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Share through the phone's own sheet; where there is none, copy the link and say so. */
export function ShareButton({ title, text, url }) {
  const [said, setSaid] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (line) => {
    setSaid(line);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(""), 2600);
  };
  const share = async () => {
    const data = { title, text, url };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    say((await copyText(url)) ? "Link copied" : `Copy this link: ${url}`);
  };
  return (
    <span className="ep-actionwrap">
      <button type="button" className="ep-action" onClick={share}>
        <EpIcon name="share" size={17} />
        Share
      </button>
      <span className={`ep-toast${said ? " is-on" : ""}`} role="status" aria-live="polite">
        {said ? (
          <>
            <EpIcon name="check" size={14} />
            {said}
          </>
        ) : null}
      </span>
    </span>
  );
}

/** "Add to calendar": Google Calendar, or an .ics file for Apple Calendar, Outlook and the rest. */
export function CalendarButton({ event, url, links = null }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const menuId = useId();
  const cal = useMemo(() => links || calendarLinks(event, url), [links, event, url]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!cal) return null;
  return (
    <div className="ep-cal" ref={box}>
      <button ref={button} type="button" className="ep-action" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        <EpIcon name="calendarPlus" size={17} />
        Add to calendar
      </button>
      <div id={menuId} className="ep-cal-menu" hidden={!open}>
        <a href={cal.google} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
          Google Calendar
        </a>
        <a href={cal.ics} download={cal.filename} onClick={() => setOpen(false)}>
          Apple, Outlook and others (.ics)
        </a>
      </div>
    </div>
  );
}

/* ---------- in-page navigation ---------- */

/** The tab bar under the hero: one link per section that has something in it; the one in view is marked. */
export function SectionNav({ items }) {
  const [active, setActive] = useState(items[0]?.id || null);
  const ids = items.map((i) => i.id).join(",");
  const bar = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const order = ids.split(",");
    let frame = 0;
    // The section being read is the last one whose top has passed under the tab bar.
    const look = () => {
      frame = 0;
      const line = (bar.current?.getBoundingClientRect().bottom || 0) + 24;
      let current = order[0];
      for (const id of order) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom, the last section is the one being read, however short.
      const root = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 4) {
        const last = [...order].reverse().find((id) => document.getElementById(id));
        if (last) current = last;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(look);
    };
    look();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids]);
  if (items.length < 2) return null;
  return (
    <nav ref={bar} className="ep-tabs" aria-label="On this page">
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className={active === i.id ? "is-on" : undefined} aria-current={active === i.id ? "location" : undefined}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------- the room and the competition ---------- */

/**
 * The strips over the page while something is on: the live room (polled
 * every half minute until the event ends) and the competition, if any.
 */
export function LiveStrips({ event }) {
  const [live, setLive] = useState(null);
  const [competition, setCompetition] = useState(null);
  const id = event.id;
  const ended = event.status === "ended";

  useEffect(() => {
    let alive = true;
    competitionApi
      .leaderboard(id)
      .then((b) => alive && setCompetition(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    let alive = true;
    const look = () =>
      liveApi
        .fetchFeed(id)
        .then((f) => alive && setLive(f))
        .catch(() => {});
    look();
    const t = ended ? null : setInterval(look, 30000);
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [id, ended]);

  const roomOn = roomIsActive(live);
  if (!roomOn && !competition?.enabled) return null;
  return (
    <div className="ep-strips">
      {roomOn ? (
        <div className="ep-strip ep-strip--live" role="status">
          <div className="ep-strip-text">
            <span className="ep-strip-tag">Live now</span>
            <p>{live.banner ? live.banner.text : live.quiz?.live ? "The quiz is on — join with the code on the screen" : live.poll ? live.poll.prompt : "Questions are being taken from the floor"}</p>
          </div>
          <Link className="dc-btn dc-btn--accent dc-btn--sm" to={eventPath(event, "live")}>
            Open the live room
          </Link>
        </div>
      ) : null}
      {competition?.enabled ? (
        <div className="ep-strip" role="status">
          <div className="ep-strip-text">
            <span className="ep-strip-tag ep-strip-tag--plain">Competition</span>
            <p>{competition.public && competition.rows?.length ? `${competition.rows[0].name} leads the board` : "Form a team from your ticket, pick a track, and hand in your work here."}</p>
          </div>
          <Link className="dc-btn dc-btn--ghost dc-btn--sm" to={eventPath(event, "compete")}>
            Your team
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const LONG_ABOUT = 900;

/** The about, folded after a screenful when it runs long. */
export function About({ text }) {
  const long = text.length > LONG_ABOUT;
  const [open, setOpen] = useState(false);
  const id = "ep-about-text";
  return (
    <>
      <div id={id}>
        <RichText text={text} className={`ep-about${long && !open ? " is-clamped" : ""}`} />
      </div>
      {long ? (
        <button type="button" className="ep-more-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Read more"}
        </button>
      ) : null}
    </>
  );
}
