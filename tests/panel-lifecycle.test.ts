// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAboutPanel } from "../src/panel.js";
const identity = { build: "2026-10-07T18:20:00.000Z", source: "source", bundle: "main.js" };
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("About host port lifecycle", () => {
  it("uses supplied document, visibility and cancellation without ambient browser ports", async () => {
    const hostDocument = document.implementation.createHTMLDocument("Injected host");
    const controller = new AbortController();
    const createAbortController = vi.fn(() => controller);
    const callbacks: (() => void)[] = [];
    const stopVisibility = vi.fn();
    const stopPublished = vi.fn();
    const shown = vi.fn();
    let finish!: (value: string) => void;
    const read = vi.fn((_signal: AbortSignal) => new Promise<string>(resolve => { finish = resolve; }));
    const ambientNames = ["document", "window", "IntersectionObserver", "AbortController", "HTMLDetailsElement", "fetch"];
    const originalDescriptors = ambientNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const name of ambientNames) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`Ambient ${name} must not be read`); } });
    try {
      const about = createAboutPanel({
        document: hostDocument,
        whenShown: (element, listener) => {
          expect(element.ownerDocument).toBe(hostDocument);
          callbacks.push(listener);
          return stopVisibility;
        },
        createAbortController,
        identity,
        title: "Injected host",
        builtFrom: { built: identity.build, app: { name: "host", from: "app", commit: "a".repeat(40), repository: "https://example.org/host", parts: [
          { name: "shared", version: "1", from: "file", commit: "b".repeat(40), repository: "https://example.org/shared" },
          { name: "shared", version: "1", from: "file", listedAbove: true },
        ] } },
        publishedVersion: { describe: () => "Host publication status", subscribe: () => stopPublished, shown },
        latestDeploy: { read },
      });
      hostDocument.body.append(about.element);
      expect(about.element.ownerDocument).toBe(hostDocument);
      expect([...about.element.querySelectorAll("*")].every(element => element.ownerDocument === hostDocument)).toBe(true);
      expect(about.element.querySelector("svg")).not.toBeNull();
      const full = about.element.querySelectorAll<HTMLDetailsElement>("details")[1];
      expect(full.open).toBe(false);
      about.element.querySelector<HTMLButtonElement>(".foss-earth-about__above")!.click();
      expect(full.open).toBe(true);
      expect(callbacks).toHaveLength(2);
      expect(read).not.toHaveBeenCalled();
      for (const callback of callbacks) callback();
      await Promise.resolve();
      expect(shown).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledTimes(1);
      expect(read.mock.calls[0][0]).toBe(controller.signal);
      for (const callback of callbacks) callback();
      expect(read).toHaveBeenCalledTimes(1);
      expect(createAbortController).toHaveBeenCalledTimes(1);
      const text = about.element.textContent;
      about.dispose(); about.dispose();
      expect(controller.signal.aborted).toBe(true);
      expect(stopVisibility).toHaveBeenCalledTimes(2);
      expect(stopPublished).toHaveBeenCalledTimes(1);
      for (const callback of callbacks) callback();
      expect(shown).toHaveBeenCalledTimes(2);
      finish("c".repeat(40));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(about.element.textContent).toBe(text);
    } finally {
      for (const [name, descriptor] of originalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it("observes visibility, reads deployment once and disposes subscriptions", async () => {
    let observe!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { observe = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const read = vi.fn(async (_signal: AbortSignal) => "b".repeat(40));
    const about = createAboutPanel({ identity, title: "Host", builtFrom: null, latestDeploy: { read } });
    expect(read).not.toHaveBeenCalled();
    const visible = [{ isIntersecting: true }] as IntersectionObserverEntry[];
    observe(visible, {} as IntersectionObserver);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    observe([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    observe(visible, {} as IntersectionObserver);
    expect(read).toHaveBeenCalledTimes(1);
    about.dispose(); about.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0].aborted).toBe(true);
  });

  it("ignores a deployment completion after disposal", async () => {
    let finish!: (value: string) => void;
    const about = createAboutPanel({ identity, title: "Host", builtFrom: null, latestDeploy: { read: () => new Promise(resolve => { finish = resolve; }) } });
    await Promise.resolve();
    const text = about.element.textContent;
    about.dispose();
    finish("a".repeat(40));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(about.element.textContent).toBe(text);
  });

  it("renders supplied labels as text and makes no request without a host port", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const about = createAboutPanel({ identity, title: "<img src=x onerror=alert(1)>", builtFrom: null });
    expect(about.element.querySelector("img")).toBeNull();
    expect(about.element.querySelector("h2")?.textContent).toContain("<img");
    expect(fetcher).not.toHaveBeenCalled();
    about.dispose();
  });

  it("separates tour page provenance from its published site's identity", async () => {
    const pageIdentity = { build: "2026-10-07T18:20:00.000Z", source: "tour-source", bundle: "tour-page.js" };
    const about = createAboutPanel({ identity: pageIdentity, title: "Campus tour", builtFrom: null, publishedVersion: { describe: () => "Published site: a different release", subscribe: () => () => {} }, latestDeploy: { read: async () => "a".repeat(40) } });
    await vi.waitFor(() => expect(about.element.textContent).toContain("Site's latest deploy: aaaaaaaaaaaa"));
    expect(about.element.textContent).toContain("Source: tour-source");
    expect(about.element.textContent).toContain("Bundle: tour-page.js");
    expect(about.element.textContent).toContain("Published site: a different release");
    about.dispose();
  });
});
