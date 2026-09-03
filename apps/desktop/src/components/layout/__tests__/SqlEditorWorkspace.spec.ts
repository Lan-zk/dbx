import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(new URL("../SqlEditorWorkspace.vue", import.meta.url), "utf8");
const groupSource = readFileSync(new URL("../EditorGroup.vue", import.meta.url), "utf8");
const groupTabBarSource = readFileSync(new URL("../EditorGroupTabBar.vue", import.meta.url), "utf8");
const tabMenuSource = readFileSync(new URL("../../../lib/tabs/tabMenu.ts", import.meta.url), "utf8");
const editorSurfaceSource = readFileSync(new URL("../QueryEditorSurface.vue", import.meta.url), "utf8");
const resultSurfaceSource = readFileSync(new URL("../QueryResultSurface.vue", import.meta.url), "utf8");
const contentAreaSource = readFileSync(new URL("../ContentArea.vue", import.meta.url), "utf8");
const surfaceContractSource = readFileSync(new URL("../querySurfaces.ts", import.meta.url), "utf8");

describe("SQL editor workspace single-group tracer bullet", () => {
  it("composes splitpanes editor groups and one shared result surface", () => {
    expect(workspaceSource).toContain("Splitpanes");
    expect(workspaceSource).toContain("EditorGroup");
    expect(workspaceSource).toContain("QueryResultSurface");
    expect(groupSource).toContain("EditorGroupTabBar");
    expect(groupSource).toContain("QueryEditorSurface");
    expect(groupSource).toContain("ContentArea");
    expect(groupSource).toContain("tabIds");
    expect(groupSource).toContain("activeTabId");
  });

  it("routes query editor and shared result through dedicated surface components", () => {
    expect(editorSurfaceSource).toContain("editor-only");
    expect(resultSurfaceSource).toContain("result-only");
    expect(contentAreaSource).toContain("editorOnly?: boolean");
    expect(contentAreaSource).toContain("resultOnly?: boolean");
  });

  it("keeps AppTabBar as the global special-page bar while regular tabs move to groups", () => {
    const tabBarSource = readFileSync(new URL("../AppTabBar.vue", import.meta.url), "utf8");
    expect(tabBarSource).not.toContain("hideRegularTabs");
    expect(groupTabBarSource).toContain("app-tab-bar");
  });

  it("makes the shared result area vertically resizable through the workspace splitter", () => {
    expect(workspaceSource).toContain("sql-editor-workspace-split");
    expect(workspaceSource).toContain("onSharedResultResized");
    expect(workspaceSource).toContain("dbx-shared-results-pane-size");
    expect(workspaceSource).not.toContain("h-1/3");
  });

  it("routes shared-result statement navigation to the owning editor surface", () => {
    expect(workspaceSource).toContain("@preview-statement");
    expect(workspaceSource).toContain("@focus-statement");
    expect(workspaceSource).toContain("handlePreviewStatement");
    expect(workspaceSource).toContain("handleFocusStatement");
    expect(resultSurfaceSource).toContain("previewStatement");
    expect(resultSurfaceSource).toContain("focusStatement");
    expect(resultSurfaceSource).toContain("previewStatementRange");
    expect(resultSurfaceSource).toContain("focusStatementRange");
    expect(editorSurfaceSource).toContain("previewStatementRange");
    expect(editorSurfaceSource).toContain("focusStatementRange");
    expect(groupSource).toContain("previewStatementRange");
    expect(groupSource).toContain("focusStatementRange");
    expect(surfaceContractSource).toContain("previewStatement: [tabId: string, range: StatementRange | null]");
    expect(surfaceContractSource).toContain("focusStatement: [tabId: string, range: StatementRange | null]");
  });

  it("keeps group tabbar behavior compatible with the legacy tab bar", () => {
    expect(workspaceSource).toContain("@toggle-zen-mode");
    expect(groupSource).toContain("@toggle-zen-mode");
    expect(groupTabBarSource).toContain('"toggle-zen-mode": []');
    expect(groupTabBarSource).toContain('tab.mode === "data"');
    expect(groupTabBarSource).toContain('emit("toggle-zen-mode")');
    expect(tabMenuSource).toContain("visible: options.canRename");
    expect(groupTabBarSource).toContain("createRenameDuplicateTabItems");
    expect(groupTabBarSource).toContain("cleanupTabDrag");
    expect(groupTabBarSource).toContain("onUnmounted(cleanupTabDrag)");
    expect(groupTabBarSource).toContain("pointercancel");
  });

  it("keeps event forwarding and per-group active tab wiring intact", () => {
    expect(workspaceSource).toContain('v-bind="editorGroupBindings"');
    expect(workspaceSource).toContain('v-bind="resultSurfaceBindings"');
    expect(groupSource).toContain('v-bind="surfaceBindings"');
    expect(groupSource).toContain("activeTab: activeTab.value!");
    expect(editorSurfaceSource).toContain('v-bind="bindings"');
    expect(resultSurfaceSource).toContain('v-bind="bindings"');
  });
});
