export const profiles = {
  TM171: {tool: 'EcoStruxure Machine Expert – HVAC', focus: 'Practice a compact I/O map: scale the temperature inputs, then trace enable, proof and alarm contacts through the sequence.', url: 'https://www.se.com/in/en/download/document/EIO0000003412/'},
  TM172: {tool: 'EcoStruxure Machine Expert – HVAC', focus: 'Trace equipment commands and feedback through an HVAC equipment state machine. Compare the live permissives with your own project tags.', url: 'https://www.se.com/in/en/download/document/EIO0000003412/'},
  TM173: {tool: 'EcoStruxure Machine Expert – HVAC', focus: 'Use the simulated plant to test equipment interlocks and alarm recovery before mapping signals to the I/O and options of your specific controller.', url: 'https://www.se.com/us/en/download/document/DIA3ED2151001EN/'},
  TM262: {tool: 'EcoStruxure Machine Expert · Logic Builder', focus: 'Map the sequence into a cyclic task and equipment function blocks. Compare the lab timers and latches with your own Structured Text implementation.', url: 'https://www.se.com/us/en/download/document/EIO0000003651/'}
};

export const scenarios = {
  cooling: {plant: 'ahu', name: 'Mechanical cooling', brief: 'Start with warm outdoor air and watch the fan prove before the cooling valve modulates to supply temperature.'},
  economizer: {plant: 'ahu', name: 'Economizer changeover', setup: {outside: 51}, brief: 'Start with cool outdoor air. Once the fan proves, raise outdoor air above 65 °F to watch the damper return to minimum and mechanical cooling take over.'},
  fanFailure: {plant: 'ahu', name: 'Fan proof failure', setup: {proof: false}, brief: 'Start with fan feedback unavailable. Watch the 8 s prove timeout, acknowledge the alarm, restore feedback, then reset the latch.'},
  freeze: {plant: 'ahu', name: 'Freeze-stat trip', brief: 'Run until the fan is proven, then open the freeze-stat circuit in Digital inputs. Observe the outputs, restore the circuit, and reset.'},
  pumping: {plant: 'pump', name: 'Hydronic lead / lag', setup: {load: 82}, brief: 'Run the lead pump into a high load. Watch the 12 s lag stage timer. Reduce load and allow the 15 s destage timer to complete.'},
  failover: {plant: 'pump', name: 'Pump proof failover', setup: {load: 42, proofA: false}, brief: 'Start with Pump A feedback unavailable. After 8 s the fault latches and Pump B takes over. Restore proof and reset to make Pump A available again. Cycle the enable to reselect it as lead.'}
};

export const points = {
  ahu: {
    analog: [
      ['outside','AI-01','Outdoor air','°F',10,110,1],
      ['returnAir','AI-02','Return air','°F',45,95,1],
      ['pv','AI-03','Supply air','°F',20,100,.1],
      ['sp','SP-01','Supply air target','°F',45,70,.5]
    ],
    digital: [
      ['enable','DI-01','Unit enable','Enabled','Disabled'],
      ['demand','DI-02','Occupancy request','Occupied','Unoccupied'],
      ['smoke','DI-03','Smoke circuit','Normal','Trip'],
      ['freeze','DI-04','Freeze-stat circuit','Normal','Trip'],
      ['drive','DI-05','Fan VFD healthy','Healthy','Fault'],
      ['proof','DI-06','Fan proof available','Available','Missing']
    ],
    trend: [['pv','Supply air','°F','#56d9f2'],['sp','SAT target','°F','#a6a9ff'],['damper','OA damper','%','#5dddb2'],['valve','Cooling valve','%','#f6b969']]
  },
  pump: {
    analog: [
      ['load','SIM-01','Loop load','%',0,100,1],
      ['pv','AI-01','Differential pressure','psi',0,40,.1],
      ['sp','SP-01','DP target','psi',8,30,.5]
    ],
    digital: [
      ['enable','DI-01','Plant enable','Enabled','Disabled'],
      ['demand','DI-02','Loop demand','Requested','Idle'],
      ['stop','DI-03','E-stop circuit','Normal','Trip'],
      ['driveA','DI-04','Pump A VFD healthy','Healthy','Fault'],
      ['driveB','DI-05','Pump B VFD healthy','Healthy','Fault'],
      ['proofA','DI-06','Pump A proof available','Available','Missing'],
      ['proofB','DI-07','Pump B proof available','Available','Missing']
    ],
    trend: [['pv','Loop DP','psi','#56d9f2'],['sp','DP target','psi','#a6a9ff'],['speedA','Pump A speed','%','#5dddb2'],['speedB','Pump B speed','%','#f6b969']]
  }
};

