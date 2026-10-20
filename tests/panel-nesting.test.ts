// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BuiltFrom, BuiltFromPart } from "../src/builtFrom.js";
import { createAboutPanel } from "../src/panel.js";

/**
 * Sub-ownership is shown by nesting, never by indentation: each part is a
 * rounded rectangle that holds its own line and then its parts' rectangles,
 * as matryoshka dolls hold each other (the user's rule, 19 October 2026).
 */

const IDENTITY = { build: "2026-10-19T12:00:00.000Z", source: "tour", bundle: "index.js" };

/** Five levels, the depth of a tour: the tour, Earth, its UI, About in it, and a package About brings in. */
const DEEP: BuiltFrom = {
  built: "2026-10-19T12:00:00.000Z",
  app: {
    name: "tour", version: "26.10.19.#2", from: "app", parts: [
      { name: "foss-earth", version: "26.10.19.#5", from: "checkout", parts: [
        { name: "react", version: "19.2.6", from: "registry", repository: "https://github.com/facebook/react" },
        { name: "@foss-earth/ui", version: "26.10.19.#1", from: "checkout", parts: [
          { name: "@foss-earth/about", version: "26.10.18.#3", from: "checkout", parts: [
            { name: "vite", version: "8.3.4", from: "registry", repository: "https://github.com/vitejs/vite" },
          ] },
          { name: "react", version: "19.2.6", from: "registry", listedAbove: true },
        ] },
      ] },
      { name: "@babylonjs/core", version: "9.4.0", from: "registry" },
    ],
  },
};

afterEach(() => { document.body.replaceChildren(); });

describe("About's tree of parts", () => {
  it("puts each part's parts inside its own enclosure, its line first", () => {
    const about = createAboutPanel({ title: "Tour", builtFrom: DEEP, identity: IDENTITY });
    document.body.append(about.element);
    const enclosures = [...about.element.querySelectorAll<HTMLElement>(".foss-earth-about__part")];
    let checked = 0;
    const check = (part: BuiltFromPart, enclosure: HTMLElement, parent: HTMLElement | null, depth: number): void => {
      checked++;
      expect(enclosure.localName).toBe("li");
      // Its nearest enclosing part is the one that brought it in, and it lies inside that one's rectangle.
      expect(enclosure.parentElement!.closest(".foss-earth-about__part")).toBe(parent);
      if (parent) expect(parent.contains(enclosure)).toBe(true);
      let outer = 0;
      for (let at = enclosure.parentElement; at; at = at.parentElement) if (at.classList.contains("foss-earth-about__part")) outer++;
      expect(outer).toBe(depth);
      // Its own line comes first in its rectangle: the summary of its disclosure, or the row of a copy listed above.
      const line = enclosure.firstElementChild!.matches("details") ? enclosure.firstElementChild!.firstElementChild! : enclosure.firstElementChild!;
      expect(line.matches("summary.foss-earth-about__row, div.foss-earth-about__row")).toBe(true);
      expect(line.querySelector(".foss-earth-about__name")?.textContent).toBe(part.name);
      const children = [...enclosure.querySelectorAll<HTMLElement>(":scope > details > .foss-earth-about__body > .foss-earth-about__parts > .foss-earth-about__part")];
      expect(children).toHaveLength(part.listedAbove ? 0 : part.parts?.length ?? 0);
      children.forEach((child, index) => {
        expect(line.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        check(part.parts![index], child, enclosure, depth + 1);
      });
    };
    check(DEEP.app, about.element.querySelector<HTMLElement>(".foss-earth-about__tree > .foss-earth-about__part")!, null, 0);
    expect(checked).toBe(enclosures.length);
    expect(checked).toBe(8);
  });

  it("indents nothing in the DOM, and keeps its lists lists", () => {
    const about = createAboutPanel({ title: "Tour", builtFrom: DEEP, identity: IDENTITY });
    expect(about.element.querySelectorAll("[style]")).toHaveLength(0);
    const lists = [...about.element.querySelectorAll(".foss-earth-about__tree, .foss-earth-about__parts")];
    expect(lists.length).toBe(5);
    for (const list of lists) {
      expect(list.localName).toBe("ul");
      expect(list.getAttribute("role")).toBe("list");
      expect([...list.children].every(child => child.matches("li.foss-earth-about__part"))).toBe(true);
    }
  });
});

/** The panel's rules, innermost blocks only, so those inside @media count too. */
const CSS = readFileSync(path.join(import.meta.dirname, "../styles/panel.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim().replace(/\s+/g, " "),
  declarations: Object.fromEntries(body.split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const colon = item.indexOf(":");
    return [item.slice(0, colon).trim(), item.slice(colon + 1).trim()];
  })) as Record<string, string>,
}));
const rule = (selector: string): Record<string, string> => {
  const found = RULES.filter(entry => entry.selector === selector);
  expect(found, selector).toHaveLength(1);
  return found[0].declarations;
};

describe("About's stylesheet", () => {
  it("indents no level: no start-side padding, margin, border, offset or text indent", () => {
    const startOnly = new Set(["padding-left", "margin-left", "border-left", "border-left-width", "padding-inline", "padding-inline-start", "margin-inline", "margin-inline-start", "border-inline-start", "inset-inline-start", "left", "text-indent"]);
    const offenders: string[] = [];
    for (const { selector, declarations } of RULES) {
      for (const [property, value] of Object.entries(declarations)) {
        if (startOnly.has(property)) offenders.push(`${selector} { ${property}: ${value} }`);
        const sides = value.split(/\s+/);
        // A four-value padding or margin with its left unlike its right indents.
        if ((property === "padding" || property === "margin") && sides.length === 4 && sides[3] !== sides[1]) offenders.push(`${selector} { ${property}: ${value} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("draws each part as the parameter rows' rounded rectangle, each level a step smaller", () => {
    expect(rule(".foss-earth-about__part")).toMatchObject({
      border: "1px solid rgba(148, 163, 184, 0.4)",
      "border-radius": "10px",
      padding: "3px 6px",
      background: "rgba(148, 163, 184, 0.08)",
    });
    expect(rule(".foss-earth-about__part .foss-earth-about__part")).toEqual({ "border-radius": "8px", padding: "2px 5px" });
    expect(rule(".foss-earth-about__part .foss-earth-about__part .foss-earth-about__part")).toEqual({ "border-radius": "6px", padding: "2px 4px" });
    expect(rule(':root[data-theme="light"] .foss-earth-about__part')).toEqual({ background: "rgba(255, 255, 255, 0.72)" });
    expect(rule('[data-ui-theme]:not([data-ui-theme="earth"]) .foss-earth-about__part')).toEqual({ "border-color": "var(--ui-border)" });
    // The parts a part holds flow at their own widths as a paragraph does, an open one taking the line.
    expect(rule(".foss-earth-about__parts")).toMatchObject({ display: "flex", "flex-wrap": "wrap" });
    expect(rule(".foss-earth-about__part:has(> .foss-earth-about__details[open])")).toEqual({ "flex-basis": "100%" });
  });
});
