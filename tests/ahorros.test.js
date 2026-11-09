// Ahorros: todo lo que dice "ahorro" es plata guardada y nunca se mezcla con un gasto.
// Entrega 1: separar ahorro de gasto. Entrega 2: movimientos reales en ahr1, migración y plazos fijos.
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
function extractConst(name){
  const start=html.indexOf(`const ${name}=`);
  assert.notEqual(start,-1,`No se encontró ${name}`);
  return html.slice(start,html.indexOf(';\n',start)+1).replace('const ','var ');
}

// "Hoy" fijo: 15 de noviembre de 2026 (mes 10).
const NOW=new Date(2026,10,15,12);
const FUNCS=['money','sumMoney','parseMoney','k','km','montoCat','normalizeGymLookup','resolveFinanceCategory',
  'normalizeFinanceDate','prepareExpenseAction','resolveExpenseTarget','expenseCategories',
  'ahorroISO','ahorroTipo','ahorroMoneda','ahorroFmt','ahorroSigned','migrateAhorrosFromPf4','ahorroMovsDe',
  'ahorroHistorialCat','ahorroAcumCat','ahorroNetoMes','planAhorroMes','totalAhorroMes','ahorroAcumTotal',
  'buildAhorroMov','addAhorroMov','delAhorroMovById','setAhorroSaldo','plazoFijoInfo',
  'normalizeGoalDate','financialGoalPlan','applyFinancialGoalFields','getSueldo','setSueldo',
  'shownCommitmentAmount','commitmentCategories','ejecutarAccion'];

function savingsFixture(){
  const db={
    cats4:[
      {id:'super',n:'Supermercado',base:0},
      {id:'viaje',n:'Viaje',base:0,saldoInicial:10000,ahorro:true},
      {id:'emerg',n:'Fondo emergencia',base:1500,ahorro:true}, // vieja: sin saldoInicial
      {id:'usd',n:'Dólares',base:0,saldoInicial:500,ahorro:true,tipoAhorro:'reserva',moneda:'USD'}
    ],
    pf4:{
      'viaje_8_2026':3000,  // septiembre: pasado
      'viaje_10_2026':2000, // noviembre: mes actual
      'viaje_11_2026':5000, // diciembre: plan futuro
      'viaje_2_2027':5000,  // marzo 2027: plan futuro
      'viaje_10_2026_nota':999, // no es un mes: no cuenta
      'super_10_2026':8000  // un gasto: no es ahorro
    },
    gst4:[{_id:1,c:'super',v:1200,desc:'Disco',m:10,y:2026,f:'02/11'}]
  };
  let n=0;
  const context={
    db,cats:db.cats4,gastos:db.gst4,pagosFijos:db.pf4,ahorroMovs:[],
    S:{g:(key,fallback)=>db[key]??fallback,s:(key,value)=>{db[key]=value;}},
    fmt:n=>String(Math.round(Number(n)||0)),fmtFull:n=>'$'+String(Math.round(Number(n)||0)),
    MONTHS:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    sueldos:{},getCardMonthAmt:()=>0,uid:()=>'id-'+(++n),
    Date:class extends Date{constructor(...a){if(a.length)super(...a);else super(NOW.getTime());}static now(){return NOW.getTime();}}
  };
  vm.createContext(context);
  vm.runInContext(extractConst('AHORRO_TIPOS')+'\n'+FUNCS.map(extractFunction).join('\n'),context);
  return context;
}
function migrated(){
  const f=savingsFixture();
  f.ahorroMovs=f.migrateAhorrosFromPf4(f.cats,f.pagosFijos,NOW);
  f.db.ahr1=f.ahorroMovs;
  return f;
}

