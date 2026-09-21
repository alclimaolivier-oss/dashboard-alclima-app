import {esc,dateLabel,time,norm} from './utils.js';
import {occurs,eventType,eventInterval,people,projects,conflicts} from './planning-domain.js';

const unique=values=>[...new Set(values)];
const detailState=new Map();
const hasText=value=>Boolean(String(value??'').trim());
export function bindWeeklySummaries(container){container.querySelectorAll('.week-details[data-week]').forEach(el=>el.ontoggle=()=>detailState.set(el.dataset.week,el.open));}
const label=t=>t.label||t.title||t.brand||t.id;
const free=r=>eventType(r)==='availability'&&/^(libre(?: confirme)?|disponible|disponibilite|free)$/.test(norm(r.status||r.type||'').trim());
const blocked=r=>Boolean(hasText(r.blockers)||r.material_missing||/bloqu|blocked/.test(norm(r.status)));

// Counts use the displayed dates, not the selected day. Each record is counted
// once even when it appears on several days. No empty slot implies availability.
export function summarizeWeek(events,days,trucks,allEvents=events){
  const selected=[...new Map(events.filter(r=>days.some(d=>occurs(r,d))).map(r=>[r.id,r])).values()];
  const interventions=selected.filter(r=>r.kind==='event'&&eventType(r)==='intervention');
  const interventionIds=new Set(interventions.map(r=>r.id));
  const relevant=[...new Map(allEvents.filter(r=>days.some(d=>occurs(r,d))).map(r=>[r.id,r])).values()];
  const collisions=conflicts(relevant).filter(c=>c.record_ids.some(id=>interventionIds.has(id))&&days.some(d=>occurs({start:c.start,end:c.end},d)));
  const fleet=new Map(trucks.map(t=>[t.id,t]));
  for(const r of interventions)if(r.truck&&!fleet.has(r.truck))fleet.set(r.truck,{id:r.truck,label:r.truck});
  const teams=[...fleet.values()].map(t=>{
    const jobs=interventions.filter(r=>r.truck===t.id);
    return {id:t.id,label:label(t),jobs,people:unique(jobs.flatMap(people)),days:days.filter(d=>jobs.some(r=>occurs(r,d)))};
  }).filter(t=>t.jobs.length);
  const daily=days.map(date=>({date,count:interventions.filter(r=>occurs(r,date)).length}));
  const peak=Math.max(0,...daily.map(d=>d.count));
  const travel=teams.flatMap(t=>days.flatMap(date=>{
    const cities=unique(t.jobs.filter(r=>occurs(r,date)).map(r=>r.city?.trim()).filter(Boolean));
    return cities.length>1?[{date,truck:t.label,cities}]:[];
  }));
  const sectors=Object.entries(interventions.reduce((out,r)=>{const name=r.city?.trim()||'Commune non renseignée';out[name]=(out[name]||0)+1;return out;},Object.create(null)));
  const absences=selected.filter(r=>eventType(r)==='absence');
  const associatedAbsences=relevant.filter(r=>eventType(r)==='absence'&&collisions.some(c=>c.record_ids.includes(r.id)));
  const freeSlots=selected.filter(free);
  const freeConflicts=freeSlots.filter(slot=>relevant.some(r=>{
    if(r.id===slot.id||eventType(r)==='availability')return false;
    const shared=slot.truck&&slot.truck===r.truck||people(slot).some(p=>people(r).some(q=>norm(p)===norm(q)));
    const [ss,se]=eventInterval(slot),[rs,re]=eventInterval(r);
    return shared&&Math.max(ss,rs)<Math.min(se,re)&&days.some(d=>occurs(slot,d)&&occurs(r,d));
  }));
  const counters=projects(interventions,days[0],days.at(-1));
  return {start:days[0],end:days.at(-1),days,interventions,teams,counters,daily,peak,
    busiest:daily.filter(d=>peak&&d.count===peak),travel,sectors,collisions,
    free:freeSlots.filter(r=>!freeConflicts.includes(r)),freeConflicts,absences:unique([...absences,...associatedAbsences]),
    unknownAvailability:selected.filter(r=>r.kind==='availability'&&!free(r)&&eventType(r)!=='absence'),
    toConfirm:interventions.filter(r=>/^(prevue?|a confirmer|tentative)$/.test(norm(r.status).trim())),
    postponed:interventions.filter(r=>/reporte|postponed/.test(norm(r.status))),
    blockers:interventions.filter(blocked),preparation:interventions.filter(r=>[r.material,r.preparation,r.notes].some(hasText)),
    missingPeople:interventions.filter(r=>!people(r).length),missingTruck:interventions.filter(r=>!r.truck)};
}

