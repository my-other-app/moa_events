import ClientPage from "../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* The live quiz, played from a phone. CLIENT PAGE (@/components/play). Never indexed. */
export const metadata = pageMetadata({ title: "Play", description: "Play along live on MyOtherApp.", path: null, noindex: true });

export default function Play() {
  return <ClientPage name="play" />;
}