test('migración: meses pasados y el actual pasan a ser aportes; el futuro queda como plan',()=>{
  const f=migrated();
  assert.deepEqual(JSON.parse(JSON.stringify(f.ahorroMovs.map(mv=>[mv.meta,mv.tipo,mv.v,mv.fecha]))),[
    ['viaje','aporte',3000,'2026-09-01'],
    ['viaje','aporte',2000,'2026-11-01']
  ]);
  assert.equal(f.db.pf4['viaje_11_2026'],5000,'pf4 no se toca');
});

test('migración: una meta vieja sin saldo inicial conserva el número que se veía',()=>{
  const f=migrated();
  assert.equal(f.cats.find(c=>c.id==='emerg').saldoInicial,1500);
  assert.equal(f.ahorroAcumCat('emerg',NOW),1500);
});

test('el saldo es saldo inicial + movimientos hasta hoy, nunca el plan futuro',()=>{
  const f=migrated();
  assert.equal(f.ahorroAcumCat('viaje',NOW),15000); // 10.000 + 3.000 + 2.000
  f.addAhorroMov({meta:'viaje',tipo:'aporte',v:4000,fecha:'2026-12-20'},NOW); // fecha futura
  assert.equal(f.ahorroAcumCat('viaje',NOW),15000);
  assert.equal(f.ahorroAcumCat('viaje',new Date(2026,11,31,12)),19000);
});

test('guardar y sacar plata mueven el saldo y el ahorrado del mes',()=>{
  const f=migrated();
  assert.ok(f.addAhorroMov({meta:'viaje',tipo:'aporte',v:'1.500',fecha:'2026-11-10'},NOW).mov);
  assert.ok(f.addAhorroMov({meta:'viaje',tipo:'retiro',v:800,fecha:'2026-11-12',nota:'pasaje'},NOW).mov);
  assert.equal(f.ahorroAcumCat('viaje',NOW),15700);
  assert.equal(f.ahorroNetoMes(10,2026),2700); // 2.000 migrado + 1.500 − 800
  assert.equal(f.db.ahr1.length,4);
});

test('el total en pesos no mezcla dólares',()=>{
  const f=migrated();
  assert.equal(f.ahorroAcumTotal('UYU'),16500); // viaje 15.000 + emergencia 1.500
  assert.equal(f.ahorroAcumTotal('USD'),500);
  f.addAhorroMov({meta:'usd',tipo:'aporte',v:100,fecha:'2026-11-01'},NOW);
  assert.equal(f.ahorroNetoMes(10,2026),2000,'el aporte en USD no entra en el mes en pesos');
});

test('totales del mes: real hasta hoy, plan en los meses que vienen',()=>{
  const f=migrated();
  assert.equal(f.totalAhorroMes(8,2026,NOW),3000);
  assert.equal(f.totalAhorroMes(10,2026,NOW),2000);
  assert.equal(f.totalAhorroMes(11,2026,NOW),6500); // plan: viaje 5.000 + base emergencia 1.500
});

test('valida montos, fecha y destino',()=>{
  const f=migrated();
  assert.match(f.addAhorroMov({meta:'viaje',tipo:'aporte',v:0}).error,/mayor a 0/);
  assert.match(f.addAhorroMov({meta:'super',tipo:'aporte',v:100}).error,/dónde/);
  assert.match(f.addAhorroMov({meta:'viaje',tipo:'aporte',v:100,fecha:'2026-02-30'}).error,/fecha/);
});

test('editar un movimiento lo reemplaza y borrarlo recalcula el saldo',()=>{
  const f=migrated();
  const {mov}=f.addAhorroMov({meta:'viaje',tipo:'aporte',v:1000,fecha:'2026-11-05'},NOW);
  f.addAhorroMov({id:mov.id,meta:'viaje',tipo:'aporte',v:1200,fecha:'2026-11-05'},NOW);
  assert.equal(f.ahorroAcumCat('viaje',NOW),16200);
  f.delAhorroMovById(mov.id);
  assert.equal(f.ahorroAcumCat('viaje',NOW),15000);
});

