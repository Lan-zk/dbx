<script lang="ts">
import { reactive } from "vue";

/**
 * Drag session state lives at module scope, shared by every group's tab bar
 * instance: the source bar starts the drag, but the insertion indicator must
 * render on the targeted pill — which may belong to another group's bar.
 */
const groupTabDrag = reactive({
  active: false,
  tabId: null as string | null,
  sourceGroupId: null as string | null,
  payload: "",
  startX: 0,
  startY: 0,
  targetGroupId: null as string | null,
  targetTabId: null as string | null,
  position: null as "before" | "after" | null,
});

let groupTabDragGhost: HTMLElement | null = null;
let groupTabDragSourceEl: HTMLElement | null = null;

/** Horizontal distance (px) required before a press becomes a tab drag; absorbs click jitter. */
const TAB_DRAG_HORIZONTAL_THRESHOLD = 24;
</script>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { useI18n } from "vue-i18n";
import { AlertTriangle, ArrowDown, ArrowRight, CalendarClock, ChevronDown, Code2, Copy, Database, Gauge, KeyRound, Maximize2, Minimize2, Network, PencilRuler, Pin, RotateCw, Search, ShieldCheck, Table2, TableProperties, X, Activity } from "@lucide/vue";
import CustomContextMenu, { type ContextMenuItem } from "@/components/ui/CustomContextMenu.vue";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import DatabaseIcon from "@/components/icons/DatabaseIcon.vue";
import TabExecutionStatus from "@/components/layout/TabExecutionStatus.vue";
import ReadOnlySessionControl from "@/components/connection/ReadOnlySessionControl.vue";
import { useQueryStore } from "@/stores/queryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabScroll } from "@/composables/useTabScroll";
import { useToast } from "@/composables/useToast";
import { copyToClipboard } from "@/lib/common/clipboard";
import { parseTabDragPayload, serializeTabDragPayload } from "@/lib/tabs/tabDrag";
import { createCloseAllTabMenuItem, createCloseOtherTabMenuItem, createCloseRightTabMenuItem, createCloseTabMenuItem, createLocateTabMenuItem, createPinTabMenuItem, createRenameDuplicateTabItems } from "@/lib/tabs/tabMenu";
import { dirtyTabTitleStyle, tabColorStyle as sharedTabColorStyle, tabDatabaseIconType, tabDisplayTitle, tabIconClass, tabTooltipLines } from "@/lib/tabs/tabPresentation";
import { activeTabSidebarTarget } from "@/lib/sidebar/sidebarActiveTabTarget";
import "./appTabBar.css";
import type { QueryTab } from "@/types/database";

const props = defineProps<{
  groupId: string;
  tabs: QueryTab[];
  activeTabId: string | null;
}>();

const emit = defineEmits<{
  "activate-tab": [tabId: string];
  "locate-tab": [tab: QueryTab];
  "toggle-zen-mode": [];
}>();

const { t } = useI18n();
const queryStore = useQueryStore();
const settingsStore = useSettingsStore();
const { toast } = useToast();
const tabsContainerRef = ref<HTMLElement | null>(null);
const { hasTabOverflow, scrollThumbLeftPercent, scrollThumbWidthPercent, isScrollbarDragging, updateScrollButtons, onTabsWheel, startScrollbarDrag } = useTabScroll(tabsContainerRef);
const editingTabId = ref<string | null>(null);
const editingTitle = ref("");
// Drag suppression must survive pointerup: the browser fires click *after*
// pointerup, so the flag is consumed by the click instead of being cleared
// with the drag state. A fresh pointerdown always resets it.
const suppressNextTabClick = ref(false);
const isClassicLayout = computed(() => settingsStore.editorSettings.appLayout === "classic");
const isWrapLayout = computed(() => settingsStore.editorSettings.tabLayout === "wrap");
const groupCapacityReached = computed(() => queryStore.groups.length >= 4);
const canChangeOrientation = computed(() => queryStore.groups.length >= 2);
const isSecondaryGroup = computed(() => queryStore.groups[0]?.id !== props.groupId);
const compactTabTitle = computed({
  get: () => settingsStore.editorSettings.compactTabTitle,
  set: (checked: boolean | "indeterminate") => {
    settingsStore.updateEditorSettings({ compactTabTitle: checked === true });
  },
});

