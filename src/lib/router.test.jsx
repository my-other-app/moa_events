import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/*
 * The real @/lib/router (the app's), on a stand-in for Next's router: the
 * react-router-style API the components were written against, translated
 * to next/link and next/navigation. (Other tests swap this module for the
 * react-router one; this one imports the file itself.)
 */
const nav = vi.hoisted(() => ({ pathname: "/events", search: "", params: {}, push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => nav.params,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, replace, prefetch, ...rest }) => <a href={href} data-replace={replace ? "1" : undefined} data-prefetch={String(prefetch)} {...rest} />,
}));

const { Link, NavLink, Navigate, useLocation, useNavigate, useParams, useSearchParams } = await import("./router.jsx");
const { hrefOf, isActivePath, searchOf } = await import("./href.js");

beforeEach(() => {
  nav.pathname = "/events";
  nav.search = "";
  nav.params = {};
  nav.push.mockReset();
  nav.replace.mockReset();
  window.history.replaceState(null, "", "/events");
});

describe("links", () => {
  it("take `to` as a string or {pathname, search, hash}", () => {
    render(
      <>
        <Link to="/clubs/x">A</Link>
        <Link to={{ pathname: "/events/y", search: "ref=1", hash: "agenda" }} replace>
          B
        </Link>
      </>
    );
    expect(screen.getByText("A")).toHaveAttribute("href", "/clubs/x");
    expect(screen.getByText("B")).toHaveAttribute("href", "/events/y?ref=1#agenda");
    expect(screen.getByText("B")).toHaveAttribute("data-replace", "1");
  });

  it("know when they are where you are, as react-router's NavLink did", () => {
    nav.pathname = "/me/tickets";
    render(
      <>
        <NavLink to="/me/tickets">Tickets</NavLink>
        <NavLink to="/me/following">Following</NavLink>
        <NavLink to="/me" className={({ isActive }) => (isActive ? "on" : "off")}>
          Me
        </NavLink>
      </>
    );
    expect(screen.getByText("Tickets")).toHaveClass("active");
    expect(screen.getByText("Tickets")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Following")).not.toHaveClass("active");
    expect(screen.getByText("Me")).toHaveClass("on");
  });
});

describe("hooks", () => {
  it("navigate pushes, replaces, and keeps the page where it is when only the query changes", () => {
    let navigate;
    function Probe() {
      navigate = useNavigate();
      return null;
    }
    render(<Probe />);
    act(() => navigate("/clubs"));
    expect(nav.push).toHaveBeenCalledWith("/clubs", { scroll: true });
    act(() => navigate("/events?q=robots"));
    expect(nav.push).toHaveBeenLastCalledWith("/events?q=robots", { scroll: false });
    act(() => navigate({ pathname: "/events/x", search: "?a=1" }, { replace: true }));
    expect(nav.replace).toHaveBeenCalledWith("/events/x?a=1", { scroll: true });
  });

  it("navigate with state writes it on the browser's own entry, where useLocation reads it back", () => {
    let navigate;
    let location;
    function Probe() {
      navigate = useNavigate();
      location = useLocation();
      return null;
    }
    render(<Probe />);
    act(() => navigate({ pathname: "/events", search: "?step=details" }, { replace: true, state: { rgDone: { eventId: "1" } } }));
    expect(window.location.search).toBe("?step=details");
    expect(window.history.state).toMatchObject({ rgDone: { eventId: "1" } });
    expect(location.state).toMatchObject({ rgDone: { eventId: "1" } });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("setSearchParams takes params, a function of them, and replace", () => {
    nav.search = "q=a";
    window.history.replaceState(null, "", "/events?q=a");
    let params;
    let setParams;
    function Probe() {
      [params, setParams] = useSearchParams();
      return null;
    }
    render(<Probe />);
    expect(params.get("q")).toBe("a");
    act(() => setParams(new URLSearchParams({ q: "b" })));
    expect(nav.push).toHaveBeenCalledWith("/events?q=b", { scroll: false });
    act(() => setParams((p) => (p.set("type", "online"), p), { replace: true }));
    expect(nav.replace).toHaveBeenCalledWith("/events?q=a&type=online", { scroll: false });
    act(() => setParams(new URLSearchParams()));
    expect(nav.push).toHaveBeenLastCalledWith("/events", { scroll: false });
  });

  it("useParams and useLocation read Next's", () => {
    nav.params = { slug: "hack-night-04" };
    nav.pathname = "/events/hack-night-04";
    nav.search = "ref=abc";
    window.history.replaceState(null, "", "/events/hack-night-04?ref=abc#agenda");
    let params;
    let location;
    function Probe() {
      params = useParams();
      location = useLocation();
      return null;
    }
    render(<Probe />);
    expect(params).toEqual({ slug: "hack-night-04" });
    expect(location).toMatchObject({ pathname: "/events/hack-night-04", search: "?ref=abc", hash: "#agenda" });
  });

  it("<Navigate> moves on once mounted", () => {
    render(<Navigate to="/me/tickets" replace />);
    expect(nav.replace).toHaveBeenCalledWith("/me/tickets", { scroll: true });
  });

  it("a link click is next/link's", () => {
    render(<Link to="/clubs">Clubs</Link>);
    fireEvent.click(screen.getByText("Clubs"));
    expect(screen.getByText("Clubs")).toHaveAttribute("href", "/clubs");
  });
});

describe("addresses", () => {
  it("are written and compared the way react-router did", () => {
    expect(hrefOf({ pathname: "/a", search: "b=1", hash: "c" })).toBe("/a?b=1#c");
    expect(hrefOf({ search: "?x=1" }, "/events")).toBe("/events?x=1");
    expect(searchOf({ a: "1" })).toBe("?a=1");
    expect(searchOf(new URLSearchParams())).toBe("");
    expect(isActivePath("/events/x", "/events")).toBe(true);
    expect(isActivePath("/events/x", "/events", true)).toBe(false);
    expect(isActivePath("/eventsx", "/events")).toBe(false);
    expect(isActivePath("/clubs", "/")).toBe(false);
  });
});
