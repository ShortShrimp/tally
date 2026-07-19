import * as THREE from 'three';

export function createRig(scene) {
  const rig = new THREE.Group();      // lazy follower — peripheral panels
  const tight = new THREE.Group();    // fast follower — reticle, ladder
  scene.add(rig);
  scene.add(tight);
  return { rig, tight };
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export function updateRig({ rig, tight }, camera, dt, shake) {
  camera.getWorldPosition(_pos);
  camera.getWorldQuaternion(_quat);

  const kSlow = 1 - Math.pow(0.0001, dt);   // ~lazy
  const kFast = 1 - Math.pow(0.000000001, dt);

  rig.position.lerp(_pos, kFast);
  rig.quaternion.slerp(_quat, kSlow * 0.9);

  tight.position.lerp(_pos, kFast);
  tight.quaternion.slerp(_quat, kFast);

  if (shake > 0.001) {
    rig.position.x += (Math.random() - 0.5) * 0.012 * shake;
    rig.position.y += (Math.random() - 0.5) * 0.012 * shake;
    tight.position.x += (Math.random() - 0.5) * 0.008 * shake;
    tight.position.y += (Math.random() - 0.5) * 0.008 * shake;
  }
}
