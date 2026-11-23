'use strict';

const EXERCISE_MEDIA_CATALOG='exercise-media.json?v=4';
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
      const url=location.protocol==='file:'?'https://martin10app.github.io/exercise-media.json?v=4':EXERCISE_MEDIA_CATALOG;
      const res=await fetch(url,{cache:'force-cache',signal:ctrl.signal});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(!data||!Array.isArray(data.exercises)||data.exercises.length>3000)throw new Error('Catalogo invalido');
      _exerciseMediaData=data;return data;
    }finally{clearTimeout(timer);_exerciseMediaPromise=null;}
  })();
  return _exerciseMediaPromise;
}
function isCuratedMovement(item){return !!(item&&(item.curated||!item.muscle));}
function findExerciseMovement(ex,catalog){
  if(ex.mediaId){const byId=catalog.exercises.find(item=>item.id===ex.mediaId);if(byId)return byId;}
  // Primero los ejercicios curados a mano (los nombres de las rutinas). El resto del catálogo
  // sólo gana con una coincidencia muy clara, para no cambiar la animación de rutinas viejas.
  const exact=normExerciseMediaName(ex.name);
  const exactItem=catalog.exercises.find(item=>[item.name,...(item.aliases||[])].some(n=>normExerciseMediaName(n)===exact));
  if(exactItem)return exactItem;
  let best=null,bestScore=0,wide=null,wideScore=0;
  for(const item of catalog.exercises){
    const curated=isCuratedMovement(item);
    for(const candidate of [item.name,...(item.aliases||[])]){
      const score=exerciseMediaScore(ex.name,candidate);
      if(curated){if(score>bestScore){bestScore=score;best=item;}}
      else if(score>wideScore){wideScore=score;wide=item;}
    }
  }
  if(bestScore>=58)return best;
  return wideScore>=80?wide:null;
}
function exerciseMovementMuscle(item){
  if(item?.muscle)return item.muscle;
  const target=normExerciseMediaName(item?.target);
  if(/pectoral|chest/.test(target))return 'Pecho';
  if(/lat|back|trap|spine/.test(target))return 'Espalda';
  if(/delt|shoulder/.test(target))return 'Hombros';
  if(/bicep/.test(target))return 'Bíceps';
  if(/tricep/.test(target))return 'Tríceps';
  if(/hamstring/.test(target))return 'Femoral';
  if(/calf|calves/.test(target))return 'Gemelos';
  if(/abs|waist/.test(target))return 'Abdomen';
  if(/quad|glute|adductor/.test(target))return 'Cuádriceps';
  const body=normExerciseMediaName(item?.body_part);
  return body==='upper arms'?'Bíceps':body==='upper legs'?'Cuádriceps':body==='lower legs'?'Gemelos':body==='waist'?'Abdomen':'Espalda';
}
function exerciseMovementName(item){return String(item?.aliases?.[0]||item?.name||'Ejercicio').trim();}
function canonicalExerciseMovement(ex,catalog){
  const query=String(ex?.name||'').trim();if(!query||!catalog?.exercises)return null;
  const normalized=normExerciseMediaName(query);
  let movement=catalog.exercises.find(item=>item.id===ex.mediaId||[item.name,...(item.aliases||[])].some(n=>normExerciseMediaName(n)===normalized));
  if(!movement){
    const candidate=findExerciseMovement(ex,catalog);
    if(candidate){
      const best=Math.max(...[candidate.name,...(candidate.aliases||[])].map(n=>exerciseMediaScore(query,n)));
      if(best>=76)movement=candidate;
    }
  }
  if(!movement)return null;
  return {...ex,name:exerciseMovementName(movement),muscle:exerciseMovementMuscle(movement),mediaId:movement.id};
}
function exerciseMovementCatalogForAI(catalog,place='gym'){
  if(!catalog?.exercises)return '';
  // A la IA sólo le pasamos los curados: el catálogo completo no entra en el prompt.
  const allowed=catalog.exercises.filter(isCuratedMovement).filter(item=>{
    const eq=normExerciseMediaName(item.equipment);
    if(place==='casa_sin')return eq==='body weight';
    if(place==='casa_basico')return ['body weight','dumbbell','weighted','resistance band'].includes(eq);
    return true;
  });
  return allowed.map(item=>exerciseMovementName(item)+' | '+exerciseMovementMuscle(item)+' | '+exerciseMediaLabel(item.equipment,'equipment')).join('\n');
}
function exerciseMediaUrl(path){
  if(!/^(images|videos)\/[a-zA-Z0-9._-]+$/.test(String(path||'')))return '';
  return EXERCISE_MEDIA_BASE+path;
}
function exerciseMediaLabel(value,type){
  const body={chest:'Pecho',back:'Espalda',shoulders:'Hombros','upper arms':'Brazos','upper legs':'Piernas','lower legs':'Pantorrillas',waist:'Abdomen',cardio:'Cardio'};
  const equipment={barbell:'Barra',dumbbell:'Mancuernas',cable:'Polea','body weight':'Peso corporal','leverage machine':'M\u00e1quina',smith:'Smith','smith machine':'Smith','ez barbell':'Barra Z',kettlebell:'Kettlebell',band:'Banda','resistance band':'Banda',weighted:'Con peso',assisted:'Asistida','sled machine':'M\u00e1quina','trap bar':'Barra hexagonal','olympic barbell':'Barra',rope:'Cuerda',roller:'Rueda'};
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
function movementStepsEs(movement){
  if(Array.isArray(movement?.steps_es)&&movement.steps_es.length)return movement.steps_es.slice(0,8);
  const txt=String(movement?.instructions_es||'').trim();
  if(!txt)return [];
  return txt.split(/(?<=\.)\s+/).map(x=>x.trim()).filter(Boolean).slice(0,8);
}
function movementMuscleChips(movement){
  const main=movement?.target_es||'';
  const sec=Array.isArray(movement?.secondary_es)?movement.secondary_es:[];
  return {main,sec};
}
const EX_MEDIA_ICONS={
  pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
  zoom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
};
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
    const {main,sec}=movementMuscleChips(movement);
    const steps=movementStepsEs(movement);
    slot.setAttribute('aria-busy','false');
    slot.innerHTML=`<div class="ex-media-card pro">
      <div class="ex-media-frame" data-state="loading">
        <div class="ex-media-shimmer" aria-hidden="true"></div>
        <img src="${esc(initial)}" alt="Demostración de ${esc(ex.name)}" width="360" height="360" decoding="async" data-gif="${esc(gif)}" data-still="${esc(still)}" data-playing="${reduce?'0':'1'}" data-fallback="0" onload="handleExerciseMediaLoad(this)" onerror="handleExerciseMediaError(this)" onclick="zoomExerciseMovement(this)">
        <span class="ex-media-live"${reduce?' hidden':''}><i></i>En bucle</span>
        <button type="button" class="ex-media-zoom" aria-label="Ver en pantalla completa" onclick="zoomExerciseMovement(this)">${EX_MEDIA_ICONS.zoom}</button>
      </div>
      <div class="ex-media-meta">
        ${main?`<span class="ex-media-chip main">● ${esc(main)}</span>`:''}
        ${sec.map(m=>`<span class="ex-media-chip sec">${esc(m)}</span>`).join('')}
        ${equipment?`<span class="ex-media-chip eq">${esc(equipment)}</span>`:''}
        ${!main&&body?`<span class="ex-media-chip">${esc(body)}</span>`:''}
      </div>
      <div class="ex-media-actions">
        <button class="btn b-md b-p" onclick="toggleExerciseMovement(this)">${reduce?EX_MEDIA_ICONS.play+' Reproducir movimiento':EX_MEDIA_ICONS.pause+' Pausar movimiento'}</button>
        <button class="btn b-md b-g" onclick="zoomExerciseMovement(this)">${EX_MEDIA_ICONS.zoom} Grande</button>
      </div>
      <div class="ex-media-status" role="status" hidden></div>
      ${steps.length?`<div class="ex-steps-t">Cómo hacerlo</div><ol class="ex-steps">${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:''}
      <div class="ex-media-foot">Demostración educativa · <a href="https://github.com/hasaneyldrm/exercises-dataset" target="_blank" rel="noopener">fuente</a>. Verificá la técnica con un profesional.</div>
    </div>`;
  }catch(err){renderExerciseMediaError(slot,err&&err.name==='AbortError'?'La carga demoro demasiado':'No se pudo cargar el catalogo');}
}
function handleExerciseMediaLoad(image){
  const frame=image.closest('.ex-media-frame');if(frame)frame.dataset.state='ready';
  if(image.dataset.fallback==='1')return;
  const status=image.closest('.ex-media-card')?.querySelector('.ex-media-status');
  if(status)status.hidden=true;
}
function toggleExerciseMovement(button){
  const card=button.closest('.ex-media-card'),image=card?.querySelector('.ex-media-frame img');if(!image)return;
  const playing=image.dataset.playing==='1';
  image.dataset.playing=playing?'0':'1';image.dataset.fallback='0';image.src=playing?image.dataset.still:image.dataset.gif;
  const status=card.querySelector('.ex-media-status');if(status)status.hidden=true;
  const live=card.querySelector('.ex-media-live');if(live)live.hidden=playing;
  button.innerHTML=playing?EX_MEDIA_ICONS.play+' Reproducir movimiento':EX_MEDIA_ICONS.pause+' Pausar movimiento';
}
function zoomExerciseMovement(el){
  const card=el.closest('.ex-media-card'),image=card?.querySelector('.ex-media-frame img');if(!image)return;
  document.getElementById('ex-media-zoom-layer')?.remove();
  const layer=document.createElement('div');
  layer.id='ex-media-zoom-layer';layer.className='ex-media-zoom-layer';
  layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Movimiento en pantalla completa');
  const src=image.dataset.playing==='1'?image.dataset.gif:image.src;
  layer.innerHTML=`<div class="ex-zoom-box"><img src="${esc(src)}" alt="${esc(image.alt)}"></div><div class="ex-zoom-hint">Tocá para cerrar</div>`;
  const close=()=>{layer.classList.remove('on');setTimeout(()=>layer.remove(),220);document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')close();};
  layer.addEventListener('click',close);document.addEventListener('keydown',onKey);
  document.body.appendChild(layer);requestAnimationFrame(()=>layer.classList.add('on'));
}

// Miniaturas: imagen fija del movimiento al lado del nombre del ejercicio.
function exerciseThumbHtml(ex,extraClass=''){
  return `<span class="ex-thumb ${extraClass}" data-thumb-id="${esc(ex?.mediaId||'')}" data-thumb-name="${esc(ex?.name||'')}" aria-hidden="true"></span>`;
}
async function hydrateExerciseThumbs(root){
  const scope=root||document;
  const els=[...scope.querySelectorAll('.ex-thumb:not([data-ready])')];if(!els.length)return;
  els.forEach(el=>{el.dataset.ready='wait';});
  let catalog=null;
  try{catalog=await loadExerciseMediaCatalog();}catch(_e){els.forEach(el=>{el.dataset.ready='0';el.classList.add('none');});return;}
  for(const el of els){
    if(!el.isConnected)continue;
    el.dataset.ready='1';
    const movement=el.dataset.thumbId?catalog.exercises.find(i=>i.id===el.dataset.thumbId):findExerciseMovement({name:el.dataset.thumbName},catalog);
    const still=movement?exerciseMediaUrl(movement.image):'';
    if(!still){el.classList.add('none');continue;}
    const img=new Image();img.alt='';img.loading='lazy';img.decoding='async';
    img.onload=()=>el.classList.add('ok');img.onerror=()=>{el.classList.add('none');img.remove();};
    img.src=still;el.appendChild(img);
  }
}
