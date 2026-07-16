import { test, expect } from "@playwright/test";
import { Parser } from "../src/Project/Parser";

const SAMPLE = `
  <?xml version="1.0"?>
  <Project>
    <ItemGroup>
      <Content Include="Scripts\\node.js" />
      <Content Include="Scripts\\node.min.js">
        <DependentUpon>node.js</DependentUpon>
      </Content>
    </ItemGroup>
  </Project>
`;

test("parse returns a node tree", () => {
  const parsed = Array.isArray(Parser.parse(SAMPLE));
  expect(parsed).toBe(true);
});

test("findAll locates every Content item", () => {
  const parsed = Parser.findAll(Parser.parse(SAMPLE), "Content");
  expect(parsed.length).toBe(2);
});

test("attr reads the Include attribute", () => {
  const [first] = Parser.findAll(Parser.parse(SAMPLE), "Content");
  expect(Parser.attr(first, "Include")).toBe(`Scripts\\node.js`);
});

test("attr returns undefined when missing", () => {
  const [first] = Parser.findAll(Parser.parse(SAMPLE), "Content");
  expect(Parser.attr(first!, "Nope")).toBeUndefined();
});

test("text reads a child element's value", () => {
  const dep = Parser.findAll(Parser.parse(SAMPLE), "DependentUpon");
  expect(Parser.text(dep[0]!)).toBe("node.js");
});

test("tagName ignores text-only nodes", () => {
  const [root] = Parser.findAll(Parser.parse("<Root>hello</Root>"), "Root");
  const child = Parser.children(root!)[0]!;
  expect(Parser.tagName(child)).toBeUndefined();
});
