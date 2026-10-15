"use server";

import { revalidatePath } from "next/cache";

import { recordActivity, requireStaffAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";

export type SettingsFormState = {
  error?: string;
  success?: string;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HTTPS_URL = /^https:\/\/\S+$/;

export async function updateAgencyAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const staff = await requireStaffAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const brandColor = String(formData.get("brand_color") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const rawLogo = String(formData.get("logo_url") ?? "").trim();
  const slug = slugify(rawSlug);

  if (name.length < 2 || name.length > 60) {
    return { error: "Agency name must be between 2 and 60 characters." };
  }

  if (rawSlug && slug !== rawSlug.toLowerCase()) {
    return {
      error:
        "Slug can only contain lowercase letters, numbers and single hyphens.",
    };
  }

  if (!HEX_COLOR.test(brandColor)) {
    return { error: "Brand colour must be a hex value like #4f46e5." };
  }

  // The logo is shown in the client portal, so only an https URL is accepted.
  // Empty clears it and the portal falls back to a monogram.
  if (rawLogo && (!HTTPS_URL.test(rawLogo) || rawLogo.length > 500)) {
    return { error: "Logo URL must start with https://." };
  }

  const { error } = await supabaseAdmin()
    .from("agencies")
    .update({
      name,
      slug,
      brand_color: brandColor,
      logo_url: rawLogo || null,
    })
    .eq("id", staff.agency.id);

  if (error) {
    console.error("[settings] update failed", error.message);
    if (error.code === "23505") {
      return { error: "That slug is already taken." };
    }
    if (error.code === "23514") {
      return { error: "That slug is not allowed. Use lowercase letters and hyphens." };
    }
    return { error: "Could not save your settings. Please try again." };
  }

  await recordActivity({ actor: staff, message: "Updated agency settings" });

  revalidatePath("/", "layout");

  return { success: "Settings saved." };
}
