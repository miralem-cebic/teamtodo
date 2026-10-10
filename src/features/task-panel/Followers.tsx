import { AssigneePicker } from '../../components/AssigneePicker';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Popover, usePop } from '../../components/Popover';
import { setFollowing, useApp } from '../../store/appStore';
import type { TaskState } from '../../data/types';

export function Followers({ t }: { t: TaskState }) {
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const p = usePop();
  const followers = t.followerIds.map((id) => users.find((u) => u.id === id)).filter((u) => !!u);
  const iFollow = !!meId && t.followerIds.includes(meId);
  return (
    <div className="followers">
      <span className="f-l">Follower</span>
      <div className="fol-list">
        {followers.map((u) => (
          <button key={u.id} type="button" className="fol" onClick={() => setFollowing(t.id, u.id, false)} title={`${u.name} entfernen`} aria-label={`${u.name} als Follower entfernen`}>
            <Avatar user={u} size={24} />
            <span className="fol-x" aria-hidden="true"><Icon n="x" s={10} /></span>
          </button>
        ))}
        <button type="button" className="icon-btn" onClick={p.open} aria-label="Add follower">
          <Icon n="plus" s={15} />
        </button>
        {p.anchor && (
          <Popover anchor={p.anchor} onClose={p.close} label="Add follower">
            <AssigneePicker
              value={null}
              onPick={(id) => {
                if (id) setFollowing(t.id, id, true);
                p.close(true);
              }}
            />
          </Popover>
        )}
      </div>
      {meId && (
        <button type="button" className="btn sm" onClick={() => setFollowing(t.id, meId, !iFollow)} aria-pressed={iFollow}>
          {iFollow ? 'Unfollow' : 'Follow'}
        </button>
      )}
    </div>
  );
}
