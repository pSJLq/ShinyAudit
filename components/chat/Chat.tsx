"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { ChatNav } from "./ChatNav";
import { SessionStrip } from "./SessionStrip";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { UserMessage } from "./UserMessage";
import { SwarmReply } from "./SwarmReply";
import { VideoBg } from "./VideoBg";
import { DepositModal } from "./DepositModal";
import { investigate } from "@/lib/investigate-client";
import { applyEvent, emptyReply } from "@/lib/chat-stream";
import { ESCROW_ABI, ESCROW_ADDRESS } from "@/lib/somnia/escrow";
import { somniaTestnet } from "@/lib/somnia/chains";
import type { ChatMessage, ChatSession, SwarmMsg, UserMsg } from "./types";

const STORAGE_KEY = "shinyaudit_session_v1";

function newSessionId(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `dossier-#${n}`;
}

function nowUtc(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function freshSession(): ChatSession {
  return {
    id: newSessionId(),
    startedAt: nowUtc(),
    credit: 0,
    sessionTotal: 0,
    lastReply: 0,
    turns: 0
  };
}

interface StoredSession {
  session: ChatSession;
  messages: ChatMessage[];
}

function loadStored(address: string | undefined): StoredSession | null {
  if (typeof window === "undefined" || !address) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${address.toLowerCase()}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveStored(address: string | undefined, s: StoredSession) {
  if (typeof window === "undefined" || !address) return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:${address.toLowerCase()}`, JSON.stringify(s));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function Chat() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  // SSR returns null; the first client effect generates the real session.
  // This prevents hydration mismatch caused by Math.random + Date.now in initial state.
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Live credit sync — refreshes session.credit from escrow contract.
  // Runs on connect, every 8s while idle, and after every dispatch completes.
  const refreshCredit = useCallback(async () => {
    if (!address || !publicClient) return;
    try {
      const c = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "credits",
        args: [address]
      })) as bigint;
      const credit = Number(formatEther(c));
      setSession((s) => (s ? { ...s, credit } : s));
    } catch {
      /* swallow — keep last known credit */
    }
  }, [address, publicClient]);

  useEffect(() => {
    refreshCredit();
    const id = setInterval(refreshCredit, 8000);
    return () => clearInterval(id);
  }, [refreshCredit]);

  // Initial session creation — runs once after mount on the client.
  useEffect(() => {
    if (session !== null) return;
    const stored = address ? loadStored(address) : null;
    if (stored && stored.messages.length > 0) {
      setSession(stored.session);
      setMessages(stored.messages);
    } else {
      setSession(freshSession());
    }
  }, [address, session]);

  // When wallet changes (connect/switch), re-hydrate from that wallet's storage.
  useEffect(() => {
    if (!address) return;
    const stored = loadStored(address);
    if (stored && stored.messages.length > 0) {
      setSession(stored.session);
      setMessages(stored.messages);
    }
  }, [address]);

  // First-time experience: if connected but credit = 0, auto-open deposit modal.
  // We only check once per session.
  const promptedRef = useRef(false);
  useEffect(() => {
    if (!isConnected || !address || promptedRef.current) return;
    promptedRef.current = true;
    // give SessionStrip a beat to read credit before deciding
    const id = setTimeout(() => {
      // re-read directly to avoid stale state
      void (async () => {
        try {
          const { createPublicClient, http } = await import("viem");
          const { ESCROW_ABI: A, ESCROW_ADDRESS: ADDR } = await import("@/lib/somnia/escrow");
          const { somniaTestnet: chain } = await import("@/lib/somnia/chains");
          const c = createPublicClient({ chain, transport: http() });
          const credit = (await c.readContract({
            address: ADDR,
            abi: A,
            functionName: "credits",
            args: [address]
          })) as bigint;
          if (credit === 0n) setDepositOpen(true);
        } catch {
          /* silent */
        }
      })();
    }, 1500);
    return () => clearTimeout(id);
  }, [isConnected, address]);

  // Persist on every update.
  useEffect(() => {
    if (!address || !session) return;
    saveStored(address, { session, messages });
  }, [address, session, messages]);

  // Auto-scroll to bottom on new message or stream tick.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ⌘K / Ctrl+K → new session
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel inflight on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLastSwarm = useCallback((fn: (m: SwarmMsg) => SwarmMsg) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "swarm") {
          const next = [...prev];
          next[i] = fn(prev[i] as SwarmMsg);
          return next;
        }
      }
      return prev;
    });
  }, []);

  const handleSend = useCallback(
    async (p: {
      text: string;
      target: { kind: string; addr: string } | null;
      qtype: string | null;
      costEst: number | null;
    }) => {
      if (!address) return;
      if (!session) return; // safety
      const userMsg: UserMsg = {
        id: "u_" + Date.now(),
        role: "user",
        text: p.text,
        target: p.target,
        qtype: p.qtype,
        costEst: p.costEst ?? undefined
      };
      const targetAddr = p.target?.addr || p.text.match(/0x[a-fA-F0-9]{40,64}/)?.[0] || "—";
      const title = {
        kind: p.qtype || "free-form",
        target: shortAddr(targetAddr)
      };
      const reply = emptyReply("s_" + Date.now(), title);

      setMessages((prev) => [...prev, userMsg, reply]);
      setIsStreaming(true);
      setSession((s) => (s ? { ...s, turns: s.turns + 1 } : s));

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        await investigate(
          p.text,
          targetAddr,
          address,
          (ev) => {
            updateLastSwarm((m) => applyEvent(m, ev));
          },
          ctrl.signal
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        updateLastSwarm((m) => ({
          ...m,
          status: "error",
          errorMessage: (err as Error).message
        }));
      } finally {
        setIsStreaming(false);
        // capture last reply cost from the message itself
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "swarm" && last.costTotal != null) {
            setSession((s) =>
              s
                ? {
                    ...s,
                    lastReply: last.costTotal!,
                    sessionTotal: s.sessionTotal + last.costTotal!
                  }
                : s
            );
          }
          return prev;
        });
        // Refresh credit from chain after dispatch completes (escrow drained)
        void refreshCredit();
      }
    },
    [address, session, updateLastSwarm, refreshCredit]
  );

  const handleNew = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSession(freshSession());
  };

  const handleDownload = () => {
    if (!session) return;
    const md = renderMarkdownDossier(session, messages);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!session) return;
    const md = renderMarkdownDossier(session, messages);
    try {
      await navigator.clipboard.writeText(md);
      alert("dossier markdown copied to clipboard");
    } catch {
      handleDownload();
    }
  };

  const empty = messages.length === 0;

  // Render a stable placeholder until session is initialised on the client.
  // Same DOM shape as the real Chat so hydration succeeds, but no random/Date.
  if (!session) {
    return (
      <div className="chat-root">
        <VideoBg />
        <div className="shell">
          <ChatNav />
          <div className="session-strip">
            <div className="session-row-1">
              <div className="session-id">
                <span className="pre">&gt;&nbsp;session</span>
                <span className="id">initializing…</span>
              </div>
            </div>
          </div>
          <div className="chat-body" />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-root">
      <VideoBg />
      <div className="shell">
        <ChatNav />
        <SessionStrip
          session={session}
          onNew={handleNew}
          onOpenDeposit={() => setDepositOpen(true)}
          onDownload={handleDownload}
          onShare={handleShare}
        />
        <div className="chat-body">
          {empty ? (
            <EmptyState
              onPick={(text) => {
                handleSend({
                  text,
                  target: null,
                  qtype: text.startsWith("/") ? text.slice(1).split(" ")[0] : null,
                  costEst: 1.8
                });
              }}
            />
          ) : (
            <div className="messages">
              {messages.map((m) =>
                m.role === "user" ? <UserMessage key={m.id} msg={m} /> : <SwarmReply key={m.id} msg={m} />
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <Composer
          disabled={isStreaming}
          isConnected={isConnected}
          onSend={handleSend}
          onAbort={() => {
            abortRef.current?.abort();
            updateLastSwarm((m) => ({
              ...m,
              status: "error",
              errorMessage: "aborted by user — any in-flight Somnia request will still be billed once it finalises or times out."
            }));
            setIsStreaming(false);
          }}
          session={session}
        />
        {depositOpen && (
          <DepositModal
            onClose={() => setDepositOpen(false)}
            onSuccess={() => {
              void refreshCredit();
            }}
          />
        )}
      </div>
    </div>
  );
}

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function renderMarkdownDossier(session: ChatSession, messages: ChatMessage[]): string {
  const out: string[] = [];
  out.push(`# {s}hinyAudit dossier · ${session.id}`);
  out.push(``);
  out.push(`> started ${session.startedAt}  ·  ${session.turns} turn${session.turns === 1 ? "" : "s"}  ·  spent ${session.sessionTotal.toFixed(3)} STT`);
  out.push(``);
  for (const m of messages) {
    if (m.role === "user") {
      out.push(`---`);
      out.push(`## ❓ ${m.text}`);
      if (m.target) out.push(`> target: \`${m.target.kind} ${m.target.addr}\``);
      if (m.qtype) out.push(`> type: ${m.qtype}`);
      out.push(``);
    } else {
      out.push(`### 🔎 ${m.title.kind} · ${m.title.target}`);
      out.push(`> ${m.agents.length} agents · ${m.costTotal?.toFixed(3) ?? "—"} STT`);
      out.push(``);
      if (m.verdict) {
        out.push(`**${m.verdict.label.toUpperCase()}** · ${m.verdict.headline}`);
        if (m.verdict.score != null) out.push(`> risk score: **${m.verdict.score}/100**`);
        out.push(``);
      }
      for (const b of m.blocks) {
        if (b.type === "markdown") {
          out.push(b.text);
          out.push(``);
        } else if (b.type === "risk-list") {
          const list = b.items || b.itemsByView?.user || [];
          for (const r of list) {
            out.push(`- **[${r.sev.toUpperCase()}]** ${r.title} — ${r.desc}`);
          }
          out.push(``);
        } else if (b.type === "callout") {
          out.push(`> ${b.text}`);
          out.push(``);
        }
      }
      if (m.citations.length > 0) {
        out.push(`#### citations`);
        for (const c of m.citations) {
          out.push(`- \`${c.hash}\` · ${c.agent} · [receipt](${c.receipt})`);
        }
        out.push(``);
      }
    }
  }
  out.push(`---`);
  out.push(`*generated by {s}hinyAudit — agent-native on-chain investigator built on Somnia.*`);
  return out.join("\n");
}
