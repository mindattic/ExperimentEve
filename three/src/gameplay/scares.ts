import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { spawnEnemy } from '../enemies/registry';
import type { Sfx } from '../audio/sfx';

// Scripted fake-outs and setpieces. These are theater, not combat: driven by
// small timelines, never dealing damage.

interface DogActor {
  object: THREE.Object3D;
  startX: number;
  phase: 'sprint' | 'slam';
  t: number;
  offset: number;
}

export class ScareDirector {
  private cat: THREE.Object3D | null = null;
  private catVel = new THREE.Vector3();
  private catTimer = 0;
  private dogs: DogActor[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sfx: Sfx,
  ) {}

  /** A cat bolts across the street. Classic. */
  catDash(fromX: number, toX: number, z: number): void {
    const cat = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.16, 0.42),
      makePS1Material({ color: 0x1c1a18 }),
    );
    body.position.y = 0.14;
    cat.add(body);
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.3, 4),
      makePS1Material({ color: 0x1c1a18 }),
    );
    tail.position.set(0, 0.26, -0.24);
    tail.rotation.x = -0.7;
    cat.add(tail);
    cat.position.set(fromX, 0, z);
    cat.rotation.y = Math.atan2(toX - fromX, 0);
    this.scene.add(cat);
    this.cat = cat;
    this.catVel.set(Math.sign(toX - fromX) * 7.5, 0, 0);
    this.catTimer = Math.abs(toX - fromX) / 7.5;
    this.sfx.hiss();
  }

  /** Something slams a shutter. Pure audio + rumble hook returns nothing. */
  shutterBang(): void {
    this.sfx.bark(); // sharp transient stands in until dedicated slam
    this.sfx.hiss();
  }

  /** Tentacled dobermans hit the chain-link — they can NEVER cross it. */
  dogFence(spawnX: number, fenceX: number, z: number, count = 2): void {
    for (let i = 0; i < count; i++) {
      const enemy = spawnEnemy('tentacleDoberman');
      if (!enemy) continue;
      enemy.object.position.set(spawnX - i * 1.2, 0, z + i * 1.6 - 0.8);
      this.scene.add(enemy.object);
      this.dogs.push({
        object: enemy.object,
        startX: fenceX - 0.45, // stop short of the fence plane
        phase: 'sprint',
        t: 0,
        offset: i * 0.9,
      });
    }
    this.sfx.bark();
  }

  update(gameDt: number): void {
    if (gameDt <= 0) return;

    if (this.cat) {
      this.catTimer -= gameDt;
      this.cat.position.addScaledVector(this.catVel, gameDt);
      this.cat.position.y = Math.abs(Math.sin(this.catTimer * 22)) * 0.08;
      if (this.catTimer <= 0) {
        this.scene.remove(this.cat);
        this.cat = null;
      }
    }

    for (const dog of this.dogs) {
      dog.t += gameDt;
      if (dog.phase === 'sprint') {
        dog.object.position.x += 5.5 * gameDt;
        dog.object.rotation.y = Math.PI / 2; // toward +x fence
        if (dog.object.position.x >= dog.startX) {
          dog.object.position.x = dog.startX;
          dog.phase = 'slam';
          dog.t = 0;
        }
      } else {
        // Jump against the fence, tentacles lashing: bounce + pitch.
        const k = (dog.t + dog.offset) % 1.1;
        dog.object.position.y = Math.max(0, Math.sin((k / 1.1) * Math.PI)) * 0.55;
        dog.object.rotation.x = -0.25 * Math.sin((k / 1.1) * Math.PI);
        if (Math.abs(k) < 0.04 && Math.random() < 0.5) this.sfx.bark();
      }
    }
  }
}