function toggleCompactTabTitle() {
  compactTabTitle.value = !compactTabTitle.value;
}

const tabBarClass = computed(() => [isClassicLayout.value ? "bg-muted" : "border-b bg-background"]);
const tabsContainerStyle = computed<CSSProperties>(() => ({
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  WebkitOverflowScrolling: "touch",
}));
const tabScrollbarThumbStyle = computed<CSSProperties>(() => ({
  insetInlineStart: `${scrollThumbLeftPercent.value}%`,
  width: `${scrollThumbWidthPercent.value}%`,
}));

// Overflow search lists this group's tabs (mirrors the legacy AppTabBar
// overflow popover, scoped to the group that owns the strip).
const tabOverflowOpen = ref(false);
const tabSearchQuery = ref("");
const filteredGroupTabs = computed(() => {
  const query = tabSearchQuery.value.trim().toLocaleLowerCase();
  if (!query) {
    return props.tabs;
  }
  return props.tabs.filter((tab) => tabDisplayTitle(tab, t).toLocaleLowerCase().includes(query) || tab.title.toLocaleLowerCase().includes(query));
});

watch(tabOverflowOpen, (open) => {
  tabSearchQuery.value = "";
  if (open) {
    nextTick(() => document.querySelector<HTMLInputElement>("[data-group-tab-search-input]")?.focus());
  }
});

const showOverflowControl = computed(() => props.tabs.length > 0 && hasTabOverflow.value && !isWrapLayout.value);
const tabTailDragRegionClass = computed(() => (showOverflowControl.value || isWrapLayout.value ? "w-0 flex-none self-stretch" : "min-w-8 flex-1 self-stretch"));

function tabColorStyle(tab: QueryTab): CSSProperties | undefined {
  return sharedTabColorStyle(tab, tab.id === props.activeTabId, isClassicLayout.value);
}

/**
 * Drag visuals for a pill, ported from the legacy tab bar's tabDropStyle: the
 * dragged pill dims, and the hovered pill shows an inset ring line marking
 * whether the drop lands before or after it.
 */
function tabDropStyle(tab: QueryTab): CSSProperties | undefined {
  if (!groupTabDrag.active) {
    return undefined;
  }
  if (groupTabDrag.tabId === tab.id) {
    return { opacity: 0.4 };
  }
  if (groupTabDrag.targetTabId !== tab.id) {
    return undefined;
  }
  if (groupTabDrag.position === "before") {
    return { boxShadow: "inset 3px 0 0 0 var(--ring)" };
  }
  return { boxShadow: "inset -3px 0 0 0 var(--ring)" };
}

function createTabDragGhost(sourceEl: HTMLElement, x: number, y: number) {
  const ghost = document.createElement("div");
  const textNode = sourceEl.querySelector(".truncate");
  ghost.textContent = textNode?.textContent || "";
  ghost.style.cssText = `position: fixed; pointer-events: none; z-index: 9999; opacity: 0.9; box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: var(--dbx-radius-fixed-6); background: var(--background, #fff); border: 1px solid var(--border, #e5e7eb); max-width: 200px; height: 28px; padding: 0 12px; font-size: 12px; line-height: 28px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; left: ${x + 12}px; top: ${y - 14}px;`;
  document.body.appendChild(ghost);
  return ghost;
}

function moveTabDragGhost(x: number, y: number) {
  if (groupTabDragGhost) {
    groupTabDragGhost.style.left = `${x + 8}px`;
    groupTabDragGhost.style.top = `${y - 14}px`;
  }
}

function removeTabDragGhost() {
  groupTabDragGhost?.remove();
  groupTabDragGhost = null;
}

function isDirtyTab(tab: QueryTab) {
  return queryStore.isTabDirty(tab);
}

function tabTitleStyle(tab: QueryTab): CSSProperties | undefined {
  return dirtyTabTitleStyle(isDirtyTab(tab));
}

function dispatchBeforeTabSwitch(tabId: string) {
  if (tabId === props.activeTabId) {
    return;
  }
  window.dispatchEvent(new CustomEvent("dbx:before-tab-switch", { detail: { tabId, fromTabId: props.activeTabId } }));
}

function activateTab(tabId: string) {
  emit("activate-tab", tabId);
}

