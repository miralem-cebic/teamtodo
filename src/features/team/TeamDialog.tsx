import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { addUser, deleteUser, renameUser, restoreUser, useApp } from '../../store/appStore';
import type { ID } from '../../data/types';

/** Team management: add, rename, remove (open tasks become unassigned) and restore people. */
export function TeamDialog({ onClose }: { onClose: () => void }) {
  const users = useApp((s) => s.users);
  const tasks = useApp((s) => s.tasks);
  const meId = useApp((s) => s.meId);
  const [newName, setNewName] = useState('');
  const [confirmId, setConfirmId] = useState<ID | null>(null);

  const active = users.filter((u) => !u.deletedAt);
  const removed = users.filter((u) => u.deletedAt);
  const openCount = (id: ID) => Object.values(tasks).filter((t) => t.assigneeId === id && !t.deletedAt && !t.completedAt).length;

  const trimmed = newName.trim();
  const duplicate = !!trimmed && active.some((u) => u.name.toLowerCase() === trimmed.toLowerCase());

  const add = () => {
    if (!trimmed || duplicate) return;
    addUser(trimmed);
    setNewName('');
  };

  const remove = (id: ID) => {
    deleteUser(id);
    setConfirmId(null);
  };

  return (
    <Dialog title="Team" onClose={onClose}>
      <form
        className="d-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="tm-in"
          value={newName}
          placeholder="Name of the new person"
          aria-label="Name of the new person"
          aria-invalid={duplicate}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!trimmed || duplicate}>
          <Icon n="plus" s={15} />
          Add
        </button>
      </form>
      {duplicate && <p className="d-text tm-hint">"{trimmed}" is already in the team.</p>}

      <ul className="tm-list" aria-label="Team members">
        {active.map((u) => {
          const open = openCount(u.id);
          const isMe = u.id === meId;
          const confirming = confirmId === u.id;
          return (
            <li key={u.id} className="tm-row">
              <Avatar user={u} size={28} />
              <input
                key={u.name}
                className="tm-name"
                defaultValue={u.name}
                aria-label={`Name of ${u.name}`}
                onBlur={(e) => renameUser(u.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <small className="tm-meta">
                {isMe ? 'You, currently logged in' : open ? `${open} open ${open === 1 ? 'task' : 'tasks'}` : 'No open tasks'}
              </small>
              {confirming ? (
                <span className="tm-confirm">
                  <button type="button" className="btn sm" onClick={() => remove(u.id)}>
                    Remove{open ? ` and unassign ${open}` : ''}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn sm"
                  disabled={isMe}
                  title={isMe ? 'Switch person first, then remove this one' : undefined}
                  onClick={() => setConfirmId(u.id)}
                >
                  <Icon n="trash" s={14} />
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {removed.length > 0 && (
        <>
          <h3 className="d-h">Removed</h3>
          <ul className="tm-list" aria-label="Removed people">
            {removed.map((u) => (
              <li key={u.id} className="tm-row tm-gone">
                <Avatar user={u} size={28} />
                <span className="tm-name">{u.name}</span>
                <button type="button" className="btn sm" onClick={() => restoreUser(u.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
