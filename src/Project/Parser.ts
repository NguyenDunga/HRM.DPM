import { XMLParser } from "fast-xml-parser";

/**
 * Minimal XML reader for csproj / MSBuild files.
 *
 * Uses fast-xml-parser in preserveOrder mode so element order and attributes
 * survive. This module is READ-ONLY: it turns XML text into a walkable node
 * tree. Writing edits back to disk is done with targeted string edits in the
 * Loader so untouched formatting stays byte-identical (a full rebuild reflows
 * whitespace).
 *
 * Node shape (preserveOrder):
 *   { TagName: XmlNode[], ":@"?: { "@_Attr": value } }
 *   text nodes: { "#text": "..." }
 */
export interface XmlNode {
  [key: string]: unknown;
  ":@"?: Record<string, string>;
}

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
} as const;

export const Xml = (() => {
  const parser = new XMLParser(PARSER_OPTIONS);

  /** Parse XML text into an ordered node tree. */
  function parse(text: string): XmlNode[] {
    return parser.parse(text) as XmlNode[];
  }

  /** Tag name of a node (the single non-":@" key), or undefined for text. */
  function tagName(node: XmlNode): string | undefined {
    const keys = Object.keys(node).filter((k) => k !== ":@");
    const tag = keys[0];
    return tag === "#text" ? undefined : tag;
  }

  /** Child nodes of a node by its tag. */
  function children(node: XmlNode): XmlNode[] {
    const tag = tagName(node);
    if (!tag) return [];
    const value = node[tag];
    return Array.isArray(value) ? (value as XmlNode[]) : [];
  }

  /** Read an attribute value (without the @_ prefix). */
  function attr(node: XmlNode, name: string): string | undefined {
    return node[":@"]?.[`@_${name}`];
  }

  /** Text content of a node's first #text child. */
  function text(node: XmlNode): string | undefined {
    for (const child of children(node)) {
      if ("#text" in child) return String(child["#text"]);
    }
    return undefined;
  }

  /** Depth-first walk yielding every element node with the given tag. */
  function findAll(nodes: XmlNode[], tag: string): XmlNode[] {
    const out: XmlNode[] = [];
    const visit = (list: XmlNode[]) => {
      for (const n of list) {
        if (tagName(n) === tag) out.push(n);
        visit(children(n));
      }
    };
    visit(nodes);
    return out;
  }

  return { parse, tagName, children, attr, text, findAll };
})();
