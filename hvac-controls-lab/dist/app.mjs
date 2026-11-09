import {profiles, scenarios, points, sequence, createLab, scan, setInput, acknowledge, resetAlarms, economizerAvailable, permissives} from './model.mjs';

const $ = id => document.getElementById(id);
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const timeText = n => [Math.floor(n / 3600),Math.floor(n / 60) % 60,n % 60].map(x => String(x).padStart(2,'0')).join(':');
const valueText = (n, decimals = 0) => Number(n).toFixed(decimals);
const pct = n => valueText(n) + '%';
const unit = () => lab.plant === 'ahu' ? '°F' : 'psi';
let lab = createLab(), timer = null, lastEvent = null, lastAlarm = null;
const hiddenTraces = new Set();
const analogControls = new Map();
const digitalControls = new Map();

function ahuDiagram() {
  return `<svg viewBox="0 0 620 193" role="img" aria-label="AHU schematic. Outdoor air mixes with return air and passes through the filter, cooling coil and supply fan.">
  <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4 0 8Z" fill="#62bdd1"/></marker></defs>
  <text x="24" y="29">OUTDOOR AIR</text><text id="oaValue" x="24" y="48" class="svg-value"></text>
  <text x="595" y="29" text-anchor="end">SUPPLY AIR</text><text id="saValue" x="595" y="48" text-anchor="end" class="svg-value"></text>
  <path class="duct" d="M26 68H593V120H26Z"/><path class="duct" d="M171 121h49v30h169v24H171Z"/>
  <path id="returnFlow" class="flow return" d="M380 163H194V118" marker-end="url(#arrow)"/>
  <path id="oaFlow" class="flow" d="M36 94H95M135 94H174" marker-end="url(#arrow)"/>
  <path id="supplyFlow" class="flow" d="M208 94H245M281 94H316M352 94H402M458 94H516M528 94H585" marker-end="url(#arrow)"/>
  <rect id="damperBlock" class="component" x="100" y="75" width="34" height="38" rx="4"/>
  <path id="damperBlade" class="diagram-detail" d="m108 103 18-18m-17 11 11-11m-6 18 11-11"/>
  <circle class="component" cx="193" cy="94" r="16"/><path class="diagram-detail" d="M184 94h18m-9-9v18"/>
  <rect class="component" x="248" y="76" width="29" height="36" rx="3"/>
  <path class="diagram-detail" d="m253 106 5-24 4 24 4-24 5 24"/>
  <rect id="valveBlock" class="component" x="319" y="75" width="33" height="38" rx="4"/>
  <path id="coilDetail" class="diagram-detail" d="M324 83h22l-22 7h22l-22 8h22l-22 7h22"/>
  <circle id="fanBlock" class="component" cx="430" cy="94" r="24"/><path id="fanDetail" class="diagram-detail" d="M430 94c-8-15 4-19 7-10 1 5-2 8-7 10Zm0 0c17 0 14 13 5 12-4-1-5-6-5-12Zm0 0c-9 15-18 6-13-1 3-3 8-2 13 1Z"/>
  <circle class="component" cx="522" cy="94" r="7"/><circle cx="522" cy="94" r="2.5" fill="#56d9f2"/>
  <text x="117" y="133" text-anchor="middle" class="svg-caption">OA DAMPER</text><text x="193" y="65" text-anchor="middle" class="svg-caption">MIXING BOX</text>
  <text x="262" y="133" text-anchor="middle" class="svg-caption">FILTER</text><text x="335" y="133" text-anchor="middle" class="svg-caption">COOLING COIL</text><text x="430" y="133" text-anchor="middle" class="svg-caption">SUPPLY FAN</text>
  <text x="403" y="161">RETURN AIR</text><text id="raValue" x="403" y="177" class="svg-value"></text>
  </svg>`;
}

