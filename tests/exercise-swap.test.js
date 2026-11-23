const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mediaJs=fs.readFileSync(path.join(root,'exercise-media.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'exercise-media.json'),'utf8'));

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
const MC=html.match(/const MC=(\{[^}]*\})/)[1];

function makeContext(){
  const saved={};
  const ctx={
    saved,weekUpdates:0,
    S:{s:(k,v)=>{saved[k]=JSON.parse(JSON.stringify(v));return true;}},
    routines:[{id:'r1',name:'Salida',days:[{id:'d1',label:'Torso',exercises:[
      {name:'Press banca plano con barra',muscle:'Pecho',series:3,reps:'4-6'},
      {name:'Remo con mancuerna un brazo',muscle:'Espalda',series:3,reps:'10-12',rir:'1'},
      {name:'Curl con barra recta',muscle:'Bíceps',series:3,reps:'8-12'}
    ]}]}],
    sets:{'r1|d1|0|0':true,'r1|d1|1|0':true,'r1|d1|1|1':true,'r1|d1|2|0':true},
    setPerformance:{'r1|d1|1|0':{weight:40,reps:10,rir:1,done:true},'r1|d1|2|0':{weight:30,reps:9,rir:1,done:true}},
    weights:{'r1|d1|1':'40','r1|d1|1|0':'40','r1|d1|2':'30'}
  };
  vm.createContext(ctx);
  vm.runInContext([
    'const MC='+MC+';',
    'function updateWeekLogFromCurrent(){weekUpdates++;}',
    extractFunction('normStr'),
    extractFunction('getRoutineExercise'),
    extractFunction('clearExerciseSessionData'),
    extractFunction('replaceRoutineExercise'),
    extractFunction('normExerciseMediaName',mediaJs),
    extractFunction('exerciseMediaScore',mediaJs),
    extractFunction('isCuratedMovement',mediaJs),
    extractFunction('findExerciseMovement',mediaJs),
    extractFunction('exerciseMovementMuscle',mediaJs),
    extractFunction('exerciseMovementName',mediaJs),
    extractFunction('pickEquipGroup'),
    extractFunction('exPickRanked')
  ].join('\n'),ctx);
  return ctx;
}

test('cambiar un ejercicio conserva series/reps/RIR y no le pasa kilos ni series hechas al nuevo',()=>{
  const ctx=makeContext();
  const res=ctx.replaceRoutineExercise('r1','d1',1,{name:'Remo en T en máquina',muscle:'Espalda',mediaId:'0606'});
  assert.equal(res.error,undefined);
  const ex=ctx.routines[0].days[0].exercises[1];
  assert.equal(ex.name,'Remo en T en máquina');
  assert.equal(ex.series,3);assert.equal(ex.reps,'10-12');assert.equal(ex.rir,'1');
  assert.equal(ex.mediaId,'0606');
  assert.deepEqual(JSON.parse(JSON.stringify(ex.swappedFrom)),{name:'Remo con mancuerna un brazo',muscle:'Espalda',mediaId:null});
  assert.equal(ctx.sets['r1|d1|1|0'],undefined);
  assert.equal(ctx.setPerformance['r1|d1|1|0'],undefined);
  assert.equal(ctx.weights['r1|d1|1'],undefined);
  // los otros ejercicios no se tocan
  assert.equal(ctx.sets['r1|d1|0|0'],true);
  assert.equal(ctx.setPerformance['r1|d1|2|0'].weight,30);
  assert.equal(ctx.weights['r1|d1|2'],'30');
  assert.ok(ctx.saved.rt2&&ctx.saved.sets2&&ctx.saved.setPerf3&&ctx.saved.wts2);
  assert.equal(ctx.weekUpdates,1);
});

test('se puede elegir otro grupo muscular o un nombre propio, y volver al original',()=>{
  const ctx=makeContext();
  ctx.replaceRoutineExercise('r1','d1',1,{name:'Mi remo raro',muscle:'Hombros'});
  let ex=ctx.routines[0].days[0].exercises[1];
  assert.equal(ex.muscle,'Hombros');assert.equal(ex.mediaId,undefined);
  ctx.replaceRoutineExercise('r1','d1',1,{name:'Otro remo',muscle:'Espalda'});
  assert.equal(ex.swappedFrom.name,'Remo con mancuerna un brazo','guarda el original, no el intermedio');
  ctx.replaceRoutineExercise('r1','d1',1,ex.swappedFrom,{undo:true});
  ex=ctx.routines[0].days[0].exercises[1];
  assert.equal(ex.name,'Remo con mancuerna un brazo');assert.equal(ex.swappedFrom,undefined);
});

test('rechaza nombres vacíos o largos y músculos desconocidos quedan como estaban',()=>{
  const ctx=makeContext();
  assert.ok(ctx.replaceRoutineExercise('r1','d1',1,{name:'  '}).error);
  assert.ok(ctx.replaceRoutineExercise('r1','d1',1,{name:'x'.repeat(81)}).error);
  assert.ok(ctx.replaceRoutineExercise('r1','d1',9,{name:'Remo'}).error);
  ctx.replaceRoutineExercise('r1','d1',1,{name:'Remo Pendlay con barra',muscle:'Glúteo'});
  assert.equal(ctx.routines[0].days[0].exercises[1].muscle,'Espalda');
});

test('el selector filtra por músculo y búsqueda, saca el ejercicio actual y pone primero el mismo patrón',()=>{
  const ctx=makeContext();
  const base=ctx.routines[0].days[0].exercises[1];
  const baseMv=ctx.findExerciseMovement(base,catalog);
  assert.ok(baseMv&&baseMv.curated,'el remo de la rutina sigue usando su animación curada');
  const items=catalog.exercises.map(item=>({id:item.id,name:ctx.exerciseMovementName(item),en:item.name,muscle:ctx.exerciseMovementMuscle(item),equip:item.equipment,group:ctx.pickEquipGroup(item.equipment),target:item.target,curated:ctx.isCuratedMovement(item),key:ctx.normExerciseMediaName([ctx.exerciseMovementName(item),item.name,...(item.aliases||[])].join(' '))}));
  ctx.window={_exPick:{base,baseMv:{id:baseMv.id,target:baseMv.target,group:ctx.pickEquipGroup(baseMv.equipment)},items,q:'remo',muscle:'Espalda',group:'all'}};
  vm.runInContext('var window=this.window;',ctx);
  const list=ctx.exPickRanked();
  assert.ok(list.length>=15,'hay muchas variantes de remo');
  assert.ok(list.every(it=>it.muscle==='Espalda'));
  assert.ok(!list.some(it=>it.id===baseMv.id||ctx.normStr(it.name)===ctx.normStr(base.name)),'no ofrece el mismo ejercicio');
  assert.equal(list[0].target,baseMv.target);
  ctx.window._exPick.group='dumbbell';
  assert.ok(ctx.exPickRanked().every(it=>it.equip==='dumbbell'));
});

test('las rutinas viejas no cambian de animación con el catálogo ampliado',()=>{
  const ctx=makeContext();
  const programs=JSON.parse(fs.readFileSync(path.join(root,'programas.json'),'utf8')).programs;
  const names=[...new Set(programs.flatMap(p=>p.days.flatMap(d=>d.exercises.map(e=>e.name))))];
  const curated=catalog.exercises.filter(e=>e.curated);
  const curatedCatalog={exercises:curated};
  for(const name of names){
    const before=ctx.findExerciseMovement({name},curatedCatalog);
    if(!before)continue;
    const after=ctx.findExerciseMovement({name},catalog);
    // Sólo puede cambiar si ahora existe un movimiento con ese mismo nombre exacto (más preciso).
    const exact=after&&[after.name,...(after.aliases||[])].some(n=>ctx.normExerciseMediaName(n)===ctx.normExerciseMediaName(name));
    if(!exact)assert.equal(after?.id,before.id,`${name} cambió de animación`);
  }
});
