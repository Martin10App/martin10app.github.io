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

const FUNCTIONS=['gymSetKey','clampGymNumber','getSetPerformance','updateWeekLogFromCurrent','routineDraft','cleanRoutineDays',
  'exerciseUnits','reorderUnits','copyExercises','cloneRoutine','remapRoutineRecords','applyRoutineEditRecords','getWeekPct'];

const ex=(name,series=2,extra={})=>({name,muscle:'Pecho',series,reps:'8-10',...extra});
const done=(weight,reps=8)=>({weight,reps,rir:2,done:true,updatedAt:1});

// Rutina activa r1 con registros de esta semana en A, B, C (día 1) y D (día 2); r2 es otra rutina.
function makeContext(){
  const routine={id:'r1',name:'Torso',days:[{id:'d1',label:'Día A',exercises:[ex('A'),ex('B'),ex('C')]},{id:'d2',label:'Día B',exercises:[ex('D')]}]};
  const setPerformance={
    'r1|d1|0|0':done(60),'r1|d1|0|1':done(60),
    'r1|d1|1|0':done(40),
    'r1|d1|2|0':done(20),'r1|d1|2|1':done(22),
    'r1|d2|0|0':done(100),
    'r2|d1|0|0':done(999)
  };
  const sets=Object.fromEntries(Object.keys(setPerformance).map(k=>[k,true]));
  const weights={'r1|d1|0':'60','r1|d1|1':'40','r1|d1|2':'22','r1|d2|0':'100','r2|d1|0':'999'};
  const week={id:'w1',routineId:'r1',days:{
    d1:{label:'Día A',exercises:['A','B','C'].map(n=>({...ex(n),weight:'',completedSets:0,totalSets:2,setLogs:[]}))},
    d2:{label:'Día B',exercises:[{...ex('D'),weight:'',completedSets:0,totalSets:2,setLogs:[]}]}
  }};
  let n=0;const db={};
  const context={routines:[routine],activeRid:'r1',activeWeekId:'w1',gymWeekLog:[week],setPerformance,sets,weights,db,
    uid:()=>'n'+(++n),S:{g:(k,f)=>db[k]??f,s:(k,v)=>{db[k]=structuredClone(v);return true;}}};
  vm.createContext(context);
  vm.runInContext(FUNCTIONS.map(name=>extractFunction(name)).join('\n'),context);
  context.updateWeekLogFromCurrent();
  return context;
}
// Simula "Guardar cambios" del editor: remapea y reemplaza la rutina, como saveRoutine.
function save(ctx,draft){
  ctx.applyRoutineEditRecords('r1',draft.days);
  ctx.routines[0]={...draft,days:ctx.cleanRoutineDays(draft.days)};
  ctx.updateWeekLogFromCurrent();
}
const perfOf=(ctx,did,ei,si=0)=>ctx.setPerformance[`r1|${did}|${ei}|${si}`];
const weekNames=(ctx,did)=>ctx.gymWeekLog[0].days[did].exercises.map(e=>e.name+(e.removed?'*':''));

test('[T3] reordenar ejercicios mueve sus series y kilos con ellos',()=>{
  const ctx=makeContext();const draft=ctx.routineDraft(ctx.routines[0]);
  const [A,B,C]=draft.days[0].exercises;draft.days[0].exercises=[C,A,B];
  save(ctx,draft);
  assert.equal(perfOf(ctx,'d1',0).weight,20);assert.equal(perfOf(ctx,'d1',0,1).weight,22);
  assert.equal(perfOf(ctx,'d1',1).weight,60);assert.equal(perfOf(ctx,'d1',2).weight,40);
  assert.equal(ctx.weights['r1|d1|0'],'22');assert.equal(ctx.sets['r1|d1|2|0'],true);assert.equal(ctx.sets['r1|d1|2|1'],undefined);
  assert.deepEqual([...weekNames(ctx,'d1')],['C','A','B']);
  assert.equal(ctx.gymWeekLog[0].days.d1.exercises[0].setLogs[1].weight,22);
  assert.ok(ctx.routines[0].days[0].exercises.every(e=>!('_src' in e)),'no se guarda _src en rt2');
});

