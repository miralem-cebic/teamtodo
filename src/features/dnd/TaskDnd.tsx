import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, type ReactNode } from 'react';
import { create } from 'zustand';
import { moveSection, showToast, updateTask, useApp } from '../../store/appStore';
import { liveSections, orderBetween, type Group, type ViewSettings } from '../../store/selectors';
import type { ID, TaskState } from '../../data/types';

// Drag and Drop für Liste, Board, Bereiche und Unteraufgaben.
// Kennungen: „t:<id>“ Aufgabe, „g:<key>“ Gruppenende/Spalte, „s:<id>“ Bereich.
// Tastatur: Verschieben mit Strg/⌘+Umschalt+↑/↓, Umziehen über die Felder (Bereich, Datum …).

export type DragData =
  | { type: 'task'; taskId: ID; groupKey: string }
  | { type: 'sub'; taskId: ID; parentId: ID; scope: 'list' | 'panel' }
  | { type: 'group'; groupKey: string }
  | { type: 'section'; sectionId: ID; projectId: ID };

interface DndUi {
  activeId: string | null;
  overId: string | null;
  pos: 'before' | 'after' | null;
  label: string;
}
export const useDndUi = create<DndUi>()(() => ({ activeId: null, overId: null, pos: null, label: '' }));
const reset = () => useDndUi.setState({ activeId: null, overId: null, pos: null, label: '' });

// Für die Entscheidung „davor/danach“: echte Zeigerposition und aktuelle Lage des Ziels
// (dnd-kit verrechnet beim automatischen Scrollen Verschiebungen, die hier stören würden).
const nodes = new Map<string, HTMLElement>();
let pointerY = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => (pointerY = e.clientY), { passive: true, capture: true });
  window.addEventListener('touchmove', (e) => (pointerY = e.touches[0]?.clientY ?? pointerY), { passive: true, capture: true });
}

