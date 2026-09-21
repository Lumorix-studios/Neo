/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */

export type LogChannel =
  | "Git"
  | "Problems"
  | "Debug Console"
  | "Ports"
  | "App";

export interface LogEntry {
  channel: LogChannel;
  message: string;
  time: number;
}

type Listener = (entry: LogEntry) => void;

const listeners = new Set<Listener>();
const buffer: LogEntry[] = [];
const MAX_BUFFER = 500;

/** Push one log entry to the bus (and the ring buffer for late subscribers). */
export function logToBus(channel: LogChannel, message: string): void {
  const entry: LogEntry = { channel, message, time: Date.now() };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  listeners.forEach((fn) => fn(entry));
}

/** Subscribe to new entries; immediately replays the buffered history. */
export function subscribeLogs(fn: Listener): () => void {
  buffer.forEach((e) => fn(e));
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clear the buffered history. */
export function clearLogs(): void {
  buffer.length = 0;
}