function handleTabPointerDown(event: PointerEvent, tab: QueryTab) {
  if (event.button !== 0) {
    return;
  }
  // A drag session is already in progress (second pointer device): ignore.
  if (groupTabDrag.active) {
    return;
  }
  suppressNextTabClick.value = false;
  if (event.target instanceof Element && event.target.closest("button, input, [role='button']")) {
    return;
  }
  // Match the legacy tab bar: flush pending grid edits before the visible tab changes.
  dispatchBeforeTabSwitch(tab.id);
  if (event.pointerType === "touch") {
    // Touch does not arm the drag; the strip's native scroll owns the gesture.
    return;
  }
  groupTabDragSourceEl = event.currentTarget as HTMLElement | null;
  groupTabDrag.active = false;
  groupTabDrag.tabId = tab.id;
  groupTabDrag.sourceGroupId = props.groupId;
  groupTabDrag.payload = serializeTabDragPayload({ tabId: tab.id, sourceGroupId: props.groupId });
  groupTabDrag.startX = event.clientX;
  groupTabDrag.startY = event.clientY;
  groupTabDrag.targetGroupId = null;
  groupTabDrag.targetTabId = null;
  groupTabDrag.position = null;
  window.addEventListener("pointermove", handleTabPointerMove);
  window.addEventListener("pointerup", handleTabPointerUp);
  window.addEventListener("pointercancel", cleanupTabDrag);
  window.addEventListener("blur", cleanupTabDrag);
}

function canRenameTab(tab: QueryTab) {
  return tab.mode === "query";
}

