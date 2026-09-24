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

function financeFixture(){
  const context={
    cats:[
      {id:'ute',n:'UTE',base:5500},
      {id:'super',n:'Supermercado',base:0},
      {id:'ahorro',n:'Ahorro',base:1500,ahorro:true},
      {id:'card_mc',n:'MASTERCARD',base:0,cardRef:'mc'}
    ],
    gastos:[
      {_id:1,c:'super',v:1200.25,m:6,y:2026,f:'03/07',desc:'Disco'},
      {_id:2,c:'super',v:799.75,m:6,y:2026,f:'08/07',desc:'Tienda Inglesa'}
    ],
    pagosFijos:{'ute_6_2026':6100,'ahorro_6_2026':2000},
    getCardMonthAmt:()=>3400
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('money'),extractFunction('sumMoney'),extractFunction('parseMoney'),
    extractFunction('k'),extractFunction('montoCat'),extractFunction('totalCompromisosMes'),
    extractFunction('totalAhorroMes'),extractFunction('gastosVariablesMes'),
    extractFunction('totalVariablesMes'),extractFunction('totalGastosMes')
  ].join('\n'),context);
  return context;
}

function smartFinanceFixture(){
  const context={
    cats:[
      {id:'super',n:'Supermercado'},
      {id:'nafta',n:'Combustible'},
      {id:'ute',n:'UTE'},
      {id:'visa',n:'VISA ORO',base:40000}
    ],
    gastos:[
      {_id:10,c:'super',v:1200,desc:'Disco 8 de Octubre',m:6,y:2026,f:'10/07'},
      {_id:11,c:'super',v:900,desc:'Disco',m:6,y:2026,f:'12/07'},
      {_id:12,c:'nafta',v:2000,desc:'Ancap',m:6,y:2026,f:'13/07'}
    ],
    pagosFijos:{}
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('money'),extractFunction('parseMoney'),extractFunction('normalizeGymLookup'),
    extractFunction('resolveFinanceCategory'),extractFunction('normalizeFinanceDate'),
    extractFunction('prepareExpenseAction'),extractFunction('resolveExpenseTarget'),
    extractFunction('ahorroAcumCat'),extractFunction('normalizeGoalDate'),
    extractFunction('financialGoalPlan'),extractFunction('applyFinancialGoalFields')
  ].join('\n'),context);
  return context;
}

function financeActionFixture(){
  const base=smartFinanceFixture();
  const db={gst4:structuredClone(base.gastos),sld4:{},pf4:{},cats4:base.cats};
  Object.assign(base,{
    S:{g:(key,fallback)=>db[key]??fallback,s:(key,value)=>{db[key]=value;}},
    fmt:n=>String(Math.round(Number(n)||0)),fmtFull:n=>'$'+String(Math.round(Number(n)||0)),
    MONTHS:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    sueldos:db.sld4,pagosFijos:db.pf4,getCardMonthAmt:()=>0,uid:(()=>{let id=0;return()=>`goal-${++id}`;})(),db
  });
  vm.runInContext([
    extractFunction('km'),extractFunction('getSueldo'),extractFunction('setSueldo'),extractFunction('ejecutarAccion')
  ].join('\n'),base);
  return base;
}

test('caracteriza formatos monetarios usados actualmente',()=>{
  const f=financeFixture();
  assert.deepEqual([
    f.parseMoney('$ 1.250,50'),
    f.parseMoney('1,250.50'),
    f.parseMoney('2.500'),
    f.parseMoney('799,75')
  ],[1250.5,1250.5,2500,799.75]);
});

test('caracteriza el total mensual sin contar ahorro como gasto',()=>{
  const f=financeFixture();
  assert.equal(f.totalCompromisosMes(6,2026),6100);
  assert.equal(f.totalVariablesMes(6,2026),2000);
  assert.equal(f.totalAhorroMes(6,2026),2000);
  assert.equal(f.totalGastosMes(6,2026),11500);
});

test('categoriza por nombre, comercio conocido y palabra clave sin inventar IDs',()=>{
  const f=smartFinanceFixture();
  assert.equal(f.resolveFinanceCategory({cat:'Supermercado'}).category.id,'super');
  assert.equal(f.resolveFinanceCategory({desc:'Compras en Disco'}).category.id,'super');
  assert.equal(f.resolveFinanceCategory({desc:'Cargué nafta en Shell'}).category.id,'nafta');
  assert.match(f.resolveFinanceCategory({desc:'algo irreconocible'}).error,/categoría/i);
});

