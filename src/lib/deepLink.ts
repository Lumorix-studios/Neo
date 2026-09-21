/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { handleOAuthRedirect } from "./auth";

/** Deep-link scheme registered in `src-tauri/tauri.conf.json > plugins.deep-link`. */
const SCHEME = "agenticcoder://";

/** Event emitted by the Rust single-instance handler for a second launch. */
const SINGLE_INSTANCE_EVENT = "neo:deep-link";

/**
 * URLs already handed to the auth layer. On Windows/Linux the same link can
 * arrive twice (the `deep-link://new-url` event *and* our single-instance
 * event), and OAuth codes/tokens are single-use — replaying them would just
 * produce a confusing error.
 */
const consumed = new Set<string>();

/**
 * Feed one raw URL to the auth layer when it looks like an OAuth callback.
 * `getCurrent()` also reports the URL the app was *launched* with, and the
 * session exchange is idempotent, so duplicate delivery is harmless.
 */
function consume(url: string): void {
  if (!url.startsWith(SCHEME)) return;
  if (consumed.has(url)) return;
  consumed.add(url);
  void handleOAuthRedirect(url);
}

/**
 * VS Code style sign-in plumbing: listen for `agenticcoder://auth/callback#…`
 * URLs that the OS hands back after the user authorises in the browser, and
 * complete the Supabase session. No-op in a plain browser (dev preview).
 */
export function useDeepLinkAuth(): void {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const register = (urls: string[] | null) => {
      if (disposed) return;
      for (const url of urls ?? []) consume(url);
    };

    // Cold start from a deep link, plus live links while the app is open.
    void import("@tauri-apps/plugin-deep-link")
      .then(async ({ getCurrent, onOpenUrl }) => {
        if (disposed) return;
        register(await getCurrent());
        // `onOpenUrl` fires only on macOS; Windows/Linux deliver the URL as a
        // new process, which the single-instance plugin forwards to us below.
        unlisteners.push(await onOpenUrl(register));
      })
      .catch(() => undefined);

    void import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        if (disposed) return;
        unlisteners.push(await listen<string>(SINGLE_INSTANCE_EVENT, (e) => consume(e.payload)));
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      for (const off of unlisteners) {
        try {
          off();
        } catch {
          /* listener already gone */
        }
      }
    };
  }, []);
}