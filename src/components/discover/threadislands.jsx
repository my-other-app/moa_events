"use client";

/**
 * A post's page's client islands. The post and its comments are rendered
 * on the server (threadspage.jsx), read as nobody: no one's like or vote.
 * <ThreadReader> reads the post again as the signed-in reader, once the
 * page is in the browser, and holds what they do: liking it and voting in
 * its poll (the button changes at once, and changes back if the server
 * says no). Everyone else, and commenting, gets the app prompt, with
 * signing in as the other way where the build has it.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { accountApi } from "@/api/account";
import { discoverApi } from "@/api/discover";
import { useAuth } from "@/auth/context";
import { plural } from "@/utils/format";
import { AppPrompt } from "./dialog";
import { Poll } from "./threadcard";
import Icon from "./icons";

const PROMPTS = {
  like: "Liking a post happens in the MyOtherApp app, where you follow the clubs you like. It's free.",
  vote: "Polls are answered in the MyOtherApp app — one vote per person, and you can change it there. It's free.",
  comment: "Comments are written in the MyOtherApp app, where the club reads and replies. It's free.",
};

const SIGN_IN_TO = { like: "Sign in to like it here", vote: "Sign in to vote here" };

const ReaderContext = createContext(null);
const useReader = () => useContext(ReaderContext);

/** `thread`: {id, likes, poll} as the server read it. */
export function ThreadReader({ thread: initial, children }) {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  const [t, setT] = useState({ liked: false, likes: initial.likes, poll: initial.poll, readAs: false });
  const [prompt, setPrompt] = useState(null);
  const [note, setNote] = useState(null);
  const busy = useRef(false);
  const pending = useRef(null);
  const id = initial.id;

  // Read again on signing in or out: whether this reader liked it, and how they voted.
  useEffect(() => {
    if (!signedIn) {
      setT((x) => (x.readAs ? { liked: false, likes: x.likes, poll: x.poll ? { ...x.poll, voted_option_id: null } : x.poll, readAs: false } : x));
      return undefined;
    }
    let alive = true;
    discoverApi.thread(id).then(
      (fresh) => alive && setT({ liked: fresh.liked, likes: fresh.likes, poll: fresh.poll, readAs: true }),
      () => {
        /* the page as the server read it stands */
      }
    );
    return () => {
      alive = false;
    };
  }, [id, signedIn]);

  const like = useCallback(
    async (now) => {
      if (busy.current) return;
      busy.current = true;
      setNote(null);
      setT((x) => ({ ...x, liked: !now.liked, likes: Math.max(0, now.likes + (now.liked ? -1 : 1)) }));
      try {
        const r = await accountApi.toggleLike(id);
        setT((x) => ({ ...x, liked: r.liked, likes: r.likes }));
      } catch {
        setT((x) => ({ ...x, liked: now.liked, likes: now.likes }));
        setNote("Your like didn't save. Try again.");
      } finally {
        busy.current = false;
      }
    },
    [id]
  );

  const vote = useCallback(
    async (now, optionId) => {
      if (busy.current || !now.poll || String(now.poll.voted_option_id) === String(optionId)) return;
      busy.current = true;
      setNote(null);
      setT((x) => ({ ...x, poll: { ...x.poll, voted_option_id: optionId } }));
      try {
        const poll = await accountApi.vote(id, optionId);
        setT((x) => ({ ...x, poll: poll || x.poll }));
      } catch {
        setT((x) => ({ ...x, poll: now.poll }));
        setNote("Your vote didn't count. Try again.");
      } finally {
        busy.current = false;
      }
    },
    [id]
  );

  // A like or vote asked for before signing in, done once the post has been read as the new reader.
  useEffect(() => {
    const want = pending.current;
    // Only on the post as read for the signed-in reader: before that, `liked` says nothing about them.
    if (!signedIn || !want || !t.readAs) return;
    pending.current = null;
    if (want.kind === "like" && !t.liked) like(t);
    if (want.kind === "vote") vote(t, want.optionId);
  }, [signedIn, t, like, vote]);

  const act = (kind, optionId) => {
    if (kind === "comment" || !signedIn) {
      setPrompt({ kind, optionId });
      return;
    }
    if (kind === "like") like(t);
    else if (kind === "vote") vote(t, optionId);
  };

  const signInFor = (want) => {
    setPrompt(null);
    auth.openSignIn({
      reason: want.kind,
      onDone: () => {
        pending.current = want;
      },
    });
  };

  return (
    <ReaderContext.Provider value={{ t, act, note }}>
      {children}
      <AppPrompt
        open={Boolean(prompt)}
        onClose={() => setPrompt(null)}
        title="Do this in the app"
        message={PROMPTS[prompt?.kind] || PROMPTS.like}
        alt={
          auth.enabled && !signedIn && SIGN_IN_TO[prompt?.kind] ? (
            <button type="button" className="dc-btn dc-btn--ghost" onClick={() => signInFor(prompt)}>
              {SIGN_IN_TO[prompt.kind]}
            </button>
          ) : null
        }
      />
    </ReaderContext.Provider>
  );
}

/** The poll, each option a button to vote with. */
export function ThreadPoll() {
  const { t, act } = useReader();
  return t.poll ? <Poll poll={t.poll} onVote={(o) => act("vote", o.id)} /> : null;
}

/** "12 likes", moving with the reader's own like. */
export function ThreadLikes() {
  const { t } = useReader();
  return (
    <span className="dc-tcard-stat">
      <Icon name="heart" size={16} /> {plural(t.likes, "like")}
    </span>
  );
}

/** Like and Comment, under the post. */
export function ThreadActions() {
  const { t, act } = useReader();
  return (
    <div className="dc-tcard-actions">
      <button type="button" className="dc-tcard-action" aria-pressed={t.liked} onClick={() => act("like")}>
        <Icon name="heart" size={16} /> {t.liked ? "Liked" : "Like"}
      </button>
      <button type="button" className="dc-tcard-action" onClick={() => act("comment")}>
        <Icon name="comment" size={16} /> Comment
      </button>
    </div>
  );
}

/** What went wrong with a like or a vote, under the post. */
export function ThreadNote() {
  const { note } = useReader();
  return note ? (
    <p className="ac-thread-note" role="status">
      {note}
    </p>
  ) : null;
}

/** "Add a comment": comments are written in the app. */
export function CommentButton() {
  const { act } = useReader();
  return (
    <button type="button" className="dc-btn dc-btn--ghost" onClick={() => act("comment")}>
      <Icon name="comment" size={16} /> Add a comment
    </button>
  );
}

/** The line under "From the clubs": what a reader can do here, signed in or not. */
export function ThreadsLede() {
  const auth = useAuth();
  return (
    <p className="dc-section-sub">
      {auth.status === "signed-in"
        ? "News, photos and polls from clubs on MyOtherApp. Open a post to like it or vote."
        : "News, photos and polls from clubs on MyOtherApp. Like, vote and comment in the app."}
    </p>
  );
}
