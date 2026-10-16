import assert from 'node:assert/strict';
import test from 'node:test';
import {assignmentMaterialMime, validAssignmentMaterial, ASSIGNMENT_MATERIAL_IMAGE_BYTES, ASSIGNMENT_MATERIAL_VIDEO_BYTES} from './assignment-materials';
test('teacher reference media supports mixed images and videos independently of the student answer format', () => {
  for (const type of ['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']) assert(validAssignmentMaterial(type, 1024));
  assert(validAssignmentMaterial('image/jpeg',ASSIGNMENT_MATERIAL_IMAGE_BYTES));
  assert(!validAssignmentMaterial('image/jpeg',ASSIGNMENT_MATERIAL_IMAGE_BYTES+1));
  assert(validAssignmentMaterial('video/mp4',ASSIGNMENT_MATERIAL_VIDEO_BYTES));
  assert(!validAssignmentMaterial('video/mp4',ASSIGNMENT_MATERIAL_VIDEO_BYTES+1));
  for (const value of [0,-1,1.5,NaN,Infinity,'1000']) assert(!validAssignmentMaterial('image/png',value));
  for (const type of ['image/svg+xml','text/html','application/pdf','video/unknown']) assert(!validAssignmentMaterial(type,1000));
  assert.equal(assignmentMaterialMime({name:'参考.MOV',type:''}),'video/quicktime');
});
