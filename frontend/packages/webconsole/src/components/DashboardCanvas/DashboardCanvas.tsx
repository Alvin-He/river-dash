import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from "react";
import type { LayoutSnapshot } from "../../layout/layoutConfigurations";
import {
  DEFAULT_SURFACE, MIN_SURFACE_WIDTH, listRepeatableModules, minWidthFor,
  type RepeatableModuleKind,
} from "../../layout/dashboardLayout";
import { useDashboardLayout } from "../../layout/useDashboardLayout";
import { FloatingModule } from "../FloatingModule";
import type { UIController } from "../../controller/UIController";
import type { StandSimulator } from "../../controller/MockStand";
import type { OperatorEventLog } from "../../controller/OperatorEventLog";
import { MockStandModule } from "../../modules/mock-stand/MockStandModule";
import { ModeControlsModule } from "../../modules/mode-controls/ModeControlsModule";
import { OperatorEventsModule } from "../../modules/operator-events/OperatorEventsModule";
import { PlaceholderModule } from "../../modules/placeholder";
import {
  demoTelemetryStream, TelemetryModule, type TelemetryModuleHandle,
} from "../../modules/telemetry";
import { TELEMETRY_SETTINGS_KEY } from "../../modules/telemetry/telemetrySettings";
import {
  TimeSeriesGraphModule, type TimeSeriesGraphHandle,
} from "../../modules/time-series-graph";
import { GRAPH_SETTINGS_KEY, type GraphSettings } from "../../modules/time-series-graph/graphSettings";
import type { TelemetrySettings } from "../../modules/telemetry/telemetrySettings";
import { demoGraphChannels } from "../../modules/time-series-graph/demoGraphStream";
import styles from "./DashboardCanvas.module.css";

export type ManagedModule = { id: string; kind: RepeatableModuleKind; label: string };

export interface DashboardCanvasHandle {
  getLayoutSnapshot: () => LayoutSnapshot;
  applyLayoutSnapshot: (snapshot: LayoutSnapshot) => void;
  addModule: (kind: RepeatableModuleKind) => string;
  removeModule: (id: string) => void;
}

interface DashboardCanvasProps {
  isLocked: boolean;
  resetSequence: number;
  onModulesChange?: (modules: ManagedModule[]) => void;
  controller: UIController;
  simulator: StandSimulator;
  eventLog: OperatorEventLog;
  readOnly?: boolean;
}

function settingsKey(id: string, kind: RepeatableModuleKind): string {
  const base = kind === "graphs" ? GRAPH_SETTINGS_KEY : TELEMETRY_SETTINGS_KEY;
  return id === kind ? base : `${base}:${id}`;
}

