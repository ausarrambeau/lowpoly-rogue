/** DOM overlay: status, equipment, inventory, minimap, log, boss bar, overlays. */
import type { Dungeon } from './dungeon';
import { FLOOR } from './grid';
import type { ItemDef, ItemDrop } from './items';
import type { Point } from './dungeon';

const MAP_PX = 168;

export class HUD {
  readonly fxLayer: HTMLElement;
  onSlot: (i: number) => void = () => {};
  onOverlayClick: () => void = () => {};

  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private floorEl: HTMLElement;
  private goldEl: HTMLElement;
  private killsEl: HTMLElement;
  private weaponEl: HTMLElement;
  private armorEl: HTMLElement;
  private invEl: HTMLElement;
  private logEl: HTMLElement;
  private bossEl: HTMLElement;
  private bossFill: HTMLElement;
  private bossTitle: HTMLElement;
  private hurtEl: HTMLElement;
  private bannerEl: HTMLElement;
  private overlayEl: HTMLElement;
  private fadeEl: HTMLElement;
  private mapCtx: CanvasRenderingContext2D;
  private cache = new Map<string, string>();
  private bannerTimer = 0;

  constructor(parent: HTMLElement, slots: number) {
    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div id="status" class="panel">
        <div class="row"><span id="floor">Floor 1</span><span class="gold" id="gold">0 g</span></div>
        <div class="bar"><i id="hpfill"></i><b id="hptext"></b></div>
        <div class="row muted" style="margin-top:6px"><span>Kills</span><span id="kills">0</span></div>
      </div>
      <div id="boss" class="panel"><div class="title" id="bosstitle"></div><div class="bar"><i id="bossfill"></i></div></div>
      <div id="minimap" class="panel"><canvas width="${MAP_PX}" height="${MAP_PX}"></canvas></div>
      <div id="equip" class="panel">
        <div><span class="muted">Weapon </span><span id="weapon"></span></div>
        <div><span class="muted">Armor &nbsp;</span><span id="armor"></span></div>
      </div>
      <div id="inv" class="panel"></div>
      <div id="log"></div>
      <div id="fx"></div>
      <div id="hurt"></div>
      <div id="banner"></div>
    `;
    parent.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.addEventListener('click', () => this.onOverlayClick());
    parent.appendChild(overlay);
    const fade = document.createElement('div');
    fade.id = 'fade';
    parent.appendChild(fade);

    const q = (id: string): HTMLElement => {
      const el = root.querySelector<HTMLElement>(`#${id}`);
      if (!el) throw new Error(`hud element #${id} missing`);
      return el;
    };
    this.hpFill = q('hpfill');
    this.hpText = q('hptext');
    this.floorEl = q('floor');
    this.goldEl = q('gold');
    this.killsEl = q('kills');
    this.weaponEl = q('weapon');
    this.armorEl = q('armor');
    this.invEl = q('inv');
    this.logEl = q('log');
    this.bossEl = q('boss');
    this.bossFill = q('bossfill');
    this.bossTitle = q('bosstitle');
    this.hurtEl = q('hurt');
    this.bannerEl = q('banner');
    this.fxLayer = q('fx');
    this.overlayEl = overlay;
    this.fadeEl = fade;
    const canvas = root.querySelector('canvas');
    if (!canvas) throw new Error('minimap canvas missing');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.mapCtx = ctx;

