// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAboutPanel } from "../src/panel.js";
const identity = { build: "2026-10-07T18:20:00.000Z", source: "source", bundle: "main.js" };
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("About host port lifecycle", () => {
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
