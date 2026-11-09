const $ = id => document.getElementById(id);
const el = {
  cards: $('sensorCards'), name: $('projectName'), host: $('sensorHost'), unit: $('sensorUnit'),
  heartbeat: $('sensorHeartbeat'), read: $('mapRead'), start: $('testStart'), stop: $('testStop'),
  confirm: $('testConfirm'), status: $('sensorStatus'), file: $('mapFile')
};
const limit = 16;
const modes = {manual:'Manual', timeline:'Timed profile', follow:'PLC command'};
const defaults = [
  ['analog','Supply air temperature','°F',55,20,120,10],
  ['analog','Outdoor air temperature','°F',75,-40,150,10],
  ['analog','Zone humidity','% RH',45,0,100,10],
  ['analog','Duct static pressure','in. w.c.',.9,0,3,100],
  ['analog','Filter differential pressure','in. w.c.',.35,0,2,100],
  ['analog','Supply airflow','CFM',1200,0,5000,1],
  ['analog','Zone CO₂','ppm',650,300,2500,1],
  ['analog','Air quality · TVOC','ppb',150,0,2000,1],
  ['digital','Supply fan proof','',0],
  ['digital','Occupancy request','',1],
  ['digital','Freeze-stat normal','',1]
];

function point([kind,label,units = '',value = 0,low = 0,high = 100,scale = 10]) {
  return {kind,label,units,value,low,high,scale,address:null,quality:null,mode:'manual',valid:true,override:false,
          profile:'0, ' + value + ', step, good', source:null,onDelay:2,offDelay:0,invert:false,
          sourceLow:0,sourceHigh:100,lag:3};
}

let points = defaults.map(point), session = '', ticket = '', run = '', busy = false, stopping = false;
let poll = null, live = new Map(), mapped = [], readWords = {};
const cardRefs = new Map();
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric = node => Number.isFinite(node.valueAsNumber) ? node.valueAsNumber : null;

function message(text, tone = '') {
  if (el.status.textContent !== text) el.status.textContent = text;
  el.status.dataset.tone = tone;
}

function options() {
  const locked = busy || !!run || stopping;
  $('connectionFields').disabled = locked;
  el.read.disabled = !session || locked;
  el.confirm.disabled = !ticket || locked;
  el.start.disabled = !ticket || !el.confirm.checked || locked;
  el.stop.disabled = !run || stopping;
  $('addAnalog').disabled = $('addDigital').disabled = locked || points.length >= limit;
  $('importMap').disabled = locked;
  for (const ref of cardRefs.values()) {
    ref.config.disabled = locked;
    for (const node of ref.manualInputs) node.disabled = !!run && ref.point.address === null;
    ref.quality.disabled = ref.override.disabled = !!run && ref.point.address === null;
  }
  const badge = $('runBadge');
  badge.className = 'status-chip' + (stopping ? ' warning' : run ? '' : ' idle');
  badge.lastElementChild.textContent = stopping ? 'STOPPING' : run ? 'TEST ACTIVE' : session ? 'LOCAL BRIDGE' : 'OFFLINE';
}

function invalidateMap() {
  if (ticket) message('Map changed. Read the project map again before starting.');
  ticket = '';
  el.confirm.checked = false;
  mapped = [];
  readWords = {};
  options();
}

function numberInput(key,value,min,max,step = '1',placeholder = '') {
  return `<input data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(value)}" placeholder="${placeholder}">`;
}

