/**
 * A small WML reader, good enough for Wesnoth savegames and scenario/terrain configs.
 *
 * It is a character scanner rather than a line splitter, because savegames carry
 * multi-line quoted values (map_data, help_text) that a line-based parser mangles.
 * Preprocessor directives are not expanded: `{MACRO}` calls and `#ifdef` blocks are
 * kept as raw text so callers can inspect them, which is what the briefing tool wants.
 */

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

export interface WNode {
  tag: string;
  attrs: Record<string, string>;
  children: WNode[];
  /** Raw lines that were neither a tag nor an assignment (macro calls, ifdefs). */
  raw: string[];
}

function node(tag: string): WNode {
  return { tag, attrs: {}, children: [], raw: [] };
}

/** Reads a save or config, transparently gunzipping when needed. */
export function readWmlFile(path: string): string {
  const buf = readFileSync(path);
  const gzipped = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  return (gzipped ? gunzipSync(buf) : buf).toString("utf8");
}

export function parseWml(text: string): WNode {
  const root = node("root");
  const stack: WNode[] = [root];
  let i = 0;
  const n = text.length;

  const top = () => stack[stack.length - 1]!;

  while (i < n) {
    // Skip whitespace, remembering whether we are at the start of a line.
    while (i < n && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
    if (i >= n) break;

    const c = text[i]!;

    if (c === "#") {
      // Comment or preprocessor directive. Keep the text, skip the line.
      const end = text.indexOf("\n", i);
      const line = text.slice(i, end === -1 ? n : end).trim();
      if (!line.startsWith("#textdomain")) top().raw.push(line);
      i = end === -1 ? n : end + 1;
      continue;
    }

    if (c === "[") {
      const end = text.indexOf("]", i);
      if (end === -1) break;
      let name = text.slice(i + 1, end);
      i = end + 1;
      if (name.startsWith("/")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const merge = name.startsWith("+");
      if (merge) name = name.slice(1);
      const parent = top();
      if (merge) {
        // [+tag] reopens the last child with that name if there is one.
        const existing = [...parent.children].reverse().find((ch) => ch.tag === name);
        if (existing) {
          stack.push(existing);
          continue;
        }
      }
      const child = node(name);
      parent.children.push(child);
      stack.push(child);
      continue;
    }

    // Otherwise: `key=value`, `key1,key2=v1,v2`, or an unrecognised line.
    const lineEnd = text.indexOf("\n", i);
    const eq = text.indexOf("=", i);
    if (eq === -1 || (lineEnd !== -1 && eq > lineEnd)) {
      const line = text.slice(i, lineEnd === -1 ? n : lineEnd).trim();
      if (line) top().raw.push(line);
      i = lineEnd === -1 ? n : lineEnd + 1;
      continue;
    }

    const key = text.slice(i, eq).trim();
    i = eq + 1;
    const { value, next } = readValue(text, i);
    i = next;

    if (key.includes(",") && !value.includes("\n")) {
      const keys = key.split(",").map((k) => k.trim());
      const values = splitTopLevel(value);
      keys.forEach((k, idx) => {
        top().attrs[k] = (values[idx] ?? "").trim();
      });
    } else {
      top().attrs[key] = value;
    }
  }
  return root;
}

/**
 * Reads one WML value: a bare token, a quoted string (`""` escapes a quote),
 * a translatable `_"..."`, or several of those joined by trailing `+`.
 */
function readValue(text: string, start: number): { value: string; next: number } {
  let i = start;
  const parts: string[] = [];
  const n = text.length;

  for (;;) {
    while (i < n && (text[i] === " " || text[i] === "\t")) i++;
    // Translatable marker, written either as `_"text"` or as `_ "text"`.
    if (i < n && text[i] === "_") {
      let j = i + 1;
      while (j < n && (text[j] === " " || text[j] === "\t")) j++;
      if (text[j] === '"') i = j;
    }
    if (i < n && text[i] === '"') {
      i++;
      let out = "";
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            out += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += text[i];
        i++;
      }
      parts.push(out);
    } else {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      // Outside quotes a `#` starts a comment, including inline ones such as
      // `string=Gt       # wmllint: ignore` in terrain.cfg.
      let raw = text.slice(i, stop);
      const hash = raw.indexOf("#");
      if (hash !== -1) raw = raw.slice(0, hash);
      parts.push(raw.trim());
      i = stop;
      break;
    }
    // A trailing `+` (possibly followed by a newline) continues the string.
    let j = i;
    while (j < n && (text[j] === " " || text[j] === "\t")) j++;
    if (text[j] === "+") {
      j++;
      while (j < n && (text[j] === " " || text[j] === "\t" || text[j] === "\n" || text[j] === "\r")) j++;
      i = j;
      continue;
    }
    break;
  }
  if (i < n && text[i] === "\n") i++;
  return { value: parts.join(""), next: i };
}

/** Splits `a,b,c` on commas that are not inside parentheses or quotes. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// --- navigation helpers -----------------------------------------------------

export function child(n: WNode, tag: string): WNode | undefined {
  return n.children.find((c) => c.tag === tag);
}

export function children(n: WNode, tag: string): WNode[] {
  return n.children.filter((c) => c.tag === tag);
}

/** Follows a slash path, e.g. `snapshot/side`. Returns every node at the leaf. */
export function query(n: WNode, path: string): WNode[] {
  let level = [n];
  for (const part of path.split("/")) {
    level = level.flatMap((x) => children(x, part));
  }
  return level;
}

export function attr(n: WNode | undefined, key: string): string | undefined {
  return n?.attrs[key];
}

export function num(n: WNode | undefined, key: string, fallback = 0): number {
  const v = n?.attrs[key];
  if (v === undefined || v === "") return fallback;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Strips Wesnoth's translation marker leftovers from a display string. */
export function clean(s: string | undefined): string {
  if (!s) return "";
  return s.trim().replace(/^_\s*/, "").replace(/^"+|"+$/g, "").trim();
}