test('ajustar el saldo anota la diferencia y no borra nada',()=>{
  const f=migrated();
  const before=f.db.ahr1.length;
  const res=f.setAhorroSaldo('viaje',12000,NOW);
  assert.equal(res.mov.tipo,'ajuste');
  assert.equal(res.mov.v,-3000);
  assert.equal(f.db.ahr1.length,before+1);
  assert.equal(f.ahorroAcumCat('viaje',NOW),12000);
  assert.equal(f.setAhorroSaldo('viaje',12000,NOW).mov,null,'sin diferencia no anota nada');
});

test('+ Gasto no ofrece metas de ahorro ni categorías archivadas',()=>{
  const f=savingsFixture();
  f.cats.push({id:'viejo',n:'Viejo',base:0,archived:true});
  assert.deepEqual(f.expenseCategories(f.cats).map(c=>c.id),['super']);
});

test('la IA no anota un gasto dentro de una meta de ahorro',()=>{
  const f=savingsFixture();
  assert.match(f.prepareExpenseAction({v:500,cat:'Viaje'},f.cats,f.gastos,NOW).error,/ahorro/i);
});

test('la IA guarda y saca plata como movimientos',()=>{
  const f=migrated();
  assert.match(f.ejecutarAccion({op:'ahorro',v:1500,cat:'Viaje',fecha:'2026-11-10'}),/guardado/);
  assert.match(f.ejecutarAccion({op:'retiro_ahorro',v:500,cat:'Viaje',fecha:'2026-11-11'}),/Sacaste/);
  assert.equal(f.ahorroAcumCat('viaje',NOW),16000);
  assert.equal(f.db.pf4['viaje_10_2026'],2000,'ya no escribe en pf4');
});

test('la IA pregunta en cuál ahorro si hay varios y no dijo cuál',()=>{
  const f=migrated();
  assert.match(f.ejecutarAccion({op:'ahorro',v:1500}),/En cuál/);
});

test('la IA ajusta el saldo sin borrar historial',()=>{
  const f=migrated();
  assert.match(f.ejecutarAccion({op:'set_saldo_ahorro',cat:'viaje',v:20000}),/20000/);
  assert.equal(f.ahorroMovs.filter(mv=>mv.meta==='viaje').length,3);
  assert.equal(f.db.pf4['viaje_8_2026'],3000);
});

test('plazo fijo: días al vencimiento, interés estimado y aviso',()=>{
  const f=migrated();
  const pf={id:'pf1',n:'Plazo BROU',ahorro:true,tipoAhorro:'plazo_fijo',saldoInicial:100000,tasa:6,fechaInicio:'2026-08-20',fechaVence:'2026-11-18'};
  f.cats.push(pf);
  const info=f.plazoFijoInfo(pf,NOW);
  assert.equal(info.diasPlazo,90);
  assert.equal(info.diasFaltan,3);
  assert.equal(info.interes,1479); // 100.000 × 6% × 90 / 365
  assert.equal(info.porVencer,true);
  assert.equal(f.plazoFijoInfo(pf,new Date(2026,10,20,12)).vencido,true);
});

test('el plan del mes usa el aporte planificado de la meta si no hay monto propio',()=>{
  const f=migrated();
  f.cats.find(c=>c.id==='emerg').aportePlan=2500;
  assert.equal(f.planAhorroMes(2,2027),5000+2500); // viaje: monto propio en pf4; emergencia: aportePlan
});

test('un ahorro archivado no suma al total',()=>{
  const f=migrated();
  f.cats.find(c=>c.id==='emerg').archived=true;
  assert.equal(f.ahorroAcumTotal('UYU'),15000);
});

test('migración: el saldo que sale de la base queda marcado para confirmar',()=>{
  const f=migrated();
  assert.equal(f.cats.find(c=>c.id==='emerg').revisarSaldo,true);
  assert.equal(f.cats.find(c=>c.id==='viaje').revisarSaldo,undefined,'ya tenía saldo inicial');
});
