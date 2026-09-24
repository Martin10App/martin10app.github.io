const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mediaJs=fs.readFileSync(path.join(root,'exercise-media.js'),'utf8');
const programs=JSON.parse(fs.readFileSync(path.join(root,'programas.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'exercise-media.json'),'utf8'));

function extractFunction(name,source=html){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`No se encontró ${name}`);
  const bodyStart=source.indexOf('{',source.indexOf(')',start));
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

function makeContext(){
  let n=0;const db={};
  const context={_programsData:programs,routines:[],activeRid:null,activeWeekId:null,gymWeekLog:[],gymCycles:{},gymProfile:{},db,
    uid:()=>'id'+(++n),S:{g:(k,f)=>k in db?db[k]:f,s:(k,v)=>{db[k]=structuredClone(v);return true;}}};
  vm.createContext(context);
  vm.runInContext([extractFunction('normExerciseMediaName',mediaJs),
    ...['findCatalogMovement','routineFromProgram','programWeekValue','applyProgramWeek','cleanupSupersetGroups','normalizeSupersetAssignments','supersetMeta',
      'yearTemplatePlan','monthKey','nextMonthKeys','gymProgFilter','filteredPrograms','exerciseProgression','ensureGymCycle','getCycleStatus','programWeekInfo','upcomingCycleWeek'].map(n=>extractFunction(n))].join('\n'),context);
  return context;
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('[T4] cada programa se convierte en una rutina válida, con ids propios, video y biseries en pares',()=>{
  const ctx=makeContext();
  const ids=new Set();let withVideo=0,total=0;
  for(const p of programs.programs){
    const r=plain(ctx.routineFromProgram(p,catalog));
    assert.equal(r.programId,p.id);assert.equal(r.goal,p.goal);assert.equal(r.cycleLength,p.weeks);assert.equal(r.days.length,p.days.length);
    for(const id of [r.id,...r.days.map(d=>d.id)]){assert.ok(!ids.has(id),'id repetido '+id);ids.add(id);}
    r.days.forEach((d,di)=>{
      assert.equal(d.exercises.length,p.days[di].exercises.length,p.id+' día '+(di+1));
      const labels=p.days[di].exercises.filter(e=>e.superset).length;
      assert.equal(d.exercises.filter(e=>e.superset).length,labels,p.id+': biseries perdidas');
      d.exercises.forEach((ex,ei)=>{
        total++;if(ex.mediaId)withVideo++;
        assert.equal(ex.name,p.days[di].exercises[ei].name);
        if(ex.superset){const pair=d.exercises.filter(x=>x.superset===ex.superset);assert.equal(pair.length,2);}
      });
    });
    if(p.conditioning)assert.equal(r.conditioning.length,p.conditioning.length);
  }
  assert.ok(withVideo/total>0.85,`solo ${withVideo}/${total} con video`);
});

test('[T4] la copia no comparte objetos con el programa y aplica la semana 1',()=>{
  const ctx=makeContext();
  const p=programs.programs.find(x=>x.days.some(d=>d.exercises.some(e=>e.seriesByWeek)));
  const r=ctx.routineFromProgram(p,catalog);
  const ex=r.days.flatMap(d=>d.exercises).find(e=>e.seriesByWeek);
  const src=p.days.flatMap(d=>d.exercises).find(e=>e.name===ex.name&&e.seriesByWeek);
  assert.equal(ex.series,src.seriesByWeek[0]);
  ex.seriesByWeek[0]=99;r.weekPlan[0].focus='x';
  assert.notEqual(src.seriesByWeek[0],99);assert.notEqual(p.weekPlan[0].focus,'x');
});

test('[T4] el plan semanal cambia series, reps y RIR al empezar cada semana',()=>{
  const ctx=makeContext();
  const p=programs.programs.find(x=>x.id==='fuerza-rir-4d');
  const r=ctx.routineFromProgram(p,catalog);
  const squat=()=>r.days.flatMap(d=>d.exercises).find(e=>e.name==='Sentadilla con barra');
  const s=p.days.flatMap(d=>d.exercises).find(e=>e.name==='Sentadilla con barra');
  for(const week of [3,6]){
    ctx.applyProgramWeek(r,week);
    assert.equal(squat().series,s.seriesByWeek[week-1]);
    if(s.rirByWeek)assert.equal(squat().rir,String(s.rirByWeek[week-1]));
    if(s.repsByWeek)assert.equal(squat().reps,String(s.repsByWeek[week-1]));
  }
  // La semana siguiente sale de las semanas ya registradas de esa rutina.
  ctx.routines=[r];ctx.gymCycles={};ctx.gymWeekLog=[{id:'a',routineId:r.id},{id:'b',routineId:r.id},{id:'z',routineId:'otra'}];
  assert.equal(ctx.upcomingCycleWeek(r),3);
  ctx.activeWeekId='b';
  assert.equal(ctx.programWeekInfo(r).week,2);assert.equal(ctx.programWeekInfo(r).focus,p.weekPlan[1].focus);
});

test('[T4] ejercicios sin progresión automática muestran la nota y la progresión del programa',()=>{
  const ctx=makeContext();
  const p=programs.programs.find(x=>x.id==='fuerza-531-bbb-4d');
  const r=ctx.routineFromProgram(p,catalog);ctx.routines=[r];
  const day=r.days.find(d=>d.exercises.some(e=>e.autoProgress===false));
  const ei=day.exercises.findIndex(e=>e.autoProgress===false);
  const advice=ctx.exerciseProgression(r.id,day.id,ei,day.exercises[ei]);
  assert.equal(advice.kind,'manual');assert.ok(advice.text.includes(p.progression.slice(0,30)));
});

test('[T4] plan del año: una plantilla llena los meses vacíos y solo reemplaza si se acepta',()=>{
  const ctx=makeContext();
  const t=programs.yearTemplates[0];
  assert.equal(t.id,'anio-martin-4d');
  const keys=plain(ctx.nextMonthKeys(12,new Date(2026,10,15)));
  assert.equal(keys[0],'2026-11');assert.equal(keys[11],'2027-10');
  const mine={'2026-12':'natural-ppl-6d'};
  const keep=plain(ctx.yearTemplatePlan(t,mine,keys,false));
  // months[0] es enero: noviembre toma months[10] y enero de 2027 months[0].
  assert.equal(keep['2026-12'],'natural-ppl-6d');assert.equal(keep['2026-11'],t.months[10]);assert.equal(keep['2027-01'],t.months[0]);assert.equal(Object.keys(keep).length,12);
  const replace=plain(ctx.yearTemplatePlan(t,mine,keys,true));
  assert.equal(replace['2026-12'],t.months[11]);
  assert.ok(t.months.every(id=>programs.programs.some(p=>p.id===id)),'la plantilla apunta a programas que existen');
});

test('[T4] filtros: arrancan en "hasta 4 días" y se guardan como preferencia',()=>{
  const ctx=makeContext();
  assert.equal(ctx.gymProgFilter().maxDays,4);
  assert.ok(ctx.filteredPrograms().every(p=>p.daysPerWeek<=4));
  assert.ok(ctx.filteredPrograms().length<programs.programs.length);
  ctx.S.s('gymProgFilter1',{discipline:'boxeo',maxDays:0,level:'all'});
  assert.deepEqual([...new Set(ctx.filteredPrograms().map(p=>p.discipline))],['boxeo']);
});
