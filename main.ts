import * as d3 from "d3";
import $ from "jquery";

import { ModelProfile, WeaponProfile, UnitProfile, AdditionalWeaponType } from "./data";
import * as profiles from "./data";

interface DamageBin {
  damage: number;
  probability: number;
}

var _binomial_cache = [
  [1],
  [1,1],
  [1,2,1],
  [1,3,3,1],
  [1,4,6,4,1],
  [1,5,10,10,5,1],
  [1,6,15,20,15,6,1],
  [1,7,21,35,35,21,7,1],
  [1,8,28,56,70,56,28,8,1],
];

function binomial(n: number, k: number) : number {
  while (n >= _binomial_cache.length) {
    let s = _binomial_cache.length;
    let next_row = [];
    next_row[0] = 1;
    for(let i = 1, prev = s - 1; i < s; i++) {
      next_row[i] = _binomial_cache[prev][i-1] + _binomial_cache[prev][i];
    }
    next_row[s] = 1;
    _binomial_cache.push(next_row);
  }
  return _binomial_cache[n][k];
}

function probDice(required: number) : number {
  return (1 + 6 - required) / 6.0;
}

function probDiceTest(rolls: number, successes: number, roll_requirement: number) {
  let fails = rolls - successes;
  let bin = binomial(rolls, successes);
  let p = probDice(roll_requirement);
  return bin * (p ** successes) * ((1 - p) ** fails);
}

function clamp(x: number, min: number, max: number) : number {
  return x <= min ? min : x >= max ? max : x;
}

function isNumber(value: string | number): boolean
{
   return ((value != null) &&
           (value !== '') &&
           !isNaN(Number(value.toString())));
}

class Histogram {
  private _histogram: Array<number>;
  private static readonly INITIAL_LENGTH : number = 20;

  constructor() {
    this._histogram = new Array<number>(Histogram.INITIAL_LENGTH);
    for (let i = 0; i < Histogram.INITIAL_LENGTH; ++i) {
      this._histogram[i] = 0.0;
    }
  }

  add(value: number, p: number) {
    this.extend(value);
    this._histogram[value] += p;
  }

  get(value: number) {
    return this._histogram[value];
  }

  // Ensure the histogram has room for |value|.
  private extend(value: number) {
    if (value >= this._histogram.length) {

      let new_length = Math.max(this._histogram.length * 2, value + 1);

      for (let i = this._histogram.length; i < new_length; ++i) {
        this._histogram[i] = 0;
      }
    }
  }

  merge(other: Histogram) : Histogram {
    this.trim();
    other.trim();

    let merged = new Histogram();
    merged.extend(this._histogram.length + other._histogram.length);

    for (let i = 0; i < this._histogram.length; i++) {
      for (let j = 0; j < other._histogram.length; j++) {
        merged.add(i + j, this.get(i) * other.get(j));
      }
    }

    return merged;
  }

  trim() {
    for (let i = this._histogram.length - 1; i >= 0; --i) {
      if (this._histogram[i] != 0) {
        this._histogram.splice(i + 1);
        break;
      }
    }
  }

  histogram() {
    this.trim();
    return this._histogram;
  }
}

function weaponDamage(unit: UnitProfile, target: UnitProfile, weapon: WeaponProfile, model_count: number) : Histogram {
  let modified_damage = weapon.damage + unit.damage_modifier;
  let weapon_damage = new Histogram();

  let modified_to_hit = weapon.to_hit - unit.hit_modifier;
  modified_to_hit = clamp(modified_to_hit, 1, 6);

  let modified_to_wound = weapon.to_hit - unit.wound_modifier;
  modified_to_wound = clamp(modified_to_wound, 1, 6);

  let modified_to_save = target.save - target.save_modifier + weapon.rend;
  modified_to_save = modified_to_save <= 2 ? 2 : modified_to_save;

  let total_attacks = weapon.attacks * model_count;
  for (let hits = 0; hits <= total_attacks; hits++) {
    let p_hits = probDiceTest(total_attacks, hits, modified_to_hit);
    for (let wounds = 0; wounds <= hits; wounds++) {
      let p_wounds = probDiceTest(hits, wounds, modified_to_wound);

      let handle_damage = function(wounds: number, p: number) {
        let damage = wounds * modified_damage;
        if (target.ignore_wounds == -1) {
          weapon_damage.add(damage, p);
          return;
        }

        for (let not_ignored = 0; not_ignored <= damage; not_ignored++) {
          let p_not_ignored = probDiceTest(damage, damage - not_ignored, target.ignore_wounds);
          weapon_damage.add(not_ignored, p * p_not_ignored);
        }
      };

      if (modified_to_save > 6) {
        // Target doesn't get a save. Skip save rolls.
        handle_damage(wounds, p_hits * p_wounds);
        continue;
      }

      for (let unsaved = 0; unsaved <= wounds; unsaved++) {
        let p_unsaved = probDiceTest(wounds, wounds - unsaved, modified_to_save);
        handle_damage(unsaved, p_hits * p_wounds * p_unsaved);
      }
    }
  }

  return weapon_damage;
}