test('normaliza fechas y rechaza días inexistentes',()=>{
  const f=smartFinanceFixture(),now=new Date(2026,6,31,12);
  assert.deepEqual(JSON.parse(JSON.stringify(f.normalizeFinanceDate({fecha:'2026-02-28'},now))),{m:1,y:2026,f:'28/02'});
  assert.match(f.normalizeFinanceDate({fecha:'2026-02-30'},now).error,/día/i);
  assert.deepEqual(JSON.parse(JSON.stringify(f.normalizeFinanceDate({m:1,y:2026},now))),{m:1,y:2026,f:'28/02'});
});

test('prepara un gasto válido y permite localizar solamente el último solicitado',()=>{
  const f=smartFinanceFixture();
  const prepared=f.prepareExpenseAction({v:'$ 1.250,50',desc:'Disco',fecha:'2026-07-15'});
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.expense)),{c:'super',v:1250.5,desc:'Disco',m:6,y:2026,f:'15/07'});
  assert.match(f.resolveExpenseTarget({desc:'Disco'}).error,/varios/i);
  assert.equal(f.resolveExpenseTarget({desc:'Disco',ultimo:true}).expense._id,11);
});

test('el ejecutor corrige un gasto de forma atómica y no crea un duplicado',()=>{
  const f=financeActionFixture(),beforeLength=f.db.gst4.length;
  const result=f.ejecutarAccion({op:'editar_gasto',desc_original:'Disco',ultimo:true,v:1500});
  assert.match(result,/Corregí el gasto ID 11/);
  assert.equal(f.db.gst4.length,beforeLength);
  assert.equal(f.db.gst4.find(g=>g._id===11).v,1500);
  const snapshot=structuredClone(f.db.gst4);
  assert.match(f.ejecutarAccion({op:'editar_gasto',gasto_id:11,v:-20}),/mayor a 0/i);
  assert.deepEqual(f.db.gst4,snapshot);
});

test('el ejecutor diferencia ingreso total de ingreso adicional',()=>{
  const f=financeActionFixture();
  f.ejecutarAccion({op:'ingreso',v:80000,m:6,y:2026,modo:'total'});
  f.ejecutarAccion({op:'ingreso',v:5000,m:6,y:2026,modo:'sumar'});
  assert.equal(f.db.sld4['6_2026'],85000);
});

test('suma importes al total mensual sin reemplazarlo ni crear gastos',()=>{
  const f=financeActionFixture(),expenseCount=f.db.gst4.length;
  assert.match(f.ejecutarAccion({op:'ajustar_monto',cat:'Visa Oro',delta:1200,m:7,y:2026}),/Nuevo total: \$41200/);
  assert.match(f.ejecutarAccion({op:'ajustar_monto',cat:'visa',delta:800,m:7,y:2026}),/Nuevo total: \$42000/);
  assert.equal(f.db.pf4['visa_7_2026'],42000);
  assert.equal(f.db.gst4.length,expenseCount);
});

test('calcula el aporte mensual necesario para llegar a una meta con fecha',()=>{
  const f=smartFinanceFixture();
  const meta={id:'electrico',objetivo:500000,base:100000,aportePlan:20000,fechaObjetivo:'2027-12-31'};
  f.cats.push(meta);
  const plan=f.financialGoalPlan(meta,new Date(2026,7,1,12));
  assert.deepEqual(JSON.parse(JSON.stringify(plan)),{saved:100000,target:500000,remaining:400000,date:'2027-12-31',months:17,required:23530,planned:20000,status:'insuficiente'});
  const undated=f.financialGoalPlan({...meta,fechaObjetivo:''},new Date(2026,7,1,12));
  assert.equal(undated.required,0);assert.equal(undated.status,'sin_fecha');
});

test('la IA crea y luego actualiza una meta financiera sin duplicarla',()=>{
  const f=financeActionFixture();
  const created=f.ejecutarAccion({op:'crear_meta',nombre:'Auto eléctrico',objetivo:900000,fecha_objetivo:'2028-12-31',saldo_inicial:100000,aporte_mensual:30000,descripcion:'Cambiar el auto actual'});
  assert.match(created,/Meta "Auto eléctrico" creada/);
  const meta=f.cats.find(c=>c.n==='Auto eléctrico');
  assert.deepEqual({objetivo:meta.objetivo,fecha:meta.fechaObjetivo,saldo:meta.saldoInicial,base:meta.base,plan:meta.aportePlan,detalle:meta.descripcionObjetivo},{objetivo:900000,fecha:'2028-12-31',saldo:100000,base:0,plan:30000,detalle:'Cambiar el auto actual'});
  assert.match(f.ejecutarAccion({op:'crear_meta',nombre:'Auto eléctrico'}),/Ya existe/);
  assert.match(f.ejecutarAccion({op:'actualizar_meta',cat:meta.id,aporte_mensual:40000}),/actualizada/);
  assert.equal(meta.aportePlan,40000);
});

