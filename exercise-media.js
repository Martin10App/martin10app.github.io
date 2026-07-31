'use strict';

const EXERCISE_MEDIA_CATALOG='exercise-media.json?v=2';
const EXERCISE_MEDIA_BASE='https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';
let _exerciseMediaData=null,_exerciseMediaPromise=null;

function normExerciseMediaName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function exerciseMediaScore(query,candidate){
  const q=normExerciseMediaName(query),c=normExerciseMediaName(candidate);
  if(!q||!c)return 0;
  if(q===c)return 100;
  if(q.includes(c)||c.includes(q))return 76+Math.round(20*Math.min(q.length,c.length)/Math.max(q.length,c.length));
  const qt=[...new Set(q.split(' '))],ct=[...new Set(c.split(' '))];
  const common=qt.filter(t=>ct.includes(t)).length;
  return Math.round(55*common/qt.length+30*common/ct.length);
}
async function loadExerciseMediaCatalog(){
  if(_exerciseMediaData)return _exerciseMediaData;
  if(_exerciseMediaPromise)return _exerciseMediaPromise;
  _exerciseMediaPromise=(async()=>{
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
    try{
      const url=location.protocol==='file:'?'https://martin10app.github.io/exercise-media.json?v=2':EXERCISE_MEDIA_CATALOG;
      const res=await fetch(url,{cache:'force-cache',signal:ctrl.signal});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(!data||!Array.isArray(data.exercises)||data.exercises.length>500)throw new Error('Catalogo invalido');
      _exerciseMediaData=data;return data;
    }finally{clearTimeout(timer);_exerciseMediaPromise=null;}
  })();
  return _exerciseMediaPromise;
}
function findExerciseMovement(ex,catalog){
  if(ex.mediaId){const byId=catalog.exercises.find(item=>item.id===ex.mediaId);if(byId)return byId;}
  let best=null,bestScore=0;
  for(const item of catalog.exercises){
    for(const candidate of [item.name,...(item.aliases||[])]){
      const score=exerciseMediaScore(ex.name,candidate);
      if(score>bestScore){bestScore=score;best=item;}
    }
  }
  return bestScore>=58?best:null;
}
function exerciseMediaUrl(path){
  if(!/^(images|videos)\/[a-zA-Z0-9._-]+$/.test(String(path||'')))return '';
  return EXERCISE_MEDIA_BASE+path;
}
function exerciseMediaLabel(value,type){
  const body={chest:'Pecho',back:'Espalda',shoulders:'Hombros','upper arms':'Brazos','upper legs':'Piernas','lower legs':'Pantorrillas',waist:'Abdomen',cardio:'Cardio'};
  const equipment={barbell:'Barra',dumbbell:'Mancuernas',cable:'Polea','body weight':'Peso corporal','leverage machine':'M\u00e1quina',smith:'Smith',weighted:'Con peso',roller:'Rueda'};
  return (type==='body'?body[value]:equipment[value])||value||'';
}
function renderExerciseMediaError(slot,message){
  slot.setAttribute('aria-busy','false');
  slot.innerHTML=`<div class="ex-media-card" style="text-align:center;padding:24px 16px"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--text2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg><div style="font-size:13px;font-weight:700;margin-top:10px">Movimiento no disponible</div><div style="font-size:11px;color:var(--text2);line-height:1.5;margin-top:5px">${esc(message)}. Pod\u00e9s usar la b\u00fasqueda de YouTube.</div></div>`;
}
function handleExerciseMediaError(image){
  const card=image.closest('.ex-media-card'),slot=card?.parentElement;
  const still=image.dataset.still||'';
  if(image.dataset.fallback!=='1'&&still&&image.src!==still){
    image.dataset.fallback='1';image.dataset.playing='0';image.src=still;
    const button=card?.querySelector('.ex-media-actions .b-p');
    if(button)button.textContent='Reintentar movimiento';
    const status=card?.querySelector('.ex-media-status');
    if(status){status.hidden=false;status.textContent='La animaci\u00f3n no carg\u00f3; mostramos una imagen fija.';}
    return;
  }
  if(slot)renderExerciseMediaError(slot,'No se pudo cargar la animaci\u00f3n ni la imagen fija');
}
function handleExerciseMediaLoad(image){
  if(image.dataset.fallback==='1')return;
  const status=image.closest('.ex-media-card')?.querySelector('.ex-media-status');
  if(status)status.hidden=true;
}
async function loadExerciseMovement(ex,slotId){
  const slot=document.getElementById(slotId);if(!slot)return;
  slot.setAttribute('aria-busy','true');
  try{
    const catalog=await loadExerciseMediaCatalog();
    const movement=findExerciseMovement(ex,catalog);
    if(!movement){renderExerciseMediaError(slot,'No encontramos una coincidencia segura');return;}
    const gif=exerciseMediaUrl(movement.gif_url),still=exerciseMediaUrl(movement.image);
    if(!gif||!still){renderExerciseMediaError(slot,'El archivo multimedia no es valido');return;}
    const reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const initial=reduce?still:gif;
    const body=exerciseMediaLabel(movement.body_part,'body'),equipment=exerciseMediaLabel(movement.equipment,'equipment');
    slot.setAttribute('aria-busy','false');
    slot.innerHTML=`<div class="ex-media-card">
      <div class="ex-media-frame"><img src="${esc(initial)}" alt="Demostraci\u00f3n de ${esc(ex.name)}" width="300" height="300" decoding="async" data-gif="${esc(gif)}" data-still="${esc(still)}" data-playing="${reduce?'0':'1'}" data-fallback="0" onload="handleExerciseMediaLoad(this)" onerror="handleExerciseMediaError(this)"></div>
      <div class="ex-media-meta"><span class="ex-media-chip">${esc(body)}</span><span class="ex-media-chip">${esc(equipment)}</span></div>
      ${movement.instructions_es?`<div style="font-size:12px;line-height:1.6;color:var(--text1)">${esc(movement.instructions_es)}</div>`:''}
      <div class="ex-media-actions"><button class="btn b-md b-p" onclick="toggleExerciseMovement(this)">${reduce?'Reproducir movimiento':'Pausar movimiento'}</button><button class="btn b-md b-g" onclick="window.open('https://github.com/hasaneyldrm/exercises-dataset','_blank','noopener')">Fuente</button></div>
      <div class="ex-media-status" role="status" hidden></div>
      <div style="font-size:9px;color:var(--text3);line-height:1.4;margin-top:9px">Demostraci\u00f3n educativa. Verific\u00e1 la t\u00e9cnica con un profesional.</div>
    </div>`;
  }catch(err){renderExerciseMediaError(slot,err&&err.name==='AbortError'?'La carga demoro demasiado':'No se pudo cargar el catalogo');}
}
function toggleExerciseMovement(button){
  const image=button.closest('.ex-media-card')?.querySelector('img');if(!image)return;
  const playing=image.dataset.playing==='1';
  image.dataset.playing=playing?'0':'1';image.dataset.fallback='0';image.src=playing?image.dataset.still:image.dataset.gif;
  const status=image.closest('.ex-media-card')?.querySelector('.ex-media-status');if(status)status.hidden=true;
  button.textContent=playing?'Reproducir movimiento':'Pausar movimiento';
}
