import {addDays,monday,today,dateLabel,time,esc,notice} from './utils.js';

export function monthStart(date,offset=0){
  const d=new Date(date.slice(0,7)+'-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth()+offset);
  return d.toISOString().slice(0,10);
}
export function calendarRange(filters={},now=today()){
  const date=filters.date||now, view=filters.view||'upcoming';
  const start=view==='month'?monthStart(date):view==='week'?monday(date):date;
  const end=view==='month'?addDays(monthStart(start,1),-1):addDays(start,view==='upcoming'?29:view==='week'?6:0);
  const days=[];
  for(let day=start;day<=end;day=addDays(day,1))days.push(day);
  return {view,start,end,days,overview:view==='month'||view==='upcoming'};
}
export function quickRange(name,now=today()){
  if(name==='next-week')return {view:'week',date:addDays(monday(now),7)};
  if(name==='next-month')return {view:'month',date:monthStart(now,1)};
  if(name==='today')return {view:'day',date:now};
  return {view:'upcoming',date:now};
}
export function shiftRange(filters={},offset=1,now=today()){
  const range=calendarRange(filters,now);
  return {date:range.view==='month'?monthStart(range.start,offset):addDays(range.start,offset*(range.view==='upcoming'?30:range.view==='week'?7:1))};
}
export function calendarCoverage(health={}){
  const source=(health.sources||[]).find(s=>/google|agenda|calendar/i.test(s.source||'')&&s.coverage_start&&s.coverage_end);
  return source?{start:String(source.coverage_start).slice(0,10),end:String(source.coverage_end).slice(0,10)}:null;
}
export const covered=(day,coverage)=>!coverage||(day>=coverage.start&&day<=coverage.end);
export function calendarFailureNotice(health={}){
  const failures=(health.sources||[]).filter(s=>/google|agenda|calendar|pilotage/i.test(s.source||'')&&['error','failed','partial','unauthorized','authorization_required'].includes(s.status));
  return failures.map(source=>{
    const last=source.last_success;
    const previous=last?`Dernière réussite le ${dateLabel(last)}${String(last).length>10?' à '+time(last):''}.`:'Aucune actualisation réussie n’est renseignée.';
    const issue=source.status==='partial'?'la dernière actualisation est incomplète.':'la dernière actualisation a échoué.';
    return notice(`Google Agenda : ${issue} ${previous} Les données affichées peuvent être anciennes ou incomplètes. Consultez Paramètres avant de confirmer le planning.`,source.status==='partial'?'warning':'error');
  }).join('');
}
export function coverageNotice(range,coverage){
  if(!coverage)return '';
  const complete=range.start>=coverage.start&&range.end<=coverage.end;
  return notice(`Google Agenda : données chargées du ${dateLabel(coverage.start)} au ${dateLabel(coverage.end)}.${complete?'':' Une partie de la période affichée reste à synchroniser ; les totaux peuvent être incomplets.'}`,complete?'info':'warning');
}
export function rangeControls(filters={},now=today()){
  const range=calendarRange(filters,now);
  return `<div class="calendar-controls"><div class="calendar-quick"><button class="btn small ${range.view==='upcoming'?'primary':''}" data-calendar-quick="upcoming">30 prochains jours</button><button class="btn small" data-calendar-quick="next-week">Semaine prochaine</button><button class="btn small" data-calendar-quick="next-month">Mois prochain</button><button class="btn small" data-calendar-quick="today">Aujourd’hui</button></div><div class="tab-row"><div class="week-nav"><button class="icon-button" data-calendar-shift="-1" aria-label="Période précédente">‹</button><strong>${esc(dateLabel(range.start))}${range.end!==range.start?' — '+esc(dateLabel(range.end)):''}</strong><button class="icon-button" data-calendar-shift="1" aria-label="Période suivante">›</button></div><div class="segmented calendar-views" aria-label="Vue du calendrier"><button data-calendar-view="upcoming" aria-pressed="${range.view==='upcoming'}">30 jours</button><button data-calendar-view="month" aria-pressed="${range.view==='month'}">Mois</button><button data-calendar-view="week" aria-pressed="${range.view==='week'}">Semaine</button><button data-calendar-view="day" aria-pressed="${range.view==='day'}">Jour</button></div><label class="calendar-date">Aller au<input type="date" data-calendar-date value="${esc(filters.date||now)}"></label></div></div>`;
}
export function bindRangeControls(ctx){
  ctx.container.querySelectorAll('[data-calendar-quick]').forEach(b=>b.onclick=()=>ctx.setFilters(quickRange(b.dataset.calendarQuick)));
  ctx.container.querySelectorAll('[data-calendar-shift]').forEach(b=>b.onclick=()=>ctx.setFilters(shiftRange(ctx.filters,Number(b.dataset.calendarShift))));
  ctx.container.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>ctx.setFilters({view:b.dataset.calendarView}));
  ctx.container.querySelector('[data-calendar-date]')?.addEventListener('change',e=>{if(e.target.value)ctx.setFilters({date:e.target.value});});
}
