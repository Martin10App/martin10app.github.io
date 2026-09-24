const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function extractFunction(name,source=html){
  const start=source.search(new RegExp(`(async )?function ${name}\\(`));
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
const constant=name=>html.match(new RegExp(`const ${name}=[^\\n]*\\n`))[0];

const FUNCTIONS=['money','sumMoney','parseMoney','fmt','normalizeGymLookup','parseFinanceMonth','categoryTokens','commitmentCategories','cardHasPurchases','shownCommitmentAmount',
  'resolveCommitmentCategory','inferCommitmentAmountAction','resolveFinanceCategory','normalizeFinanceDate','getCardPurchs','pInstAmt','pStartM','pStartY',
  'instMonthYear','getCardMonthAmt','ensureCardCats','isAIActionExecutionError','executeAIActionBlocks','expectsAIAction','inferDirectExpenseAction',
  'prepareExpenseAction','executeAIActionResponse','ejecutarAccion'];

// Categorías comunes con monto mensual, más dos tarjetas de cards1: Visa SIN compras (así tiene Martín
// las suyas: se usan como monto mensual en pf4) y Master con compras en cuotas.
function makeContext(now=new Date(2026,8,24,12)){
  let n=0;
  const db={
    cats4:[{id:'oca1',n:'OCA card',c:'#0f0',base:0},{id:'brou1',n:'Banco card',c:'#00f',base:0},{id:'brou2',n:'Banco Recompensa',c:'#00f',base:12300},
      {id:'ute',n:'UTE',c:'#0ff',base:3900},{id:'card_v',n:'Visa',c:'#33f',base:0,cardRef:'v'},{id:'card_m',n:'Master',c:'#f33',base:0,cardRef:'m'},
      {id:'meta1',n:'Reducir gasto mensual en tarjetas',c:'#a0f',base:0,ahorro:true}],
    cards1:[{id:'v',name:'Visa',type:'Visa',color:'#33f'},{id:'m',name:'Master',type:'Mastercard',color:'#f33'}],
    cpurch1:[{id:'p1',cardId:'m',commerce:'Heladera',total:30000,installments:6,paidInstallments:0,startM:7,startY:2026}],
    pf4:{'oca1_9_2026':18000},gst4:[]
  };
  const context={db,MONTHS:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    uid:()=>'u'+(++n),Date:class extends Date{constructor(...a){super(...(a.length?a:[now.getTime()]));}static now(){return now.getTime();}},
    fmtFull:v=>'$'+Math.round(v||0).toLocaleString('es-UY'),refreshAIAppState(){},
    S:{g:(k,f)=>k in db?structuredClone(db[k]):f,s:(k,v)=>{db[k]=structuredClone(v);return true;}}};
  vm.createContext(context);
  vm.runInContext(constant('FINANCE_MONTH_NAMES')+constant('CATEGORY_STOPWORDS')+constant('AI_ALLOWED_ACTIONS')+FUNCTIONS.map(f=>extractFunction(f)).join('\n'),context);
  Object.assign(context,{cats:db.cats4,cards:db.cards1,cpurch:db.cpurch1,gastos:db.gst4,pagosFijos:db.pf4});
  vm.runInContext('var cats=this.cats,cards=this.cards,cpurch=this.cpurch,gastos=this.gastos,pagosFijos=this.pagosFijos;',context);
  context.now=now;
  return context;
}
const plain=x=>JSON.parse(JSON.stringify(x));
const say=(ctx,text)=>plain(ctx.inferCommitmentAmountAction(text,ctx.now,ctx.db.cats4,ctx.db.cpurch1));

test('[G1] "anotame 1200 de la oca para el mes que viene" suma sobre lo que muestra octubre',()=>{
  const ctx=makeContext();
  const action=say(ctx,'anotame 1200 de la oca para el mes que viene');
  assert.deepEqual(action,{op:'ajustar_monto',cat:'oca1',delta:1200,m:9,y:2026});
  const msg=ctx.ejecutarAccion(action);
  assert.match(msg,/OCA card" · Octubre 2026: \$18\.000 → \$19\.200/);
  assert.equal(ctx.db.pf4.oca1_9_2026,19200);
});

test('[G1] "sumame en octubre 3500 en banco recompensa": sin monto propio parte de la base',()=>{
  const ctx=makeContext();
  const action=say(ctx,'sumame en octubre 3500 en banco recompensa');
  assert.deepEqual(action,{op:'ajustar_monto',cat:'brou2',delta:3500,m:9,y:2026});
  assert.match(ctx.ejecutarAccion(action),/\$12\.300 → \$15\.800/);
  assert.equal(ctx.db.pf4.brou2_9_2026,15800);
});

test('[G1] "poné la ute de noviembre en 4200" reemplaza y muestra antes → después',()=>{
  const ctx=makeContext();
  const action=say(ctx,'poné la ute de noviembre en 4200');
  assert.deepEqual(action,{op:'fijo',cat:'ute',v:4200,m:10,y:2026});
  assert.equal(ctx.ejecutarAccion(action),'UTE · Noviembre 2026: $3.900 → $4.200');
});

test('[G1] una tarjeta que no existe o dos que coinciden: error claro y nada anotado',()=>{
  const ctx=makeContext();
  assert.match(say(ctx,'anotá 800 en la tarjeta itau').error,/No encontré la tarjeta "itau"\. Las que tenés: OCA card, Banco card, Banco Recompensa, UTE, Visa, Master/);
  assert.match(say(ctx,'anotame 1200 en banco').error,/Hay 2 que coinciden: Banco card y Banco Recompensa\. ¿Cuál\?/);
  assert.deepEqual(ctx.db.pf4,{'oca1_9_2026':18000});
});

test('[G1] cambio de año: en diciembre "el mes que viene" y "en enero" son enero siguiente',()=>{
  const ctx=makeContext(new Date(2026,11,10,12));
  assert.deepEqual(say(ctx,'anotame 500 de la oca para el mes que viene'),{op:'ajustar_monto',cat:'oca1',delta:500,m:0,y:2027});
  assert.deepEqual(say(ctx,'sumame 300 en banco recompensa en enero'),{op:'ajustar_monto',cat:'brou2',delta:300,m:0,y:2027});
  assert.deepEqual(say(ctx,'sumame 300 en banco recompensa en octubre 2026'),{op:'ajustar_monto',cat:'brou2',delta:300,m:9,y:2026});
  // Un monto después del mes no se toma como año; octubre en diciembre es el de hace 2 meses.
  assert.deepEqual(say(ctx,'sumame en octubre 2000 en banco recompensa'),{op:'ajustar_monto',cat:'brou2',delta:2000,m:9,y:2026});
  assert.deepEqual(say(ctx,'sumame 700 en banco recompensa en marzo'),{op:'ajustar_monto',cat:'brou2',delta:700,m:2,y:2027});
});

test('[G1] tarjeta sin compras = monto mensual (el uso real de Martín); con compras, sumar agrega una compra y no congela el mes',()=>{
  const ctx=makeContext();
  // Así están sus tarjetas en el respaldo real: categoría card_ con cardRef, SIN compras en cuotas y
  // con el monto de cada mes en pf4. Se tiene que poder sumar como a cualquier compromiso.
  const visa=say(ctx,'anotame 900 en la visa para el mes que viene');
  assert.deepEqual(visa,{op:'ajustar_monto',cat:'card_v',delta:900,m:9,y:2026});
  assert.match(ctx.ejecutarAccion(visa),/"Visa" · Octubre 2026: \$0 → \$900/);
  assert.equal(ctx.db.pf4.card_v_9_2026,900);
  assert.match(ctx.ejecutarAccion({op:'ajustar_monto',cat:'Visa',delta:300,m:9,y:2026}),/\$900 → \$1\.200/);
  assert.equal(ctx.db.pf4.card_v_9_2026,1200);
  assert.equal(ctx.db.cpurch1.length,1,'una tarjeta sin compras no recibe compras');
  const action=say(ctx,'sumame 2000 en la tarjeta master para octubre');
  assert.equal(action.op,'compra');assert.equal(action.cardId,'m');
  const msg=ctx.ejecutarAccion(action);
  assert.match(msg,/Master · Octubre 2026: \$5\.000 → \$7\.000/);
  assert.equal(ctx.db.pf4.card_m_9_2026,undefined,'no congela el mes');
  assert.equal(ctx.db.cpurch1.length,2);
  // Y ajustar_monto directo sobre esa tarjeta también va como compra.
  assert.match(ctx.ejecutarAccion({op:'ajustar_monto',cat:'Master',delta:1000,m:9,y:2026}),/\$7\.000 → \$8\.000/);
});

test('[G1] restar, y frases que no son montos de tarjeta quedan para la IA',()=>{
  const ctx=makeContext();
  assert.deepEqual(say(ctx,'restame 500 de la ute en octubre'),{op:'ajustar_monto',cat:'ute',delta:-500,m:9,y:2026});
  assert.equal(say(ctx,'¿cuánto gasté este mes?'),null);
  assert.equal(say(ctx,'anotame un gasto de 900 en Disco'),null);
  assert.equal(say(ctx,'haceme una rutina de 4 días'),null);
});

test('[G1] la acción equivocada de la IA se ignora y se usa la resolución local',async()=>{
  const ctx=makeContext();
  const reply='Listo, lo anoto. [ACCION]{"op":"compra","n":"OCA","v":1200}[/ACCION] [ACCION]{"op":"ajustar_monto","cat":"Visa","delta":1200}[/ACCION]';
  const run=plain(await ctx.executeAIActionResponse(reply,'anotame 1200 de la oca para el mes que viene'));
  assert.equal(run.errors.length,0,run.errors.join(' | '));
  assert.equal(run.done.length,1);assert.match(run.done[0],/\$18\.000 → \$19\.200/);
  assert.equal(run.clean,'Listo, lo anoto.');
  assert.equal(ctx.db.cpurch1.length,1);assert.equal(ctx.db.pf4.card_v_9_2026,undefined);
  const ask=plain(await ctx.executeAIActionResponse('[ACCION]{"op":"ajustar_monto","cat":"Banco card","delta":1200}[/ACCION]','anotame 1200 en la tarjeta banco'));
  assert.equal(ask.done.length,0);assert.match(ask.errors[0],/¿Cuál\?/);
  assert.equal(ctx.db.pf4.brou1_8_2026,undefined,'la IA no anota cuando hay que preguntar');
});

test('[G1] una meta con "en tarjetas" en el nombre no compite con la tarjeta (caso del respaldo real)',()=>{
  const ctx=makeContext();
  assert.deepEqual(say(ctx,'sumame 3500 en banco recompensa en octubre'),{op:'ajustar_monto',cat:'brou2',delta:3500,m:9,y:2026});
  assert.deepEqual(say(ctx,'cargame 2000 en la tarjeta oca en noviembre'),{op:'ajustar_monto',cat:'oca1',delta:2000,m:10,y:2026});
  assert.deepEqual(say(ctx,'poné la ute de diciembre en 2600'),{op:'fijo',cat:'ute',v:2600,m:11,y:2026});
  // Si comparten palabras, gana la que comparte más: "banco recompensa" no es ambiguo con "banco card".
  assert.equal(say(ctx,'anotame 500 en banco recompensa').cat,'brou2');
});
