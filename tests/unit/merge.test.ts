import { describe, expect, it } from 'vitest';
import { mergeProjects, mergeTask, mergeUsers } from '../../src/data/merge';
import { makeProject, makeTask, makeUser } from '../../src/data/schema';

const T0 = '2026-10-02T08:00:00.000Z';
const T1 = '2026-10-02T09:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';

const base = () => makeTask({ id: 'x', title: 'Alt', createdBy: 'u1', createdAt: T0 });

describe('mergeTask', () => {
  it('gleichzeitige Änderungen an unterschiedlichen Feldern bleiben beide erhalten', () => {
    const b = base();
    const a = { ...b, title: 'Neu von A', fieldUpdatedAt: { title: T1 } };
    const r = { ...b, assigneeId: 'u2', dueDate: '2026-10-10', fieldUpdatedAt: { assigneeId: T2, dueDate: T2 } };
    const m = mergeTask(a, r);
    expect(m.title).toBe('Neu von A');
    expect(m.assigneeId).toBe('u2');
    expect(m.dueDate).toBe('2026-10-10');
    expect(m.fieldUpdatedAt).toEqual({ title: T1, assigneeId: T2, dueDate: T2 });
    // symmetrisch
    const m2 = mergeTask(r, a);
    expect([m2.title, m2.assigneeId, m2.dueDate]).toEqual(['Neu von A', 'u2', '2026-10-10']);
  });

  it('dasselbe Feld: die neuere Änderung gewinnt', () => {
    const b = base();
    const a = { ...b, title: 'A', fieldUpdatedAt: { title: T2 } };
    const r = { ...b, title: 'B', fieldUpdatedAt: { title: T1 } };
    expect(mergeTask(a, r).title).toBe('A');
    expect(mergeTask(r, a).title).toBe('A');
  });

  it('Kommentare und Aktivitäten werden vereinigt, nicht überschrieben', () => {
    const b = base();
    const a = { ...b, comments: [{ id: 'c1', userId: 'u1', text: 'eins', mentions: [], at: T1 }], activity: [{ id: 'a1', userId: 'u1', type: 'created' as const, at: T0 }] };
    const r = {
      ...b,
      comments: [{ id: 'c2', userId: 'u2', text: 'zwei', mentions: [], at: T2 }],
      activity: [{ id: 'a1', userId: 'u1', type: 'created' as const, at: T0 }, { id: 'a2', userId: 'u2', type: 'completed' as const, at: T2 }],
    };
    const m = mergeTask(a, r);
    expect(m.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(m.activity.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('entfernte Anhänge bleiben entfernt', () => {
    const b = base();
    const att = { id: 'f', fileName: 'a.pdf', size: 1, mimeType: 'application/pdf', addedAt: T0, addedBy: 'u1' };
    const m = mergeTask({ ...b, attachments: [att] }, { ...b, attachments: [{ ...att, removedAt: T1 }] });
    expect(m.attachments[0]!.removedAt).toBe(T1);
  });

  it('Löschen auf der einen, Bearbeiten auf der anderen Seite: beides bleibt sichtbar im Ergebnis', () => {
    const b = base();
    const m = mergeTask({ ...b, deletedAt: T2, fieldUpdatedAt: { deletedAt: T2 } }, { ...b, title: 'Später', fieldUpdatedAt: { title: T1 } });
    expect(m.deletedAt).toBe(T2);
    expect(m.title).toBe('Später');
  });
});

describe('mergeProjects', () => {
  it('neuer Bereich auf der einen, Umbenennung auf der anderen Seite', () => {
    const p = { ...makeProject('Alt', 'teal', 1, ['A']), updatedAt: T0 };
    const a = { ...p, name: 'Neu', updatedAt: T2 };
    const r = { ...p, sections: [...p.sections, { id: 's2', name: 'B', order: 2, updatedAt: T1 }] };
    const [m] = mergeProjects([a], [r]);
    expect(m!.name).toBe('Neu');
    expect(m!.sections.map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('Projekte, die nur auf einer Seite existieren, bleiben erhalten', () => {
    const p1 = makeProject('Eins', 'teal', 1);
    const p2 = makeProject('Zwei', 'rose', 2);
    expect(mergeProjects([p1], [p2]).map((p) => p.name)).toEqual(['Eins', 'Zwei']);
  });
});

describe('mergeUsers', () => {
  it('vereinigt das Team', () => {
    const a = makeUser('Pia', 'teal');
    const b = makeUser('Jonas', 'violet');
    expect(mergeUsers([a], [b]).map((u) => u.name)).toEqual(['Pia', 'Jonas']);
  });
});
