const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const mediaJs=fs.readFileSync(path.join(__dirname,'..','exercise-media.js'),'utf8');

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

let uidCounter=0;
const context={activeRid:'rutina-a',uid:()=>String(++uidCounter)};
vm.createContext(context);
vm.runInContext([
  extractFunction('normExerciseMediaName',mediaJs),
  extractFunction('exerciseMediaScore',mediaJs),
  extractFunction('findExerciseMovement',mediaJs),
  extractFunction('exerciseMovementMuscle',mediaJs),
  extractFunction('exerciseMovementName',mediaJs),
  extractFunction('canonicalExerciseMovement',mediaJs),
  extractFunction('normalizeGymLookup'),
  extractFunction('gymLookupMatches'),
  extractFunction('resolveGymExerciseTarget'),
  extractFunction('applyGymExerciseReplacement'),
  extractFunction('cleanupSupersetGroups'),
  extractFunction('normalizeSupersetAssignments'),
  extractFunction('supersetMeta'),
  extractFunction('prepareMovementExercises'),
  extractFunction('normalizeAIRoutinePayload')
].join('\n'),context);
context._exerciseMediaData={exercises:[
  {id:'0314',aliases:['Press banca inclinado con mancuernas'],name:'dumbbell incline bench press',target:'pectorals',body_part:'chest'}
]};

function fixture(){
  return [{id:'rutina-a',name:'Hipertrofia',days:[
    {id:'lunes',label:'Empuje',exercises:[
      {name:'Press de banca',muscle:'Pecho',series:4,reps:'8-10'},
      {name:'Aperturas',muscle:'Pecho',series:3,reps:'12-15'}
    ]},
    {id:'martes',label:'Piernas',exercises:[
      {name:'Sentadilla',muscle:'Cuádriceps',series:4,reps:'6-8'}
    ]}
  ]}];
}

test('Día 1 resuelve el ejercicio dentro del primer día y conserva el resto',()=>{
  const routines=fixture();
  const untouchedExercise=structuredClone(routines[0].days[0].exercises[1]);
  const untouchedDay=structuredClone(routines[0].days[1]);
  const target=context.resolveGymExerciseTarget(routines,{dia:'Día 1',nombre_original:'press banca'});
  assert.equal(target.error,undefined,target.error);
  assert.equal(target.day.id,'lunes');
  assert.equal(target.exerciseIndex,0);
  const result=context.applyGymExerciseReplacement(target.exercise,{nombre_nuevo:'Press inclinado con mancuernas'});
  assert.equal(result.error,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(target.exercise)),{name:'Press banca inclinado con mancuernas',muscle:'Pecho',series:4,reps:'8-10',mediaId:'0314'});
  assert.deepEqual(routines[0].days[0].exercises[1],untouchedExercise);
  assert.deepEqual(routines[0].days[1],untouchedDay);
});

test('una biserie válida queda marcada como A1/A2 y no afecta al tercer ejercicio',()=>{
  const exercises=[
    {name:'Curl',superset:'A'},
    {name:'Tríceps',superset:'A'},
    {name:'Sentadilla'}
  ];
  context.normalizeSupersetAssignments(exercises);
  const day={exercises};
  const first=context.supersetMeta(day,0),second=context.supersetMeta(day,1);
  assert.equal(first.label,'A');assert.equal(first.position,1);
  assert.equal(second.label,'A');assert.equal(second.position,2);
  assert.equal(exercises[2].superset,undefined);
});

test('un grupo de tres ejercicios no se guarda como biserie',()=>{
  const exercises=[{name:'Uno',superset:'A'},{name:'Dos',superset:'A'},{name:'Tres',superset:'A'}];
  context.normalizeSupersetAssignments(exercises);
  assert.ok(exercises.every(ex=>!ex.superset));
});

test('una modificación inválida no altera el ejercicio',()=>{
  const exercise={name:'Press de banca',muscle:'Pecho',series:4,reps:'8-10'};
  const before=structuredClone(exercise);
  const result=context.applyGymExerciseReplacement(exercise,{nombre_nuevo:'Press inclinado',series:99});
  assert.match(result.error,/series/i);
  assert.deepEqual(exercise,before);
});

test('permite un reemplazo útil sin movimiento y conserva el enfoque',()=>{
  const exercise={name:'Press de banca',muscle:'Pecho',series:4,reps:'8-10',mediaId:'viejo'};
  const result=context.applyGymExerciseReplacement(exercise,{nombre_nuevo:'Press convergente artesanal'});
  assert.equal(result.error,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(exercise)),{name:'Press convergente artesanal',muscle:'Pecho',series:4,reps:'8-10',mediaId:null});
});

test('conserva nombres cuando la IA responde con campos en español o texto directo',()=>{
  const prepared=context.prepareMovementExercises([
    {nombre:'Sentadilla hack',musculo:'Cuádriceps',series:4,repeticiones:'8-10'},
    {ejercicio:'Curl martillo',grupo_muscular:'Bíceps',sets:3,reps:'10-12'},
    'Plancha abdominal'
  ],null,false);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.exercises)),[
    {name:'Sentadilla hack',muscle:'Cuádriceps',series:4,reps:'8-10'},
    {name:'Curl martillo',muscle:'Bíceps',series:3,reps:'10-12'},
    {name:'Plancha abdominal',muscle:'Abdomen',series:3,reps:'10'}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.invalid)),[]);
  const malformed=context.prepareMovementExercises([{series:4,reps:'10'}],null,false);
  assert.deepEqual(JSON.parse(JSON.stringify(malformed.exercises)),[]);
  assert.match(malformed.invalid[0],/sin nombre/);
});

