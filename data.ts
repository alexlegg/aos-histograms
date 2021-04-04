export enum DamageType {
  Normal,
  D3,
  D6,
}

export class WeaponProfile {
  name: string;
  range: number;
  attacks: number;
  to_hit: number;
  to_wound: number;
  rend: number;
  damage: number;
  damage_type: DamageType;

  constructor(name: string) {
    this.name = name;
    this.range = 1;
    this.attacks = 0;
    this.to_hit = 0;
    this.to_wound = 0;
    this.rend = 0;
    this.damage = 0;
    this.damage = DamageType.Normal;
  }

  max_damage() : number {
    return this.attacks * this.damage;
  }
}

class WeaponProfileBuilder {
  private readonly _profile: WeaponProfile;

  constructor(name: string) {
    this._profile = new WeaponProfile(name);
  }

  range(range: number): WeaponProfileBuilder {
    this._profile.range = range;
    return this;
  }

  attacks(attacks: number): WeaponProfileBuilder {
    this._profile.attacks = attacks;
    return this;
  }

  to_hit(to_hit: number): WeaponProfileBuilder {
    this._profile.to_hit = to_hit;
    return this;
  }
  
  to_wound(to_wound: number): WeaponProfileBuilder {
    this._profile.to_wound = to_wound;
    return this;
  }
  
  rend(rend: number): WeaponProfileBuilder {
    this._profile.rend = rend;
    return this;
  }
  
  damage(damage: number): WeaponProfileBuilder {
    this._profile.damage = damage;
    return this;
  }

  build(): WeaponProfile {
    return this._profile;
  }
}

export enum AdditionalWeaponType {
  ReplaceOneInUnit,
  ReplaceOneInN,
  AdditionalEveryModel,
}

class AdditionalWeapon {
  type: AdditionalWeaponType;
  weapon_options: WeaponProfile[];
  selected_weapon_option: number;
  optional: bool;
  one_in_n: number;

  constructor(type: AdditionalWeaponType, weapon_options: [WeaponProfile], optional = true, one_in_n?: number) {
    this.type = type;
    this.weapon_options = weapon_options;
    this.optional = optional;
    if (this.optional) {
      this.selected_weapon_option = -1;
    } else {
      this.selected_weapon_option = 0;
    }
    this.one_in_n = one_in_n;
  }

  weapon() : WeaponProfile {
    if (this.selected_weapon_option > this.weapon_options.length) {
      throw "Invalid weapon option";
    }
    if (this.selected_weapon_option == -1) {
      throw "Called weapon() on AdditionalWeapon when no weapon selected";
    }
    return this.weapon_options[this.selected_weapon_option];
  }

  model_count(unit_model_count: number): number {
    switch (this.type) {
    case AdditionalWeaponType.ReplaceOneInUnit:
      return 1;
    case AdditionalWeaponType.ReplaceOneInN:
      if (this.one_in_n === undefined) {
        throw "model_count(): one_in_n must be defined";
      }
      return unit_model_count / this.one_in_n;
    case AdditionalWeaponType.AdditionalEveryModel:
      return unit_model_count;
    }
    throw "Unhandled additional weapon type in model_count()";
  }

  replace_model_count(unit_model_count: number): number {
    switch (this.type) {
    case AdditionalWeaponType.ReplaceOneInUnit:
      return 1;
    case AdditionalWeaponType.ReplaceOneInN:
      if (this.one_in_n === undefined) {
        throw "model_count(): one_in_n must be defined";
      }
      return unit_model_count / this.one_in_n;
    case AdditionalWeaponType.AdditionalEveryModel:
      return 0;
    }
    throw "Unhandled additional weapon type in replace_model_count()";
  }
}

export class UnitProfile {
  name: string;
  movement: number;
  save: number;
  wounds: number;
  bravery: number;
  points: number;

  min_size: number;
  max_size: number;
  selected_size: number;

  weapon_options: WeaponProfile[];
  selected_weapon_option: number;

  additional_weapon_options: AdditionalWeapon[];

  hit_modifier: number;
  wound_modifier: number;
  save_modifier: number;
  damage_modifier: number;
  ignore_wounds: number;

