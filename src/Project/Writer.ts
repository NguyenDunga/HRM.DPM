import type { CsprojEdit, ItemChild } from "./Model.js";

/**
 * Formatting-preserving csproj writer.
 *
 * Applies edits as minimal string operations on the raw XML so untouched lines
 * stay byte-identical. Item lookups anchor on the exact Include attribute.
 * Indentation is inferred from the matched item's own leading whitespace.
 */
export const Writer = (() => {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /** Locate an item element by its Include value. Returns [start, end) span. */
  function findItem(raw: string, include: string): { start: number; end: number; indent: string; selfClosing: boolean } | undefined {
    // Match: <indent><Tag Include="value" ... > ... </Tag>  OR self-closing />
    const open = new RegExp(
      `([ \\t]*)<([A-Za-z0-9_]+)\\s+Include="${esc(include)}"\\s*(/?)>`,
    );
    const m = open.exec(raw);
    if (!m) return undefined;
    const indent = m[1]!;
    const tag = m[2]!;
    const selfClosing = m[3] === "/";
    const start = m.index;
    if (selfClosing) {
      return { start, end: start + m[0].length, indent, selfClosing };
    }
    const closeRe = new RegExp(`</${esc(tag)}>`, "g");
    closeRe.lastIndex = start + m[0].length;
    const cm = closeRe.exec(raw);
    if (!cm) return undefined;
    return { start, end: cm.index + cm[0].length, indent, selfClosing };
  }

  function renderChildren(children: ItemChild[], indent: string, eol: string): string {
    return children
      .map((c) => `${indent}  <${c.tag}>${c.text}</${c.tag}>`)
      .join(eol);
  }

  function renderItem(tag: string, include: string, children: ItemChild[], indent: string, eol: string): string {
    if (children.length === 0) return `${indent}<${tag} Include="${include}" />`;
    return (
      `${indent}<${tag} Include="${include}">${eol}` +
      renderChildren(children, indent, eol) +
      `${eol}${indent}</${tag}>`
    );
  }

  /** Return the item's inner content (between > and </Tag>), or undefined. */
  function innerOf(raw: string, span: { start: number; end: number; selfClosing: boolean }): string | undefined {
    if (span.selfClosing) return undefined;
    const openEnd = raw.indexOf(">", span.start) + 1;
    const closeStart = raw.lastIndexOf("</", span.end);
    return raw.slice(openEnd, closeStart);
  }

  /** Expand a self-closing item into an open/close pair with children. */
  function setChild(raw: string, include: string, tag: string, value: string, eol: string): string {
    const span = findItem(raw, include);
    if (!span) throw new Error(`item not found for Include="${include}"`);
    const childLine = `${span.indent}  <${tag}>${value}</${tag}>`;

    if (span.selfClosing) {
      const openTagMatch = /<([A-Za-z0-9_]+)\s+Include="/.exec(raw.slice(span.start))!;
      const itemTag = openTagMatch[1]!;
      const replacement =
        `${span.indent}<${itemTag} Include="${include}">${eol}` +
        `${childLine}${eol}` +
        `${span.indent}</${itemTag}>`;
      return raw.slice(0, span.start) + replacement + raw.slice(span.end);
    }

    const inner = innerOf(raw, span)!;
    const existing = new RegExp(`([ \\t]*)<${esc(tag)}>[^<]*</${esc(tag)}>`);
    if (existing.test(inner)) {
      const newInner = inner.replace(existing, `$1<${tag}>${value}</${tag}>`);
      const openEnd = raw.indexOf(">", span.start) + 1;
      const closeStart = raw.lastIndexOf("</", span.end);
      return raw.slice(0, openEnd) + newInner + raw.slice(closeStart);
    }
    // append new child before </Tag>
    const closeStart = raw.lastIndexOf("</", span.end);
    return raw.slice(0, closeStart) + childLine + eol + span.indent + raw.slice(closeStart);
  }

  function copyValue(v: string): string {
    return v === "None" ? "Never" : v;
  }

  /** Insert a new item at the end of the last ItemGroup (create one if none). */
  function addItem(raw: string, edit: Extract<CsprojEdit, { op: "add-item" }>, eol: string): string {
    const lastClose = raw.lastIndexOf("</ItemGroup>");
    if (lastClose !== -1) {
      const lineStart = raw.lastIndexOf("\n", lastClose) + 1;
      const indent = raw.slice(lineStart, lastClose).match(/^[ \t]*/)![0] + "  ";
      const block = renderItem(edit.tag, edit.include, edit.children ?? [], indent, eol) + eol;
      return raw.slice(0, lineStart) + block + raw.slice(lineStart);
    }
    // no ItemGroup: add one before </Project>
    const projClose = raw.lastIndexOf("</Project>");
    const block =
      `  <ItemGroup>${eol}` +
      renderItem(edit.tag, edit.include, edit.children ?? [], "    ", eol) +
      `${eol}  </ItemGroup>${eol}`;
    return raw.slice(0, projClose) + block + raw.slice(projClose);
  }

  function removeItem(raw: string, include: string, eol: string): string {
    const span = findItem(raw, include);
    if (!span) return raw;
    const lineStart = raw.lastIndexOf("\n", span.start) + 1;
    let end = span.end;
    // consume trailing EOL
    if (raw.startsWith(eol, end)) end += eol.length;
    return raw.slice(0, lineStart) + raw.slice(end);
  }

  function applyEdits(raw: string, edits: CsprojEdit[], eol: string): string {
    let out = raw;
    for (const edit of edits) {
      switch (edit.op) {
        case "add-item":
          out = addItem(out, edit, eol);
          break;
        case "remove-item":
          out = removeItem(out, edit.include, eol);
          break;
        case "set-dependent-upon":
          out = setChild(out, edit.include, "DependentUpon", edit.value, eol);
          break;
        case "set-copy-to-output":
          out = setChild(out, edit.include, "CopyToOutputDirectory", copyValue(edit.value), eol);
          break;
      }
    }
    return out;
  }

  return { applyEdits };
})();
