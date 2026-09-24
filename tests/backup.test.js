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
const constant=name=>html.match(new RegExp(`const ${name}=[\\s\\S]*?;\\n`))[0];

const FUNCTIONS=['capacitorPlugin','isNativeMartinApp','buildBackup','backupExportMode','markBackupDone','backupStatusHtml','refreshBackupStatus',
  'exportData','exportBackupNative','showBackupFallback','copyBackupToClipboard','exportBackupBrowser','backupEntries','applyBackup','importBackupText'];

function fakeStorage(initial={}){
  const map=new Map(Object.entries(initial));
  return {map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,
    setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);}};
}
// Datos de un usuario con meses de uso + otro usuario en el mismo teléfono.
const STORED={
  'usr_martin_gst4':JSON.stringify([{_id:'g1',c:'luz',v:1234.5,m:8,y:2026,desc:'Luz'}]),
  'usr_martin_pf4':JSON.stringify({luz_8_2026:1200}),
  'usr_martin_rt2':JSON.stringify([{id:'r1',name:'Torso',days:[]}]),
  'usr_martin_arid':JSON.stringify('r1'),
  'usr_ana_gst4':JSON.stringify([{_id:'a1',v:5}]),
  'auth_users_v1':JSON.stringify([{id:'usr_martin',name:'martin'}])
};

function makeContext({native=false,plugins=false,picker=true,stored=STORED}={}){
  const calls={toasts:[],modals:[],writeFile:[],share:[],clipboard:[],picker:[],anchors:0};
  const localStorage=fakeStorage(stored);
  const context={
    localStorage,currentUser:{id:'usr_martin',name:'martin',isAdmin:true},calls,Blob,JSON,Date,Math,Number,String,Object,Array,
    tst:msg=>calls.toasts.push(msg),oOv1:h=>calls.modals.push(h),cOv1:()=>{},confirm:()=>true,setTimeout:()=>0,location:{reload(){}},
    navigator:{clipboard:{writeText:async text=>{calls.clipboard.push(text);}}},
    document:{getElementById:()=>null,createElement:()=>({click(){calls.anchors++;}}),body:{appendChild(){},removeChild(){}}},
    URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
    checkForAppUpdate:async()=>false,openAppUpdate(){}
  };
  context.window=context;
  if(native)context.Capacitor={isNativePlatform:()=>true,Plugins:plugins?{
    Filesystem:{writeFile:async opts=>{calls.writeFile.push(opts);return {uri:'file:///cache/'+opts.path};}},
    Share:{share:async opts=>{calls.share.push(opts);return {};}}
  }:{}};
  if(picker)context.showSaveFilePicker=async opts=>{calls.picker.push(opts);return {createWritable:async()=>({write:async text=>{calls.picker.push(text);},close:async()=>{}})};};
  context.S={_p:k=>context.currentUser.id+'_'+k,g(k,d=null){const v=localStorage.getItem(this._p(k));return v!=null?JSON.parse(v):d;},s(k,v){localStorage.setItem(this._p(k),JSON.stringify(v));return true;}};
  vm.createContext(context);
  vm.runInContext(constant('BACKUP_MAX_AGE_DAYS')+constant('BACKUP_DATA_KEYS')+FUNCTIONS.map(n=>extractFunction(n)).join('\n'),context);
  return context;
}

test('[T0b] APK con Filesystem y Share: escribe el archivo, abre Compartir y anota el respaldo',async()=>{
  const ctx=makeContext({native:true,plugins:true});
  assert.equal(ctx.backupExportMode(),'native-share');
  await ctx.exportData();
  assert.equal(ctx.calls.writeFile.length,1);
  const w=ctx.calls.writeFile[0];
  assert.equal(w.directory,'CACHE');assert.equal(w.encoding,'utf8');assert.match(w.path,/^app-backup-\d{4}-\d\d-\d\d\.json$/);
  assert.equal(JSON.parse(w.data).entries.gst4[0].v,1234.5);
  assert.equal(ctx.calls.share[0].url,'file:///cache/'+w.path);assert.equal(ctx.calls.share[0].dialogTitle,'Guardar o enviar el respaldo');
  assert.ok(ctx.S.g('lastBackupAt',0)>0,'lastBackupAt se guarda solo si Compartir terminó bien');
  assert.equal(ctx.calls.anchors,0,'no finge una descarga');
});