export const sequence = {
  ahu: [
    ['off','Standby','Wait for unit enable, occupied request and a healthy safety chain.'],
    ['prestart','Pre-open damper','Command 20% outdoor air for 3 s before starting the fan.'],
    ['proving','Prove supply fan','Start the fan at 65%. Simulated proof arrives after 2 s when available. Alarm after 8 s without proof.'],
    ['economizer','Economizer cooling','With proof established, modulate outdoor air when it is 40–65 °F and at least 2 °F below return air. The valve assists above target +2 °F at 85% damper or higher.'],
    ['mechanical','Mechanical cooling','With proof established and economizer unavailable, hold 20% outdoor air and modulate the cooling valve to supply air target.'],
    ['lockout','Safety lockout','Smoke, freeze-stat and VFD trips close damper and valve and stop the fan. Missing running proof trips after 3 s. Restore the input and reset the latch.']
  ],
  pump: [
    ['off','Standby','Wait for plant enable, loop demand and a healthy E-stop circuit.'],
    ['proving','Prove the lead','Prefer Pump A. Simulated proof arrives after 2 s when available. Without proof after 8 s, latch that pump fault and select the other pump. Running proof loss trips after 3 s.'],
    ['lead','Lead pressure control','With lead proof, modulate pump speed to maintain differential pressure. A healthy standby can take over if the lead trips.'],
    ['staging','Stage the lag','Start and prove the standby after 12 s below target −2 psi with lead speed at or above 85%.'],
    ['dual','Dual pump control','Share the speed demand. Stop the lag after 15 s at or above target −2 psi and at 44% speed or lower on both pumps.'],
    ['lockout','Safety lockout','An E-stop trips both pumps. When neither pump is available, the plant waits for at least one fault to be restored and reset.']
  ]
};

const ahuInputs = {outside:88,returnAir:76,pv:71,sp:55,enable:true,demand:true,smoke:true,freeze:true,drive:true,proof:true};
const pumpInputs = {load:42,pv:0,sp:18,enable:true,demand:true,stop:true,driveA:true,driveB:true,proofA:true,proofB:true};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = n => Math.round(n * 10) / 10;
const alarmNames = {
  smoke: 'Smoke circuit trip', freeze: 'Freeze-stat trip', drive: 'Fan VFD fault', proof: 'Supply fan proof failure',
  stop: 'E-stop circuit trip', driveA: 'Pump A VFD fault', driveB: 'Pump B VFD fault', proofA: 'Pump A proof failure', proofB: 'Pump B proof failure'
};

export function createLab(id = 'cooling') {
  const {plant, setup} = scenarios[id];
  const s = {
    id, plant, inputs:{...(plant === 'ahu' ? ahuInputs : pumpInputs), ...setup}, manual:false, time:0, stage:'off',
    stageTime:0, alarms:{}, log:[], history:[], outputs:{fan:0, damper:0, valve:0, speedA:0, speedB:0},
    fan:{since:0, lost:0, proven:false}, pumps:{A:{since:0,lost:0,proven:false},B:{since:0,lost:0,proven:false}},
    integral:0, ecoIntegral:0, lead:null, lag:null, stageDelay:0, destageDelay:0
  };
  event(s,'session',scenarios[id].name + ' loaded');
  sample(s);
  return s;
}

function event(s, type, text) {
  s.log.unshift({time:s.time,type,text});
  if (s.log.length > 100) s.log.pop();
}