function pumpDiagram() {
  return `<svg viewBox="0 0 620 193" role="img" aria-label="Hydronic loop schematic. Two parallel VFD pumps feed a common supply header and return through the loop load.">
  <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4 0 8Z" fill="#62bdd1"/></marker></defs>
  <path class="duct" d="M51 48H487V61H63v91h424v12H51Z"/><path class="duct" d="M245 100h242v12H245Z"/>
  <path class="duct" d="M480 48h14v116h-14ZM50 100h187v12H50Z"/>
  <path id="pumpPathA" class="flow" d="M68 54H220M269 54H475" marker-end="url(#arrow)"/>
  <path id="pumpPathB" class="flow" d="M68 106H220M269 106H475" marker-end="url(#arrow)"/>
  <path id="pumpReturn" class="flow return" d="M475 157H67" marker-end="url(#arrow)"/>
  <circle id="pumpBlockA" class="component" cx="244" cy="54" r="20"/><path class="diagram-detail" d="m237 44 16 10-16 10z"/>
  <circle id="pumpBlockB" class="component" cx="244" cy="106" r="20"/><path class="diagram-detail" d="m237 96 16 10-16 10z"/>
  <rect id="loopBlock" class="component" x="467" y="80" width="40" height="54" rx="5"/><path class="diagram-detail" d="m474 89 26 7-26 7 26 7-26 7 26 7"/>
  <text x="244" y="25" text-anchor="middle">PUMP A</text><text x="244" y="140" text-anchor="middle">PUMP B</text>
  <text x="57" y="25" text-anchor="middle">HEADER</text><text x="57" y="181" text-anchor="middle" class="svg-caption">RETURN</text>
  <text x="522" y="92">LOOP LOAD</text><text id="loadValue" x="522" y="110" class="svg-value"></text>
  <text x="413" y="21">LOOP DP</text><text id="dpValue" x="413" y="39" class="svg-value"></text>
  <circle class="component" cx="415" cy="54" r="6"/><circle cx="415" cy="54" r="2" fill="#56d9f2"/>
  </svg>`;
}

function renderProfile() {
  const profile = profiles[$('profile').value];
  $('profileTool').textContent = profile.tool;
  $('profileFocus').textContent = profile.focus;
  $('profileDoc').href = profile.url;
}

function buildInputs() {
  const {analog,digital} = points[lab.plant];
  analogControls.clear();
  digitalControls.clear();
  $('analog').innerHTML = analog.map(([key,tag,label,u,min,max,step]) => `
    <div class="analog-row"><div class="point-head"><label class="point-name" for="num-${key}"><span class="tag">${tag}</span>${label}</label>
    <span class="point-value"><input id="num-${key}" type="number" min="${min}" max="${max}" step="${step}">${u}</span></div>
    <input id="range-${key}" type="range" aria-label="${label} slider" min="${min}" max="${max}" step="${step}"></div>`).join('') +
    '<div class="manual-row"><span id="pvMode"></span><label><input id="manual" type="checkbox"> Manual override</label></div>';
  for (const [key] of analog) {
    const num = $('num-' + key), range = $('range-' + key);
    analogControls.set(key,{num,range});
    const commit = () => {
      setInput(lab,key,num.valueAsNumber);
      num.value = valueText(lab.inputs[key], key === 'pv' || key === 'sp' ? 1 : 0);
      render();
    };
    num.addEventListener('change',commit);
    num.addEventListener('blur',commit);
    num.addEventListener('keydown',e => {
      if (e.key === 'Enter') {e.preventDefault(); commit();}
    });
    range.addEventListener('input',() => {setInput(lab,key,range.valueAsNumber); render();});
  }
  $('manual').addEventListener('change',e => {
    lab.manual = e.target.checked;
    if (lab.manual) lab.inputs.pv = Math.max(+analogControls.get('pv').num.min,Math.min(+analogControls.get('pv').num.max,lab.inputs.pv));
    render();
  });
  $('digitalCount').textContent = String(digital.length).padStart(2,'0');
  $('digital').innerHTML = digital.map(([key,tag,label]) => `
    <div class="digital-row"><span class="point-name" id="name-${key}"><span class="tag">${tag}</span>${label}</span>
    <button class="toggle ${key === 'enable' || key === 'demand' ? '' : 'trip'}" id="toggle-${key}" type="button" role="switch" aria-labelledby="name-${key}" aria-describedby="di-${key}"><span id="di-${key}"></span><span class="toggle-track"></span></button></div>`).join('') +
    '<p class="panel-note">Inputs are evaluated on the next simulation scan.</p>';
  for (const [key,,,on,off] of digital) {
    const btn = $('toggle-' + key);
    digitalControls.set(key,{btn,on,off,status:$('di-' + key)});
    btn.addEventListener('click',() => {setInput(lab,key,!lab.inputs[key]); render();});
  }
}

function renderInputs() {
  for (const [key,{num,range}] of analogControls) {
    const value = lab.inputs[key];
    if (num !== document.activeElement) num.value = valueText(value,key === 'pv' || key === 'sp' ? 1 : 0);
    range.value = value;
    num.disabled = range.disabled = key === 'pv' && !lab.manual;
  }
  for (const [key,{btn,on,off,status}] of digitalControls) {
    btn.setAttribute('aria-checked',lab.inputs[key]);
    status.textContent = lab.inputs[key] ? on : off;
  }
  $('pvMode').textContent = lab.manual ? 'Process sensor manually driven' : 'Process sensor follows the model';
}

