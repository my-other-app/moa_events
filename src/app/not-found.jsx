import NotFound from "@/components/notfound";

/* Anything no route answers (and every notFound()): the 404 page the site has always had. */
export const metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFoundPage() {
  return <NotFound />;
}
