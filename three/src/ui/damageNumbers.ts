import * as THREE from 'three';

// RPG damage floaters: a number pops off the wound, drifts up, and dies.
// White is a normal hit; yellow is a crit (weak point / CRITICAL sweep).

interface Floater {
  el: HTMLDivElement;
  world: THREE.Vector3;
  age: number;
  life: number;
}

export class DamageNumbers {
  private floaters: Floater[] = [];

  constructor(private readonly root: HTMLElement) {}

  spawn(world: THREE.Vector3, amount: number, crit: boolean): void {
    const el = document.createElement('div');
    el.textContent = crit ? `${amount}!` : `${amount}`;
    el.style.cssText =
      'position:absolute;transform:translate(-50%,-100%);pointer-events:none;z-index:30;' +
      'font-family:"Courier New",monospace;font-weight:bold;white-space:nowrap;' +
      (crit
        ? 'color:#ffd23e;font-size:24px;text-shadow:2px 2px 0 #000,0 0 8px rgba(200,120,0,.8);'
        : 'color:#f0ece0;font-size:17px;text-shadow:2px 2px 0 #000;');
    this.root.appendChild(el);
    // Tiny scatter so stacked hits on one part don't overprint.
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.15, (Math.random() - 0.5) * 0.25);
    this.floaters.push({ el, world: world.clone().add(jitter), age: 0, life: crit ? 1.15 : 0.85 });
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const f of this.floaters) {
      f.age += dt;
      if (f.age >= f.life) {
        f.el.remove();
        continue;
      }
      const pos = f.world.clone();
      pos.y += 0.9 * f.age; // world-space rise keeps scale honest at range
      const ndc = pos.project(camera);
      if (ndc.z > 1) {
        f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = 'block';
      f.el.style.left = `${((ndc.x + 1) / 2) * 100}%`;
      f.el.style.top = `${((1 - ndc.y) / 2) * 100}%`;
      const k = f.age / f.life;
      f.el.style.opacity = k > 0.55 ? String(1 - (k - 0.55) / 0.45) : '1';
    }
    this.floaters = this.floaters.filter((f) => f.age < f.life);
  }

  clear(): void {
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
  }
}