test('carga una rutina anidada, reconoce aliases y omite solamente filas incompletas',()=>{
  const normalized=context.normalizeAIRoutinePayload({rutina:{
    nombre:'Fuerza 4 días',
    dias:[
      {nombre:'Empuje',movimientos:[
        {nombre_ejercicio:'Press inclinado',grupo:'Pecho',cantidad_series:4,rango:'6-8'},
        {series:3,reps:'10'}
      ]},
      {titulo:'Piernas',workout:[
        {exercise_name:'Sentadilla frontal',body_part:'legs',sets_count:3,rep_range:'8-10'}
      ]}
    ]
  }},null);
  assert.equal(normalized.name,'Fuerza 4 días');
  assert.equal(normalized.days.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.days.map(d=>d.label))),['Empuje','Piernas']);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.days[0].exercises)),[
    {name:'Press inclinado',muscle:'Pecho',series:4,reps:'6-8'}
  ]);
  assert.equal(normalized.days[1].exercises[0].name,'Sentadilla frontal');
  assert.equal(normalized.days[1].exercises[0].series,3);
  assert.equal(normalized.days[1].exercises[0].reps,'8-10');
  assert.equal(normalized.invalid.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.emptyDays)),[]);
});

test('el ejecutor crea, persiste y activa una rutina generada por IA',()=>{
  const db={rt2:[],arid:null};
  context.routines=[];
  context.activeRid=null;
  context.S={g:(key,fallback)=>db[key]??fallback,s:(key,value)=>{db[key]=structuredClone(value);}};
  vm.runInContext(extractFunction('ejecutarAccion'),context);
  const result=context.ejecutarAccion({
    op:'crear_rutina',name:'Torso pierna',days:[
      {label:'Torso',exercises:[{name:'Press de banca',muscle:'Pecho',series:4,reps:'8-10'}]},
      {label:'Pierna',exercises:[{name:'Sentadilla',muscle:'Cuádriceps',series:4,reps:'8'}]}
    ]
  });
  assert.match(result,/creada/i);
  assert.equal(db.rt2.length,1);
  assert.equal(db.rt2[0].name,'Torso pierna');
  assert.equal(db.rt2[0].days.length,2);
  assert.equal(db.arid,db.rt2[0].id);
  assert.equal(context.routines.length,1);
  assert.equal(context.activeRid,db.arid);
});

test('la publicación declara voz nativa y una descarga APK HTTPS propia',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','app-version.json'),'utf8'));
  const apk=new URL(manifest.apkUrl);
  assert.equal(apk.protocol,'https:');
  assert.equal(apk.hostname,'martin10app.github.io');
  assert.match(apk.pathname,/\.apk$/i);
  assert.match(html,/capacitorPlugin\('TextToSpeech'\)/);
  assert.match(html,/capacitorPlugin\('AppLauncher'\)/);
  assert.match(html,/setTimeout\(\(\)=>checkForAppUpdate\(false\),3500\)/);
});

test('el catálogo completo queda disponible para IA y selector manual',()=>{
  const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','exercise-media.json'),'utf8'));
  assert.equal(catalog.exercises.length,59);
  assert.ok(catalog.exercises.every(ex=>ex.id&&ex.gif_url));
  assert.match(html,/window\._movementExercisePicker=groups/);
  assert.match(html,/mediaId:ex\.mediaId\|\|undefined/);
  assert.match(html,/CATÁLOGO PREFERIDO/);
  assert.match(html,/buscar la técnica en YouTube/);
});

test('[T1] una biserie que la IA etiqueta A1/A2 queda como una sola biserie A',()=>{
  const exercises=[
    {name:'Press banca',superset:'A1'},
    {name:'Remo con barra',superset:'A2'},
    {name:'Curl',superset:'b1'},
    {name:'Tríceps en polea',superset:'B-2'},
    {name:'Sentadilla'}
  ];
  context.normalizeSupersetAssignments(exercises);
  const day={exercises};
  const meta=exercises.map((_,i)=>context.supersetMeta(day,i));
  assert.deepEqual(meta.map(m=>m&&m.label+m.position),['A1','A2','B1','B2',null]);
});

test('[T1] biseries marcadas con true o "Biserie A" se arman de a pares consecutivos',()=>{
  const exercises=[
    {name:'Press militar',biserie:true},
    {name:'Elevaciones laterales',biserie:true},
    {name:'Dominadas',superset:'Biserie B'},
    {name:'Face pull',superset:'biserie b'},
    {name:'Plancha',superset:'no'}
  ];
  context.normalizeSupersetAssignments(exercises);
  const day={exercises};
  const meta=exercises.map((_,i)=>context.supersetMeta(day,i));
  assert.deepEqual(meta.map(m=>m&&m.label+m.position),['A1','A2','B1','B2',null]);
});

test('[T1] crear_rutina conserva la biserie A1/A2 que manda la IA',()=>{
  const normalized=context.normalizeAIRoutinePayload({name:'Torso',days:[{label:'Torso',exercises:[
    {nombre:'Press banca inclinado con mancuernas',series:4,reps:'8-10',biserie:'A1'},
    {nombre:'Remo con mancuerna',series:4,reps:'10',biserie:'A2'}
  ]}]},context._exerciseMediaData);
  const day=normalized.days[0];
  assert.equal(day.exercises[0].name,'Press banca inclinado con mancuernas');
  assert.equal(day.exercises[1].name,'Remo con mancuerna');
  assert.equal(context.supersetMeta(day,0)?.label+context.supersetMeta(day,0)?.position,'A1');
  assert.equal(context.supersetMeta(day,1)?.label+context.supersetMeta(day,1)?.position,'A2');
});
