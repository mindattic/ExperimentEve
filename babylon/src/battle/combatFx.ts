import { Vector3 } from '@babylonjs/core';
import type { Sfx } from '../audio/sfx';
import type { FixedCameraDirector } from '../camera/fixedCamera';
import type { Input } from '../core/input';
import type { Voice } from '../enemies/enemyActor';
import type { Particles } from '../render/particles';
import type { BattleHud } from '../ui/battleHud';

// Everything a hit is, other than the number it subtracts: the flash, the line
// through the air, the spray, the crack off the brick, the frame kicking, and
// the pad shoving back against the hand.
//
// It lives here rather than in BattleSystem for one reason — the battle should
// be readable as rules. A shot resolving is six lines of arithmetic; making the
// player believe it is thirty lines of noise and light, and the two shouldn't
// be interleaved. The battle calls one verb per event and this decides what
// that event looks and sounds like.

/** Which pitch each species screams in before it commits. */
const VOICES: Record<Voice, (sfx: Sfx) => void> = {
  squeak: (s) => s.squeak(),
  croak: (s) => s.croak(),
  hiss: (s) => s.hiss(),
  chitter: (s) => s.chitter(),
  buzz: (s) => s.buzz(),
  screech: (s) => s.screech(),
  squelch: (s) => s.squelch(),
};

export class CombatFx {
  private readonly away = new Vector3();

  constructor(
    private readonly sfx: Sfx,
    private readonly particles: Particles,
    private readonly director: FixedCameraDirector,
    private readonly input: Input,
    private readonly hud: BattleHud,
  ) {}

  // ---- her round ------------------------------------------------------

  /**
   * The shot leaving the gun. The tracer is drawn muzzle-to-wound rather than
   * simulated, because at pistol range across a street the round arrives on the
   * same frame it left and nobody was ever going to see it travel.
   */
  gunshot(muzzle: Vector3, at: Vector3): void {
    this.direction(muzzle, at);
    this.particles.muzzleFlash(muzzle, this.away);
    this.particles.tracer(muzzle, at);
    this.sfx.gunshot();
    this.director.addShake(0.22);
    this.input.rumble(70, 0.35, 0.75);
  }

  dryFire(): void {
    this.sfx.dryFire();
    this.input.rumble(40, 0.2, 0);
  }

  reload(): void {
    this.sfx.reloadClack();
    this.input.rumble(60, 0.15, 0.1);
  }

  /** The round went into something soft. */
  fleshHit(muzzle: Vector3, at: Vector3, crit: boolean): void {
    this.direction(muzzle, at);
    this.particles.bloodHit(at, this.away, crit);
    this.particles.stain(at.x, at.z, crit ? 0.42 : 0.24);
    if (crit) {
      this.sfx.crit();
      this.director.addShake(0.3);
      this.input.rumble(160, 0.6, 1);
    } else {
      this.sfx.fleshHit();
    }
  }

  /** The round went into the frog's back, or the coil's mass, and stopped. */
  armourHit(muzzle: Vector3, at: Vector3): void {
    this.direction(muzzle, at);
    this.particles.armourHit(at, this.away);
    this.sfx.armourPing();
  }

  /** Precision Aim found nothing. The round is still somewhere. */
  missed(muzzle: Vector3): void {
    this.sfx.ricochet();
    void muzzle;
  }

  kill(at: Vector3): void {
    this.particles.deathBurst(at);
    this.sfx.deathRattle();
    this.director.addShake(0.35);
    this.input.rumble(220, 0.4, 0.9);
  }

  // ---- their swing ----------------------------------------------------

  /**
   * The tell. Said three ways at once — its own voice here, the attack clip and
   * the emissive ramp on the actor — because the player has to be able to read
   * it out of the corner of an eye, off a fixed camera, at distance.
   */
  telegraph(voice: Voice): void {
    VOICES[voice](this.sfx);
  }

  /** It reached her. */
  playerHit(at: Vector3, from: Vector3, severity: number): void {
    this.direction(from, at);
    this.particles.playerHit(at, this.away);
    this.sfx.bite();
    this.sfx.hurt();
    this.hud.hurtFlash(severity);
    this.director.addShake(0.25 + severity * 0.3);
    this.input.rumble(180, 0.9, 1);
  }

  /** It didn't. She was already out of the arc. */
  playerEvaded(): void {
    this.sfx.whiff();
    this.input.rumble(50, 0.25, 0);
  }

  /** It swung at nothing at all — she wasn't even close. */
  swingWide(): void {
    this.sfx.swing();
  }

  // ---- framing --------------------------------------------------------

  encounter(): void {
    this.sfx.encounterSting();
    this.director.addShake(0.18);
  }

  victory(): void {
    this.sfx.victory();
  }

  atbReady(): void {
    this.sfx.atbReady();
  }

  menuMove(): void {
    this.sfx.uiBlip();
  }

  menuConfirm(): void {
    this.sfx.uiConfirm();
  }

  menuDeny(): void {
    this.sfx.uiDeny();
  }

  dodgeRoll(): void {
    this.sfx.dodgeRoll();
  }

  footstep(): void {
    this.sfx.footstep(false);
  }

  /** Unit vector from `from` to `to`, kept in a scratch so shots don't allocate. */
  private direction(from: Vector3, to: Vector3): void {
    this.away.copyFrom(to).subtractInPlace(from);
    const length = this.away.length();
    if (length < 1e-4) this.away.set(0, 1, 0);
    else this.away.scaleInPlace(1 / length);
  }
}
