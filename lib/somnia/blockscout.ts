/**
 * Blockscout-style API wrapper for Shannon Explorer.
 *
 * Shannon explorer (https://shannon-explorer.somnia.network) follows the
 * Blockscout REST convention: /api?module=<m>&action=<a>&...
 *
 * These selector strings are what we hand to the `json-fetch` Somnia agent
 * (or call directly server-side for fallback).
 */

import { EXPLORER_API } from "./chains";

export function txListUrl(address: string, page = 1, offset = 100): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "txlist");
  u.searchParams.set("address", address);
  u.searchParams.set("page", String(page));
  u.searchParams.set("offset", String(offset));
  u.searchParams.set("sort", "desc");
  return u.toString();
}

export function internalTxListUrl(address: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "txlistinternal");
  u.searchParams.set("address", address);
  return u.toString();
}

export function tokenTxListUrl(address: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "tokentx");
  u.searchParams.set("address", address);
  return u.toString();
}

export function tokenHoldersUrl(contractAddress: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "token");
  u.searchParams.set("action", "getTokenHolders");
  u.searchParams.set("contractaddress", contractAddress);
  return u.toString();
}

export function contractSourceUrl(address: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "contract");
  u.searchParams.set("action", "getsourcecode");
  u.searchParams.set("address", address);
  return u.toString();
}

export function contractAbiUrl(address: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "contract");
  u.searchParams.set("action", "getabi");
  u.searchParams.set("address", address);
  return u.toString();
}

export function txByHashUrl(hash: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "transaction");
  u.searchParams.set("action", "gettxinfo");
  u.searchParams.set("txhash", hash);
  return u.toString();
}

export function balanceUrl(address: string): string {
  const u = new URL(EXPLORER_API);
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "balance");
  u.searchParams.set("address", address);
  return u.toString();
}

/**
 * Direct server-side fetch fallback (when not going through json-fetch agent).
 * Use only from API routes / orchestrator, never from the browser.
 */
export async function explorerFetch<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 }
  });
  if (!res.ok) throw new Error(`explorer fetch failed: ${res.status}`);
  return (await res.json()) as T;
}