test('[T3] borrar un ejercicio del medio no le pasa sus kilos al siguiente y su semana queda guardada',()=>{
  const ctx=makeContext();const draft=ctx.routineDraft(ctx.routines[0]);
  draft.days[0].exercises.splice(1,1); // quita B
  save(ctx,draft);
  assert.equal(perfOf(ctx,'d1',1).weight,20,'C ocupa el lugar 1 con SUS kilos');
  assert.equal(perfOf(ctx,'d1',2),undefined);
  assert.deepEqual([...weekNames(ctx,'d1')],['A','C','B*']);
  const removed=ctx.gymWeekLog[0].days.d1.exercises[2];
  assert.equal(removed.setLogs[0].weight,40);assert.equal(removed.totalSets,removed.completedSets);
  assert.equal(ctx.getWeekPct('w1'),Math.round(6/7*100),'lo quitado cuenta lo hecho y no baja el %');
});

test('[T3] mover un ejercicio a otro día y agregar uno nuevo al principio',()=>{
  const ctx=makeContext();const draft=ctx.routineDraft(ctx.routines[0]);
  const [D]=draft.days[1].exercises.splice(0,1);draft.days[0].exercises.push(D);
  draft.days[0].exercises.unshift(ex('Nuevo'));
  save(ctx,draft);
  assert.equal(perfOf(ctx,'d1',0),undefined,'el nuevo arranca sin registros');
  assert.equal(perfOf(ctx,'d1',1).weight,60);assert.equal(perfOf(ctx,'d1',4).weight,100);
  assert.equal(perfOf(ctx,'d2',0),undefined);
  assert.deepEqual([...weekNames(ctx,'d1')],['Nuevo','A','B','C','D']);
  assert.deepEqual([...weekNames(ctx,'d2')],[]);
  // El nuevo ya queda en la semana: sus series se registran desde ahora.
  ctx.setPerformance['r1|d1|0|0']=done(15);ctx.updateWeekLogFromCurrent();
  assert.equal(ctx.gymWeekLog[0].days.d1.exercises[0].setLogs[0].weight,15);
});

test('[T3] quitar un día con series hechas las deja en la semana; otras rutinas no se tocan',()=>{
  const ctx=makeContext();const draft=ctx.routineDraft(ctx.routines[0]);
  draft.days.splice(1,1);
  save(ctx,draft);
  assert.deepEqual([...weekNames(ctx,'d2')],['D*']);
  assert.equal(ctx.gymWeekLog[0].days.d2.exercises[0].setLogs[0].weight,100);
  assert.equal(ctx.setPerformance['r2|d1|0|0'].weight,999);assert.equal(ctx.weights['r2|d1|0'],'999');
  // Una segunda edición conserva lo quitado antes.
  const again=ctx.routineDraft(ctx.routines[0]);again.days[0].exercises.reverse();save(ctx,again);
  assert.deepEqual([...weekNames(ctx,'d2')],['D*']);
  assert.deepEqual([...weekNames(ctx,'d1')],['C','B','A']);
});

test('[T3] las biseries se mueven como bloque y los duplicados no heredan registros',()=>{
  const ctx=makeContext();
  const list=[ex('A',2,{superset:'ss1'}),ex('B',2,{superset:'ss1'}),ex('C'),ex('D')];
  const units=ctx.exerciseUnits(list);
  assert.deepEqual([...units],[0,0,1,2]);
  assert.deepEqual([...ctx.reorderUnits(list,units,0,2).map(e=>e.name)],['C','D','A','B']);
  assert.deepEqual([...ctx.reorderUnits(list,units,2,0).map(e=>e.name)],['D','A','B','C']);
  assert.equal(ctx.reorderUnits(list,units,0,-1),null);
  const copies=ctx.copyExercises([{...list[0],_src:{did:'d1',ei:0}},list[1]]);
  assert.ok(!('_src' in copies[0]));assert.equal(copies[0].superset,copies[1].superset);assert.notEqual(copies[0].superset,'ss1');
  const clone=ctx.cloneRoutine(ctx.routines[0],{name:'Copia'});
  assert.notEqual(clone.id,'r1');assert.notEqual(clone.days[0].id,'d1');assert.equal(clone.name,'Copia');
  assert.equal(ctx.routines[0].days[0].id,'d1','el original no cambia');
});
