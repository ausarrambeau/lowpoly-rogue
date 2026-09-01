/** Instanced cube particles + DOM floating damage numbers. */
import * as THREE from 'three';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; spin: number;
}

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private slots: (P | null)[];
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene, capacity = 500) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.slots = new Array<P | null>(capacity).fill(null);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.tmpColor.setHex(0xffffff));
    }
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, color: number, count = 12, speed = 4, life = 0.6, size = 0.16): void {
    this.tmpColor.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.slots.length;
      const theta = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = speed * (0.4 + Math.random() * 0.8);
      const horiz = Math.sqrt(1 - up * up);
      this.slots[i] = {
        x, y, z,
        vx: Math.cos(theta) * horiz * s,
        vy: up * s + speed * 0.5,
        vz: Math.sin(theta) * horiz * s,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        spin: Math.random() * Math.PI,
      };
      this.mesh.setColorAt(i, this.tmpColor);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const p = this.slots[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.slots[i] = null;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.06) {
        p.y = 0.06;
        p.vy *= -0.35;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const s = p.size * Math.min(1, p.life / (p.max * 0.5));
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.spin + p.life * 4, p.spin * 2, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Floater {
  el: HTMLElement;
  pos: THREE.Vector3;
  life: number;
  vy: number;
}

export class FloatingText {
  private items: Floater[] = [];
  private v = new THREE.Vector3();

  constructor(private container: HTMLElement, private camera: THREE.Camera) {}

  spawn(pos: { x: number; y: number; z: number }, text: string, color: string, crit = false): void {
    const el = document.createElement('div');
    el.className = crit ? 'dmg crit' : 'dmg';
    el.textContent = text;
    el.style.color = color;
    this.container.appendChild(el);
    this.items.push({ el, pos: new THREE.Vector3(pos.x, pos.y, pos.z), life: 0.95, vy: 1.8 });
    if (this.items.length > 40) this.items.shift()!.el.remove();
  }

  update(dt: number): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      f.pos.y += f.vy * dt;
      f.vy *= 0.94;
      this.v.copy(f.pos).project(this.camera);
      const x = ((this.v.x + 1) / 2) * w;
      const y = ((1 - this.v.y) / 2) * h;
      const scale = f.life > 0.8 ? 1.3 : 1;
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale})`;
      f.el.style.opacity = String(Math.min(1, f.life / 0.3));
    }
  }

  clear(): void {
    for (const f of this.items) f.el.remove();
    this.items = [];
  }
}