function panelText(id,value) { $(id).textContent = value; }
function diagramActive(ids,active) { for (const id of ids) $(id).classList.toggle('live',active); }
function equipmentCell(label,value,state = '',tone = '') {
  return `<div class="equipment-cell"><span>${label}</span><strong>${value}${state ? ` <small class="${tone}">${state}</small>` : ''}</strong></div>`;
}

function renderEquipment() {
  const {inputs:i,outputs:o} = lab;
  const badge = $('processBadge');
  const running = lab.plant === 'ahu' ? o.fan : o.speedA || o.speedB;
  const warning = ['prestart','proving','staging'].includes(lab.stage);
  const alarm = Object.keys(lab.alarms).length;
  badge.className = 'status-chip' + (lab.stage === 'lockout' ? ' fault' : warning || (running && alarm) ? ' warning' : running ? '' : ' idle');
  badge.lastElementChild.textContent = lab.stage === 'lockout' ? 'Locked out' : warning ? 'Starting / proving' : running && alarm ? 'Running with fault' : running ? 'Equipment running' : 'Equipment idle';
  if (lab.plant === 'ahu') {
    panelText('oaValue',valueText(i.outside) + ' °F');
    panelText('raValue',valueText(i.returnAir) + ' °F');
    panelText('saValue',valueText(i.pv,1) + ' °F');
    diagramActive(['oaFlow','damperBlock','damperBlade'],o.damper > 0);
    diagramActive(['returnFlow','supplyFlow','fanBlock','fanDetail'],o.fan > 0);
    diagramActive(['valveBlock','coilDetail'],o.valve > 0);
    const fanFault = lab.alarms.drive || lab.alarms.proof;
    const proven = o.fan && lab.fan.since >= 2 && i.proof;
    $('equipment').innerHTML = equipmentCell('Supply fan',pct(o.fan),fanFault ? 'FAULT' : proven ? 'PROVEN' : o.fan ? 'PROVING' : 'OFF',fanFault ? 'fault' : proven ? '' : 'off') +
      equipmentCell('Outside air damper',pct(o.damper),o.damper ? 'CMD' : 'CLOSED',o.damper ? '' : 'off') +
      equipmentCell('Cooling valve',pct(o.valve),o.valve ? 'CMD' : 'CLOSED',o.valve ? '' : 'off');
  } else {
    panelText('loadValue',pct(i.load));
    panelText('dpValue',valueText(i.pv,1) + ' psi');
    diagramActive(['pumpPathA','pumpBlockA'],o.speedA > 0);
    diagramActive(['pumpPathB','pumpBlockB'],o.speedB > 0);
    diagramActive(['pumpReturn','loopBlock'],!!running);
    const pumpCell = name => {
      const speed = o['speed' + name];
      const fault = lab.alarms['drive' + name] || lab.alarms['proof' + name];
      const proven = speed && lab.pumps[name].since >= 2 && i['proof' + name];
      return equipmentCell('Pump ' + name,pct(speed),fault ? 'FAULT' : proven ? (lab.lead === name ? 'LEAD' : 'LAG') : speed ? 'PROVING' : 'OFF',fault ? 'fault' : proven ? '' : 'off');
    };
    $('equipment').innerHTML = pumpCell('A') + pumpCell('B') + equipmentCell('Loop load',pct(i.load));
  }
}

function renderMetrics() {
  const {inputs:i} = lab;
  const ahu = lab.plant === 'ahu';
  const activeAlarms = Object.keys(lab.alarms).length;
  const stateName = sequence[lab.plant].find(([key]) => key === lab.stage)[1];
  const deviation = i.pv - i.sp;
  const metric = (name, symbol, value, sub, style = '') => `<div class="metric"><div class="metric-head">${name}${icon(symbol)}</div><strong class="${style}">${value}</strong><p>${sub}</p></div>`;
  const unitText = ' <em>' + unit() + '</em>';
  const stateDetail = ahu ? (economizerAvailable(lab) ? 'Outdoor air eligible' : 'Outdoor air outside enable limits') :
    lab.stageDelay ? 'Lag timer ' + lab.stageDelay + ' / 12 s' : lab.destageDelay ? 'Destage timer ' + lab.destageDelay + ' / 15 s' : lab.lead ? 'Pump ' + lab.lead + ' selected' : 'Awaiting plant demand';
  $('metrics').innerHTML = metric(ahu ? 'Supply air temperature' : 'Loop differential pressure','temp',valueText(i.pv,1) + unitText,lab.manual ? 'Manual sensor input' : 'Simulated process value','cyan') +
    metric(ahu ? 'Supply air target' : 'Pressure target','target',valueText(i.sp,1) + unitText,(deviation >= .05 ? '+' : '') + valueText(deviation,1) + ' ' + unit() + ' deviation') +
    metric('Operating state','wave',stateName,stateDetail,'word ' + (lab.stage === 'lockout' ? 'alarm' : lab.stage === 'off' ? '' : 'green')) +
    metric('Active alarms','shield',String(activeAlarms).padStart(2,'0'),activeAlarms ? 'Latched trip' + (activeAlarms > 1 ? 's' : '') : 'No latched trips',activeAlarms ? 'alarm' : '');
}

