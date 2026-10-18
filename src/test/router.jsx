/**
 * What @/lib/router is in tests (see vitest.config.js): the same API, on
 * react-router, so a test renders a component inside <MemoryRouter> with
 * <Routes> and reads useLocation() exactly as it always has. The real
 * module, on Next's router, has its own tests (src/lib/router.test.jsx).
 */
import { useLocation } from "react-router-dom";

export { Link, NavLink, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

export function usePathname() {
  return useLocation().pathname;
}
