const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..','programas.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','exercise-media.json'),'utf8'));
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const muscles=Object.keys(Function('return '+html.match(/const MC=(\{[^}]*\})/)[1])());
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const catalogNames=new Set(catalog.exercises.flatMap(e=>[e.name,...(e.aliases||[])]).map(norm));

test('la biblioteca tiene versión, disciplinas y programas',()=>{
  assert.equal(data.version,1);
  assert.ok(data.programs.length>=10);
  for(const p of data.programs)assert.ok(data.disciplines[p.discipline],`${p.id}: disciplina desconocida ${p.discipline}`);
});

test('cada programa tiene los campos que usa la app',()=>{
  const ids=new Set();
  for(const p of data.programs){
    assert.match(p.id,/^[a-z0-9-]+$/,p.id);
    assert.ok(!ids.has(p.id),`id repetido ${p.id}`);ids.add(p.id);
    for(const k of ['name','summary','progression','basedOn'])assert.ok(String(p[k]||'').length>10,`${p.id}: falta ${k}`);
    assert.ok(['principiante','intermedio','avanzado'].includes(p.level),`${p.id}: nivel`);
    assert.ok(['hipertrofia','fuerza','potencia','resistencia'].includes(p.goal),`${p.id}: goal`);
    assert.ok(p.weeks>=3&&p.weeks<=12,`${p.id}: weeks fuera de 3-12 (ensureGymCycle)`);
    assert.equal(p.days.length,p.daysPerWeek,`${p.id}: daysPerWeek no coincide con days`);
    assert.ok(p.sources.length>=1&&p.sources.every(s=>/^https:\/\//.test(s.url)&&s.title),`${p.id}: fuentes`);
  }
});

test('el plan semanal cubre todas las semanas en orden',()=>{
  for(const p of data.programs){
    assert.deepEqual(p.weekPlan.map(w=>w.week),Array.from({length:p.weeks},(_,i)=>i+1),p.id);
    for(const w of p.weekPlan)assert.ok(w.focus&&w.rir&&w.volume,`${p.id} semana ${w.week}`);
  }
});

test('cada ejercicio es válido para una rutina de la app',()=>{
  for(const p of data.programs)for(const d of p.days){
    assert.ok(d.label&&d.exercises.length>=3,`${p.id}/${d.label}`);
    for(const ex of d.exercises){
      const where=`${p.id}/${d.label}/${ex.name}`;
      assert.ok(ex.name&&ex.reps,where);
      assert.ok(Number.isInteger(ex.series)&&ex.series>=1&&ex.series<=6,`${where}: series`);
      assert.ok(muscles.includes(ex.muscle),`${where}: músculo ${ex.muscle} no está en MC`);
    }
  }
});

test('las reps se leen bien con parseRepRange de la app y los extras por semana cuadran',()=>{
  const i=html.indexOf('function parseRepRange(');let d=0,k=html.indexOf('{',i);
  for(;k<html.length;k++){if(html[k]==='{')d++;else if(html[k]==='}'&&!--d)break;}
  const parseRepRange=Function(html.slice(i,k+1)+';return parseRepRange;')();
  for(const p of data.programs)for(const day of p.days)for(const ex of day.exercises){
    const where=`${p.id}/${day.label}/${ex.name}`;
    const reps=[ex.reps,...(ex.repsByWeek||[])];
    for(const r of reps){const {min,max}=parseRepRange(String(r).replace('+',''));assert.ok(min>0&&min<=max,`${where}: reps "${r}"`);}
    if(ex.unit){assert.ok(['s','m'].includes(ex.unit),`${where}: unit`);assert.equal(ex.autoProgress,false,`${where}: tiempo/distancia sin progresión automática`);}
    for(const k of ['repsByWeek','seriesByWeek','rirByWeek'])if(ex[k])assert.equal(ex[k].length,p.weeks,`${where}: ${k}`);
    if(ex.seriesByWeek)assert.ok(ex.seriesByWeek.every(n=>Number.isInteger(n)&&n>=1&&n<=6),`${where}: seriesByWeek`);
  }
});

test('las biseries son exactamente dos ejercicios consecutivos',()=>{
  let total=0;
  for(const p of data.programs)for(const d of p.days){
    const groups={};
    d.exercises.forEach((ex,i)=>{if(ex.superset)(groups[ex.superset]=groups[ex.superset]||[]).push(i);});
    for(const [label,idx] of Object.entries(groups)){
      assert.equal(idx.length,2,`${p.id}/${d.label}: biserie ${label} con ${idx.length} ejercicios`);
      assert.equal(idx[1]-idx[0],1,`${p.id}/${d.label}: biserie ${label} no consecutiva`);
      total++;
    }
  }
  assert.ok(total>=20,'se esperaban biseries en la biblioteca');
});

test('la mayoría de los ejercicios tiene video en el catálogo',()=>{
  const all=data.programs.flatMap(p=>p.days.flatMap(d=>d.exercises));
  const withMedia=all.filter(ex=>catalogNames.has(norm(ex.name)));
  assert.ok(withMedia.length/all.length>=0.85,`solo ${withMedia.length}/${all.length} con movimiento`);
});

test('las plantillas anuales tienen 12 meses de programas existentes',()=>{
  const ids=new Set(data.programs.map(p=>p.id));
  for(const y of data.yearTemplates){
    assert.equal(y.months.length,12,y.id);
    for(const m of y.months)assert.ok(ids.has(m),`${y.id}: ${m} no existe`);
  }
});
