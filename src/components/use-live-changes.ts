"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@clerk/nextjs";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Live updates for one table, with a polling fallback.
 *
 * Revu reads the Clerk session token and hands it to Supabase Realtime
 * (`realtime.setAuth`). Supabase validates that token through its third-party
 * auth integration and the `postgres_changes` stream is filtered by the RLS
 * policies in supabase/migrations — so a client only ever receives rows they
 * are allowed to read.
 *
 * That path depends on the project's Clerk ↔ Supabase setup being complete. When
 * it isn't — no token, a rejected token, a channel error, or a handshake that
 * never completes — this falls back to calling `onEvent` on an interval so the
 * UI still catches up without a manual refresh. The reported status lets the UI
 * say which mode it is in instead of pretending to be live.
 */

export type LiveStatus = "connecting" | "realtime" | "polling";

const HANDSHAKE_TIMEOUT_MS = 6000;
const DEFAULT_POLL_INTERVAL_MS = 5000;

export function useLiveChanges({
  channelName,
  table,
  event = "INSERT",
  filter,
  onEvent,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  channelName: string;
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  /** Called for every realtime change, and on every poll tick. */
  onEvent: (row: Record<string, unknown>) => void;
  pollIntervalMs?: number;
}): LiveStatus {
  const { isLoaded, session } = useSession();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  // The latest callback, kept in a ref so a new inline arrow each render never
  // re-opens the channel. Assigned in an effect (never during render).
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!isLoaded) return;

    let disposed = false;
    let subscribed = false;
    let pollTimer: number | undefined;
    let handshakeTimer: number | undefined;
    let client: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;

    const stopPolling = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const clearHandshake = () => {
      if (handshakeTimer !== undefined) {
        window.clearTimeout(handshakeTimer);
        handshakeTimer = undefined;
      }
    };

    const goPolling = () => {
      if (disposed || pollTimer !== undefined) return;
      clearHandshake();
      setStatus("polling");
      pollTimer = window.setInterval(() => {
        if (!disposed) handler.current({});
      }, pollIntervalMs);
    };

    const goRealtime = () => {
      subscribed = true;
      clearHandshake();
      stopPolling();
      setStatus("realtime");
    };

    async function connect() {
      try {
        client = supabaseBrowser();
      } catch (error) {
        console.warn("[live] Supabase is not configured; polling instead", error);
        goPolling();
        return;
      }

      if (!client) return;
      const supabase = client;

      try {
        const token = session ? await session.getToken() : null;
        if (token) supabase.realtime.setAuth(token);
      } catch (error) {
        console.warn("[live] could not attach the session token to Realtime", error);
      }

      if (disposed) return;

      try {
        channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event, schema: "public", table, ...(filter ? { filter } : {}) },
            (payload: { new?: Record<string, unknown> }) => {
              if (disposed) return;
              goRealtime();
              handler.current(payload.new ?? {});
            },
          )
          .subscribe((state) => {
            if (disposed) return;
            if (state === "SUBSCRIBED") {
              goRealtime();
            } else if (
              state === "CHANNEL_ERROR" ||
              state === "TIMED_OUT" ||
              state === "CLOSED"
            ) {
              goPolling();
            }
          });
      } catch (error) {
        console.warn("[live] could not open a Realtime channel; polling instead", error);
        goPolling();
      }

      // A channel can sit in "connecting" forever when the token is rejected;
      // don't leave the UI frozen in that state.
      handshakeTimer = window.setTimeout(() => {
        if (!disposed && !subscribed) {
          console.warn(
            `[live] Realtime handshake for ${channelName} never completed; falling back to polling`,
          );
          goPolling();
        }
      }, HANDSHAKE_TIMEOUT_MS);
    }

    void connect();

    return () => {
      disposed = true;
      clearHandshake();
      stopPolling();
      if (client && channel) {
        try {
          void client.removeChannel(channel);
        } catch {
          // Removing a channel must never break unmount.
        }
      }
    };
  }, [isLoaded, session, channelName, table, event, filter, pollIntervalMs]);

  return status;
}

/** Short label for the live indicator shown next to a thread. */
export function liveStatusLabel(status: LiveStatus): string {
  if (status === "realtime") return "Live";
  if (status === "polling") return "Checking for updates…";
  return "Connecting…";
}