function buildTrend() {
  $('legend').innerHTML = points[lab.plant].trend.map(([key,label,,color]) => `
    <button type="button" data-trace="${key}" style="--series:${color}" aria-pressed="true"><i></i>${label}<strong id="trace-${key}"></strong></button>`).join('');
  $('legend').querySelectorAll('button').forEach(btn => btn.addEventListener('click',() => {
    const {trace} = btn.dataset;
    if (hiddenTraces.has(trace)) hiddenTraces.delete(trace);
    else hiddenTraces.add(trace);
    btn.setAttribute('aria-pressed',!hiddenTraces.has(trace));
    renderTrend();
  }));
}

function renderTrend() {
  const spec = points[lab.plant].trend;
  const [min,max] = lab.plant === 'ahu' ? [20,100] : [0,40];
  const right = Math.max(60,lab.time), left = Math.max(0,right - 120);
  const x = time => 42 + (time - left) * 532 / (right - left);
  const y = (n,lo,hi) => 132 - Math.max(0,Math.min(1,(n - lo) / (hi - lo))) * 111;
  const grids = [0,1,2,3,4].map(k => {
    const h = 21 + 111 * k / 4;
    return `<line x1="42" y1="${h}" x2="574" y2="${h}" class="grid"/><text x="35" y="${h+3}" text-anchor="end">${max - (max-min)*k/4}</text><text x="583" y="${h+3}">${100-k*25}</text>`;
  }).join('');
  const ticks = [0,1,2,3,4].map(k => {
    const t = Math.round(left + (right-left)*k/4);
    return `<text x="${x(t)}" y="150" text-anchor="middle">${t}s</text>`;
  }).join('');
  const traces = spec.map(([key,,u,color]) => {
    const val = lab.history.at(-1)[key];
    panelText('trace-' + key,valueText(val,u === '%' ? 0 : 1) + u);
    if (hiddenTraces.has(key)) return '';
    const coords = lab.history.map(p => [x(p.time).toFixed(1),y(p[key],u === '%' ? 0 : min,u === '%' ? 100 : max).toFixed(1)]);
    return `<polyline points="${coords.map(p => p.join(',')).join(' ')}" stroke="${color}" class="trace"/><circle cx="${coords.at(-1)[0]}" cy="${coords.at(-1)[1]}" r="2.7" fill="${color}"/>`;
  }).join('');
  $('chart').innerHTML = `<svg viewBox="0 0 620 157" role="img" aria-label="Trend of process value, setpoint and equipment commands over simulation time">
    <text x="34" y="11" text-anchor="end">${unit()}</text><text x="583" y="11">%</text>${grids}
    <path d="M42 21v111h532V21" fill="none" class="axis"/>${ticks}${traces}</svg>`;
}

function buildSequence() {
  $('sequenceList').innerHTML = sequence[lab.plant].map(([key,title,detail],i) =>
    `<li id="seq-${key}" class="sequence-row"><span class="seq-number">${String(i + 1).padStart(2,'0')}</span><div><h3>${title}</h3><p>${detail}</p></div><span class="seq-live" hidden>ACTIVE</span></li>`).join('');
}

function renderSequence() {
  for (const [key] of sequence[lab.plant]) {
    const li = $('seq-' + key);
    const active = key === lab.stage;
    li.classList.toggle('current',active);
    if (active) li.setAttribute('aria-current','step');
    else li.removeAttribute('aria-current');
    li.lastElementChild.hidden = !active;
  }
  const conditions = permissives(lab);
  $('permCount').textContent = conditions.filter(([,v]) => v).length + ' / ' + conditions.length + ' MET';
  $('permissives').innerHTML = conditions.map(([name,met]) => `<li class="perm-row ${met ? 'met' : ''}">${icon(met ? 'check' : 'minus')}${name}<small>${met ? 'MET' : 'OPEN'}</small></li>`).join('');
}

