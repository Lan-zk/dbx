// @vitest-environment happy-dom
import { createApp, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("splitpanes", () => ({
  Splitpanes: {
    name: "SplitpanesStub",
    template: `<div class="splitpanes-stub"><slot /></div>`,
  },
  Pane: {
    name: "PaneStub",
    template: `<div class="pane-stub"><slot /></div>`,
  },
}));

const editorPreviewCalls = vi.hoisted(() => [] as Array<{ tabId: string; range: unknown }>);
const editorFocusCalls = vi.hoisted(() => [] as Array<{ tabId: string; range: unknown }>);

vi.mock("@/components/layout/EditorGroup.vue", () => ({
  default: {
    name: "EditorGroupStub",
    props: ["groupId", "tabIds", "activeTabId"],
    emits: ["execute"],
    methods: {
      previewStatementRange(tabId: string, range: unknown) {
        editorPreviewCalls.push({ tabId, range });
        return true;
      },
      focusStatementRange(tabId: string, range: unknown) {
        editorFocusCalls.push({ tabId, range });
        return true;
      },
    },
    template: `<div data-test="editor-group" :data-group-id="groupId" :data-tab-ids="tabIds.join(',')" :data-active-tab-id="activeTabId"><button data-test="emit-execute" @click="$emit('execute', { fullSql: 'SELECT 1', selectedSql: 'SELECT 1', cursorPos: 0, selectionFrom: 0, selectionTo: 8 })">execute</button></div>`,
  },
}));

vi.mock("@/components/layout/EditorToolbar.vue", () => ({
  default: {
    name: "EditorToolbarStub",
    props: ["activeTab"],
    template: `<div data-test="group-toolbar" />`,
  },
}));

vi.mock("@/components/layout/QueryResultSurface.vue", () => ({
  default: {
    name: "QueryResultSurfaceStub",
    props: ["activeTab"],
    emits: ["previewStatement", "focusStatement"],
    template: `<div data-test="result-surface">{{ activeTab?.id }}<button data-test="emit-preview" @click="$emit('previewStatement', 'tab-a', { from: 0, to: 8 })">preview</button><button data-test="emit-focus" @click="$emit('focusStatement', 'tab-a', { from: 0, to: 8 })">focus</button></div>`,
  },
}));

import SqlEditorWorkspace from "../SqlEditorWorkspace.vue";
import { useQueryStore } from "@/stores/queryStore";

function tab(id: string) {
  return {
    id,
    title: id,
    connectionId: "conn-1",
    database: "db",
    sql: "SELECT 1",
    mode: "query",
  } as const;
}

function createHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

describe("SqlEditorWorkspace mount contract", () => {
  let pinia: ReturnType<typeof createPinia>;
  let i18n: ReturnType<typeof createI18n>;

  beforeEach(() => {
    document.body.innerHTML = "";
    editorPreviewCalls.length = 0;
    editorFocusCalls.length = 0;
    pinia = createPinia();
    setActivePinia(pinia);
    i18n = createI18n({
      legacy: false,
      locale: "en",
      messages: { en: { "tabs.noQueryResult": "No query result" } },
    });
  });

  it("renders one editor group per store group and binds the shared result to the global active tab", async () => {
    const store = useQueryStore();
    store.tabs = [tab("tab-a"), tab("tab-b")];
    store.activeTabId = "tab-a";
    store.groups = [
      { id: "g1", tabIds: ["tab-a"], activeTabId: "tab-a" },
      { id: "g2", tabIds: ["tab-b"], activeTabId: "tab-b" },
    ];
    store.focusedGroupId = "g1";
    store.orientation = "vertical";
    store.sizes = [50, 50];

    const host = createHost();
    const app = createApp(SqlEditorWorkspace, {
      activeTab: tab("tab-a"),
      activeConnection: undefined,
      executableSql: "SELECT 1",
      activeOutputView: "result",
      formatSqlRequest: null,
      compressSqlRequest: null,
      selectedSql: "",
      cursorPos: 0,
      blockDangerousRedisCommands: false,
    });
    app.use(pinia);
    app.use(i18n);
    app.mount(host);
    await nextTick();

    const groups = host.querySelectorAll('[data-test="editor-group"]');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.getAttribute("data-group-id")).toBe("g1");
    expect(groups[0]?.getAttribute("data-tab-ids")).toBe("tab-a");
    expect(groups[1]?.getAttribute("data-group-id")).toBe("g2");
    expect(groups[1]?.getAttribute("data-tab-ids")).toBe("tab-b");

    const result = host.querySelector<HTMLElement>('[data-test="result-surface"]');
    expect(result?.textContent).toContain("tab-a");

    app.unmount();
    host.remove();
  });

  it("forwards editor execute events from EditorGroup to the App listener", async () => {
    const store = useQueryStore();
    store.tabs = [tab("tab-a")];
    store.activeTabId = "tab-a";
    store.groups = [{ id: "g1", tabIds: ["tab-a"], activeTabId: "tab-a" }];
    store.focusedGroupId = "g1";
    store.orientation = "vertical";
    store.sizes = [100];

    const host = createHost();
    const onExecute = vi.fn();
    const app = createApp(SqlEditorWorkspace, {
      activeTab: tab("tab-a"),
      activeConnection: undefined,
      executableSql: "SELECT 1",
      activeOutputView: "result",
      formatSqlRequest: null,
      compressSqlRequest: null,
      selectedSql: "",
      cursorPos: 0,
      blockDangerousRedisCommands: false,
      onExecute,
    });
    app.use(pinia);
    app.use(i18n);
    app.mount(host);
    await nextTick();

    host.querySelector<HTMLButtonElement>('[data-test="emit-execute"]')?.click();
    await nextTick();

    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0]?.[0]).toMatchObject({ fullSql: "SELECT 1" });

    app.unmount();
    host.remove();
  });

  it("toggles the shared result pane through the exposed workspace method", async () => {
    const store = useQueryStore();
    store.tabs = [tab("tab-a")];
    store.activeTabId = "tab-a";
    store.groups = [{ id: "g1", tabIds: ["tab-a"], activeTabId: "tab-a" }];
    store.focusedGroupId = "g1";
    store.orientation = "vertical";
    store.sizes = [100];

    const host = createHost();
    const app = createApp(SqlEditorWorkspace, {
      activeTab: tab("tab-a"),
      activeConnection: undefined,
      executableSql: "SELECT 1",
      activeOutputView: "result",
      formatSqlRequest: null,
      compressSqlRequest: null,
      selectedSql: "",
      cursorPos: 0,
      blockDangerousRedisCommands: false,
    });
    app.use(pinia);
    app.use(i18n);
    const vm = app.mount(host) as any;
    await nextTick();

    expect(host.querySelector('[data-test="result-surface"]')).not.toBeNull();

    vm.toggleResultsPane();
    await nextTick();

    expect(host.querySelector('[data-test="result-surface"]')).toBeNull();

    app.unmount();
    host.remove();
  });

  it("routes result previewStatement events to the owning editor group", async () => {
    const store = useQueryStore();
    store.tabs = [tab("tab-a")];
    store.activeTabId = "tab-a";
    store.groups = [{ id: "g1", tabIds: ["tab-a"], activeTabId: "tab-a" }];
    store.focusedGroupId = "g1";
    store.orientation = "vertical";
    store.sizes = [100];

    const host = createHost();
    const app = createApp(SqlEditorWorkspace, {
      activeTab: tab("tab-a"),
      activeConnection: undefined,
      executableSql: "SELECT 1",
      activeOutputView: "result",
      formatSqlRequest: null,
      compressSqlRequest: null,
      selectedSql: "",
      cursorPos: 0,
      blockDangerousRedisCommands: false,
    });
    app.use(pinia);
    app.use(i18n);
    app.mount(host);
    await nextTick();

    host.querySelector<HTMLButtonElement>('[data-test="emit-preview"]')?.click();
    await nextTick();

    expect(editorPreviewCalls).toEqual([{ tabId: "tab-a", range: { from: 0, to: 8 } }]);

    app.unmount();
    host.remove();
  });

  it("routes result focusStatement events to the owning editor group", async () => {
    const store = useQueryStore();
    store.tabs = [tab("tab-a")];
    store.activeTabId = "tab-a";
    store.groups = [{ id: "g1", tabIds: ["tab-a"], activeTabId: "tab-a" }];
    store.focusedGroupId = "g1";
    store.orientation = "vertical";
    store.sizes = [100];

    const host = createHost();
    const app = createApp(SqlEditorWorkspace, {
      activeTab: tab("tab-a"),
      activeConnection: undefined,
      executableSql: "SELECT 1",
      activeOutputView: "result",
      formatSqlRequest: null,
      compressSqlRequest: null,
      selectedSql: "",
      cursorPos: 0,
      blockDangerousRedisCommands: false,
    });
    app.use(pinia);
    app.use(i18n);
    app.mount(host);
    await nextTick();

    host.querySelector<HTMLButtonElement>('[data-test="emit-focus"]')?.click();
    await nextTick();

    expect(editorFocusCalls).toEqual([{ tabId: "tab-a", range: { from: 0, to: 8 } }]);

    app.unmount();
    host.remove();
  });
});
