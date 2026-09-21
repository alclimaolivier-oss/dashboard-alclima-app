/** Pure business rules. Calendar dates and naive timestamps use Indian/Reunion.
 * The island has a fixed UTC+04:00 offset; server/visitor timezone is irrelevant.
 * Shared by browser and server. No credentials, records, storage, or network access.
 */
export const DAY = 86_400_000;
const OFFSET = 4 * 60 * 60 * 1000;
export const norm = value => String(value ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
export const lower = value => String(value ?? '').toLowerCase().trim();
export const unique = values => [...new Set(values)];
export const count = (records, key) => Object.fromEntries([...records.reduce((map, item) => { const name=key(item); map.set(name,(map.get(name)||0)+1); return map; },new Map())]);

export function parseDateTime(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const input=value.trim();
  const match=input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) return null;
  const [,y,m,d,h='00',min='00',s='00',fraction='',zone] = match;
  if (+y<1 || +m<1 || +m>12 || +d<1 || +h>23 || +min>59 || +s>59) return null;
  const calendar=new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10)!==`${y}-${m}-${d}`) return null;
  if (zone && zone!=='Z' && (+zone.slice(1,3)>23 || +zone.slice(-2)>59)) return null;
  const timezone=zone || '+04:00';
  const timestamp=Date.parse(`${y}-${m}-${d}T${h}:${min}:${s}.${fraction.slice(0,3).padEnd(3,'0')}${timezone}`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function asDate(value) {
  const timestamp=value===undefined || value===null ? Date.now() : parseDateTime(value);
  if (timestamp===null) throw new RangeError('Date invalide.');
  return new Date(timestamp+OFFSET).toISOString().slice(0,10);
}

function addDays(day, increment) { return new Date(Date.parse(`${day}T00:00:00Z`)+increment*DAY).toISOString().slice(0,10); }
function localISO(timestamp) { return new Date(timestamp+OFFSET).toISOString().replace(/\.000Z$/, '+04:00').replace(/Z$/, '+04:00'); }
export function shortDate(timestamp, separator=' à ') {
  const value=new Date(timestamp+OFFSET).toISOString();
  return `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}${separator}${value.slice(11,16)}`;
}

export function isoWeek(value) {
  const day=asDate(value), weekday=(new Date(`${day}T00:00:00Z`).getUTCDay()+6)%7;
  const first=addDays(day,-weekday);
  return [first,addDays(first,6)];
}
export function dateRange(start,end) {
  const first=asDate(start), last=asDate(end);
  if (last<first) throw new RangeError('La fin de période précède son début.');
  const length=Math.round((Date.parse(last)-Date.parse(first))/DAY)+1;
  if (length>3660) throw new RangeError('Période trop longue.');
  return Array.from({length},(_,i)=>addDays(first,i));
}
export function inPeriod(value,start,end) {
  const timestamp=parseDateTime(value);
  if (timestamp===null) return false;
  const day=asDate(value);
  return asDate(start)<=day && day<=asDate(end);
}
export function cancelled(record) {
  return Boolean(record.archived) || ['annulee','annule','cancelled','canceled','supprimee'].includes(norm(record.status));
}
export function eventInterval(record) {
  const start=parseDateTime(record.start);
  if (start===null) return null;
  let end=parseDateTime(record.end);
  const allDay=record.all_day || record.allDay || String(record.start).length===10;
  if (end===null) end=allDay ? start+DAY : start;
  return end<start ? null : [start,end];
}
export function occurs(record,day) {
  if (cancelled(record)) return false;
  const interval=eventInterval(record);
  if (!interval) return false;
  const [start,end]=interval, first=parseDateTime(asDate(day)), next=first+DAY;
  return start===end ? first<=start && start<next : start<next && end>first;
}

export function people(record) {
  const value=record.people || record.technicians || [];
  return unique((typeof value==='string' ? value.split(/[,;\n]/) : Array.isArray(value) ? value : []).map(x=>String(x).trim()).filter(Boolean));
}
export function eventType(record) {
  const values=['type','event_type','activity','status'].map(key=>norm(record[key]));
  if (values.some(x=>['absence','absent','absente','conge','conges','indisponible','indisponibilite','absent(e)'].includes(x))) return 'absence';
  if (record.kind==='availability' || values.some(x=>['libre','disponible','disponibilite','availability','free'].includes(x))) return 'availability';
  return 'intervention';
}
export function teamEvents(records) { return records.filter(r=>['event','availability'].includes(r.kind) && !cancelled(r) && r.scope!=='personal' && eventInterval(r)); }

export function conflicts(records) {
  const events=teamEvents(records).filter(r=>eventType(r)!=='availability'), result=[];
  for (let i=0;i<events.length;i++) {
    const left=events[i], [ls,le]=eventInterval(left);
    for (const right of events.slice(i+1)) {
      const [rs,re]=eventInterval(right);
      if (Math.max(ls,rs)>=Math.min(le,re)) continue;
      const rightPeople=new Set(people(right).map(lower));
      const common=unique(people(left).filter(person=>rightPeople.has(lower(person)))).sort();
      const truck=String(left.truck||'').trim();
      const sameTruck=Boolean(truck && lower(truck)===lower(right.truck));
      if ((!sameTruck && !common.length) || (eventType(left)==='absence' && eventType(right)==='absence')) continue;
      const reasons=[];
      if (eventType(left)==='absence'||eventType(right)==='absence') reasons.push('Intervention pendant une absence déclarée');
      else if (sameTruck) reasons.push('Camion affecté à deux interventions simultanées');
      if (common.length) reasons.push(`Technicien affecté simultanément : ${common.join(', ')}`);
      result.push({record_ids:[left.id,right.id],reason:reasons.join(' · '),truck:sameTruck?truck:null,people:common,start:localISO(Math.max(ls,rs)),end:localISO(Math.min(le,re))});
    }
  }
  return result;
}
const GOOGLE_SOURCES=new Set(['calendar','google agenda','googleagenda','google calendar','google_calendar','googlecalendar']);
const PROGRAMS=['PK','Région','DUO','À classer'];
const ACTIVITIES=['Photovoltaïque','Climatisation','Extracteur','IRVE','À classer'];
function program(value) {
  const text=norm(value), pk=/\bpk\b/.test(text), region=/\bregion\b/.test(text);
  return /\bduo\b/.test(text)||(pk&&region) ? 'DUO' : pk ? 'PK' : region ? 'Région' : null;
}
function activityMatches(value) {
  const text=norm(value), result=[];
  if (/\bpv\b|\bphotovoltaiques?\b|\bpanneaux?\s+solaires?\b|(?<![a-z])kwc\b/.test(text)) result.push('Photovoltaïque');
  if (/\bclim\b|\bclimatisation\b|\bclimatiseurs?\b/.test(text)) result.push('Climatisation');
  if (/\bextracteurs?\b/.test(text)) result.push('Extracteur');
  if (/\birve\b|\bbornes?\s+(?:de\s+)?recharge\b/.test(text)) result.push('IRVE');
  return result;
}
const explicitType=r=>norm(r.interventionType||r.type||r.event_type);
const visitMarker=text=>/\bvt\b|\bvisite\s+tech(?:nique)?s?\b/.test(text);
const excludedTitle=text=>/\bsav\b|\bmaintenance\b|\bentretien\b|\betiquetage\b|\bconnexion\b|\badministratif\b/.test(text);
function visit(record) {
  const explicit=explicitType(record);
  if (explicit) {
    if (['visit','visite'].includes(explicit)||visitMarker(explicit)) return [true,'champ explicite'];
    if (/\binstallation\b|\bsav\b|\bmaintenance\b|\bentretien\b/.test(explicit)) return [false,'champ explicite'];
  }
  const title=norm(record.title);
  return [visitMarker(title)&&!excludedTitle(title),'libellé à vérifier'];
}
function classifyProject(record) {
  if (visit(record)[0]) return null;
  const type=explicitType(record), installation=/\binstallation\b/.test(type), title=norm(record.title);
  if (!installation&&(excludedTitle(title)||excludedTitle(type))) return null;
  if (![...activityMatches(record.activity),...activityMatches(record.title)].includes('Photovoltaïque')) return null;
  const explicit=record.program||record.offer, category=program(explicit||record.title);
  if (!category&&!installation) return null;
  return {...record,_program:category||'À classer',_classification_method:explicit?'champ explicite':category?'libellé à vérifier':'non renseigné',_classification_evidence:String(explicit||record.title||'')};
}
function groupProjects(candidates) {
  const groups=new Map();
  for (const record of candidates) {
    const id=String(record.project_id||'').trim(), method=id?'project_id':'title', key=JSON.stringify([method,id||norm(record.title)]);
    if (!groups.has(key)) groups.set(key,{method,events:[]});
    groups.get(key).events.push(record);
  }
  return [...groups.values()].map(({method,events})=>{
    const representative=events.find(e=>e._classification_method==='champ explicite')||events[0], programs=unique(events.map(e=>e._program).filter(p=>p!=='À classer'));
    const conflict=programs.length>1, project={...representative,event_count:events.length,event_ids:events.map(e=>e.id||e.external_id),events,
      grouping_method:method==='project_id'?'project_id':'libellé identique — à vérifier',_classification_conflict:conflict};
    if (conflict) Object.assign(project,{_program:'À classer',_classification_method:'libellé à vérifier',_classification_evidence:`Programmes différents sur les événements regroupés : ${programs.sort().join(', ')}`});
    return project;
  });
}

export function projects(records,start,end) {
  const first=asDate(start), last=asDate(end);
  if (last<first) throw new RangeError('La fin de période précède son début.');
  const left=parseDateTime(first), finish=parseDateTime(last)+DAY, seen=new Set(), events=[];
  let undated=0;
  for (const record of records) {
    if (record.kind!=='event'||!GOOGLE_SOURCES.has(norm(record.source))||record.scope==='personal'||cancelled(record)) continue;
    const interval=eventInterval(record);
    if (!interval) {undated++;continue;}
    const [a,b]=interval;
    if (!(a===b ? left<=a&&a<finish : a<finish&&b>left)) continue;
    const key=String(record.id||record.external_id||JSON.stringify([record.calendar_id,record.title,record.start,record.end]));
    if (seen.has(key)) continue;
    seen.add(key); events.push(record);
  }
  const candidates=[], visits=[];
  for (const record of events) {
    const [isVisit,identification]=visit(record);
    if (isVisit) {
      const explicit=activityMatches(record.activity), matches=explicit.length?explicit:activityMatches(record.title);
      visits.push({...record,_activity:matches.length===1?matches[0]:'À classer',
        _classification_method:explicit.length?'champ explicite':matches.length?'libellé à vérifier':'non renseigné',
        _classification_evidence:String(explicit.length?record.activity:record.title||''),_visit_identification_method:identification});
    } else { const project=classifyProject(record); if (project) candidates.push(project); }
  }
  const grouped=groupProjects(candidates), programs=count(grouped,p=>p._program), activities=count(visits,v=>v._activity), hasData=!!events.length;
  const programCounts=Object.fromEntries(PROGRAMS.map(p=>[p,programs[p]||0])), activityCounts=Object.fromEntries(ACTIVITIES.map(a=>[a,activities[a]||0]));
  return {start:first,end:last,calendar_event_count:events.length,undated_count:undated,
    projects:{has_data:hasData,total:grouped.length,pk:programCounts.PK,region:programCounts['Région'],duo:programCounts.DUO,unclassified:programCounts['À classer'],
      pk_total:programCounts.PK+programCounts.DUO,region_total:programCounts['Région']+programCounts.DUO,event_count:candidates.length,records:grouped,by_program:programCounts},
    visits:{has_data:hasData,total:visits.length,photovoltaic:activityCounts['Photovoltaïque'],climate:activityCounts.Climatisation,extractor:activityCounts.Extracteur,irve:activityCounts.IRVE,
      unclassified:activityCounts['À classer'],records:visits,by_activity:activityCounts}};
}