function damageProfile(unit: UnitProfile, target: UnitProfile) : Array<DamageBin> {
  let histogram = new Histogram();
  histogram.add(0, 1.0);

  // Take the model count and remove any models with replaced weapons.
  let base_model_count = unit.model_count();
  for (let i in unit.additional_weapon_options) {
    let additional_weapon = unit.additional_weapon_options[i];
    if (additional_weapon.selected_weapon_option == -1) {
      continue;
    }
    base_model_count -= additional_weapon.replace_model_count(unit.model_count());
  }

  // Base weapon
  let weapon_histogram = weaponDamage(unit, target, unit.weapon(), base_model_count);
  histogram = histogram.merge(weapon_histogram);

  // Additional weapons
  for (let i in unit.additional_weapon_options) {
    let additional_weapon = unit.additional_weapon_options[i];
    if (additional_weapon.selected_weapon_option == -1) {
      continue;
    }

    let weapon_model_count = additional_weapon.model_count(unit.model_count());
    let weapon_histogram = weaponDamage(unit, target, additional_weapon.weapon(), weapon_model_count);
    histogram = histogram.merge(weapon_histogram);
  }

  let bins = Array<DamageBin>;
  let unit_damage = histogram.histogram();
  for (let dmg = 0; dmg < unit_damage.length; dmg++) {
    bins.push({
      damage: dmg,
      probability: unit_damage[dmg],
    });
  }
  return bins
}

function drawGraph(unit_profile: UnitProfile, target_profile: UnitProfile) {
  // set the dimensions and margins of the graph
  var margin = {top: 10, right: 30, bottom: 30, left: 40},
      width = 960 - margin.left - margin.right,
      height = 500 - margin.top - margin.bottom;

  // set the ranges
  var x = d3.scaleLinear()
    .range([0, width]);

  var y = d3.scaleLinear()
    .domain([100, 0])
    .range([0, height]);

  d3.select("#graph").html(null);

  var svg = d3.select("#graph").append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", 
            "translate(" + margin.left + "," + margin.top + ")");

  let data = damageProfile(unit_profile, target_profile);

  // Calculate expected value:
  let expected_value = 0;
  for (let i = 0; i < data.length; ++i) {
    expected_value += data[i].damage * data[i].probability;
  }

  // Calculate the probability of killing the target unit.
  let damage_needed = target_profile.selected_size * target_profile.wounds;
  let p_kill_unit = 0;
  for (let i = 0; i < data.length; ++i) {
    if (data[i].damage >= damage_needed) {
      p_kill_unit += data[i].probability;
    }
  }

  // Scale the range of the data in the x domain
  let domain = Array<number>;
  x.domain([0, data.length]);

  let bar_width = x(1) - x(0);

  // Label each bar.
  svg.selectAll(".text")        
    .data(data)
    .enter().append("text")
      .attr("class", "probablity_label")
      .attr("x", function(d) { return x(d.damage); })
      .attr("y", function(d) { return y(d.probability * 100) - 5; })
      .attr("id", function(d) { return "label" + d.damage; })
      .style("display", "none")
      .text(function(d) {
        return (d.probability * 100).toFixed(1);
      });

  // Add the bars.
  svg.selectAll("rect")
    .data(data)
    .enter().append("rect")
      .attr("class", "bar")
      .attr("x", 1)
      .attr("transform", function(d) {
        return "translate(" + x(d.damage) + "," + y(d.probability * 100) + ")"; })
      .attr("width", function(d) { return bar_width ; })
      .attr("height", function(d) { return height - y(d.probability * 100); })
      .on("mouseover", function(ev, d) {
        d3.select(this)
          .attr("fill", "red");
        d3.select("#label" + d.damage)
          .style("display", "block");
      })
      .on('mouseout', function(ev, d) {
        d3.select(this)
          .attr("fill", "black");
        d3.select("#label" + d.damage)
          .style("display", "none");
      });

  // Create a line for the expected value.
  svg.append('line')
      .style("stroke", "lightgreen")
      .style("stroke-width", 1)
      .attr("x1", x(expected_value))
      .attr("y1", 0)
      .attr("x2", x(expected_value))
      .attr("y2", height);

  // Label the expected value line.
  svg.append("text")
      .attr("class", "label")
      .attr("x", function(d) { return x(damage_needed); })
      .attr("y", 20)
      .text("P = " + (p_kill_unit * 100).toFixed(2) + "%");

  // Create a line for the damage needed to kill the target unit.
  svg.append('line')
      .style("stroke", "red")
      .style("stroke-width", 1)
      .attr("x1", x(damage_needed))
      .attr("y1", 0)
      .attr("x2", x(damage_needed))
      .attr("y2", height);

  // Label the damage needed line.
  svg.append("text")
      .attr("class", "label")
      .attr("x", function(d) { return x(expected_value); })
      .attr("y", 40)
      .text("EV = " + expected_value.toFixed(2));

  // add the x Axis
  svg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x).ticks(x.domain()[1]))
      .selectAll("text")
      .attr("x", bar_width / 2.0)
      .text(function(d) { if (d < data.length) { return d } else { return ""; } });

  // add the y Axis
  svg.append("g")
      .call(d3.axisLeft(y));

  svg.append("text")
      .attr("text-anchor", "center")
      .attr("x", width / 2.0)
      .attr("y", height + margin.top + 20)
      .text("Damage");
}