function stage(s, next) {
  if (s.stage === next) return;
  s.stage = next;
  s.stageTime = s.time;
  event(s,'state',sequence[s.plant].find(([id]) => id === next)[1]);
}

function trip(s, id) {
  if (s.alarms[id]) return;
  s.alarms[id] = {id, name:alarmNames[id], time:s.time, ack:false};
  event(s,'alarm',alarmNames[id]);
}

export function acknowledge(s) {
  for (const alarm of Object.values(s.alarms)) {
    if (alarm.ack) continue;
    alarm.ack = true;
    event(s,'ack','Acknowledged · ' + alarm.name);
  }
}

export function resetAlarms(s) {
  for (const [id, alarm] of Object.entries(s.alarms)) {
    if (!s.inputs[id]) continue;
    delete s.alarms[id];
    event(s,'reset','Reset · ' + alarm.name);
  }
}

function feedback(s, state, input, previousCommand) {
  if (!previousCommand) {
    state.since = 0;
    state.lost = 0;
    state.proven = false;
    return false;
  }
  state.since++;
  if (s.inputs[input] && state.since >= 2) {
    state.proven = true;
    state.lost = 0;
    return true;
  }
  if (state.proven) state.lost++;
  if (state.lost >= 3 || (!state.proven && state.since >= 8)) trip(s,input);
  return false;
}

export const economizerAvailable = s => s.inputs.outside >= 40 && s.inputs.outside <= 65 && s.inputs.outside <= s.inputs.returnAir - 2;

function ahu(s) {
  const i = s.inputs;
  const prev = s.outputs.fan;
  for (const key of ['smoke','freeze','drive']) if (!i[key]) trip(s,key);
  const eligible = i.enable && i.demand && !Object.keys(s.alarms).length;
  const proven = feedback(s,s.fan,'proof',eligible ? prev : 0);
  let fan = 0, damper = 0, valve = 0;
  if (Object.keys(s.alarms).length || !i.enable || !i.demand) {
    stage(s,Object.keys(s.alarms).length ? 'lockout' : 'off');
    s.integral = 0;
    s.ecoIntegral = 0;
    if (prev) feedback(s,s.fan,'proof',0);
  } else {
    if (s.stage === 'off' || s.stage === 'lockout') stage(s,'prestart');
    damper = 20;
    if (s.stage === 'prestart' && s.time - s.stageTime >= 3) stage(s,'proving');
    if (s.stage !== 'prestart') fan = 65;
    if (fan && !proven) stage(s,'proving');
    if (fan && proven) {
      const error = i.pv - i.sp;
      if (economizerAvailable(s)) {
        stage(s,'economizer');
        s.ecoIntegral = clamp(s.ecoIntegral + error * .22,0,80);
        damper = clamp(20 + error * 8 + s.ecoIntegral,20,100);
      } else {
        stage(s,'mechanical');
        s.ecoIntegral = 0;
      }
      if (s.stage === 'mechanical' || (damper >= 85 && error > 2)) {
        s.integral = clamp(s.integral + error * .32,0,100);
        valve = clamp(error * 8 + s.integral,0,100);
      } else {
        s.integral = 0;
      }
    }
  }
  s.outputs = {fan,damper:round(damper),valve:round(valve),speedA:0,speedB:0};
  if (!s.manual) {
    const mixed = i.returnAir + (i.outside - i.returnAir) * damper / 100;
    const target = fan ? mixed - 34 * valve / 100 : i.returnAir;
    i.pv += (target - i.pv) * (fan ? .10 : .035);
  }
}

