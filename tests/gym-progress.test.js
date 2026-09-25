const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function extractFunction(name,source=html){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`No se encontró ${name}`);
  const bodyStart=source.indexOf('{',start);
  let depth=0,quote='',escaped=false;
  for(let i=bodyStart;i<source.length;i++){
    const ch=source[i];
    if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`Función ${name} incompleta`);
}

const FUNCTIONS=['todayStr','gymSetKey','parseRepRange','clampGymNumber','getSetPerformance','normStr','normalizeGymLookup','gymLookupMatches',
  'resolveGymExerciseTarget','getPreviousExerciseLog','progressionForLogs','exerciseProgression','ensureGymCycle','getCycleStatus',
  'gymNumberInput','gymSetSummary','exerciseLoadHistory','programWeekInfo','estimatedStrength','progressHasRir','progressKg','progressTimed','bestProgressSet','compareSetToLast','isBilbo','bilboNextWeight','bilboFeedback','exerciseProgressFeedback','buildGymProgressContext','gymDayKey','findGymLogTarget','suggestedSetValues',
  'cleanupSupersetGroups','normalizeSupersetAssignments','supersetMeta','plural','prepareMovementExercises','normalizeAIRoutinePayload','ejecutarAccion'];

const BILBO_CONST=html.match(/const BILBO_MIN_REPS=[^;]+;/)[0].replace('const','var')+'\n';
function routinesFixture(){
  return [{id:'r1',name:'Hipertrofia',days:[
    {id:'d1',label:'Empuje',exercises:[
      {name:'Press de banca',muscle:'Pecho',series:3,reps:'8-10'},
      {name:'Tríceps en polea',muscle:'Tríceps',series:2,reps:'10-12'}
    ]},
    {id:'d2',label:'Full body',exercises:[
      {name:'Sentadilla',muscle:'Cuádriceps',series:3,reps:'6-8'},
      {name:'Press de banca',muscle:'Pecho',series:3,reps:'8-10'}
    ]}
  ]}];
}

function makeContext({setPerformance={},gymWeekLog=[],activeWeekId='w3'}={}){
  let n=0;
  const db={};
  const context={
    routines:routinesFixture(),activeRid:'r1',activeWeekId,gymWeekLog,setPerformance,
    sets:{},weights:{},gymCycles:{},gymProfile:{goal:'hipertrofia',loadIncrement:2.5},
    uid:()=>String(++n),updateWeekLogFromCurrent:()=>{},db,_exerciseMediaData:null,
    S:{g:(key,fallback)=>db[key]??fallback,s:(key,value)=>{db[key]=structuredClone(value);return true;}}
  };
  db.rt2=structuredClone(context.routines);
  vm.createContext(context);
  vm.runInContext(BILBO_CONST+FUNCTIONS.map(name=>extractFunction(name)).join('\n'),context);
  return context;
}

test('[T2] registrar_serie sin número anota la primera serie pendiente y no pisa la serie 1',()=>{
  const ctx=makeContext({setPerformance:{'r1|d1|0|0':{weight:60,reps:10,rir:2,done:true,updatedAt:Date.now()}}});
  const result=ctx.ejecutarAccion({op:'registrar_serie',ejercicio:'press de banca',peso:'62,5 kg',reps:'8 reps',rir:2});
  assert.match(result,/Serie 2 de "Press de banca" anotada · 62.5kg × 8 · RIR 2/);
  assert.equal(ctx.setPerformance['r1|d1|0|0'].weight,60);
  assert.equal(ctx.setPerformance['r1|d1|0|1'].weight,62.5);
  assert.equal(ctx.sets['r1|d1|0|1'],true);
});

test('[T2] registrar_serie anota varias series de una vez y avisa las que no entran',()=>{
  const ctx=makeContext();
  const result=ctx.ejecutarAccion({op:'registrar_serie',ejercicio:'Triceps en polea',series:[{peso:25,reps:12,rir:2},{peso:25,reps:11,rir:1},{peso:25,reps:9,rir:0}]});
  assert.match(result,/Anoté 2 series de "Tríceps en polea": 25kg×12@2, 25kg×11@1 · 1 no entró/);
  assert.equal(ctx.setPerformance['r1|d1|1|1'].reps,11);
  assert.equal(ctx.setPerformance['r1|d1|1|2'],undefined);
});

test('[T2] si el ejercicio está en varios días, registra en el día que se entrena hoy',()=>{
  const ctx=makeContext({setPerformance:{'r1|d2|0|0':{weight:100,reps:6,rir:2,done:true,updatedAt:Date.now()}}});
  const result=ctx.ejecutarAccion({op:'registrar_serie',ejercicio:'Press de banca',peso:70,reps:8,rir:2});
  assert.match(result,/Serie 1/);
  assert.equal(ctx.setPerformance['r1|d2|1|0'].weight,70);
  assert.equal(ctx.setPerformance['r1|d1|0|0'],undefined);
});

test('[T2] registrar_serie rechaza pedidos sin ejercicio o sin series pendientes',()=>{
  const ctx=makeContext();
  assert.match(ctx.ejecutarAccion({op:'registrar_serie',peso:60,reps:8}),/^Falta indicar el ejercicio/);
  ctx.ejecutarAccion({op:'completar_ejercicio',ejercicio:'Tríceps en polea'});
  assert.match(ctx.ejecutarAccion({op:'registrar_serie',ejercicio:'Tríceps en polea',peso:30,reps:10}),/^No quedan series pendientes/);
  // Con número explícito se puede corregir una serie ya hecha.
  assert.match(ctx.ejecutarAccion({op:'registrar_serie',ejercicio:'Tríceps en polea',serie:2,peso:30,reps:10,rir:2}),/Serie 2/);
});