function channelCard(p) {
  const analog = p.kind === 'analog';
  const card = document.createElement('article');
  card.className = 'sensor-card';
  card.innerHTML = `<div class="sensor-card-head"><div><h3></h3><p class="channel-type"></p></div><span class="channel-mode"></span></div>
    <div class="channel-display"><div class="channel-value"><span></span><small></small></div><div class="channel-raw"></div></div>
    <div class="channel-controls">
      <div class="manual">${analog ? `<input data-live="slider" aria-label="Set ${esc(p.label)}" type="range"><input data-live="number" aria-label="${esc(p.label)} value" type="number">` : '<button class="button secondary contact-switch" data-live="switch" type="button"></button>'}</div>
      <p class="channel-instruction"></p>
      <label class="quality-check" hidden><input data-live="override" type="checkbox"> Force manual value</label>
      <label class="quality-check" hidden><input data-live="quality" type="checkbox"> Sensor good</label>
    </div>
    <details class="channel-details"><summary>Configure channel</summary><fieldset class="channel-config"><legend class="sr">Channel mapping</legend>
      <div class="channel-map">
        <label class="wide">Name<input data-key="label" maxlength="64" value="${esc(p.label)}"></label>
        <label>Value address${numberInput('address',p.address,1,65536,'1','One-based')}</label>
        <label>Quality address${numberInput('quality',p.quality,1,65536,'1','Optional')}</label>
        <label class="wide">Behavior<select data-key="mode">${Object.entries(modes).map(([k,v]) => `<option value="${k}"${p.mode===k?' selected':''}>${v}</option>`).join('')}</select></label>
        ${analog ? `<label>Engineering units<input data-key="units" maxlength="16" value="${esc(p.units)}"></label>
          <label>Counts per unit${numberInput('scale',p.scale,1,1000)}</label><label>Minimum${numberInput('low',p.low,-32768,32767,'any')}</label>
          <label>Maximum${numberInput('high',p.high,-32768,32767,'any')}</label>` : ''}
      </div>
      <div class="timeline-config" hidden>
        <label>Timeline rows<textarea data-key="profile" maxlength="2500" spellcheck="false">${esc(p.profile)}</textarea></label>
        <p class="sub">Use time, value, step or ramp, good or bad. Start at 0 seconds. A ramp ends at that row’s time. Digital values are 0 or 1 and use steps.</p>
      </div>
      <div class="follow-config" hidden>
        <div class="channel-map">
          <label class="wide">PLC command address${numberInput('source',p.source,1,65536,'1','Read-only source')}</label>
          ${analog ? `<label>Low command (raw)${numberInput('sourceLow',p.sourceLow,-32768,32767)}</label><label>High command (raw)${numberInput('sourceHigh',p.sourceHigh,-32768,32767)}</label><label>Response time (s)${numberInput('lag',p.lag,0,120,'0.1')}</label>` : `<label>On delay (s)${numberInput('onDelay',p.onDelay,0,120,'0.1')}</label><label>Off delay (s)${numberInput('offDelay',p.offDelay,0,120,'0.1')}</label><label class="quality-check wide"><input data-key="invert" type="checkbox"${p.invert?' checked':''}> Invert command</label>`}
        </div>
        <p class="sub">${analog ? 'The low and high raw commands map to the sensor minimum and maximum. Response time sets the first-order lag.' : 'Zero is off. A nonzero command is on. Delay applies after each command change.'}</p>
      </div>
      <button type="button" class="button secondary remove">Remove channel</button>
    </fieldset></details>`;
  const find = s => card.querySelector(s);
  const ref = {point:p,card,title:find('h3'),type:find('.channel-type'),mode:find('.channel-mode'),
    val:find('.channel-value span'),units:find('.channel-value small'),raw:find('.channel-raw'),
    instructions:find('.channel-instruction'),manual:find('.manual'),manualInputs:find('.manual').children,
    slider:find('[data-live=slider]'), number:find('[data-live=number]'), contact:find('[data-live=switch]'),
    quality:find('[data-live=quality]'), override:find('[data-live=override]'), config:find('.channel-config'),
    timeline:find('.timeline-config'), follow:find('.follow-config')};
  ref.quality.checked = p.valid;
  cardRefs.set(p,ref);
  card.addEventListener('input',event => {
    const input = event.target;
    if (input.dataset.key) {
      p[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? numeric(input) : input.value;
      if (input.dataset.key === 'mode') {
        p.override = false;
        ref.override.checked = false;
      }
      if (input.dataset.key === 'quality' && p.quality === null) {
        p.valid = true;
        ref.quality.checked = true;
      }
      invalidateMap();
      if (analog && p.low !== null && p.high !== null && p.low < p.high) {
        p.value = Math.max(p.low,Math.min(p.high,p.value));
      }
      refreshCard(p);
      updateCount();
    } else if (['quality','override'].includes(input.dataset.live)) {
      p[input.dataset.live === 'quality' ? 'valid' : 'override'] = input.checked;
      refreshCard(p);
    } else if (input.dataset.live && numeric(input) !== null && input.validity.valid) {
      p.value = numeric(input);
      refreshCard(p);
    }
  });
  ref.number?.addEventListener('blur', () => {ref.number.value = p.value;});
  ref.contact?.addEventListener('click', () => {p.value = 1 - p.value; refreshCard(p);});
  find('.remove').addEventListener('click', () => {
    points = points.filter(item => item !== p);
    invalidateMap();
    renderCards();
  });
  return card;
}

function refreshCard(p) {
  const r = cardRefs.get(p);
  const current = live.get(p);
  const value = current?.value ?? p.value;
  const good = current?.valid ?? p.valid;
  r.card.classList.toggle('active',!!current);
  r.card.classList.toggle('bad',!good);
  r.title.textContent = p.label.trim() || 'Unnamed sensor';
  r.type.textContent = (p.kind === 'analog' ? 'ANALOG' : 'DIGITAL') + (p.address === null ? ' · UNMAPPED' : ' · REG ' + p.address);
  r.mode.textContent = modes[p.mode];
  r.val.textContent = p.kind === 'analog' ? value.toLocaleString('en-US',{maximumFractionDigits:3}) : (value ? 'Closed' : 'Open');
  r.units.textContent = p.kind === 'analog' ? p.units : '';
  const mapValue = p.address === null ? undefined : readWords[p.address];
  r.raw.textContent = current ? 'RAW ' + current.raw + (current.feedback === null ? '' : ' · CMD ' + current.feedback)
    : mapValue === undefined ? (p.address === null ? 'NO PLC MAP' : 'AWAITING READ') : 'PLC RAW ' + mapValue;
  r.manual.hidden = p.mode !== 'manual' && !p.override;
  r.timeline.hidden = p.mode !== 'timeline';
  r.follow.hidden = p.mode !== 'follow';
  r.quality.parentElement.hidden = p.quality === null;
  r.override.parentElement.hidden = p.mode === 'manual';
  r.override.checked = p.override;
  r.instructions.hidden = p.mode === 'manual';
  r.instructions.textContent = p.mode === 'timeline' ? 'Follows this channel’s timeline from Start test.' : 'Follows the mapped PLC command while the test is running.';
  if (r.number) {
    const usable = p.low !== null && p.high !== null && p.low < p.high;
    const step = p.scale > 0 ? 1 / p.scale : 0.1;
    for (const input of [r.number,r.slider]) {
      input.min = usable ? p.low : '';
      input.max = usable ? p.high : '';
      input.step = input === r.number ? 'any' : step;
      if (input !== document.activeElement || input === r.slider) input.value = p.value;
      input.setAttribute('aria-label',p.label + (input === r.slider ? ' slider' : ' value'));
    }
  } else {
    r.contact.textContent = p.value ? 'Open contact' : 'Close contact';
    r.contact.setAttribute('aria-label',r.contact.textContent + ' · ' + p.label);
    r.contact.setAttribute('aria-pressed',!!p.value);
  }
}

function updateCount() {
  const n = points.filter(p => p.address !== null).length;
  $('mapCount').textContent = points.length + ' channels · ' + n + ' mapped · ' + limit + ' maximum';
}

function renderCards() {
  cardRefs.clear();
  el.cards.replaceChildren(...points.map(channelCard));
  points.forEach(refreshCard);
  updateCount();
  options();
}

function add(kind) {
  if (points.length >= limit) return;
  const p = point([kind,kind === 'analog' ? 'New analog sensor' : 'New digital contact']);
  points.push(p);
  invalidateMap();
  renderCards();
  const ref = cardRefs.get(p);
  ref.config.parentElement.open = true;
  ref.config.querySelector('[data-key=label]').focus();
}

function rows(p) {
  const list = p.profile.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  return list.map((line,i) => {
    const [t,val,shape = 'step',quality = 'good',...extra] = line.split(',').map(v=>v.trim());
    if (!t || !val || !Number.isFinite(Number(t)) || !Number.isFinite(Number(val))
        || !['step','ramp'].includes(shape) || !['good','bad'].includes(quality) || extra.length) {
      throw new Error(p.label + ' row ' + (i + 1) + ' must use time, value, step/ramp, good/bad.');
    }
    return [Number(t),Number(val),shape,quality === 'good'];
  });
}

function exportMap() {
  const data = {version:1,project:el.name.value,host:el.host.value.trim(),unit:numeric(el.unit),
    heartbeat:numeric(el.heartbeat),points};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link = Object.assign(document.createElement('a'),{href:url,download:'hvac-sensor-map.json'});
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function loadPoint(raw) {
  if (!raw || !['analog','digital'].includes(raw.kind)) throw new Error('Each saved channel needs an analog or digital type.');
  const p = point([raw.kind,raw.kind === 'analog' ? 'Analog sensor' : 'Digital contact']);
  for (const key of ['label','units','profile']) {
    if (typeof raw[key] === 'string') p[key] = raw[key].slice(0,key === 'profile' ? 2500 : key === 'units' ? 16 : 64);
  }
  for (const key of ['value','low','high','scale','onDelay','offDelay','lag','sourceLow','sourceHigh','address','quality','source']) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) p[key] = raw[key];
  }
  if (p.kind === 'digital') p.value = p.value === 1 ? 1 : 0;
  else if (p.low < p.high) p.value = Math.max(p.low,Math.min(p.high,p.value));
  if (Object.hasOwn(modes,raw.mode)) p.mode = raw.mode;
  p.valid = p.quality === null || raw.valid !== false;
  p.invert = raw.invert === true;
  return p;
}