  constructor(name: string) {
    this.name = name;
    this.movement = 0;
    this.save = 0;
    this.wounds = 0;
    this.bravery = 0;
    this.points = 0;
    this.min_size = 0;
    this.max_size = 0;
    this.selected_size = 0;
    this.weapon_options = [];
    this.selected_weapon_option = 0;

    this.additional_weapon_options = [];

    this.hit_modifier = 0;
    this.wound_modifier = 0;
    this.save_modifier = 0;
    this.damage_modifier = 0;
    this.ignore_wounds = -1;
  }

  max_damage() : number {
    let weapon_damage = this.weapon().max_damage();
    return weapon_damage * this.selected_size;
  }

  weapon() : WeaponProfile {
    if (this.selected_weapon_option > this.weapon_options.length) {
      throw "Invalid weapon option";
    }
    return this.weapon_options[this.selected_weapon_option];
  }

  model_count() : number {
    if (this.selected_size % this.min_size != 0) {
      throw "Invalid unit size";
    }
    if (this.selected_size > this.max_damage) {
      throw "Unit size too big";
    }
    return this.selected_size;
  }
}

class UnitProfileBuilder {
  private readonly _profile: UnitProfile;

  constructor(name: string) {
    this._profile = new UnitProfile(name);
  }

  movement(movement: number): UnitProfileBuilder {
    this._profile.movement = movement;
    return this;
  }

  save(save: number): UnitProfileBuilder {
    this._profile.save = save;
    return this;
  }

  wounds(wounds: number): UnitProfileBuilder {
    this._profile.wounds = wounds;
    return this;
  }

  bravery(bravery: number): UnitProfileBuilder {
    this._profile.bravery = bravery;
    return this;
  }

  size(min: number, max: number): UnitProfileBuilder {
    this._profile.min_size = min;
    this._profile.max_size = max;
    this._profile.selected_size = min;
    return this;
  }

  points(points: number): UnitProfileBuilder {
    this._profile.points = points;
    return this;
  }

  weapon_options(weapon_options: WeaponProfile[]): UnitProfileBuilder {
    if (weapon_options.length == 0) {
      throw "Weapon options must not be empty";
    }
    this._profile.weapon_options = weapon_options;
    this._profile.selected_weapon_option = 0;
    return this;
  }

  additional_weapon_option(additional_weapon_option: AdditionalWeapon): UnitProfileBuilder {
    this._profile.additional_weapon_options.push(additional_weapon_option);
    return this;
  }

  ignore_wounds(ignore_wounds: number): UnitProfileBuilder {
    this._profile.ignore_wounds = ignore_wounds;
    return this;
  }

  build(): UnitProfile {
    if (this._profile.weapon_options.length == 0) {
      throw "Unit must have weapon options";
    }
    if (this._profile.min_size == 0) {
      throw "Unit must have a min size";
    }
    if (this._profile.max_size == 0 || this._profile.max_size % this._profile.min_size != 0) {
      throw "Unit must have a valid max size";
    }
    return this._profile;
  }
}

const brute_choppas = new WeaponProfileBuilder("Pair of Brute Choppas")
  .attacks(4)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
const jagged_gore_hacka = new WeaponProfileBuilder("Jagged Gore-hacka")
  .range(2)
  .attacks(3)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
const gore_choppa = new WeaponProfileBuilder("Gore-choppa")
  .range(2)
  .attacks(3)
  .to_hit(4)
  .to_wound(3)
  .rend(1)
  .damage(2)
  .build();
const boss_klaw = new WeaponProfileBuilder("Boss Klaw and Brute Smasha")
  .attacks(4)
  .to_hit(4)
  .to_wound(3)
  .rend(1)
  .damage(2)
  .build();
const boss_choppa = new WeaponProfileBuilder("Boss Choppa")
  .attacks(3)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(2)
  .build();
export const brutes = new UnitProfileBuilder("Orruk Brutes")
  .movement(4)
  .save(4)
  .wounds(3)
  .bravery(6)
  .size(5, 20)
  .points(130)
  .weapon_options([brute_choppas, jagged_gore_hacka])
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.ReplaceOneInUnit, [boss_klaw, boss_choppa], false))
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.ReplaceOneInN, [gore_choppa], true, 5))
  .build();

const pig_iron_choppa = new WeaponProfileBuilder("Pig-iron Choppa")
  .attacks(4)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
const pig_jagged_gore_hacka = new WeaponProfileBuilder("Jagged Gore-hacka")
  .range(2)
  .attacks(3)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