/** Aufgaben- oder Bereichszeile: ziehbar über den Griff, gleichzeitig Ablageziel */
export function useDndRow(id: string, data: DragData, disabled = false) {
  const drag = useDraggable({ id, data, disabled });
  const drop = useDroppable({ id, data, disabled });
  const overId = useDndUi((s) => s.overId);
  const pos = useDndUi((s) => s.pos);
  const ref = useCallback(
    (el: HTMLElement | null) => {
      drag.setNodeRef(el);
      drop.setNodeRef(el);
      if (el) nodes.set(id, el);
      else nodes.delete(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drag.setNodeRef, drop.setNodeRef, id],
  );
  return {
    ref,
    handle: { ref: drag.setActivatorNodeRef, ...drag.listeners, ...drag.attributes, tabIndex: -1 },
    dragging: drag.isDragging,
    dropPos: overId === id ? pos : null,
  };
}

export function useDndGroup(key: string, disabled = false) {
  const { setNodeRef } = useDroppable({ id: `g:${key}`, data: { type: 'group', groupKey: key } satisfies DragData, disabled });
  const over = useDndUi((s) => s.overId === `g:${key}`);
  return { ref: setNodeRef, over };
}

const collision: CollisionDetection = (args) => {
  const type = (args.active.data.current as DragData | undefined)?.type;
  const prefix = type === 'section' ? 's:' : 't:';
  const containers = args.droppableContainers.filter((c) => {
    const id = String(c.id);
    if (type === 'section') return id.startsWith('s:');
    if (type === 'sub') {
      const d = c.data.current as DragData | undefined;
      return d?.type === 'sub' && d.scope === (args.active.data.current as { scope?: string }).scope;
    }
    return id.startsWith(prefix) ? (c.data.current as DragData | undefined)?.type === 'task' : id.startsWith('g:');
  });
  const within = pointerWithin({ ...args, droppableContainers: containers });
  if (within.length) {
    // Zeilen vor Gruppen bevorzugen
    const row = within.find((c) => !String(c.id).startsWith('g:'));
    return row ? [row] : within;
  }
  return closestCenter({ ...args, droppableContainers: containers });
};

interface Props {
  groups: Group[];
  settings: ViewSettings;
  children: ReactNode;
  /** Unteraufgaben-Geschwister je Hauptaufgabe (für Sortieren in Liste und Panel) */
  childrenOf: Record<ID, TaskState[]>;
}

export function TaskDnd({ groups, settings, childrenOf, children }: Props) {
  const tasks = useApp((s) => s.tasks);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));

  const onStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData;
    const label =
      d.type === 'section'
        ? (useApp.getState().projects.find((p) => p.id === d.projectId)?.sections.find((s) => s.id === d.sectionId)?.name ?? '')
        : d.type === 'group'
          ? ''
          : (tasks[d.taskId]?.title ?? '');
    useDndUi.setState({ activeId: String(e.active.id), label });
  };

  // auch bei jeder Bewegung: dnd-kit meldet „over“ nur beim Wechsel des Ziels
  const onOver = (e: DragOverEvent | DragMoveEvent) => {
    const over = e.over;
    if (!over || over.id === e.active.id) {
      if (useDndUi.getState().overId !== null) useDndUi.setState({ overId: null, pos: null });
      return;
    }
    const el = nodes.get(String(over.id));
    const r = el?.getBoundingClientRect() ?? over.rect;
    const pos = String(over.id).startsWith('g:') ? null : pointerY < r.top + r.height / 2 ? 'before' : 'after';
    const cur = useDndUi.getState();
    if (cur.overId !== String(over.id) || cur.pos !== pos) useDndUi.setState({ overId: String(over.id), pos });
  };

  const onEnd = (e: DragEndEvent) => {
    const pos = useDndUi.getState().pos;
    reset();
    const over = e.over;
    if (!over || over.id === e.active.id) return;
    const a = e.active.data.current as DragData;
    const o = over.data.current as DragData;

    if (a.type === 'section' && o.type === 'section') {
      const proj = useApp.getState().projects.find((p) => p.id === a.projectId);
      const list = liveSections(proj).filter((s) => s.id !== a.sectionId);
      const i = list.findIndex((s) => s.id === o.sectionId) + (pos === 'after' ? 1 : 0);
      moveSection(a.projectId, a.sectionId, orderBetween(list[i - 1], list[i]));
      return;
    }

    if (a.type === 'sub' && o.type === 'sub') {
      const a2 = tasks[a.taskId];
      const o2 = tasks[o.taskId];
      if (!a2 || !o2 || a2.parentId !== o2.parentId) return;
      const list = (childrenOf[a2.parentId!] ?? []).filter((x) => x.id !== a.taskId);
      const i = list.findIndex((x) => x.id === o.taskId) + (pos === 'after' ? 1 : 0);
      updateTask(a.taskId, { order: orderBetween(list[i - 1], list[i]) }, { undo: 'Verschoben' });
      return;
    }

    if (a.type !== 'task' || (o.type !== 'task' && o.type !== 'group')) return;
    const from = groups.find((g) => g.key === a.groupKey);
    const to = groups.find((g) => g.key === o.groupKey);
    const task = tasks[a.taskId];
    if (!from || !to || !task) return;
    const same = from.key === to.key;
    const manual = settings.sort === 'manual';
    if (same && !manual) {
      showToast('Reihenfolge lässt sich nur bei manueller Sortierung ändern');
      return;
    }
    if (!same && to.apply === null) {
      showToast(`In „${to.label}“ kann nicht verschoben werden`);
      return;
    }
    const list = to.tasks.filter((x) => x.id !== task.id);
    let i = o.type === 'task' ? list.findIndex((x) => x.id === o.taskId) + (pos === 'after' ? 1 : 0) : list.length;
    if (i < 0) i = list.length;
    const order = orderBetween(list[i - 1], list[i]);
    if (same) updateTask(task.id, { order }, { undo: 'Verschoben' });
    else updateTask(task.id, { ...to.apply, ...(manual ? { order } : {}) }, { undo: `Nach „${to.label}“ verschoben`, toast: true });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragMove={onOver} onDragEnd={onEnd} onDragCancel={reset} accessibility={{ restoreFocus: false }}>
      {children}
      <DragOverlay dropAnimation={null}>
        <Overlay />
      </DragOverlay>
    </DndContext>
  );
}

function Overlay() {
  const label = useDndUi((s) => s.label);
  const active = useDndUi((s) => s.activeId);
  if (!active) return null;
  return <div className="drag-ghost">{label || 'Ohne Titel'}</div>;
}