function drawWeaponTable(weapon: WeaponProfile) {
  let table = $("<table>");
  table.attr("class", "stats_table");

  let tr = $("<tr>");
  tr.append($("<th>").text("Range"));
  tr.append($("<th>").text("Attacks"));
  tr.append($("<th>").text("To Hit"));
  tr.append($("<th>").text("To Wound"));
  tr.append($("<th>").text("Rend"));
  tr.append($("<th>").text("Damage"));
  table.append(tr);

  let tr = $("<tr>");
  tr.append($("<td>").text(weapon.range + '"'));
  tr.append($("<td>").text(weapon.attacks));
  tr.append($("<td>").text(weapon.to_hit + "+"));
  tr.append($("<td>").text(weapon.to_wound + "+"));
  tr.append($("<td>").text("-" + weapon.rend));
  tr.append($("<td>").text(weapon.damage));
  table.append(tr);

  return table;
}

function drawStats(parent, profile: UnitProfile) {
  parent.empty();
  let stat_table = $("<table>");
  stat_table.attr("class", "stats_table");

  let tr = $("<tr>");
  tr.append($("<th>").text("Move"));
  tr.append($("<th>").text("Wounds"));
  tr.append($("<th>").text("Bravery"));
  tr.append($("<th>").text("Save"));
  stat_table.append(tr);

  let tr = $("<tr>");
  tr.append($("<td>").text(profile.movement));
  tr.append($("<td>").text(profile.wounds));
  tr.append($("<td>").text(profile.bravery));
  tr.append($("<td>").text(profile.save + "+"));
  stat_table.append(tr);

  parent.append(stat_table);
  parent.append("<br />");

  let modifier_table = $("<table>");

  // Unit size.
  let tr = $("<tr>");
  tr.append($("<td>").text("Unit size"));
  let unit_size = $("<select>");
  for (let size = profile.min_size; size <= profile.max_size; size += profile.min_size) {
    let option = $("<option>");
    option.text(size);
    option.val(size);
    unit_size.append(option);
  }
  unit_size.val(profile.selected_size);
  unit_size.on('change', function() {
    profile.selected_size = unit_size.val();
    update();
  });
  tr.append($("<td>").append(unit_size));
  modifier_table.append(tr);
  parent.append(modifier_table);

  // Hit modifier.
  let tr = $("<tr>");
  tr.append($("<td>").text("Modify hit rolls"));
  let hit_modifier = $("<input type=\"text\" />");
  hit_modifier.on('change', function() {
    if (isNumber(hit_modifier.val())) {
      profile.hit_modifier = parseInt(hit_modifier.val());
    } else if (hit_modifier.val() == "") {
      profile.hit_modifier = 0;
    }
    update();
  });
  if (profile.hit_modifier != 0) {
    hit_modifier.val(profile.hit_modifier);
  } else {
    hit_modifier.val("");
  }
  tr.append($("<td>").append(hit_modifier));
  modifier_table.append(tr);
  parent.append(modifier_table);

  // Wounder modifier.
  let tr = $("<tr>");
  tr.append($("<td>").text("Modify wound rolls"));
  let wound_modifier = $("<input type=\"text\" />");
  wound_modifier.on('change', function() {
    if (isNumber(wound_modifier.val())) {
      profile.wound_modifier = parseInt(wound_modifier.val());
    } else if (wound_modifier.val() == "") {
      profile.wound_modifier = 0;
    }
    update();
  });
  if (profile.wound_modifier != 0) {
    wound_modifier.val(profile.wound_modifier);
  } else {
    wound_modifier.val("");
  }
  tr.append($("<td>").append(wound_modifier));
  modifier_table.append(tr);
  parent.append(modifier_table);

  // Save modifier.
  let tr = $("<tr>");
  tr.append($("<td>").text("Modify save rolls"));
  let save_modifier = $("<input type=\"text\" />");
  save_modifier.on('change', function() {
    if (isNumber(save_modifier.val())) {
      profile.save_modifier = parseInt(save_modifier.val());
    } else if (save_modifier.val() == "") {
      profile.save_modifier = 0;
    }
    update();
  });
  if (profile.save_modifier != 0) {
    save_modifier.val(profile.save_modifier);
  } else {
    save_modifier.val("");
  }
  tr.append($("<td>").append(save_modifier));
  modifier_table.append(tr);
  parent.append(modifier_table);

  // Damage modifier.
  let tr = $("<tr>");
  tr.append($("<td>").text("Modify damage"));
  let damage_modifier = $("<input type=\"text\" />");
  damage_modifier.on('change', function() {
    if (isNumber(damage_modifier.val())) {
      profile.damage_modifier = parseInt(damage_modifier.val());
    } else if (damage_modifier.val() == "") {
      profile.damage_modifier = 0;
    }
    update();
  });
  if (profile.damage_modifier != 0) {
    damage_modifier.val(profile.damage_modifier);
  } else {
    damage_modifier.val("");
  }
  tr.append($("<td>").append(damage_modifier));
  modifier_table.append(tr);
  parent.append(modifier_table);

  if (profile.ignore_wounds != -1) {
    parent.append("Ignore wounds: " + profile.ignore_wounds + "+<br />");
  }
  parent.append("<br />");

  // Main weapon.
  let select = $("<select>");
  select.attr('name', 'weapon_option');
  for (let weapon in profile.weapon_options) {
    let option = $("<option>");
    option.text(profile.weapon_options[weapon].name);
    option.val(weapon);
    select.append(option);
  }
  select.val(profile.selected_weapon_option);
  select.on('change', function() {
    profile.selected_weapon_option = select.val();
    update();
  });
  parent.append(select);
  parent.append(drawWeaponTable(profile.weapon()));
  parent.append("<br />");

  // Additional weapons.
  let addtional_weapons_div = $("<div>");
  for (let i in profile.additional_weapon_options) {
    let additional_weapon = profile.additional_weapon_options[i];
    let weapon_options = additional_weapon.weapon_options;
    let select = $("<select>");
    select.attr('name', 'weapon_option');

    if (additional_weapon.optional) {
      let option = $("<option>");
      option.text("None");
      option.val(-1);
      select.append(option);
    }

    for (let weapon in weapon_options) {
      let option = $("<option>");
      option.text(weapon_options[weapon].name);
      option.val(weapon);
      select.append(option);
    }
    select.val(additional_weapon.selected_weapon_option);
    select.on('change', function() {
      additional_weapon.selected_weapon_option = select.val();
      update();
    });
    addtional_weapons_div.append(select);
    addtional_weapons_div.append("<br />");
    if (additional_weapon.selected_weapon_option != -1) {
      addtional_weapons_div.append(drawWeaponTable(additional_weapon.weapon()));
      addtional_weapons_div.append("<br />");
    }
  }
  parent.append(addtional_weapons_div);
}

