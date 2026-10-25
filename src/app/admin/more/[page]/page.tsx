import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { SiteForm } from "../site-form";
import { saveSiteAction, sitePhotoAction } from "@/app/actions/admin";
import { PhotoButtons } from "@/components/client";
import { Card, PageHeader, SectionTitle, Notice } from "@/components/ui";
import { photoUrl } from "@/lib/format";
import { type Lang, LANGS, type TKey } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { type PhotoSlot, cloudinaryStatus, photosEnabled } from "@/lib/photos";
import { getSite, pageValues } from "@/lib/site";
import { LAYOUT, PAGE_IDS, type PageId } from "@/lib/site-config";
import { requireAdmin } from "@/lib/session";

type Params = { params: Promise<{ page: string }> };
const pageId = async (params: Params["params"]) => {
  const { page } = await params;
  return PAGE_IDS.includes(page as PageId) ? (page as PageId) : notFound();
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(`site.pages.${await pageId(params)}.title` as TKey) };
}

// Photos are uploaded one at a time (their own buttons), so they sit next to the form, not inside it.
const PHOTOS: Partial<Record<PageId, { label: TKey; slots: PhotoSlot[] }[]>> = {
  brand: [{ label: "site.fields.logo", slots: ["logo"] }],
  website: [
    { label: "site.fields.trainerPhoto", slots: ["trainer"] },
    { label: "site.fields.gallery", slots: ["g1", "g2", "g3", "g4"] },
  ],
};

/** Admin → More → Brand / Website / Contact / Messages / Rules. */
export default async function SiteSettingsPage({ params }: Params) {
  await requireAdmin();
  const page = await pageId(params);
  const { t, lang } = await getT();
  const site = await getSite(lang);
  const vars = Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, (await getSite(l)).vars]))) as Record<Lang, Record<string, string>>;
  // Pages with uploads check that Cloudinary accepts the credentials, so a wrong CLOUDINARY_URL is explained here.
  const uploads = PHOTOS[page] && photosEnabled() ? await cloudinaryStatus() : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t(`site.pages.${page}.title`)} sub={t(`site.pages.${page}.sub`)} back={{ href: "/admin/more", label: t("nav.more") }} />

      {uploads && uploads !== "ok" && (
        <div className="mt-4">
          <Notice tone="bad">{t(`site.cloudinary.${uploads}`)}</Notice>
        </div>
      )}

      {PHOTOS[page]?.map((group) => (
        <div key={group.label}>
          <SectionTitle>{t(group.label)}</SectionTitle>
          <Card className="p-4">
            {photosEnabled() ? (
              <>
                {page === "brand" && <p className="mb-4 text-[14px] text-ink-600">{t("site.hints.logo")}</p>}
                <div className="grid gap-5 sm:grid-cols-2">
                  {group.slots.map((s) => (
                    <div key={s} className="flex items-center gap-3">
                      {site.photos[s] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already resizes and converts via the URL
                        <img src={photoUrl(site.photos[s], "wide")} alt="" className="size-20 shrink-0 rounded-[12px] bg-sand-200 object-contain" />
                      ) : (
                        <span className="grid size-20 shrink-0 place-items-center rounded-[12px] border border-dashed border-sand-300 text-ink-400">
                          <ImageIcon className="size-6" aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0">
                        {group.slots.length > 1 && <p className="mb-1.5 text-[15px] font-semibold text-ink-900">{t(`settings.photoSlots.${s}`)}</p>}
                        <PhotoButtons action={sitePhotoAction.bind(null, s)} has={!!site.photos[s]} keepFormat={s === "logo"} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[14px] text-ink-600">{t("site.photosOff")}</p>
            )}
          </Card>
        </div>
      ))}

      <Card className="mt-6 p-4">
        <SiteForm action={saveSiteAction.bind(null, page)} layout={LAYOUT[page]} values={await pageValues(page)} vars={vars} />
      </Card>
    </div>
  );
}
