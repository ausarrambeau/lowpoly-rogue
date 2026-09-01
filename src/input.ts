/** Keyboard + mouse state, polled once per frame. Mouse is stored in NDC for raycasting. */
import * as THREE from 'three';

export class Input {
  readonly down = new Set<string>();
  readonly pressed = new Set<string>();
  readonly mouse = new THREE.Vector2(0, 0);
  mouseDown = false;
  mouseClicked = false;
  private target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) {
        this.down.add(e.code);
        this.pressed.add(e.code);
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => this.setMouse(e.clientX, e.clientY));
    target.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
      this.setMouse(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setMouse(cx: number, cy: number): void {
    const r = this.target.getBoundingClientRect();
    this.mouse.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Normalised movement vector: W/up = -z (up the screen), D/right = +x. */
  axis(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    const l = Math.hypot(x, z);
    return l > 0 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
