import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createWhitekneeWorldModel} from './whiteknee-world-model';

test('Whiteknee has eight articulated legs, a rear abdomen and solid geometry from every angle', () => {
  const model = createWhitekneeWorldModel(T, {pet:'animal-whiteknee'});
  const legs=model.group.children.filter(child=>child.name.startsWith('leg-'));
  assert.equal(legs.length,8);
  assert(model.group.getObjectByName('abdomen'));
  const bounds=new T.Box3().setFromObject(model.group), size=bounds.getSize(new T.Vector3());
  assert(size.x>1 && size.y>.7 && size.z>1);
  model.group.traverse(node=>assert(!(node instanceof T.Sprite)));
  model.animate(Math.PI/2,true);
  assert(legs.some(leg=>Math.abs(leg.rotation.y)>.1));
  assert(legs.some(leg=>leg.rotation.y<0) && legs.some(leg=>leg.rotation.y>0));
  model.animate(0,false);
  assert(legs.every(leg=>leg.rotation.y===0 && leg.rotation.z===0));
  let released=0;
  const geometries=new Set<T.BufferGeometry>();
  model.group.traverse(node=>{if(node instanceof T.Mesh)geometries.add(node.geometry);});
  geometries.forEach(g=>g.addEventListener('dispose',()=>released++));
  model.dispose(); assert.equal(released,geometries.size);
});

test('Whiteknee supports its saved body, head, face and neck selections without invalid geometry', () => {
  for(const body of ['explorer','chef','pajamas','hero']) for(const head of ['explorer','chef','sleep','sprout','bow']) {
    const model=createWhitekneeWorldModel(T,{pet:'animal-whiteknee',outfit:{body:'whiteknee-body-'+body},wardrobe:{head:'whiteknee-head-'+head,face:'whiteknee-face-glasses',neck:'whiteknee-neck-scarf'}});
    model.animate(1,true);
    const bounds=new T.Box3().setFromObject(model.group);
    assert(Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.y));
    model.dispose();
  }
});
