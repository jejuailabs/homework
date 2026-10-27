'use client';
import {useRef} from 'react';
import {spaceItem, type SpaceItem} from './catalog';
import {wardrobeGroups, groupFriends, friendName, type WardrobeGroupId} from './wardrobe-groups';
import './wardrobe-browser.css';

function Faces({friends, count = false}: {friends: SpaceItem[]; count?: boolean}) {
  return <span className="ms-friend-faces" aria-hidden="true">{friends.slice(0, 3).map(pet => <img key={pet.id} src={pet.art} alt=""/>)}{count && friends.length > 3 && <span>+{friends.length - 3}</span>}</span>;
}
export function WardrobeBrowser({group, model, currentName, currentPet, owned, onGroup, onModel}: {group: WardrobeGroupId; model: SpaceItem; currentName: string; currentPet: string; owned: string[]; onGroup: (group: WardrobeGroupId) => void; onModel: (pet: string) => void}) {
  const picker = useRef<HTMLDetailsElement>(null);
  return <section className="ms-wardrobe-browser" aria-label="친구별 옷장">
    <div className="ms-wardrobe-heading"><h3>누구의 옷장을 구경할까?</h3><span>함께 입는 친구들을 만나 봐요</span></div>
    <div className="ms-wardrobe-groups">{wardrobeGroups.map(g => {
      const friends = groupFriends(g.id), examples = g.examples.map(id => spaceItem(id)!);
      return <button key={g.id} type="button" className={`ms-wardrobe-group is-${g.id}`} aria-pressed={group === g.id} onClick={() => onGroup(g.id)}>
        <Faces friends={examples}/><span className="ms-wardrobe-group-copy"><strong>{g.name}</strong><span>{friends.length}명의 친구가 함께 입어요</span></span><span className="ms-wardrobe-selected">{group === g.id ? '✓ 보고 있어요' : '옷장 구경하기'}</span>
      </button>;
    })}</div>
    <div className="ms-preview-friend"><img src={model.art} alt=""/><div><strong>{model.id === currentPet ? currentName : friendName(model)}에게 미리 입혀 보고 있어요</strong><p>{model.id === currentPet ? '여기서 친구를 바꿔도 우리 방의 친구는 그대로예요.' : `우리 방의 친구는 ${currentName}예요. 미리보기만 바뀌어요.`}</p></div>
      <details ref={picker} key={group}><summary>친구 바꾸기</summary><div className="ms-preview-friend-picker" aria-label="미리 입혀 볼 친구">{groupFriends(group).map(pet => <button key={pet.id} type="button" aria-pressed={pet.id === model.id} onClick={() => {onModel(pet.id); picker.current?.removeAttribute('open');}}><img src={pet.art} alt=""/><span>{friendName(pet)}</span><small>{owned.includes(pet.id) ? '함께하는 친구' : '구경하는 친구'}</small></button>)}</div></details>
    </div>
  </section>;
}
export function CompatibilityBadge({friends, onClick, name}: {friends: SpaceItem[]; onClick: () => void; name: string}) {
  return <button type="button" className="ms-compatibility-badge" aria-label={`${name} 함께 입는 친구 ${friends.length}명 보기`} onClick={onClick}><Faces friends={friends} count/><span>함께 입는 친구 {friends.length}명 <span aria-hidden="true">›</span></span></button>;
}
export function CompatibleFriends({friends, owned}: {friends: SpaceItem[]; owned: string[]}) {
  return <section className="ms-compatible-friends" aria-label="함께 입을 수 있는 친구"><h3>함께 입을 수 있는 친구 <span>{friends.length}명</span></h3><p>한 번 구입하면 이 친구들이 함께 입어요.</p><ul className="ms-compatible-list">{friends.map(pet => <li key={pet.id}><img src={pet.art} alt=""/><span>{friendName(pet)}</span>{owned.includes(pet.id) && <small>함께하는 친구</small>}</li>)}</ul></section>;
}