function actionProtocolFixture(){
  const executed=[];
  const context={
    AI_ALLOWED_ACTIONS:new Set(['gasto','evento','cambiar_ejercicio']),
    ejecutarAccion:acc=>{executed.push(structuredClone(acc));return 'ok '+acc.op;},
    executed
  };
  vm.createContext(context);
  vm.runInContext([extractFunction('normalizeGymLookup'),extractFunction('isAIActionExecutionError'),extractFunction('executeAIActionBlocks')].join('\n'),context);
  return context;
}

test('el protocolo ejecuta acciones aunque la IA use markdown, alias o un array JSON',()=>{
  const f=actionProtocolFixture();
  let run=f.executeAIActionBlocks('Listo\n[ACCIÓN]\n```json\n{"op":"gasto","cat":"super","v":1250}\n```\n[/ACCIÓN]');
  assert.equal(run.matched,1);
  assert.equal(run.done.length,1);
  assert.equal(run.clean,'Listo');
  run=f.executeAIActionBlocks('[{"op":"evento","titulo":"Dentista"},{"op":"cambiar_ejercicio","dia":"Día 1"}]');
  assert.equal(run.matched,2);
  assert.equal(run.done.length,2);
  assert.equal(run.clean,'');
});

test('el protocolo informa JSON roto y nunca ejecuta operaciones no permitidas',()=>{
  const f=actionProtocolFixture();
  const broken=f.executeAIActionBlocks('[ACCION]{op:"gasto",v:20}[/ACCION]');
  assert.equal(broken.done.length,0);
  assert.match(broken.errors.join(' '),/JSON inválido/i);
  const forbidden=f.executeAIActionBlocks('[ACTION]{"op":"formatear_telefono"}[/ACTION]');
  assert.equal(forbidden.done.length,0);
  assert.match(forbidden.errors.join(' '),/no permitida/i);
  const example=f.executeAIActionBlocks('Ejemplo:\n```json\n{"nombre":"Martín"}\n```');
  assert.equal(example.done.length,0);
  assert.equal(example.errors.length,0);
});

test('el protocolo no informa como realizada una acción rechazada por el ejecutor',()=>{
  const f=actionProtocolFixture();
  f.ejecutarAccion=()=> 'Faltan días válidos para crear la rutina';
  f.AI_ALLOWED_ACTIONS.add('crear_rutina');
  const run=f.executeAIActionBlocks('[ACCION]{"op":"crear_rutina","name":"Vacía"}[/ACCION]');
  assert.equal(run.done.length,0);
  assert.match(run.errors.join(' '),/Faltan días/i);
});

test('recupera localmente un gasto simple cuando la respuesta de IA omite la acción',()=>{
  const f=smartFinanceFixture();
  Object.assign(f,{S:{g:(key,fallback)=>key==='gst4'?f.gastos:fallback}});
  vm.runInContext(extractFunction('inferDirectExpenseAction'),f);
  const action=f.inferDirectExpenseAction('Gasté $1.250,50 en Disco ayer',new Date(2026,7,3,12));
  assert.deepEqual(JSON.parse(JSON.stringify(action)),{op:'gasto',v:1250.5,desc:'Disco',fecha:'2026-08-02'});
  assert.deepEqual(JSON.parse(JSON.stringify(f.inferDirectExpenseAction('Cargame un gasto de 900 en Disco',new Date(2026,7,3,12)))),{op:'gasto',v:900,desc:'Disco',fecha:'2026-08-03'});
  assert.equal(f.inferDirectExpenseAction('¿Cuánto gasté este mes?',new Date(2026,7,3,12)),null);
});

test('detecta pedidos coloquiales de crear rutinas y cargar gastos',()=>{
  const f={};vm.createContext(f);
  vm.runInContext([extractFunction('normalizeGymLookup'),extractFunction('expectsAIAction')].join('\n'),f);
  assert.equal(f.expectsAIAction('Haceme una rutina de cuatro días'),true);
  assert.equal(f.expectsAIAction('Armame una rutina para hipertrofia'),true);
  assert.equal(f.expectsAIAction('Cargame un gasto de 900 pesos'),true);
  assert.equal(f.expectsAIAction('¿Cómo puedo armar una rutina?'),false);
});

test('el catálogo de ejercicios solo se agrega para cambios de gym',()=>{
  const f={};vm.createContext(f);
  vm.runInContext([extractFunction('normalizeGymLookup'),extractFunction('shouldIncludeMovementCatalog')].join('\n'),f);
  assert.equal(f.shouldIncludeMovementCatalog('Gasté $1200 en Disco'),false);
  assert.equal(f.shouldIncludeMovementCatalog('¿Qué gastos tengo anotados?'),false);
  assert.equal(f.shouldIncludeMovementCatalog('Haceme una rutina de gimnasio'),true);
  assert.equal(f.shouldIncludeMovementCatalog('Cambiame press banca por mancuernas'),true);
});