function updateArmyList(select, selected_army) {
  select.empty();
  for (let army in profiles.armies) {
    let option = $("<option>");
    option.text(army);
    option.val(army);
    select.append(option)
  }
  select.val(selected_army);
}

function updateUnitList(select, army, selected_unit) {
  select.empty();
  let units = profiles.armies[army].units;
  for (let unit in units) {
    let option = $("<option>");
    option.text(units[unit].name);
    option.val(unit);
    select.append(option);
  }
  select.val(selected_unit);
}

function update() {

  updateArmyList($("#unit_army"), unit_army);
  updateArmyList($("#target_army"), target_army);
  updateUnitList($("#unit"), unit_army, unit_unit);
  updateUnitList($("#target"), target_army, target_unit);

  let unit_army_units = profiles.armies[unit_army].units;
  let target_army_units = profiles.armies[target_army].units;

  let unit_index = $("#unit").val();
  let target_index = $("#target").val();

  let unit_profile : UnitProfile = unit_army_units[unit_index];
  let target_profile : UnitProfile = target_army_units[target_index];

  drawGraph(unit_profile, target_profile);
  drawStats($("#target_stats"), target_profile);
  drawStats($("#unit_stats"), unit_profile);
}

const unit_army_select = $("#unit_army");
unit_army_select.on('change', function() {
  unit_army = $("#unit_army").val();
  unit_unit = 0;
  update();
});

const target_army_select = $("#target_army");
target_army_select.on('change', function() {
  target_army = $("#target_army").val();
  target_unit = 0;
  update();
});

const unit_select = $("#unit");
unit_select.on('change', function() {
  unit_unit = $("#unit").val();
  update();
});

const target_select = $("#target");
target_select.on('change', function() {
  target_unit = $("#target").val();
  update();
});

var unit_army = "Orruk Warclans";
var target_army = "Ossiarch Bonereapers";
var unit_unit = 0;
var target_unit = 0;
update();