function startRenameTab(tab: QueryTab) {
  if (!canRenameTab(tab)) {
    return;
  }
  editingTabId.value = tab.id;
  editingTitle.value = tab.title;
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-tab-title-input="${tab.id}"]`);
    if (input) {
      input.focus();
      const dotIndex = input.value.lastIndexOf(".");
      const selectEnd = dotIndex > 0 ? dotIndex : input.value.length;
      input.setSelectionRange(0, selectEnd);
    }
  });
}

function commitRenameTab(tab: QueryTab) {
  if (editingTabId.value !== tab.id) {
    return;
  }
  const title = editingTitle.value.trim();
  if (title) {
    queryStore.renameTab(tab.id, title);
  }
  editingTabId.value = null;
}

function cancelRenameTab() {
  editingTabId.value = null;
}

function closeTab(tab: QueryTab) {
  queryStore.closeTab(tab.id);
}

function tabsToRightInGroup(tab: QueryTab) {
  const index = props.tabs.findIndex((item) => item.id === tab.id);
  return index < 0 ? [] : props.tabs.slice(index + 1);
}

function hasTabsToRight(tab: QueryTab) {
  return tabsToRightInGroup(tab).length > 0;
}

function getTabMenuItems(tab: QueryTab): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      label: compactTabTitle.value ? t("contextMenu.fullTabTitle") : t("contextMenu.compactTabTitle"),
      action: toggleCompactTabTitle,
      icon: compactTabTitle.value ? Maximize2 : Minimize2,
    },
    ...createRenameDuplicateTabItems({
      tab,
      t,
      canRename: canRenameTab(tab),
      onRename: () => startRenameTab(tab),
      onDuplicate: () => queryStore.duplicateTab(tab.id),
    }),
    {
      label: t("contextMenu.copyName"),
      action: async () => {
        try {
          await copyToClipboard(tabDisplayTitle(tab, t));
          toast(t("connection.copied"), 2000);
        } catch (e: any) {
          toast(t("grid.copyFailed", { message: e?.message || String(e) }), 5000);
        }
      },
      icon: Copy,
    },
    createLocateTabMenuItem({
      t,
      visible: !!activeTabSidebarTarget(tab),
      onLocate: () => emit("locate-tab", tab),
    }),
    createPinTabMenuItem({
      label: tab.pinned ? t("contextMenu.unpinTab") : t("contextMenu.pinTab"),
      onToggle: () => queryStore.togglePinnedTab(tab.id),
    }),
    // Split actions stay visible at the four-group cap but render disabled;
    // the store rejects the operation with the same `groups.length >= 4` rule.
    ...(tab.mode === "query"
      ? [
          {
            label: t("contextMenu.splitRight"),
            action: () => queryStore.splitTabRight(tab.id),
            disabled: groupCapacityReached.value,
            icon: ArrowRight,
          },
          {
            label: t("contextMenu.splitDown"),
            action: () => queryStore.splitTabDown(tab.id),
            disabled: groupCapacityReached.value,
            icon: ArrowDown,
          },
        ]
      : []),
    ...(canChangeOrientation.value
      ? [
          {
            label: t("contextMenu.changeOrientation"),
            action: () => queryStore.setOrientation(queryStore.orientation === "vertical" ? "horizontal" : "vertical"),
            icon: RotateCw,
          },
        ]
      : []),
    ...(isSecondaryGroup.value
      ? [
          {
            label: t("contextMenu.unsplit"),
            action: () => queryStore.unsplitTab(tab.id),
            icon: ArrowRight,
            visible: true,
          },
        ]
      : []),
    createCloseOtherTabMenuItem({
      label: t("contextMenu.closeOtherTabs"),
      onClose: () => queryStore.closeOtherTabsInGroup(props.groupId, tab.id),
    }),
    createCloseRightTabMenuItem({
      label: t("contextMenu.closeRightTabs"),
      disabled: !hasTabsToRight(tab),
      onClose: () => queryStore.closeRightTabsInGroup(props.groupId, tab.id),
    }),
    createCloseAllTabMenuItem({
      label: t("contextMenu.closeAllTabs"),
      onClose: () => queryStore.closeAllTabsInGroup(props.groupId, tab.id),
    }),
    createCloseTabMenuItem({
      label: t("contextMenu.closeTab"),
      onClose: () => closeTab(tab),
    }),
  ];
  return items;
}

function handleTabDoubleClick(tab: QueryTab, event: MouseEvent) {
  event.stopPropagation();
  if (event.target instanceof Element && event.target.closest("button, input, [role='button']")) {
    return;
  }
  if (tab.mode === "data") {
    if (tab.id !== props.activeTabId) {
      activateTab(tab.id);
    }
    emit("toggle-zen-mode");
    return;
  }
  startRenameTab(tab);
}

function handleTabClick(tab: QueryTab) {
  if (suppressNextTabClick.value) {
    suppressNextTabClick.value = false;
    return;
  }
  activateTab(tab.id);
}

function cleanupTabDrag() {
  window.removeEventListener("pointermove", handleTabPointerMove);
  window.removeEventListener("pointerup", handleTabPointerUp);
  window.removeEventListener("pointercancel", cleanupTabDrag);
  window.removeEventListener("blur", cleanupTabDrag);
  // The shared drag session belongs to the bar that started it: another
  // group's tab bar unmounting mid-drag must not kill the source's drag.
  if (groupTabDrag.sourceGroupId === props.groupId) {
    groupTabDrag.active = false;
    groupTabDrag.tabId = null;
    groupTabDrag.sourceGroupId = null;
    groupTabDrag.payload = "";
    groupTabDrag.targetGroupId = null;
    groupTabDrag.targetTabId = null;
    groupTabDrag.position = null;
    groupTabDragSourceEl = null;
    removeTabDragGhost();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

function handleTabPointerMove(event: PointerEvent) {
  const drag = groupTabDrag;
  if (!drag.tabId) {
    return;
  }
  if (!drag.active) {
    // Horizontal-only threshold, matching the legacy tab bar: absorbs click
    // jitter and touch tap drift (touch never arms the drag at all).
    if (Math.abs(event.clientX - drag.startX) < TAB_DRAG_HORIZONTAL_THRESHOLD) {
      return;
    }
    drag.active = true;
    suppressNextTabClick.value = true;
    if (groupTabDragSourceEl) {
      groupTabDragGhost = createTabDragGhost(groupTabDragSourceEl, event.clientX, event.clientY);
    }
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }
  event.preventDefault();
  moveTabDragGhost(event.clientX, event.clientY);

  const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  const tabElement = element?.closest<HTMLElement>("[data-tab-id]");
  const groupElement = element?.closest<HTMLElement>("[data-group-id]");
  drag.targetGroupId = groupElement?.dataset.groupId ?? null;
  drag.targetTabId = null;
  drag.position = null;
  if (tabElement && groupElement) {
    drag.targetTabId = tabElement.dataset.tabId ?? null;
    const rect = tabElement.getBoundingClientRect();
    drag.position = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  }
}

function handleTabPointerUp(event: PointerEvent) {
  const drag = {
    active: groupTabDrag.active,
    tabId: groupTabDrag.tabId,
    payload: groupTabDrag.payload,
    targetGroupId: groupTabDrag.targetGroupId,
    targetTabId: groupTabDrag.targetTabId,
    position: groupTabDrag.position,
  };
  cleanupTabDrag();
  if (!drag.active) {
    return;
  }
  event.preventDefault();

  const payload = parseTabDragPayload(drag.payload);
  if (!payload) {
    return;
  }
  const targetGroupId = drag.targetGroupId;
  if (!targetGroupId) {
    return;
  }
  // Validate the payload against live store state: both groups must exist and
  // the tab's *current* owner must still be the payload's source group.
  const sourceGroupExists = queryStore.groups.some((group) => group.id === payload.sourceGroupId);
  const targetGroupExists = queryStore.groups.some((group) => group.id === targetGroupId);
  if (!sourceGroupExists || !targetGroupExists) {
    return;
  }
  const currentOwner = queryStore.groups.find((group) => group.tabIds.includes(payload.tabId));
  if (!currentOwner || currentOwner.id !== payload.sourceGroupId) {
    return;
  }
  let index: number | undefined;
  if (drag.targetTabId) {
    const targetGroup = queryStore.groups.find((group) => group.id === targetGroupId);
    const targetTabs = targetGroup ? targetGroup.tabIds.map((id) => queryStore.tabs.find((tab) => tab.id === id)).filter((tab): tab is QueryTab => !!tab) : [];
    const targetIndex = targetTabs.findIndex((tab) => tab.id === drag.targetTabId);
    if (targetIndex >= 0) {
      index = drag.position === "before" ? targetIndex : targetIndex + 1;
    }
  }
  queryStore.moveTabToGroup(payload.tabId, targetGroupId, index);
}

onUnmounted(cleanupTabDrag);

const tabScrollBehavior = ref<ScrollBehavior>("smooth");

watch(
  () => props.activeTabId,
  () => {
    nextTick(() => {
      if (!isWrapLayout.value) {
        const container = tabsContainerRef.value;
        if (container) {
          const activeEl = container.querySelector('[data-active-tab="true"]');
          if (activeEl) {
            activeEl.scrollIntoView({ behavior: tabScrollBehavior.value, block: "nearest", inline: "center" });
          }
        }
      }
      updateScrollButtons();
      tabScrollBehavior.value = "smooth";
    });
  },
);

watch(
  () => props.tabs.map((tab) => `${tab.id}:${tab.pinned ? "1" : "0"}`).join("|"),
  () => {
    nextTick(updateScrollButtons);
  },
);
</script>

<template>
  <div class="app-tab-bar group-tabbar relative flex w-full min-w-0 shrink-0 overflow-hidden" :class="tabBarClass" :data-group-id="groupId">
    <div class="flex w-full min-w-0 shrink-0 overflow-hidden" :class="isClassicLayout ? 'h-9 items-stretch' : 'h-10 items-center px-2'">
      <div class="app-tab-strip relative h-full min-w-0 flex-1 overflow-hidden">
        <div v-if="showOverflowControl" class="app-tab-scrollbar" :class="{ 'app-tab-scrollbar--dragging': isScrollbarDragging }" @pointerdown="startScrollbarDrag">
          <div class="app-tab-scrollbar__thumb" :style="tabScrollbarThumbStyle" />
        </div>
        <div
          ref="tabsContainerRef"
          class="app-tab-scroll flex w-full min-w-0 flex-1 items-center overflow-x-auto"
          :class="[isClassicLayout ? 'h-full' : 'h-full gap-1.5 py-1.5', isWrapLayout ? 'wrap-mode' : '', isWrapLayout && isClassicLayout ? 'classic-wrap' : '']"
          :style="tabsContainerStyle"
          @scroll="updateScrollButtons"
          @wheel="onTabsWheel"
        >
          <CustomContextMenu v-for="tab in tabs" :key="tab.id" :items="getTabMenuItems(tab)" v-slot="{ onContextMenu }">
            <div :class="isClassicLayout ? 'h-full' : ''" @contextmenu="onContextMenu">
              <Tooltip>
                <TooltipTrigger as-child>
                  <div
                    class="app-tab-pill group flex cursor-default items-center gap-1 px-2 text-xs transition-colors whitespace-nowrap select-none"
                    :class="
                      isClassicLayout
                        ? ['h-full border-r border-border/80 font-medium dark:border-border/45', tab.id === activeTabId ? 'bg-background text-foreground' : 'text-foreground/70 hover:text-foreground/90']
                        : ['h-7 rounded-md border', tab.id === activeTabId ? 'text-foreground font-medium' : 'border-border/60 text-foreground/70 hover:border-border hover:text-foreground/90']
                    "
                    :style="[tabColorStyle(tab), tabDropStyle(tab)]"
                    :data-active-tab="tab.id === activeTabId"
                    :data-tab-id="tab.id"
                    @pointerdown="handleTabPointerDown($event, tab)"
                    @click="handleTabClick(tab)"
                    @dblclick="handleTabDoubleClick(tab, $event)"
                    @mousedown.middle.prevent="closeTab(tab)"
                  >
                    <TabExecutionStatus :tab="tab">
                      <span class="shrink-0" :class="tabIconClass(tab)">
                        <AlertTriangle v-if="tab.externalSqlFileMissing" class="h-3.5 w-3.5" />
                        <Table2 v-else-if="tab.mode === 'data' || tab.mode === 'mongo' || tab.mode === 'redis' || tab.mode === 'hbase'" class="h-3.5 w-3.5" />
                        <DatabaseIcon v-else-if="tab.mode === 'mq'" :db-type="tabDatabaseIconType(tab)" class="h-3.5 w-3.5" />
                        <TableProperties v-else-if="tab.mode === 'vector'" class="h-3.5 w-3.5" />
                        <KeyRound v-else-if="tab.mode === 'etcd' || tab.mode === 'zookeeper' || tab.mode === 'consul'" class="h-3.5 w-3.5" />
                        <Gauge v-else-if="tab.mode === 'consul-overview' || tab.mode === 'etcd-dashboard' || tab.mode === 'mysql-dashboard' || tab.mode === 'postgres-dashboard' || tab.mode === 'nacos-dashboard'" class="h-3.5 w-3.5" />
                        <ShieldCheck v-else-if="tab.mode === 'etcd-access-control'" class="h-3.5 w-3.5" />
                        <Network v-else-if="tab.mode === 'nacos'" class="h-3.5 w-3.5" />
                        <Database v-else-if="tab.mode === 'databases'" class="h-3.5 w-3.5" />
                        <TableProperties v-else-if="tab.mode === 'objects'" class="h-3.5 w-3.5" />
                        <PencilRuler v-else-if="tab.mode === 'structure'" class="h-3.5 w-3.5" />
                        <CalendarClock v-else-if="tab.mode === 'dameng-jobs'" class="h-3.5 w-3.5" />
                        <Activity v-else-if="tab.mode === 'processlist' || tab.mode === 'sqlserver-trace'" class="h-3.5 w-3.5" />
                        <Gauge v-else-if="tab.mode === 'dolt-version-control'" class="h-3.5 w-3.5" />
                        <Code2 v-else class="h-3.5 w-3.5" />
                      </span>
                    </TabExecutionStatus>
                    <input
                      v-if="editingTabId === tab.id"
                      v-model="editingTitle"
                      :data-tab-title-input="tab.id"
                      :aria-label="t('contextMenu.renameTab')"
                      class="h-5 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-xs font-normal text-foreground outline-none"
                      @click.stop
                      @mousedown.stop
                      @keydown.enter.prevent="commitRenameTab(tab)"
                      @keydown.escape.prevent="cancelRenameTab"
                      @blur="commitRenameTab(tab)"
                    />
                    <span v-else class="inline-flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-foreground">
                      <span v-if="isDirtyTab(tab)" aria-hidden="true" class="dirty-tab-marker">*</span>
                      <span class="min-w-0 flex-1 truncate" :style="tabTitleStyle(tab)">{{ tabDisplayTitle(tab, t) }}</span>
                    </span>
                    <ReadOnlySessionControl :connection-id="tab.connectionId" compact />
                    <button v-if="tab.pinned" class="rounded p-0.5 text-primary hover:bg-muted-foreground/20 shrink-0" :aria-label="t('contextMenu.unpinTab')" :title="t('contextMenu.unpinTab')" @pointerdown.stop @click.stop="queryStore.togglePinnedTab(tab.id)">
                      <Pin class="h-3 w-3 fill-current" aria-hidden="true" />
                    </button>
                    <button class="rounded hover:bg-muted-foreground/20 p-0.5 shrink-0" :aria-label="t('contextMenu.closeTab')" :title="t('contextMenu.closeTab')" @pointerdown.stop @click.stop="closeTab(tab)">
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" class="text-xs grid grid-cols-[auto_1fr] gap-x-2">
                  <template v-for="line in tabTooltipLines(tab, t)" :key="line.label">
                    <span class="text-muted-foreground">{{ line.label }}</span>
                    <span>{{ line.value }}</span>
                  </template>
                </TooltipContent>
              </Tooltip>
            </div>
          </CustomContextMenu>
          <div :class="tabTailDragRegionClass" data-tauri-drag-region />
        </div>
      </div>
      <div v-if="showOverflowControl" class="relative z-30 flex shrink-0 items-center">
        <Popover v-model:open="tabOverflowOpen">
          <PopoverTrigger as-child>
            <button type="button" class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-foreground/70 hover:border-border hover:text-foreground" :aria-label="t('tabs.openTabs')" :title="t('tabs.openTabs')">
              <ChevronDown class="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-auto min-w-56 max-w-80 gap-0 rounded-[6px] p-1" @click.stop @keydown.stop>
            <div class="relative border-b px-1 pb-1">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="tabSearchQuery" data-group-tab-search-input type="search" :placeholder="t('tabs.searchOpenTabs')" class="h-8 pl-7 text-sm" />
            </div>
            <div class="max-h-[min(70vh,28rem)] overflow-y-auto pt-1">
              <CustomContextMenu v-for="tab in filteredGroupTabs" :key="tab.id" :items="getTabMenuItems(tab)" v-slot="{ onContextMenu }">
                <div
                  class="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                  :class="tab.id === activeTabId ? 'bg-accent/70 text-accent-foreground' : ''"
                  :title="tabDisplayTitle(tab, t)"
                  role="menuitem"
                  tabindex="0"
                  @click="
                    activateTab(tab.id);
                    tabOverflowOpen = false;
                  "
                  @contextmenu="onContextMenu"
                  @keydown.enter.prevent="
                    activateTab(tab.id);
                    tabOverflowOpen = false;
                  "
                >
                  <TabExecutionStatus :tab="tab">
                    <DatabaseIcon v-if="tab.mode === 'mq'" :db-type="tabDatabaseIconType(tab)" class="h-3.5 w-3.5 shrink-0" />
                    <AlertTriangle v-else-if="tab.externalSqlFileMissing" class="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <component :is="Code2" v-else-if="tab.mode === 'query'" class="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <component :is="Table2" v-else class="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  </TabExecutionStatus>
                  <span class="inline-flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
                    <span v-if="isDirtyTab(tab)" aria-hidden="true" class="dirty-tab-marker">*</span>
                    <span class="min-w-0 flex-1 truncate" :style="tabTitleStyle(tab)">{{ tabDisplayTitle(tab, t) }}</span>
                  </span>
                  <ReadOnlySessionControl :connection-id="tab.connectionId" compact />
                  <Pin v-if="tab.pinned" class="h-3 w-3 shrink-0 fill-current text-primary" />
                  <span class="w-5 shrink-0">
                    <button
                      type="button"
                      class="inline-flex rounded p-1 text-muted-foreground opacity-70 hover:bg-muted-foreground/20 hover:text-foreground group-hover:opacity-100"
                      :aria-label="t('contextMenu.closeTab')"
                      :title="t('contextMenu.closeTab')"
                      @click.stop.prevent="queryStore.closeTab(tab.id)"
                      @mousedown.stop
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </span>
                </div>
              </CustomContextMenu>
              <p v-if="filteredGroupTabs.length === 0" class="px-2 py-4 text-center text-sm text-muted-foreground">{{ t("tabs.noMatchingTabs") }}</p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  </div>
</template>