/** Fixed operational panels are preserved; only graph/telemetry instances are removable. */
export const DashboardCanvas = forwardRef<DashboardCanvasHandle, DashboardCanvasProps>(
  function DashboardCanvas({ isLocked, resetSequence, onModulesChange, controller, simulator, eventLog, readOnly = false }, ref) {
    const canvasRef = useRef<HTMLElement>(null);
    const graphRefs = useRef(new Map<string, TimeSeriesGraphHandle>());
    const telemetryRefs = useRef(new Map<string, TelemetryModuleHandle>());
    const pendingSettings = useRef<LayoutSnapshot | null>(null);
    const [settingsApplySequence, setSettingsApplySequence] = useState(0);
    const [viewport, setViewport] = useState(DEFAULT_SURFACE);
    const [draggedChannel, setDraggedChannel] = useState<string | null>(null);

    useEffect(() => {
      const element = canvasRef.current;
      if (!element) return;
      const measure = () => {
        const style = getComputedStyle(element);
        const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        setViewport({
          width: Math.max(MIN_SURFACE_WIDTH, Math.floor(element.clientWidth - horizontalPadding)),
          height: Math.max(280, Math.floor(element.clientHeight - verticalPadding)),
        });
      };
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();
      return () => observer.disconnect();
    }, []);

    const {
      positions, bounds, resetLayout, affectedModuleIds,
      updatePosition, updateResize, previewMove, clearDragPreview,
      beginResize, endResize, getLayoutSnapshot, applyLayoutSnapshot,
      addModule, removeModule,
    } = useDashboardLayout(viewport);
    const instances = listRepeatableModules(positions);
    const instanceIds = instances.map(item => item.id).join("|");

    useEffect(() => {
      onModulesChange?.(listRepeatableModules(positions));
    // Layout geometry changes do not change the list of modules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceIds, onModulesChange]);

    // Apply settings after React attaches refs for newly created panels.
    useEffect(() => {
      const snapshot = pendingSettings.current;
      if (!snapshot) return;
      pendingSettings.current = null;
      const perModule = snapshot.moduleSettings ?? {};
      for (const [id, handle] of graphRefs.current) {
        const settings = perModule[id] ?? (id === "graphs" ? snapshot.graphSettings : undefined);
        if (settings) handle.applySettings(settings as GraphSettings);
      }
      for (const [id, handle] of telemetryRefs.current) {
        const settings = perModule[id] ?? (id === "telemetry" ? snapshot.telemetrySettings : undefined);
        if (settings) handle.applySettings(settings as TelemetrySettings);
      }
    }, [settingsApplySequence]);

    const removeInstance = useCallback((id: string) => {
      // The layout hook rejects removal of protected operational panels.
      removeModule(id);
      const kind = id === "graphs" || id.startsWith("graphs-") ? "graphs" : "telemetry";
      try { localStorage.removeItem(settingsKey(id, kind)); }
      catch { /* Storage can be unavailable; removal still succeeds. */ }
    }, [removeModule]);

    useImperativeHandle(ref, () => ({
      getLayoutSnapshot: () => {
        const snapshot = getLayoutSnapshot();
        const moduleSettings: NonNullable<LayoutSnapshot["moduleSettings"]> = {};
        for (const [id, handle] of graphRefs.current) moduleSettings[id] = handle.getSettings();
        for (const [id, handle] of telemetryRefs.current) moduleSettings[id] = handle.getSettings();
        return { ...snapshot, moduleSettings };
      },
      applyLayoutSnapshot: (snapshot) => {
        pendingSettings.current = snapshot;
        applyLayoutSnapshot(snapshot);
        setSettingsApplySequence(sequence => sequence + 1);
      },
      addModule: (kind) => {
        if (isLocked) throw new Error("Unlock layout editing before adding modules.");
        return addModule(kind);
      },
      removeModule: (id) => {
        if (isLocked) throw new Error("Unlock layout editing before removing modules.");
        removeInstance(id);
      },
    }), [getLayoutSnapshot, applyLayoutSnapshot, addModule, removeInstance, isLocked]);

    const previousReset = useRef(resetSequence);
    useEffect(() => {
      if (previousReset.current === resetSequence) return;
      previousReset.current = resetSequence;
      resetLayout();
    }, [resetSequence, resetLayout]);

    const fixedPanels = ["pressure", "pid", "controls", "events"] as const;

    function panelEvents(id: string) {
      return {
        position: positions[id],
        minWidth: minWidthFor(id),
        isLocked,
        onPositionChange: updatePosition(id),
        onResize: updateResize(id),
        onDragPreview: previewMove(id),
        onDragEnd: clearDragPreview,
        onResizeStart: beginResize(id),
        onResizeEnd: endResize,
      };
    }

    return (
      <section ref={canvasRef} className={styles.canvas} aria-label="Movable dashboard modules">
        <div className={styles.surface} style={{ height: bounds.height }}>
          {fixedPanels.map((id) => (
            <FloatingModule key={id} {...panelEvents(id)}>
              {id === "pressure" ? (readOnly ? <PlaceholderModule title="Stand simulator" message="View-only access — simulator controls are unavailable" isAffected={affectedModuleIds.has(id)} /> : <MockStandModule controller={controller} simulator={simulator} isAffected={affectedModuleIds.has(id)} />) :
                id === "controls" ? (readOnly ? <PlaceholderModule title="Mode & Valve Control" message="View-only access — simulated stand commands are unavailable" isAffected={affectedModuleIds.has(id)} /> : <ModeControlsModule controller={controller} isAffected={affectedModuleIds.has(id)} />) :
                  id === "events" ? <OperatorEventsModule log={eventLog} isAffected={affectedModuleIds.has(id)} /> :
                    <PlaceholderModule title="P&ID" isAffected={affectedModuleIds.has(id)} />}
            </FloatingModule>
          ))}
          {instances.map(({ id, kind, label }) => (
            <FloatingModule
              key={id} {...panelEvents(id)}
              minHeight={kind === "graphs" ? 280 : 190}
            >
              {kind === "graphs" ? (
                <TimeSeriesGraphModule
                  ref={handle => {
                    if (handle) graphRefs.current.set(id, handle);
                    else graphRefs.current.delete(id);
                  }}
                  storageKey={settingsKey(id, kind)}
                  title={label}
                  onRemove={!isLocked ? () => removeInstance(id) : undefined}
                  isAffected={affectedModuleIds.has(id)}
                  draggedChannel={draggedChannel}
                  onChannelDragEnd={() => setDraggedChannel(null)}
                />
              ) : (
                <TelemetryModule
                  ref={handle => {
                    if (handle) telemetryRefs.current.set(id, handle);
                    else telemetryRefs.current.delete(id);
                  }}
                  stream={demoTelemetryStream}
                  storageKey={settingsKey(id, kind)}
                  title={label}
                  onRemove={!isLocked ? () => removeInstance(id) : undefined}
                  isAffected={affectedModuleIds.has(id)}
                  canGraphChannel={channel => demoGraphChannels.some(entry => entry.channel === channel)}
                  onChannelDragStart={setDraggedChannel}
                  onChannelDragEnd={() => setDraggedChannel(null)}
                />
              )}
            </FloatingModule>
          ))}
        </div>
      </section>
    );
  },
);
