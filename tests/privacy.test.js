const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// La página y el repo son públicos: nada de datos personales ni financieros reales en el código.
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const testFiles=fs.readdirSync(__dirname).filter(f=>f.endsWith('.js')&&f!=='privacy.test.js').map(f=>[f,fs.readFileSync(path.join(__dirname,f),'utf8')]);

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

test('[T0] index.html no trae el historial de pagos ni la semilla',()=>{
  assert.doesNotMatch(html,/SEED_PF|SEED_PE/);
  // Claves de pagos por mes estilo "categoria_mes_año": 12 de ellas seguidas eran la semilla.
  assert.doesNotMatch(html,/["'][a-z_]+_\d{1,2}_20\d\d["']\s*:\s*(\d|true)/);
});

test('[T0] sin nombres de personas, bancos como ids ni montos base reales',()=>{
  for(const [name,source] of [['index.html',html],...testFiles]){
    assert.doesNotMatch(source,/\b(luc[ií]a|alma|madre)\b/i,`${name}: nombre personal`);
    assert.doesNotMatch(source,/\bid\s*:\s*['"](oca|brou|itau|prest|escuela|matricula|cel_lucia|curso_lucia)['"]/i,`${name}: id de categoría personal`);
    assert.doesNotMatch(source,/["']cat["']\s*:\s*\\?["'](oca|brou|itau|prest)\\?["']/i,`${name}: ejemplo con banco real`);
    assert.doesNotMatch(source,/BROU RECOMPENSA|PRÉSTAMO MADRE|ESCUELA ALMA/i,`${name}: categoría personal`);
  }
  assert.doesNotMatch(html,/base\s*:\s*\d{4,}/,'montos base de 4+ cifras en el código');
});

test('[T0] un usuario con datos guardados ve lo mismo: la semilla no toca pf4, pe4 ni banderas',()=>{
  const stored={'u1_pf4':JSON.stringify({x_0_2025:100}),'u1_pe4':JSON.stringify({x_0_2025:true}),'u1_seed_v2':'true','gst4_seed_dist_v2':'1'};
  for(const initial of [stored,{}]){
    const store={...initial};
    const localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
    const context={localStorage,currentUser:{id:'u1'},SEED_VERSION:2};
    vm.createContext(context);
    vm.runInContext(extractFunction('applySeedIfNeeded'),context);
    context.applySeedIfNeeded();
    assert.deepEqual(store,initial);
  }
  // Las categorías de un usuario salen de cats4; DEFAULT_CATS no participa al iniciar sesión.
  assert.match(extractFunction('loadUserData'),/cats=S\.g\('cats4',\[\]\);/);
  assert.doesNotMatch(extractFunction('loadUserData'),/DEFAULT_CATS/);
});
