import { describe, expect, it } from "vitest";
import {
  addRepeatableModule, createInitialLayout, DEFAULT_SURFACE, fitLayoutToWidth,
  FIXED_MODULE_IDS, layoutIsValid, listRepeatableModules, MAX_MODULES_PER_KIND,
  parseSavedLayout, removeRepeatableModule, requiredSurfaceHeight,
} from "./dashboardLayout";
import {
  addLayoutConfiguration, parseImportedLayoutConfiguration,
  parseLayoutSnapshot, serializeLayoutConfiguration,
} from "./layoutConfigurations";

const active = () => createInitialLayout();

describe("dynamic graph and telemetry panels", () => {
  it("adds independently identified copies that never overlap the current layout", () => {
    const first = addRepeatableModule(active(), "graphs", DEFAULT_SURFACE.width);
    const second = addRepeatableModule(first.layout, "telemetry", DEFAULT_SURFACE.width);
    expect(first.id).toBe("graphs-1");
    expect(second.id).toBe("telemetry-1");
    expect(Object.keys(second.layout)).toHaveLength(8);
    expect(listRepeatableModules(second.layout).map(item => item.label)).toEqual([
      "Telemetry overview 1", "Time series graph 1",
      "Time series graph 2", "Telemetry overview 2",
    ]);
    expect(parseSavedLayout({ version: 1, layout: second.layout })).toEqual(second.layout);
    expect(requiredSurfaceHeight(second.layout)).toBeGreaterThanOrEqual(DEFAULT_SURFACE.height);
  });

  it("can remove the last graph/telemetry but never a fixed operational module", () => {
    let layout = removeRepeatableModule(active(), "graphs");
    layout = removeRepeatableModule(layout, "telemetry");
    expect(listRepeatableModules(layout)).toHaveLength(0);
    expect(FIXED_MODULE_IDS.every(id => id in layout)).toBe(true);
    expect(() => removeRepeatableModule(layout, "pressure")).toThrow(/only existing graph/i);
    expect(() => removeRepeatableModule(layout, "graphs")).toThrow();
    const restored = addRepeatableModule(layout, "graphs", 480);
    expect(restored.id).toBe("graphs");
    expect(restored.layout.graphs.width).toBe(480);
  });

  it("caps the instance count and rejects unknown/missing/prototype module IDs", () => {
    let layout = active();
    for (let i = 1; i < MAX_MODULES_PER_KIND; i++) {
      layout = addRepeatableModule(layout, "graphs", DEFAULT_SURFACE.width).layout;
    }
    expect(() => addRepeatableModule(layout, "graphs", DEFAULT_SURFACE.width)).toThrow(/at most/);
    expect(parseSavedLayout({ version: 1, layout: { ...active(), dangerous: active().graphs } })).toBeNull();
    const withoutFixed = { ...active() };
    delete withoutFixed.controls;
    expect(parseSavedLayout({ version: 1, layout: withoutFixed })).toBeNull();
  });

  it("reflows dynamically populated layouts on narrow screens without changing saved geometry", () => {
    const added = addRepeatableModule(active(), "graphs", DEFAULT_SURFACE.width);
    const original = structuredClone(added.layout);
    const packed = fitLayoutToWidth(added.layout, 420, DEFAULT_SURFACE.width);
    expect(Object.keys(packed)).toHaveLength(Object.keys(original).length);
    expect(layoutIsValid(packed, { width: 420, height: requiredSurfaceHeight(packed) })).toBe(true);
    expect(added.layout).toEqual(original);
  });

  it("saves and imports instance membership with independent per-instance settings", () => {
    const added = addRepeatableModule(active(), "graphs", DEFAULT_SURFACE.width);
    const layout = removeRepeatableModule(added.layout, "telemetry");
    const snapshot = {
      version: 1, referenceWidth: DEFAULT_SURFACE.width, layout,
      moduleSettings: {
        graphs: { windowSeconds: 60, endOffsetSeconds: 0, tickSeconds: null, yRange: null, channels: {} },
        "graphs-1": { windowSeconds: 120, endOffsetSeconds: 10, tickSeconds: 15, yRange: null, channels: {} },
      },
    };
    const parsed = parseLayoutSnapshot(snapshot);
    expect(parsed?.moduleSettings?.["graphs-1"]).toMatchObject({ windowSeconds: 120 });
    const [saved] = addLayoutConfiguration([], "Two graphs", snapshot);
    const imported = parseImportedLayoutConfiguration(serializeLayoutConfiguration(saved));
    expect(imported.snapshot).toEqual(saved.snapshot);
    expect(Object.keys(imported.snapshot.layout)).not.toContain("telemetry");
  });

  it("accepts older fixed-layout presets and rejects settings for non-existent panels", () => {
    expect(parseLayoutSnapshot({ version: 1, referenceWidth: DEFAULT_SURFACE.width, layout: active() })).not.toBeNull();
    const snapshot = {
      version: 1, referenceWidth: DEFAULT_SURFACE.width, layout: active(),
      moduleSettings: { "graphs-1": { channels: {} } },
    };
    expect(parseLayoutSnapshot(snapshot)).toBeNull();
  });
});