async function importMap(file) {
  if (file.size > 65536) throw new Error('This project map is too large.');
  const data = JSON.parse(await file.text());
  if (data?.version !== 1 || !Array.isArray(data.points) || data.points.length > limit) {
    throw new Error('Select a version 1 HVAC sensor map with up to ' + limit + ' channels.');
  }
  const next = data.points.map(loadPoint);
  el.name.value = typeof data.project === 'string' ? data.project.slice(0,80) : 'TM172 HVAC bench';
  el.host.value = typeof data.host === 'string' ? data.host.slice(0,32) : '';
  el.unit.value = Number.isInteger(data.unit) ? data.unit : 1;
  el.heartbeat.value = Number.isInteger(data.heartbeat) ? data.heartbeat : '';
  points = next;
  invalidateMap();
  renderCards();
  message('Map loaded. Verify the register assignments against the PLC project.');
}

async function call(action, data, opts = {}) {
  const response = await fetch('/sensor-api/' + action,{
    method:'POST',headers:{'Content-Type':'application/json','X-Bench-Token':session},
    body:JSON.stringify(data),cache:'no-store',...opts
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The local bridge returned an error.');
  return result;
}

async function readMap() {
  if (busy || run || !session) return;
  invalidateMap();
  busy = true;
  options();
  message('Reading the configured registers without writing…');
  try {
    const selected = points.filter(p=>p.address !== null);
    const config = selected.map(p=>p.mode === 'timeline' ? {...p,frames:rows(p)} : p);
    const result = await call('read',{host:el.host.value.trim(),unit:numeric(el.unit),heartbeat:numeric(el.heartbeat),points:config});
    ticket = result.ticket;
    mapped = selected;
    readWords = result.words;
    points.forEach(refreshCard);
    message('Read ' + Object.keys(readWords).length + ' register words. Confirm each tag in Online Watch before starting.','ok');
  } catch (error) {
    message(error.message,'error');
  } finally {
    busy = false;
    options();
  }
}

function resetLive() {
  run = '';
  clearTimeout(poll);
  live.clear();
  for (const point of points) {
    point.override = false;
    refreshCard(point);
  }
  options();
}

async function tick(id) {
  if (id !== run || stopping) return;
  try {
    const result = await call('exchange',{run:id,controls:mapped.map(p=>({value:p.value,valid:p.valid,override:p.override}))});
    if (id !== run || stopping) return;
    result.points.forEach((value,i)=>live.set(mapped[i],value));
    mapped.forEach(refreshCard);
    $('runBadge').lastElementChild.textContent = 'TEST ACTIVE · ' + result.elapsed.toFixed(1) + 's';
    message('Running · ' + result.points.length + ' points verified · heartbeat ' + result.heartbeat + '.','ok');
    poll = setTimeout(()=>tick(id),750);
  } catch (error) {
    if (id !== run || stopping) return;
    resetLive();
    message('Test interrupted. Read the map before restarting. ' + error.message,'error');
  }
}

async function startTest() {
  if (!ticket || !el.confirm.checked || busy || run) return;
  busy = true;
  options();
  try {
    const result = await call('start',{ticket,confirmed:true});
    ticket = '';
    el.confirm.checked = false;
    run = result.run;
    message('Starting the test. Waiting for the first verified scan…');
    if (document.hidden) await stopTest('Test stopped because the tab lost visibility. Read the map before restarting.');
    else tick(run);
  } catch (error) {
    invalidateMap();
    message(error.message,'error');
  } finally {
    busy = false;
    options();
  }
}

async function stopTest(reason = 'Test stopped. Heartbeat updates ended. Turn off the PLC bench permit when finished.') {
  if (!run || stopping) return;
  const id = run;
  stopping = true;
  clearTimeout(poll);
  options();
  message('Stopping after any in-flight scan…');
  try {
    await call('stop',{run:id},{keepalive:true});
    message(reason);
  } catch {
    message('Bridge unreachable. No further scans will be sent from this tab. Turn off the PLC bench permit.','error');
  } finally {
    stopping = false;
    resetLive();
  }
}

for (const input of [el.host,el.unit,el.heartbeat]) input.addEventListener('input',invalidateMap);
el.confirm.addEventListener('change',options);
el.read.addEventListener('click',readMap);
el.start.addEventListener('click',startTest);
el.stop.addEventListener('click',()=>stopTest());
$('addAnalog').addEventListener('click',()=>add('analog'));
$('addDigital').addEventListener('click',()=>add('digital'));
$('exportMap').addEventListener('click',exportMap);
$('importMap').addEventListener('click',()=>el.file.click());
el.file.addEventListener('change',async()=>{
  if (!el.file.files[0]) return;
  try {await importMap(el.file.files[0]);}
  catch (error) {message('Could not load map. ' + error.message,'error');}
  finally {el.file.value = '';}
});
document.addEventListener('visibilitychange',()=>{
  if (document.hidden) stopTest('Test stopped because the tab lost visibility. Read the map before restarting.');
});
window.addEventListener('pagehide',()=>{
  if (run) call('stop',{run},{keepalive:true}).catch(()=>{});
});

renderCards();
if (location.hostname === '127.0.0.1') {
  try {
    const response = await fetch('/bench-api/session',{cache:'no-store'});
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      session = (await response.json()).token;
      $('downloadKit').hidden = !!session;
      $('bridgeMode').textContent = 'LOCAL BRIDGE';
      $('localHint').textContent = 'Connect your laptop and TM172PDG on an isolated bench network. Enter your project’s register map, then read it before starting a test.';
      message('Local bridge ready. Map your Status Variables and read the project map.');
      options();
    }
  } catch {
    // Static mode is available while the bridge is absent.
  }
}
