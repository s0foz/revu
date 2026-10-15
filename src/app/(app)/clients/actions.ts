"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordActivity, requireStaff } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ClientFormState = {
  error?: string;
  success?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails are stored lowercased so the unique(agency_id, email) constraint and
 *  the sign-in claim by verified email both match reliably. */
function normalizeEmail(raw: FormDataEntryValue | null): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function clean(raw: FormDataEntryValue | null, max = 120): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const staff = await requireStaff();

  const name = clean(formData.get("name"));
  const email = normalizeEmail(formData.get("email"));
  const contactName = clean(formData.get("contact_name"));

  if (!name) return { error: "Client name is required." };
  if (!email) return { error: "Enter a valid email address." };

  const { error } = await supabaseAdmin()
    .from("clients")
    .insert({
      agency_id: staff.agency.id,
      name,
      email,
      contact_name: contactName,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[clients] insert failed", error.message);
    if (error.code === "23505") {
      return { error: "You already have a client with that email address." };
    }
    return { error: "Could not save the client. Please try again." };
  }

  await recordActivity({
    actor: staff,
    message: `Added client ${name}`,
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return { success: `${name} added.${claimHint(email)}` };
}

export async function updateClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const staff = await requireStaff();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing client id." };

  const name = clean(formData.get("name"));
  const email = normalizeEmail(formData.get("email"));
  const contactName = clean(formData.get("contact_name"));

  if (!name) return { error: "Client name is required." };
  if (!email) return { error: "Enter a valid email address." };

  const { error } = await supabaseAdmin()
    .from("clients")
    .update({ name, email, contact_name: contactName })
    .eq("id", id)
    .eq("agency_id", staff.agency.id);

  if (error) {
    console.error("[clients] update failed", error.message);
    if (error.code === "23505") {
      return { error: "Another client already uses that email address." };
    }
    return { error: "Could not update the client. Please try again." };
  }

  await recordActivity({ actor: staff, message: `Updated client ${name}` });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);

  return { success: "Saved." };
}

/**
 * Releasing a client frees their email so it can be claimed by a different
 * Clerk user without deleting the client's projects.
 */
export async function unlinkClientPortalAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabaseAdmin()
    .from("clients")
    .update({ clerk_user_id: null })
    .eq("id", id)
    .eq("agency_id", staff.agency.id);

  if (error) {
    console.error("[clients] unlink failed", error.message);
    return;
  }

  await recordActivity({ actor: staff, message: "Revoked portal access for a client" });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabaseAdmin()
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("agency_id", staff.agency.id);

  if (error) {
    console.error("[clients] delete failed", error.message);
    return;
  }

  await recordActivity({ actor: staff, message: "Deleted a client" });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  redirect("/clients");
}

function claimHint(email: string): string {
  return ` They can sign in with ${email} to open their portal.`;
}
