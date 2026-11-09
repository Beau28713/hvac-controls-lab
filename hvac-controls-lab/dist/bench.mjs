const $ = id => document.getElementById(id);
const host = $('plcHost'), unit = $('plcUnit'), register = $('plcRegister'), units = $('plcUnits');
const temperature = $('benchTemp'), slider = $('benchSlider');
const arm = $('benchArm'), send = $('benchSend'), fields = $('benchFields');
const status = $('benchResult');
let session = '', ticket = '', busy = false;

function message(text, tone = '') {
  status.textContent = text;
  status.dataset.tone = tone;
}

function updateActions() {
  fields.disabled = busy;
  arm.disabled = !ticket;
  send.disabled = busy || !ticket || !arm.checked;
}

function updatePreview() {
  const address = register.valueAsNumber;
  $('benchAddressHint').textContent = register.validity.valid && Number.isInteger(address)
    ? 'Project address ' + address + ' → zero-based wire offset ' + (address - 1) + '. One holding register.'
    : 'Use the Address column from Machine Expert – HVAC. The bridge subtracts one to obtain the Modbus offset.';
  const temp = temperature.valueAsNumber;
  if (!temperature.validity.valid || !Number.isFinite(temp)) {
    $('benchEncoding').textContent = 'Enter a temperature from −40 to 180 °F in 0.1 °F increments.';
    return;
  }
  const scaled = (units.value === 'C' ? (temp - 32) * 5 / 9 : temp) * 10;
  const raw = Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-9);
  $('benchEncoding').textContent = 'Will send ' + raw + ' as a signed INT, equivalent to ' + (raw / 10).toFixed(1) + ' °' + units.value + ' in the PLC.';
}

async function request(action, data) {
  const response = await fetch('/bench-api/' + action, {
    method: 'POST',
    headers: {'Content-Type':'application/json','X-Bench-Token':session},
    body: JSON.stringify(data),
    cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The local bridge returned an error.');
  return result;
}

function rawText(result) {
  return result.signed + ' (0x' + result.word.toString(16).padStart(4,'0').toUpperCase() + ') · ' + result.temperature.toFixed(1) + ' °' + result.unit;
}

function disarm() {
  ticket = '';
  arm.checked = false;
  updateActions();
}

for (const el of [host,unit,register,units]) {
  el.addEventListener('input', () => {
    disarm();
    updatePreview();
    message('Read the register again after changing the PLC target.');
  });
}

temperature.addEventListener('input', () => {
  if (temperature.validity.valid) slider.value = temperature.value;
  updatePreview();
});
slider.addEventListener('input', () => {
  temperature.value = slider.value;
  updatePreview();
});
arm.addEventListener('change',updateActions);

$('benchRead').addEventListener('click',async () => {
  if (busy || !session) return;
  for (const el of [host,unit,register]) if (!el.reportValidity()) return;
  disarm();
  busy = true;
  updateActions();
  message('Reading one holding register…');
  try {
    const result = await request('read',{host:host.value.trim(),unit:unit.valueAsNumber,address:register.valueAsNumber,engineeringUnit:units.value});
    ticket = result.ticket;
    message('Read succeeded · ' + rawText(result) + '. Verify this is SimAI1_Tenths in Online Watch before enabling writes.','ok');
  } catch (error) {
    message(error.message,'error');
  } finally {
    busy = false;
    updateActions();
  }
});

$('benchForm').addEventListener('submit',async event => {
  event.preventDefault();
  if (busy || !ticket || !arm.checked) return;
  busy = true;
  updateActions();
  message('Sending one temperature and checking readback…');
  try {
    const result = await request('send',{ticket,temperatureF:temperature.valueAsNumber});
    message('Write verified · ' + rawText(result) + '. Check AI1_Used in Online Watch with the PLC bench permit enabled.','ok');
  } catch (error) {
    disarm();
    message(error.message === 'Failed to fetch' ? 'Bridge connection lost. Read the register before sending again.' : error.message,'error');
  } finally {
    busy = false;
    updateActions();
  }
});

if (location.hostname === '127.0.0.1') {
  try {
    const response = await fetch('/bench-api/session',{cache:'no-store'});
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      session = (await response.json()).token;
      if (session) {
        $('benchInstall').hidden = true;
        $('benchForm').hidden = false;
        $('benchBadge').classList.remove('idle');
        $('benchBadge').lastChild.textContent = ' LOCAL BRIDGE READY';
        $('accessLabel').lastElementChild.textContent = 'Local bench';
        updatePreview();
      }
    }
  } catch {
    // The static preview and hosted lab use the kit setup view.
  }
}
