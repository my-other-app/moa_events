/**
 * Where the site's pictures may come from: the hosts MyOtherApp's own
 * storage serves them on, over https, and nothing else.
 *
 *   - media.myotherapp.in: the media store and its CDN (production);
 *   - an S3 bucket's own address, <bucket>.s3.amazonaws.com or
 *     <bucket>.s3.<region>.amazonaws.com: links signed for the bucket
 *     before the store moved, and test deployments.
 *
 * /media/... redirects only to such a link, and the share pictures (/og/...)
 * fetch only such a link. An image field holding anything else -- a link
 * someone typed, an address inside our own network -- is treated as no
 * picture at all: /media would otherwise be an open redirect on our domain,
 * and /og a way to make the site's server fetch an address of someone's
 * choosing.
 */
export const MEDIA_HOSTS = ["media.myotherapp.in"];

/** Virtual-hosted S3: a bucket name, then s3 (and a region). */
const S3_HOST = /^[a-z0-9][a-z0-9.-]{0,62}\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;

/** True for an https link on one of our storage hosts; false for anything else, a non-string included. */
export function isOurImage(url) {
  if (typeof url !== "string" || !url) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return MEDIA_HOSTS.includes(host) || S3_HOST.test(host);
}

/** The link when it is one of ours, else null. */
export const ourImage = (url) => (isOurImage(url) ? url : null);
