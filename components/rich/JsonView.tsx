"use client";

/**
 * Minimal mono JSON pretty-printer with token highlighting.
 * Tries to render whatever it gets; if input isn't JSON, falls back to <pre>.
 */

import { useMemo } from "react";

function tokenize(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const next = "  ".repeat(indent + 1);
  if (value === null) return `<span class="b">null</span>`;
  if (typeof value === "boolean") return `<span class="b">${value}</span>`;
  if (typeof value === "number" || typeof value === "bigint") {
    return `<span class="n">${value}</span>`;
  }
  if (typeof value === "string") {
    const esc = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    return `<span class="s">"${esc}"</span>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `<span class="p">[]</span>`;
    const items = value.map((v) => `${next}${tokenize(v, indent + 1)}`).join(",\n");
    return `<span class="p">[</span>\n${items}\n${pad}<span class="p">]</span>`;
  }
  if (typeof value === "object" && value) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `<span class="p">{}</span>`;
    const items = entries
      .map(([k, v]) => `${next}<span class="k">"${k}"</span><span class="p">:</span> ${tokenize(v, indent + 1)}`)
      .join(",\n");
    return `<span class="p">{</span>\n${items}\n${pad}<span class="p">}</span>`;
  }
  return String(value);
}

export function JsonView({ data, raw }: { data?: unknown; raw?: string }) {
  const html = useMemo(() => {
    if (data !== undefined) return tokenize(data);
    if (raw !== undefined) {
      try {
        return tokenize(JSON.parse(raw));
      } catch {
        return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      }
    }
    return "";
  }, [data, raw]);
  return <div className="json-view" dangerouslySetInnerHTML={{ __html: html }} />;
}