function stat(name,value,help=''){return `<div class="week-stat"><strong>${esc(value)}</strong><span>${esc(name)}</span>${help?`<small>${esc(help)}</small>`:''}</div>`;}
function facts(items){return `<dl class="week-facts">${items.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;}
function recordList(records,trucks,description){
  return records.length?`<ul class="week-records">${records.map(r=>`<li><button class="table-title" data-edit="${esc(r.id)}">${esc(r.title||'Fiche à compléter')}</button><span>${esc([label(trucks.find(t=>t.id===r.truck)||{id:r.truck||'Camion à préciser'}),dateLabel(r.start),time(r.start),people(r).join(', ')].filter(Boolean).join(' · '))}</span>${description?`<span>${esc(description(r))}</span>`:''}</li>`).join('')}</ul>`:'<p class="muted">Aucun élément renseigné.</p>';
}

export function weeklySummary(data,trucks,{coverage=null,fullStart=data.start,fullEnd=data.end}={}){
  const p=data.counters.projects,v=data.counters.visits;
  const count=(part,key)=>part.has_data?part[key]:'—';
  const partial=data.start!==fullStart||data.end!==fullEnd;
  const loaded=coverage&&data.start>=coverage.start&&data.end<=coverage.end;
  const coverageText=coverage?(loaded?'Bilan des données chargées.':'Période partiellement chargée : compteurs incomplets.'):'Couverture de Google Agenda non précisée : bilan des seules données disponibles.';
  const assignments=data.teams.length?`<div class="week-teams">${data.teams.map(t=>`<article class="week-team"><strong>${esc(t.label)}</strong><span>${t.jobs.length} intervention(s) · ${t.days.length} jour(s)</span><span>${esc(t.people.length?t.people.join(', '):'Techniciens non renseignés')}</span>${t.jobs.some(r=>!people(r).length)&&t.people.length?'<small>Des affectations restent à compléter.</small>':''}</article>`).join('')}</div>`:'<p class="muted">Aucune équipe mobilisée renseignée. Cela ne confirme pas la disponibilité des camions.</p>';
  return `<div class="week-summary" data-week-summary="${esc(fullStart)}"><p class="week-scope muted">${partial?`Semaine partielle dans cette vue : bilan du ${esc(dateLabel(data.start))} au ${esc(dateLabel(data.end))}. Ouvrez la semaine pour voir les sept jours. `:''}${esc(coverageText)}</p><div class="week-stats">${stat('Équipes mobilisées',data.teams.length,'Par camion')}${stat('Interventions distinctes',data.interventions.length)}${stat('Projets photovoltaïques',count(p,'total'),'Google Agenda')}${stat('Visites techniques',count(v,'total'),'Google Agenda')}</div><h3>Équipes mobilisées cette semaine</h3><p class="muted">Techniciens présents sur les interventions de la période ; les affectations peuvent varier selon les jours.</p>${assignments}<details class="week-details" data-week="${esc(fullStart)}"${detailState.get(fullStart)?' open':''}><summary>Tout le bilan de la semaine · disponibilités, projets et points à traiter</summary><div class="week-detail-grid"><section><h3>Projets photovoltaïques</h3>${facts([['PK seuls',count(p,'pk')],['Région seuls',count(p,'region')],['DUO · PK + Région',count(p,'duo')],['Programme à classer',count(p,'unclassified')]])}<p class="muted">Les DUO sont comptés une fois. Les classifications et regroupements déduits des libellés restent à vérifier.</p></section><section><h3>Visites techniques</h3>${facts([['Photovoltaïque',count(v,'photovoltaic')],['Climatisation',count(v,'climate')],['Extracteur d’air',count(v,'extractor')],['Borne IRVE',count(v,'irve')],['Activité à classer',count(v,'unclassified')]])}${!v.has_data?'<p class="muted">Aucun événement Google Agenda exploitable dans cette sélection.</p>':''}</section><section><h3>Disponibilités et absences</h3>${facts([['Créneaux libres confirmés',data.free.length],['Créneaux libres en conflit',data.freeConflicts.length],['Absences / indisponibilités déclarées',data.absences.length],['Disponibilités à préciser',data.unknownAvailability.length],['Interventions sans technicien affecté',data.missingPeople.length],['Interventions sans camion',data.missingTruck.length]])}${recordList([...data.free,...data.freeConflicts,...data.absences,...data.unknownAvailability],trucks,r=>[data.freeConflicts.includes(r)?'Disponibilité en conflit : à vérifier':r.status,r.notes].filter(Boolean).join(' · '))}<p class="muted">Les jours non renseignés ne sont pas considérés comme libres. Les remplacements éventuels sont à préciser dans les fiches d’affectation.</p></section><section><h3>À confirmer et à débloquer</h3>${facts([['Prévues / à confirmer',data.toConfirm.length],['Interventions reportées',data.postponed.length],['Interventions bloquées / signalées',data.blockers.length],['Chevauchements détectés',data.collisions.length]])}${recordList(unique([...data.toConfirm,...data.postponed,...data.blockers]),trucks,r=>[r.status,r.blockers,r.material_missing?'Matériel manquant':''].filter(Boolean).join(' · '))}${data.collisions.length?`<ul class="week-records">${data.collisions.map(c=>`<li><strong>${esc(c.reason)}</strong><span>${esc(dateLabel(c.start))} · ${esc(time(c.start))} – ${esc(time(c.end))}</span><span>${c.record_ids.map(id=>{const r=data.interventions.find(r=>r.id===id);return r?`<button class="table-title" data-edit="${esc(id)}">${esc(r.title||'Intervention')}</button>`:'';}).join(' ')}</span></li>`).join('')}</ul>`:''}</section><section><h3>Répartition et charge</h3>${facts(data.sectors.map(([city,n])=>[city,`${n} intervention(s)`]))}<p class="muted">${data.peak?`Journée(s) la/les plus chargée(s) : ${esc(data.busiest.map(d=>dateLabel(d.date,true)).join(', '))} (${data.peak} interventions).`:'Aucune intervention renseignée.'}</p>${data.travel.length?`<ul class="week-records">${data.travel.map(t=>`<li>${esc(dateLabel(t.date,true))} · ${esc(t.truck)}<span>${esc(t.cities.join(' · '))}</span></li>`).join('')}</ul><p class="muted">Plusieurs communes le même jour : trajets à examiner, sans estimation automatique.</p>`:'<p class="muted">Aucun déplacement entre communes repéré dans les champs renseignés.</p>'}</section><section><h3>Matériel et préparation</h3>${recordList(data.preparation,trucks,r=>[r.material,r.preparation,r.notes].filter(Boolean).join(' · '))}</section></div><p class="muted">Bilan selon les filtres sélectionnés. Une intervention sur plusieurs jours compte une fois par semaine concernée ; les totaux hebdomadaires ne s’additionnent donc pas forcément au total de la période. Les chevauchements tiennent aussi compte des autres affectations et absences connues.</p></details></div>`;
}