const tusks_and_hooves = new WeaponProfileBuilder("Tusks and Hooves")
  .attacks(4)
  .to_hit(4)
  .to_wound(4)
  .rend(0)
  .damage(1)
  .build();
export const gruntas = new UnitProfileBuilder("Orruk Gore-gruntas")
  .movement(9)
  .save(4)
  .wounds(5)
  .bravery(7)
  .size(3, 12)
  .weapon_options([pig_iron_choppa, pig_jagged_gore_hacka])
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.AdditionalEveryModel, [tusks_and_hooves], false))
  .build();

const ardboy_choppas = new WeaponProfileBuilder("Ardboy Choppas")
  .attacks(2)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
const ardboy_boss = new WeaponProfileBuilder("Ardboy Boss")
  .attacks(4)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
export const ardboys = new UnitProfileBuilder("Orruk Ardboys")
  .movement(4)
  .save(4)
  .wounds(2)
  .bravery(6)
  .size(5, 30)
  .points(100)
  .weapon_options([ardboy_choppas])
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.ReplaceOneInUnit, [ardboy_boss], true))
  .build();

const eadbut = new WeaponProfileBuilder("'Eadbut")
  .attacks(1)
  .to_hit(4)
  .to_wound(3)
  .rend(0)
  .damage(2) // Should be D3.
  .build();
const pair_of_ardboy_choppas = new WeaponProfileBuilder("Pair of Ardboy Choppas")
  .attacks(2)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
const ardboy_big_choppa = new WeaponProfileBuilder("Ardboy Big Choppa")
  .attacks(2)
  .to_hit(4)
  .to_wound(3)
  .rend(1)
  .damage(2)
  .build();
export const ironskulls_boys = new UnitProfileBuilder("Ironskull's Boys")
  .movement(4)
  .save(4)
  .wounds(2)
  .bravery(6)
  .size(4, 4)
  .points(80)
  .weapon_options([pair_of_ardboy_choppas])
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.ReplaceOneInUnit, [ardboy_big_choppa], true))
  .build();

const boss_choppa_and_rip_toof_fist = new WeaponProfileBuilder("Boss Choppa and Rip-toof Fist")
  .attacks(6)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(2)
  .build();
export const megaboss = new UnitProfileBuilder("Orruk Megaboss")
  .movement(4)
  .save(3)
  .wounds(7)
  .bravery(8)
  .size(1, 1)
  .points(140)
  .weapon_options([boss_choppa_and_rip_toof_fist])
  .build();

export const orruks = [
  brutes,
  gruntas,
  ardboys,
  ironskulls_boys,
  megaboss,
];

const nadirite_blade = new WeaponProfileBuilder("Nadirite Blade")
  .attacks(2)
  .to_hit(3)
  .to_wound(4)
  .rend(1)
  .damage(1)
  .build();
export const mortek_guard = new UnitProfileBuilder("Mortek Guard")
  .movement(4)
  .save(4)
  .wounds(1)
  .bravery(10)
  .weapon_options([nadirite_blade])
  .size(10, 40)
  .ignore_wounds(6)
  .build();

const commanders_blade = new WeaponProfileBuilder("Commander's Blade")
  .attacks(3)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(2)
  .build();
const nadirite_battle_shield = new WeaponProfileBuilder("Nadirite Battle-shield")
  .attacks(1)
  .to_hit(3)
  .to_wound(4)
  .rend(0)
  .damage(1)
  .build();
const hooves_teeth_and_barbed_tails = new WeaponProfileBuilder("Hooves, Teeth, and Barbed Tails")
  .attacks(6)
  .to_hit(3)
  .to_wound(3)
  .rend(1)
  .damage(1)
  .build();
export const liege_kavalos = new UnitProfileBuilder("Liege Kavalos")
  .movement(10)
  .save(3)
  .wounds(7)
  .bravery(10)
  .weapon_options([commanders_blade])
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.AdditionalEveryModel, [nadirite_battle_shield], false))
  .additional_weapon_option(new AdditionalWeapon(AdditionalWeaponType.AdditionalEveryModel, [hooves_teeth_and_barbed_tails], false))
  .size(1, 1)
  .ignore_wounds(6)
  .build();

export const obr = [
  mortek_guard,
  liege_kavalos,
];

export const armies : { [id: string] : Array<UnitProfile>; } = {
  "Orruk Warclans": { units: orruks },
  "Ossiarch Bonereapers": { units: obr },
};
