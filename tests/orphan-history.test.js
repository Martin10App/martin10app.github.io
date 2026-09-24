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

const FUNCTIONS=['normalizeGymLookup','findOrphanHistory','orphanSlotLabel','orphanLabel','suggestOrphanTarget','planOrphanLink','applyOrphanLink','undoOrphanLink'];

// Categorías recreadas con ids nuevos; el historial viejo quedó con ids cortos que ya no existen.
function makeContext(){
  const db={
    cats4:[{id:'n1',n:'Visa card',base:0,cardRef:'v'},{id:'n2',n:'Banco Recompensa',base:0},{id:'n3',n:'Luz',base:0},
      {id:'n4',n:'Empresa Alarmas',base:0},{id:'n5',n:'Préstamo terreno',base:0},{id:'n6',n:'Cuota auto',base:0},
      {id:'n7',n:'Seguro de Auto',base:0},{id:'n8',n:'Ahorro',base:0},{id:'n9',n:'Ahorro 4500 USD',base:0,ahorro:true},
      {id:'n10',n:'Jardín infantil',base:0}],
    pf4:{
      visa_0_2025:7900,visa_1_2025:46000,visa_0_2026:9999,   // enero 2026 también existe en la categoría nueva
      n1_0_2026:10100,
      prest_0_2025:5300,alarma_0_2025:1800,auto_5_2025:5500,seguro_0_2025:1200,ahorro_1_2025:1500,escuela_2_2025:4500,
      mq9zzzzzzz1abc2def_3_2026:700
    },
    pe4:{visa_0_2025:true,visa_1_2025:true,n1_0_2026:false,visa_0_2026:true}
  };
  const context={db,MS:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
    S:{g:(k,f)=>k in db?structuredClone(db[k]):f,s:(k,v)=>{db[k]=structuredClone(v);return true;}}};
  vm.createContext(context);
  vm.runInContext(FUNCTIONS.map(extractFunction).join('\n')+';var cats=this.db.cats4,pagosFijos=this.db.pf4,pagosEstado=this.db.pe4;',context);
  return context;
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('encuentra el historial cuyo id de categoría ya no existe, agrupado y con su rango',()=>{
  const ctx=makeContext();
  const groups=plain(ctx.findOrphanHistory(ctx.db.cats4,ctx.db.pf4,ctx.db.pe4));
  assert.deepEqual(groups.map(g=>g.id),['visa','ahorro','alarma','auto','escuela','mq9zzzzzzz1abc2def','prest','seguro']);
  const visa=groups[0];
  assert.equal(visa.months,3);assert.equal(visa.pf,3);assert.equal(visa.pe,3);
  assert.equal(ctx.orphanSlotLabel(visa.first),'Ene 2025');assert.equal(ctx.orphanSlotLabel(visa.last),'Ene 2026');
  assert.ok(!groups.some(g=>g.id==='n1'),'las categorías actuales no son huérfanas');
});

test('sugiere la categoría actual por nombre y no adivina cuando no hay pista',()=>{
  const ctx=makeContext(),s=id=>ctx.suggestOrphanTarget(id,ctx.db.cats4);
  assert.equal(s('visa'),'n1');
  assert.equal(s('prest'),'n5','prefijo: prest → Préstamo');
  assert.equal(s('alarma'),'n4','alarma → Alarmas');
  assert.equal(s('auto'),'n6','empate por palabra: gana el nombre más corto (Cuota auto, no Seguro de Auto)');
  assert.equal(s('seguro'),'n7');
  assert.equal(s('ahorro'),'n8','Ahorro antes que Ahorro 4500 USD');
  assert.equal(s('escuela'),null,'sin pista: el usuario elige');
  assert.equal(s('mq9zzzzzzz1abc2def'),null);
  assert.equal(ctx.orphanLabel('mq9zzzzzzz1abc2def'),'Categoría borrada');
  assert.equal(ctx.orphanLabel('cel_personal'),'Cel personal');
});

test('vincular completa solo los meses vacíos, mueve el pagado y se puede deshacer',()=>{
  const ctx=makeContext();
  const before=structuredClone(ctx.db);
  const plan=plain(ctx.applyOrphanLink({visa:'n1',prest:'n5'},[]));
  assert.equal(plan.filled,3,'visa ene y feb 2025 + prest ene 2025');
  assert.equal(plan.kept,1,'enero 2026 ya tenía monto en la categoría nueva y se conserva');
  assert.equal(ctx.db.pf4.n1_0_2025,7900);assert.equal(ctx.db.pf4.n1_1_2025,46000);
  assert.equal(ctx.db.pf4.n1_0_2026,10100,'no pisa lo que ya estaba');
  assert.equal(ctx.db.pf4.n5_0_2025,5300);
  assert.equal(ctx.db.pe4.n1_0_2025,true);assert.equal(ctx.db.pe4.n1_0_2026,false,'el pagado existente no se pisa');
  assert.equal(ctx.db.pf4.visa_0_2025,undefined,'lo viejo sale de pf4…');
  assert.equal(ctx.db.orphanUndo1.removed.length,7,'…pero queda guardado para deshacer: 4 montos (3 visa + prest) y 3 pagados');
  assert.equal(ctx.db.pf4.escuela_2_2025,4500,'lo que no se eligió queda como estaba');
  assert.ok(ctx.undoOrphanLink());
  assert.deepEqual(ctx.db.pf4,before.pf4);assert.deepEqual(ctx.db.pe4,before.pe4);
  assert.equal(ctx.db.orphanUndo1,null);
});

test('crear categoría nueva para un grupo y deshacer la borra',()=>{
  const ctx=makeContext();
  const plan=plain(ctx.applyOrphanLink({escuela:'nuevo1'},[{id:'nuevo1',n:'Escuela',c:'#888',base:0}]));
  assert.equal(plan.filled,1);
  assert.ok(ctx.db.cats4.some(c=>c.id==='nuevo1'));assert.equal(ctx.db.pf4.nuevo1_2_2025,4500);
  ctx.undoOrphanLink();
  assert.ok(!ctx.db.cats4.some(c=>c.id==='nuevo1'));assert.equal(ctx.db.pf4.escuela_2_2025,4500);
});

test('dos grupos al mismo destino: el primero gana y el segundo no pisa',()=>{
  const ctx=makeContext();
  const plan=plain(ctx.planOrphanLink({alarma:'n3',seguro:'n3'},ctx.db.pf4,ctx.db.pe4));
  assert.equal(plan.filled,1);assert.equal(plan.kept,1);
  assert.equal(Object.keys(plan.pf).length,1);
});
