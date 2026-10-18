/**
 * What next/link is in tests (see vitest.config.js): react-router's <Link>,
 * so a click moves the <MemoryRouter> a test renders in, as next/link moves
 * Next's router in the app.
 */
import { Link as RouterLink } from "react-router-dom";

export default function Link({ href, replace = false, scroll, prefetch, ...rest }) {
  void scroll;
  void prefetch;
  return <RouterLink to={href} replace={replace} {...rest} />;
}