test('[T0b] APK con Filesystem y Share: si se cancela Compartir no se anota el respaldo',async()=>{
  const ctx=makeContext({native:true,plugins:true});
  ctx.Capacitor.Plugins.Share.share=async()=>{throw new Error('Share canceled');};
  await ctx.exportData();
  assert.equal(ctx.S.g('lastBackupAt',0),0);
  assert.match(ctx.calls.toasts.at(-1),/No se guardó/);
});

test('[T0b] APK actual (sin plugins): no finge la descarga, ofrece copiar y actualizar',async()=>{
  const ctx=makeContext({native:true,plugins:false});
  assert.equal(ctx.backupExportMode(),'native-no-plugins');
  await ctx.exportData();
  assert.equal(ctx.calls.anchors,0);assert.equal(ctx.calls.picker.length,0);
  assert.equal(ctx.calls.modals.length,1);
  assert.match(ctx.calls.modals[0],/no puede guardar archivos/);assert.match(ctx.calls.modals[0],/Copiar respaldo \(\d+ KB\)/);assert.match(ctx.calls.modals[0],/Actualizar la app/);
  assert.equal(await ctx.copyBackupToClipboard(),true);
  assert.equal(JSON.parse(ctx.calls.clipboard[0]).entries.rt2[0].name,'Torso');
  assert.equal(ctx.S.g('lastBackupAt',0),0,'copiar no cuenta como respaldo guardado');
});

test('[T0b] navegador: sigue usando el selector de archivos o la descarga',async()=>{
  const ctx=makeContext({native:false});
  assert.equal(ctx.backupExportMode(),'browser');
  await ctx.exportData();
  assert.equal(ctx.calls.picker.length,2,'abre el selector y escribe');
  assert.ok(ctx.S.g('lastBackupAt',0)>0);
  const plain=makeContext({native:false,picker:false});
  await plain.exportData();
  assert.equal(plain.calls.anchors,1);
});

test('[T0b] ida y vuelta: un respaldo exportado se vuelve a importar igual y no toca a otro usuario',async()=>{
  const ctx=makeContext({native:true,plugins:true});
  await ctx.exportData();
  const json=ctx.calls.writeFile[0].data;
  const before=new Map(ctx.localStorage.map);
  // Se pierden y se ensucian datos; después se importa el respaldo.
  ctx.localStorage.removeItem('usr_martin_gst4');ctx.localStorage.setItem('usr_martin_pf4','{"otro":1}');ctx.localStorage.setItem('usr_martin_basura','1');
  assert.equal(ctx.importBackupText(json),true);
  for(const [k,v] of before)assert.equal(ctx.localStorage.getItem(k),v,k);
  assert.equal(ctx.localStorage.getItem('usr_martin_basura'),null);
  assert.equal(ctx.localStorage.getItem('usr_ana_gst4'),STORED['usr_ana_gst4']);
});

test('[T0b] lee respaldos viejos (claves de localStorage sueltas, con o sin prefijo)',()=>{
  const ctx=makeContext({native:false,stored:{}});
  const legacy={'usr_martin_gst4':[{_id:'x',v:10}],'usr_martin_last_mem_compile':123,'usr_ana_gst4':[],'auth_users_v1':[{id:'usr_martin'}]};
  const {entries}=ctx.backupEntries(legacy);
  assert.deepEqual(JSON.parse(JSON.stringify(entries)),{gst4:[{_id:'x',v:10}],last_mem_compile:123});
  const preLogin=ctx.backupEntries({gst4:[{v:1}],rt2:[],auth_users_v1:[]});
  assert.deepEqual(Object.keys(preLogin.entries).sort(),['gst4','rt2']);
  assert.throws(()=>ctx.backupEntries({format:'otra-app'}),/no es un respaldo válido/);
  assert.throws(()=>ctx.backupEntries([1,2]),/no es un respaldo válido/);
});

test('[T0b] Configuración muestra el último respaldo y avisa pasados 14 días',()=>{
  const ctx=makeContext();
  assert.match(ctx.backupStatusHtml(),/nunca/);assert.match(ctx.backupStatusHtml(),/stale/);
  ctx.S.s('lastBackupAt',Date.now()-3*86400000);
  assert.match(ctx.backupStatusHtml(),/hace 3 días/);assert.doesNotMatch(ctx.backupStatusHtml(),/stale/);
  ctx.S.s('lastBackupAt',Date.now()-20*86400000);
  assert.match(ctx.backupStatusHtml(),/hace 20 días/);assert.match(ctx.backupStatusHtml(),/stale/);
  assert.match(html,/id="backup-status"/);assert.match(html,/onclick="openPasteBackup\(\)"/);
});