    for (let i = 0; i < slots; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="label"></span><span class="count"></span>`;
      slot.addEventListener('click', () => this.onSlot(i));
      this.invEl.appendChild(slot);
    }
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  setHp(hp: number, max: number): void {
    this.set('hp', `${hp}/${max}`, () => {
      this.hpFill.style.transform = `scaleX(${Math.max(0, hp / max).toFixed(3)})`;
      this.hpText.textContent = `${Math.ceil(hp)} / ${max}`;
    });
  }

  setFloor(n: number, name: string): void {
    this.set('floor', `${n}:${name}`, () => (this.floorEl.textContent = `Floor ${n} · ${name}`));
  }

  setGold(g: number): void {
    this.set('gold', String(g), () => (this.goldEl.textContent = `${g} g`));
  }

  setKills(k: number): void {
    this.set('kills', String(k), () => (this.killsEl.textContent = String(k)));
  }

  setEquipment(weapon: ItemDef | null, armor: ItemDef | null): void {
    this.set('weapon', weapon?.id ?? '-', () => {
      this.weaponEl.innerHTML = weapon
        ? `<span class="name r-${weapon.rarity}">${weapon.name}</span> <span class="muted">${weapon.damage} dmg</span>`
        : '<span class="muted">none</span>';
    });
    this.set('armor', armor?.id ?? '-', () => {
      this.armorEl.innerHTML = armor
        ? `<span class="name r-${armor.rarity}">${armor.name}</span> <span class="muted">${armor.defense} def</span>`
        : '<span class="muted">none</span>';
    });
  }

  setInventory(items: ItemDrop[]): void {
    const sig = items.map((i) => `${i.def.id}x${i.amount}`).join(',');
    this.set('inv', sig, () => {
      const slots = this.invEl.children;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] as HTMLElement;
        const it = items[i];
        const label = slot.querySelector<HTMLElement>('.label');
        const count = slot.querySelector<HTMLElement>('.count');
        if (!label || !count) continue;
        if (!it) {
          slot.className = 'slot empty';
          label.textContent = '';
          count.textContent = '';
          slot.title = '';
          continue;
        }
        slot.className = `slot r-${it.def.rarity}`;
        label.textContent = it.def.name;
        count.textContent = it.amount > 1 ? `×${it.amount}` : '';
        const stat = it.def.kind === 'weapon' ? `${it.def.damage} dmg` : it.def.kind === 'armor' ? `${it.def.defense} def` : `+${it.def.heal} hp`;
        slot.title = `${it.def.name} (${stat}) — press ${i + 1} to ${it.def.kind === 'potion' ? 'drink' : 'equip'}`;
      }
    });
  }

  log(msg: string, cls = ''): void {
    const div = document.createElement('div');
    div.textContent = msg;
    if (cls) div.className = cls;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 6) this.logEl.firstChild?.remove();
  }

  bossBar(name: string | null, hp = 0, max = 1): void {
    if (!name) {
      this.set('boss', 'off', () => (this.bossEl.style.display = 'none'));
      return;
    }
    this.set('boss', `${name}:${Math.ceil(hp)}`, () => {
      this.bossEl.style.display = 'block';
      this.bossTitle.textContent = name;
      this.bossFill.style.transform = `scaleX(${Math.max(0, hp / max).toFixed(3)})`;
    });
  }

  hurtFlash(): void {
    this.hurtEl.style.opacity = '1';
    setTimeout(() => (this.hurtEl.style.opacity = '0'), 120);
  }

  banner(title: string, sub: string, seconds = 2.6): void {
    this.bannerEl.innerHTML = `${title}<small>${sub}</small>`;
    this.bannerEl.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.bannerEl.style.opacity = '0'), seconds * 1000);
  }

  showOverlay(html: string): void {
    this.overlayEl.innerHTML = `<div class="card">${html}</div>`;
    this.overlayEl.classList.remove('hidden');
  }

  hideOverlay(): void {
    this.overlayEl.classList.add('hidden');
  }

  fade(to: 0 | 1): void {
    this.fadeEl.style.opacity = String(to);
  }

  clearLog(): void {
    this.logEl.innerHTML = '';
  }

  drawMinimap(
    d: Dungeon,
    solid: Uint8Array,
    explored: Uint8Array,
    player: Point,
    enemies: Point[],
    chests: Point[],
    exitKind: 'stairs' | 'portal-off' | 'portal-on',
  ): void {
    const ctx = this.mapCtx;
    const s = MAP_PX / Math.max(d.width, d.height);
    ctx.clearRect(0, 0, MAP_PX, MAP_PX);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, MAP_PX, MAP_PX);
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const i = y * d.width + x;
        if (!explored[i] || d.tiles[i] !== FLOOR) continue;
        ctx.fillStyle = solid[i] === FLOOR ? '#6b7390' : '#3c4258';
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
    const dot = (p: Point, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * s, (p.y + 0.5) * s, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (explored[d.stairs.y * d.width + d.stairs.x]) {
      dot(d.stairs, exitKind === 'stairs' ? '#7fe0ff' : exitKind === 'portal-on' ? '#c48bff' : '#5a4a70', s * 0.9);
    }
    for (const c of chests) if (explored[c.y * d.width + c.x]) dot(c, '#ffc233', s * 0.6);
    for (const e of enemies) if (explored[e.y * d.width + e.x]) dot(e, '#ff4d4d', s * 0.55);
    dot(player, '#ffffff', s * 0.8);
  }
}