function renderAlarms() {
  const alarms = Object.values(lab.alarms);
  const signature = alarms.map(a => a.id + ':' + a.ack).join(',');
  if (lastAlarm !== signature) {
    $('alarmCount').textContent = alarms.length + ' ACTIVE';
    $('navAlarms').textContent = alarms.length;
    $('navAlarms').hidden = !alarms.length;
    $('activeAlarms').innerHTML = alarms.length ? alarms.map(a => `<div class="alarm-row">${icon('bell')}<span>${a.name}</span><small>${a.ack ? 'ACK' : 'UNACK'}</small><time>${timeText(a.time)}</time></div>`).join('') :
      '<p class="alarm-empty">' + icon('check') + ' No active alarms</p>';
    lastAlarm = signature;
  }
  $('ack').disabled = !alarms.some(a => !a.ack);
  $('clearAlarms').disabled = !alarms.length;
  const hint = alarms.length ? (alarms.some(a => !lab.inputs[a.id]) ? 'Reset is blocked for any alarm whose field input is still in fault.' : 'Field inputs restored. Reset alarms to clear the latches.') : 'Restore the field condition before resetting a latched trip.';
  if ($('alarmHint').textContent !== hint) $('alarmHint').textContent = hint;
  if (lastEvent !== lab.log[0]) {
    $('events').innerHTML = lab.log.map(e => `<li class="${e.type === 'alarm' ? 'alarm-event' : ''}"><time>${timeText(e.time)}</time><span>${e.text}</span></li>`).join('');
    lastEvent = lab.log[0];
  }
}

function render() {
  panelText('time',timeText(lab.time));
  renderMetrics();
  renderEquipment();
  renderInputs();
  renderTrend();
  renderSequence();
  renderAlarms();
}

function setRunning(run) {
  clearInterval(timer);
  timer = run ? setInterval(() => {scan(lab); render();},1000 / Number($('rate').value)) : null;
  panelText('runStatus',run ? 'RUNNING' : 'PAUSED');
  $('runStatus').classList.toggle('running',run);
  $('run').innerHTML = icon(run ? 'pause' : 'play') + '<span>' + (run ? 'Pause' : 'Run') + '</span>';
}

function openScenario(id, warm = false) {
  setRunning(false);
  lab = createLab(id);
  if (warm) for (let i = 0; i < 60; i++) scan(lab);
  hiddenTraces.clear();
  lastAlarm = null;
  const ahu = lab.plant === 'ahu';
  panelText('assetTag',ahu ? 'AHU-01' : 'HWP-01');
  panelText('title',ahu ? 'Air handling unit' : 'Hydronic pump loop');
  panelText('subTitle',ahu ? 'Supply air temperature control with an integrated economizer.' : 'Differential pressure control with lead / lag staging and failover.');
  panelText('scenarioBrief',scenarios[id].brief);
  $('schematic').innerHTML = ahu ? ahuDiagram() : pumpDiagram();
  buildInputs();
  activateTab('analog');
  buildTrend();
  buildSequence();
  render();
}

function activateTab(key,focus = false) {
  for (const tab of ['analog','digital']) {
    const active = key === tab, btn = $(tab + '-tab');
    $(tab).hidden = !active;
    btn.setAttribute('aria-selected',active);
    btn.tabIndex = active ? 0 : -1;
    if (active && focus) btn.focus();
  }
}

$('scenario').innerHTML = Object.entries(scenarios).map(([id,{name}]) => '<option value="' + id + '">' + name + '</option>').join('');
$('scenario').addEventListener('change',e => openScenario(e.target.value));
$('profile').addEventListener('change',renderProfile);
$('run').addEventListener('click',() => setRunning(!timer));
$('rate').addEventListener('change',() => {if (timer) setRunning(true);});
$('restart').addEventListener('click',() => openScenario(lab.id));
$('step').addEventListener('click',() => {setRunning(false); scan(lab); render();});
$('ack').addEventListener('click',() => {acknowledge(lab); render();});
$('clearAlarms').addEventListener('click',() => {resetAlarms(lab); render();});
for (const tab of ['analog','digital']) {
  $(tab + '-tab').addEventListener('click',() => activateTab(tab));
  $(tab + '-tab').addEventListener('keydown',e => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
      e.preventDefault();
      activateTab(e.key === 'Home' ? 'analog' : e.key === 'End' ? 'digital' : tab === 'analog' ? 'digital' : 'analog',true);
    }
  });
}

function activeNav() {
  const hash = location.hash || '#workbench';
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.hash === hash;
    link.classList.toggle('active',active);
    if (active) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange',activeNav);
activeNav();
renderProfile();
openScenario('cooling',true);