test('[T2] el contexto de progresión le da al Coach ciclo, cargas, tendencia y sugerencia',()=>{
  const week=(id,createdAt,weekStart,setLogs)=>({id,routineId:'r1',createdAt,weekStart,days:{d1:{label:'Empuje',exercises:[{name:'Press de banca',setLogs}]}}});
  const set=(weight,reps,rir)=>({weight,reps,rir,done:true});
  const ctx=makeContext({activeWeekId:'w3',gymWeekLog:[
    week('w1',1,'2026-09-07',[set(55,10,2),set(55,10,2),set(55,9,2)]),
    week('w2',2,'2026-09-14',[set(57.5,10,2),set(57.5,10,2),set(57.5,10,1)]),
    week('w3',3,'2026-09-21',[])
  ]});
  const text=ctx.buildGymProgressContext();
  assert.match(text,/bloque 1, semana 3 de 6 \(Acumulación\)/);
  assert.match(text,/Press de banca 3×8-10 \| anterior \(2026-09-14\): 57.5kg×10@2, 57.5kg×10@2, 57.5kg×10@1/);
  assert.match(text,/tendencia kg: 55→57.5/);
  assert.match(text,/la app sugiere: hoy subir a 60 kg/);
  assert.match(text,/Sentadilla 3×6-8 \| la app sugiere: faltan datos/);
});

test('[T2] el Coach, el chat y la voz reciben la progresión del gym',()=>{
  assert.match(extractFunction('buildAppContext'),/buildGymProgressContext\(1800\)/);
  assert.equal((html.match(/const gymWeights='\\n'\+buildGymProgressContext\(\);/g)||[]).length,2);
  assert.match(extractFunction('aiActionContract'),/"series":\[\{"peso":60/);
});

test('[T2] "Biserie" o "superset" sin letra cuenta como sí y arma el par consecutivo',()=>{
  const ctx=makeContext();
  const exercises=[{name:'Curl',superset:'Biserie'},{name:'Tríceps',biserie:'superset'},{name:'Plancha'}];
  ctx.normalizeSupersetAssignments(exercises);
  const day={exercises};
  assert.deepEqual(exercises.map((_,i)=>{const m=ctx.supersetMeta(day,i);return m&&m.label+m.position;}),['A1','A2',null]);
});

test('[T2] una semana salteada no borra la última carga ni la sugerencia de progresión',()=>{
  const set=(weight,reps,rir)=>({weight,reps,rir,done:true});
  const ctx=makeContext({activeWeekId:'w3',gymWeekLog:[
    {id:'w1',routineId:'r1',createdAt:1,weekStart:'2026-09-07',days:{d1:{exercises:[{name:'Press de banca',setLogs:[set(60,10,2),set(60,10,2),set(60,10,2)]}]}}},
    {id:'w2',routineId:'r1',createdAt:2,weekStart:'2026-09-14',days:{d1:{exercises:[{name:'Press de banca',setLogs:[]}]}}},
    {id:'w3',routineId:'r1',createdAt:3,weekStart:'2026-09-21',days:{d1:{exercises:[{name:'Press de banca',setLogs:[]}]}}}
  ]});
  const previous=ctx.getPreviousExerciseLog('r1','d1','Press de banca');
  assert.equal(previous.setLogs[0].weight,60);
  const ex=ctx.routines[0].days[0].exercises[0];
  const advice=ctx.exerciseProgression('r1','d1',0,ex);
  assert.equal(advice.kind,'up');
  const plan=ctx.suggestedSetValues(ex,previous,advice,0,false);
  assert.deepEqual({weight:plan.weight,reps:plan.reps,source:plan.source},{weight:62.5,reps:8,source:'progression'});
});

test('[T2] plural: "1 día", "1 serie", "2 días"',()=>{
  const ctx=makeContext();
  assert.equal(ctx.plural(1,'día','días'),'1 día');
  assert.equal(ctx.plural(2,'día','días'),'2 días');
  assert.equal(ctx.plural(0,'serie','series'),'0 series');
  const db={rt2:[]};ctx.S={g:(k,f)=>db[k]??f,s:(k,v)=>{db[k]=structuredClone(v);}};
  const msg=ctx.ejecutarAccion({op:'crear_rutina',name:'Full',days:[{label:'Full',exercises:[{name:'Sentadilla',muscle:'Cuádriceps',series:3,reps:'8'}]}]});
  assert.match(msg,/creada con 1 día y 1 ejercicio$/);
});

test('[T2b] el encabezado del Gym no repite el anillo y todos los títulos se ajustan al ancho',()=>{
  const header=html.slice(html.indexOf('<div class="pg on" id="pg-gym">'),html.indexOf('<div class="tabs tab-line">'));
  assert.doesNotMatch(header,/id="wring"/);
  assert.doesNotMatch(header,/api-pill/);
  assert.match(extractFunction('page'),/fitHeaderTitle\(\);/);
  assert.match(extractFunction('fitHeaderTitle'),/scrollWidth>t\.clientWidth/);
});
