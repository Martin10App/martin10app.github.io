// Preparador físico: comparación semanal por nombre y mejor serie, recuperación y semáforo de sobrecarga.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extractFunction(name){
  const start=html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`No se encontró ${name}`);
  const bodyStart=html.indexOf('{',start);
  let depth=0,quote='',escaped=false;
  for(let i=bodyStart;i<html.length;i++){
    const ch=html[i];
    if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return html.slice(start,i+1);
  }
  throw new Error(`Función ${name} incompleta`);
}
const BILBO_CONST=html.match(/const BILBO_MIN_REPS=[^;]+;/)[0].replace('const','var')+'\n';
const FUNCS=['normStr','parseRepRange','estimatedStrength','progressHasRir','progressKg','progressTimed','bestProgressSet','compareSetToLast','isBilbo',
  'weekExerciseIndex','weekBestSet','weekExerciseDiffs','gymDateISO','weekSessions','sleepHoursLast7','recoveryStatus','compareWeekRow'];
function ctx(extra={}){
  const c={gymHist:[],esc:s=>String(s||''),...extra};
  vm.createContext(c);
  vm.runInContext(BILBO_CONST+FUNCS.map(extractFunction).join('\n'),c);
  return c;
}
const set=(weight,reps,rir=2)=>({weight,reps,rir,done:true});
const plain=v=>JSON.parse(JSON.stringify(v));
function week(id,weekStart,days){return {id,routineId:'r1',weekStart,weekEnd:weekStart.slice(0,8)+String(Number(weekStart.slice(8))+6).padStart(2,'0'),days};}

test('compara por nombre aunque los ejercicios cambien de lugar o de día',()=>{
  const f=ctx();
  const prev=week('w1','2026-11-02',{d1:{exercises:[{name:'Press banca',reps:'8-10',setLogs:[set(80,8)]},{name:'Remo',reps:'8-10',setLogs:[set(60,10)]}]}});
  const cur=week('w2','2026-11-09',{d1:{exercises:[{name:'Remo',reps:'8-10',setLogs:[set(60,10)]}]},d2:{exercises:[{name:'Press Banca',reps:'8-10',setLogs:[set(80,10)]}]}});
  const diffs=plain(f.weekExerciseDiffs(prev,cur));
  const banca=diffs.find(d=>/banca/i.test(d.name)),remo=diffs.find(d=>d.name==='Remo');
  assert.equal(banca.kind,'up');
  assert.match(banca.text,/80 kg × 8 → 80 kg × 10/);
  assert.match(banca.text,/fuerza est/);
  assert.equal(remo.kind,'same');
});

test('usa la mejor serie, no el último peso tocado',()=>{
  const f=ctx();
  const prev=week('w1','2026-11-02',{d1:{exercises:[{name:'Sentadilla',reps:'6-8',weight:'',setLogs:[set(100,8),set(100,7)]}]}});
  const cur=week('w2','2026-11-09',{d1:{exercises:[{name:'Sentadilla',reps:'6-8',weight:'40',setLogs:[set(105,8),set(40,12,5)]}]}});
  const [d]=plain(f.weekExerciseDiffs(prev,cur));
  assert.equal(d.kind,'up');
  assert.match(d.text,/100 kg × 8 → 105 kg × 8/);
});

test('la serie Bilbo (15+ reps y después más pesadas) no se toma como la mejor',()=>{
  const f=ctx();
  const ex={name:'Banca',reps:'5',setLogs:[set(60,20),set(90,5),set(90,5)]};
  assert.equal(f.weekBestSet(ex).weight,90);
});

test('semanas viejas sin reps comparan solo kilos',()=>{
  const f=ctx();
  const prev=week('w1','2026-11-02',{d1:{exercises:[{name:'Curl',weight:'12'}]}});
  const cur=week('w2','2026-11-09',{d1:{exercises:[{name:'Curl',weight:'14'}]}});
  const [d]=plain(f.weekExerciseDiffs(prev,cur));
  assert.equal(d.kind,'up');
  assert.equal(d.text,'12 kg → 14 kg');
});

test('la tarjeta de semanas muestra solo cambios y en la dirección correcta',()=>{
  const f=ctx();
  const older=week('w1','2026-11-02',{d1:{exercises:[{name:'Banca',reps:'8-10',setLogs:[set(80,10)]}]}});
  const newer=week('w2','2026-11-09',{d1:{exercises:[{name:'Banca',reps:'8-10',setLogs:[set(82.5,8)]}]}});
  const htmlRow=f.compareWeekRow(older,newer);
  assert.match(htmlRow,/80 kg × 10 → 82,5 kg × 8/);
  assert.equal(f.compareWeekRow(older,older),'','sin cambios no muestra nada');
});

test('recuperación: verde, amarillo, rojo y sin datos',()=>{
  const f=ctx();
  assert.equal(f.recoveryStatus([],[]).level,'none');
  assert.equal(f.recoveryStatus([{energy:4,rpe:8}],[7.5,8]).level,'green');
  assert.equal(f.recoveryStatus([{energy:3,rpe:9}],[7.5]).level,'yellow');
  assert.equal(f.recoveryStatus([{energy:4,rpe:8}],[5.5,6]).level,'red','poco sueño');
  assert.equal(f.recoveryStatus([{energy:2,rpe:8}],[]).level,'red','energía muy baja');
  const r=f.recoveryStatus([{energy:4,rpe:8},{energy:3,rpe:9}],[7,8]);
  assert.equal(r.energy,3.5);assert.equal(r.rpe,8.5);assert.equal(r.sleep,7.5);
});

test('sesiones de la semana: por weekId o por fecha; las viejas sin fecha no cuentan',()=>{
  const ts=s=>new Date(s+'T12:00:00').getTime();
  const f=ctx({gymHist:[{weekId:'w2',energy:4},{ts:ts('2026-11-10'),energy:3},{ts:ts('2026-11-01'),energy:5},{energy:1}]});
  const w=week('w2','2026-11-09',{});
  assert.deepEqual(plain(f.weekSessions(w).map(h=>h.energy)),[4,3]);
});

test('sueño de los últimos 7 días, ignorando días sin registro',()=>{
  const f=ctx();
  const log={'2026-11-09':{hours:7},'2026-11-08':{hours:6.5},'2026-11-01':{hours:9}};
  assert.deepEqual(plain(f.sleepHoursLast7(log,new Date(2026,10,9,20))),[7,6.5]);
});
