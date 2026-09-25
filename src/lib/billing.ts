/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
/**
 * Plan catalogue for the desktop app.
 *
 * Checkout itself lives on the website, not in the app: the plan buttons open
 * UPGRADE_URL in the system browser. Accounts are shared through the same
 * Supabase project, so a purchase made on the website updates
 * `profiles.plan` / `byok_enabled` and the app picks it up on the next
 * account refresh.
 */

/** Plans the app can sell. `pro` is the BYOK-unlocking default. */
export const PAID_PLANS = ["pro", "team", "enterprise"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** Plan copy + pricing shown in Settings → Billing. */
export const PLAN_DISPLAY: Record<PaidPlan, { name: string; price: string; cadence: string }> = {
  pro: { name: "Pro", price: "$9", cadence: "per month" },
  team: { name: "Team", price: "$29", cadence: "per month" },
  enterprise: { name: "Enterprise", price: "$99", cadence: "per month" },
};

/**
 * Where the plan buttons send people — the website that handles checkout.
 *
 * TODO(owner): replace this with the real checkout page URL. Every button opens
 * it with `?plan=<id>` so the website can preselect the plan that was clicked.
 */
export const UPGRADE_URL = "https://lumorix-studios.github.io/LumorixStudiosHq/pricing";

/** Upgrade link for one specific plan. */
export function upgradeUrl(plan: PaidPlan): string {
  return `${UPGRADE_URL}${UPGRADE_URL.includes("?") ? "&" : "?"}plan=${plan}`;
}
