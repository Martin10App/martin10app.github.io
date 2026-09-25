const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extractFunction(name){
  const start=html.search(new RegExp(`function ${name}\\(`));
  assert.notEqual(start,-1,`No se encontró ${name}`);
  const bodyStart=html.indexOf('{',html.indexOf(')',start));
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
const FUNCTIONS=['normStr','plural','parseRepRange','estimatedStrength','progressHasRir','progressKg','progressTimed','bestProgressSet','isBilbo','bilboNextWeight','bilboFeedback','looksLikeBilbo','compareSetToLast',
  'exerciseProgressFeedback','exerciseBestEver','sessionProgressSummary','setCompareHtml','exerciseFeedbackHtml'];
function ctx(weekLog=[]){
  const c={gymWeekLog:weekLog};vm.createContext(c);
  // esc() tiene comillas que confunden al extractor: acá va una equivalente.
  const esc="function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}\n";
  const bilboConst=html.match(/const BILBO_MIN_REPS=[^;]+;/)[0].replace('const','var')+'\n';
  vm.runInContext(bilboConst+esc+FUNCTIONS.map(extractFunction).join('\n')+';var gymWeekLog=this.gymWeekLog;',c);
  return c;
}
const set=(weight,reps,rir='',done=true)=>({weight,reps,rir,done});
const bench={name:'Press banca plano con barra',series:3,reps:'8-10'};

test('serie: más kilos con las mismas reps es ▲ y dice cuánto',()=>{
  const c=ctx(),r=c.compareSetToLast(bench,set(105,10,2),set(100,10,2));
  assert.equal(r.kind,'up');assert.equal(r.chip,'▲ +5 kg');assert.equal(r.dKg,5);assert.ok(r.dPct>4);
});

test('serie: mismas cargas y más reps es ▲ en reps; menos reps es ▼; igual es =',()=>{
  const c=ctx();
  assert.equal(c.compareSetToLast(bench,set(100,12,2),set(100,10,2)).chip,'▲ +2 reps');
  assert.equal(c.compareSetToLast(bench,set(100,8,2),set(100,10,2)).chip,'▼ -2 reps');
  assert.equal(c.compareSetToLast(bench,set(100,10,2),set(100,10,2)).chip,'=');
  assert.equal(c.compareSetToLast(bench,set(100,10,2),null).kind,'first');
  assert.equal(c.compareSetToLast(bench,set(100,'',2),set(100,10,2)),null,'sin reps no se compara');
});

test('serie: kilos y reps en sentidos opuestos los decide la fuerza estimada',()=>{
  const c=ctx();
  const ok=c.compareSetToLast(bench,set(105,9,2),set(100,10,2));   // 105×(1+11/30) > 100×(1+12/30)
  assert.equal(ok.kind,'up');assert.equal(ok.chip,'▲ +5 kg · -1 reps');
  const bad=c.compareSetToLast(bench,set(105,6,1),set(100,10,2));  // 105×(1+7/30) < 100×(1+12/30)
  assert.equal(bad.kind,'down');assert.ok(bad.dPct<-2);
});

test('ejercicio: los mensajes de cada caso',()=>{
  const c=ctx(),prev=[set(100,10,2),set(100,10,2),set(100,9,2)];
  assert.match(c.exerciseProgressFeedback(bench,[set(105,10,2)],prev,0).text,/^Más peso con las mismas reps o más: progreso claro 💪 \(100×10 → 105×10\)$/);
  assert.match(c.exerciseProgressFeedback({...bench,reps:'8-12'},[set(100,11,2)],prev,0).text,/^Mismo peso, más reps: vas bien; cuando llegues al tope del rango, subís/);
  assert.match(c.exerciseProgressFeedback(bench,[set(100,12,2)],prev,0).text,/^Mismo peso, más reps: vas bien; llegaste al tope del rango, la próxima subí peso/);
  assert.match(c.exerciseProgressFeedback(bench,[set(105,9,2)],prev,0).text,/^Subiste peso; las reps bajaron pero tu fuerza estimada subió [\d,]+%/);
  assert.match(c.exerciseProgressFeedback(bench,[set(105,6,1)],prev,0).text,/^Subiste un poco antes de tiempo: probá volver a 100 kg hasta completar el rango/);
  const strength={...bench,reps:'4-6'},heavy=c.exerciseProgressFeedback(strength,[set(112.5,6,1)],[set(110,8,1)],0);
  assert.equal(heavy.kind,'same','más kilos dentro del rango no es retroceso');
  assert.equal(c.compareSetToLast(strength,set(112.5,6,1),set(110,8,1)).chip,'≈ +2,5 kg · -2 reps');
  assert.match(heavy.text,/^Subiste peso y seguís dentro del rango \(4-6\): bien \(110×8 → 112,5×6\)/);
  assert.match(c.exerciseProgressFeedback(bench,[set(95,8,2)],prev,0).text,/^Hoy rendiste [\d,]+% menos que la semana pasada .*Un día flojo pasa/);
  assert.match(c.exerciseProgressFeedback(bench,[set(100,10,2)],prev,0).text,/^Igual que la semana pasada/);
  assert.match(c.exerciseProgressFeedback(bench,[set(100,10,2)],[],0).text,/^Primera marca registrada en Press banca plano con barra: 100×10\.$/);
});

test('ejercicio: sin RIR compara igual pero lo pide; de programa no sugiere subir ni bajar',()=>{
  const c=ctx();
  assert.match(c.exerciseProgressFeedback(bench,[set(105,10)],[set(100,10)],0).text,/Sumá el RIR para comparar mejor\.$/);
  const manual={...bench,autoProgress:false};
  assert.doesNotMatch(c.exerciseProgressFeedback(manual,[set(100,12,2)],[set(100,10,2)],0).text,/subís/);
  assert.doesNotMatch(c.exerciseProgressFeedback(manual,[set(105,6,1)],[set(100,10,2)],0).text,/volver a/);
});

test('récord: supera la mejor fuerza estimada de cualquier semana anterior',()=>{
  const log=[{id:'w1',days:{d:{exercises:[{name:'press banca plano con barra',setLogs:[set(100,10,2)]}]}}},
             {id:'w2',days:{x:{exercises:[{name:'Press banca plano con barra',setLogs:[set(102,10,2)]}]}}}];
  const c=ctx(log);
  const best=c.exerciseBestEver('Press banca plano con barra','wActual');
  assert.ok(Math.abs(best-102*(1+12/30))<1e-9,'busca en todas las semanas y rutinas, sin importar mayúsculas');
  const fb=c.exerciseProgressFeedback(bench,[set(105,10,2)],[set(102,10,2)],best);
  assert.equal(fb.kind,'pr');assert.match(fb.text,/^🏆 Récord en Press banca plano con barra \(102×10 → 105×10\)/);
  assert.notEqual(c.exerciseProgressFeedback(bench,[set(102,10,2)],[set(100,10,2)],best).kind,'pr','igualar no es récord');
});

test('tiempo y peso corporal: más segundos o más reps es mejor, sin fuerza estimada',()=>{
  const c=ctx(),plank={name:'Plancha lateral',series:3,reps:'30',unit:'s'},dips={name:'Fondos en paralelas',series:3,reps:'8-12'};
  assert.equal(c.compareSetToLast(plank,set('',45),set('',30)).chip,'▲ +15 s');
  assert.match(c.exerciseProgressFeedback(plank,[set('',45)],[set('',30)],0).text,/^Más tiempo que la semana pasada: vas bien \(30 s → 45 s\)$/);
  assert.match(c.exerciseProgressFeedback(plank,[set('',30)],[set('',30)],0).text,/Buscá un poco más la próxima\.$/);
  assert.equal(c.compareSetToLast(dips,set('',12),set('',10)).chip,'▲ +2 reps');
  assert.doesNotMatch(c.exerciseProgressFeedback(dips,[set('',12)],[set('',10)],0).text,/RIR/,'sin kilos no hace falta el RIR');
  assert.match(c.exerciseProgressFeedback(dips,[set('',11)],[set('',10)],0).text,/^Más reps que la semana pasada: vas bien \(10 reps → 11 reps\)$/);
  assert.match(c.exerciseProgressFeedback(dips,[set('',12)],[set('',10)],0).text,/llegaste al tope del rango, probá sumar lastre/);
});

test('resumen del día y HTML',()=>{
  const c=ctx();
  const items=[{name:'Sentadilla',fb:{kind:'up',dPct:6.2}},{name:'Banca',fb:{kind:'pr',dPct:3}},{name:'Remo',fb:{kind:'same',dPct:0}},
    {name:'Curl',fb:{kind:'down',dPct:-4}},{name:'Nuevo',fb:{kind:'first'}}];
  assert.equal(c.sessionProgressSummary(items),'Hoy: 2 mejoras · 1 igual · 1 abajo · mejor avance: Sentadilla +6,2%');
  assert.equal(c.sessionProgressSummary([{name:'Nuevo',fb:{kind:'first'}}]),'','solo primeras marcas: sin resumen');
  assert.equal(c.setCompareHtml(bench,set(105,10,2),set(100,10,2)),'<span class="set-cmp up">▲ +5 kg</span>');
  assert.equal(c.setCompareHtml(bench,set(105,10,2,false),set(100,10,2)),'','serie sin marcar: nada');
  assert.equal(c.setCompareHtml(bench,set(105,10,2),null),'','primera vez: sin chip');
});

test('Bilbo: la serie 1 se compara aparte y sube 2,5 kg por sesión mientras haya 15+ reps',()=>{
  const c=ctx(),ex={...bench,series:4,reps:'4-6',bilbo:true};
  // Semanas reales: 90×17 → 95×16 en la serie Bilbo, y las pesadas 100×8 → 110×8.
  const prev=[set(90,17,4),set(100,8,2),set(100,7,1),set(100,6,1)],cur=[set(95,16,1),set(110,8,1),set(110,6,1),set(110,5,1)];
  const fb=c.exerciseProgressFeedback(ex,cur,prev,0);
  assert.match(fb.bilbo,/^Bilbo: \+5 kg y seguís en 15 o más 💪 \(90×17 → 95×16\)\. Próxima sesión: 97,5 kg\.$/);
  assert.match(fb.rest,/^Más peso con las mismas reps o más: progreso claro 💪 \(100×8 → 110×8\)/,'las pesadas no se mezclan con la Bilbo');
  assert.equal(c.compareSetToLast(ex,cur[0],prev[0],0).kind,'up','+5 kg perdiendo 1 rep es avance en Bilbo');
  assert.notEqual(c.compareSetToLast(bench,cur[0],prev[0],0).kind,'up','sin Bilbo la misma serie no contaría como avance');
  assert.equal(c.bilboNextWeight(set(95,16,1)),97.5);
  assert.equal(c.bilboNextWeight(set(100,13,1)),'','con menos de 15 no sugiere subir');
});

test('Bilbo: bajar de 15 cierra el ciclo; bajar el peso es ciclo nuevo; sin pesadas queda solo la Bilbo',()=>{
  const c=ctx();
  assert.match(c.bilboFeedback(set(100,13,1),set(97.5,15,1)).text,/terminó el ciclo 🎯.*descarga.*27-35 reps/);
  assert.equal(c.bilboFeedback(set(100,13,1),set(97.5,15,1)).kind,'cycle');
  assert.match(c.bilboFeedback(set(90,17,2),set(95,15,2)).text,/^Bilbo: ciclo nuevo desde 90 kg/);
  assert.match(c.bilboFeedback(set(95,16,2),set(95,15,2)).text,/Tocaba subir 2,5 kg\. Próxima sesión: 97,5 kg\.$/);
  const only=c.exerciseProgressFeedback({...bench,series:1,bilbo:true},[set(95,16,1)],[set(92.5,17,1)],0);
  assert.equal(only.kind,'up');assert.equal(c.exerciseFeedbackHtml(only),'<div class="ex-feedback bilbo">'+only.bilbo+'</div>');
  assert.equal(c.sessionProgressSummary([{name:'Banca',fb:{kind:'cycle'}}]),'','fin de ciclo no rompe el resumen');
});

test('Bilbo: reconoce el patrón en el historial para ofrecer marcarlo',()=>{
  const c=ctx();
  const w=(a,...heavy)=>[set(...a),...heavy.map(h=>set(...h))];
  assert.equal(c.looksLikeBilbo([w([95,16,1],[110,8,1]),w([90,17,4],[100,8,2],[100,7,1]),w([95,15,2],[105,6,1])]),true);
  assert.equal(c.looksLikeBilbo([w([60,12,2],[60,10,2]),w([60,11,2],[60,10,2])]),false,'series normales no');
  assert.equal(c.looksLikeBilbo([w([95,16,1],[110,8,1])]),false,'con una sola semana no alcanza');
});
