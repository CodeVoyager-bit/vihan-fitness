import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n/server";
import { photoVariant } from "@/lib/site-config";
import { getSite } from "@/lib/site";

// Names and icon follow Admin → More → Brand, so the manifest is built per request, not at build time.
export const dynamic = "force-dynamic";

// "Add to Home screen" so the owner and members open the app like any other on their phone.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t } = await getT();
  const site = await getSite("en");
  const icon = (px: number) => ({ src: photoVariant(site.logo, `c_pad,b_white,w_${px},h_${px},f_png`), sizes: `${px}x${px}`, type: "image/png", purpose: "any" as const });
  return {
    name: site.vars.gym,
    short_name: site.vars.gymShort,
    description: t("meta.description"),
    start_url: "/login",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#121210",
    icons: site.logo ? [icon(192), icon(512)] : [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