function pump(s) {
  const i = s.inputs;
  for (const key of ['stop','driveA','driveB']) if (!i[key]) trip(s,key);
  const demand = i.enable && i.demand && !s.alarms.stop;
  const available = name => !s.alarms['drive' + name] && !s.alarms['proof' + name];
  const proof = {};
  for (const name of ['A','B']) {
    proof[name] = feedback(s,s.pumps[name],'proof' + name,demand && available(name) ? s.outputs['speed' + name] : 0);
    if (!available(name)) feedback(s,s.pumps[name],'proof' + name,0);
  }
  const speed = {A:0,B:0};
  if (!demand || (!available('A') && !available('B'))) {
    s.lead = null;
    s.lag = null;
    s.integral = s.stageDelay = s.destageDelay = 0;
    stage(s,s.alarms.stop || (!available('A') && !available('B')) ? 'lockout' : 'off');
  } else {
    if (!s.lead || !available(s.lead)) {
      s.lead = available('A') ? 'A' : 'B';
      s.lag = null;
      s.stageDelay = s.destageDelay = 0;
      event(s,'state','Pump ' + s.lead + ' selected as lead');
    }
    const alternate = s.lead === 'A' ? 'B' : 'A';
    if (s.lag && !available(s.lag)) s.lag = null;
    const error = i.sp - i.pv;
    const bias = 35 + i.load * .55 + (i.sp - 18) * 2.5;
    if (proof[s.lead]) s.integral = clamp(s.integral + error * .16,-35,50);
    const demandSpeed = clamp(bias + error * 2.6 + s.integral,25,150);
    const leadSpeed = proof[s.lead] ? clamp(demandSpeed,30,100) : 40;
    if (!s.lag && available(alternate) && proof[s.lead] && error > 2 && leadSpeed >= 85) {
      s.stageDelay++;
      if (s.stageDelay >= 12) s.lag = alternate;
    } else {
      s.stageDelay = 0;
    }
    if (s.lag && proof[s.lag] && error <= 2 && demandSpeed / 2 <= 44) {
      s.destageDelay++;
      if (s.destageDelay >= 15) {
        s.lag = null;
        s.destageDelay = 0;
      }
    } else {
      s.destageDelay = 0;
    }
    speed[s.lead] = s.lag && proof[s.lag] && proof[s.lead] ? clamp(demandSpeed / 2,30,100) : leadSpeed;
    if (s.lag) speed[s.lag] = proof[s.lag] && proof[s.lead] ? speed[s.lead] : 40;
    if (!proof[s.lead]) stage(s,'proving');
    else if (s.lag && proof[s.lag]) stage(s,'dual');
    else if (s.lag || s.stageDelay) stage(s,'staging');
    else stage(s,'lead');
  }
  s.outputs = {fan:0,damper:0,valve:0,speedA:round(speed.A),speedB:round(speed.B)};
  if (!s.manual) {
    const effective = (i.proofA ? speed.A : 0) + (i.proofB ? speed.B : 0);
    const target = clamp(effective * .27 - i.load * .21,0,40);
    i.pv += (target - i.pv) * .12;
  }
}

function sample(s) {
  s.history.push({time:s.time,pv:round(s.inputs.pv),sp:s.inputs.sp,...s.outputs});
  if (s.history.length > 121) s.history.shift();
}

export function scan(s) {
  s.time++;
  if (s.plant === 'ahu') ahu(s);
  else pump(s);
  sample(s);
}

export function setInput(s,key,value) {
  if (typeof s.inputs[key] === 'boolean') {
    s.inputs[key] = !!value;
    return;
  }
  const point = points[s.plant].analog.find(([tag]) => tag === key);
  if (point && Number.isFinite(value) && (key !== 'pv' || s.manual)) {
    s.inputs[key] = clamp(value,point[4],point[5]);
  }
}

export function permissives(s) {
  const i = s.inputs;
  const basic = [['Run enable',i.enable],['Demand request',i.demand]];
  if (s.plant === 'ahu') return [...basic,['Smoke circuit normal',i.smoke],['Freeze-stat normal',i.freeze],['Fan VFD healthy',i.drive],['No latched trip',!Object.keys(s.alarms).length],['Fan proof made',!!s.outputs.fan && s.fan.since >= 2 && i.proof]];
  const ready = name => i['drive' + name] && !s.alarms['drive' + name] && !s.alarms['proof' + name];
  return [...basic,['E-stop circuit normal',i.stop],['No E-stop latch',!s.alarms.stop],['Pump A available',ready('A')],['Pump B available',ready('B')],['Lead proof made',!!s.lead && !!s.outputs['speed' + s.lead] && s.pumps[s.lead].since >= 2 && i['proof' + s.lead]]];
}
