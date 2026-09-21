import {API_BASE} from './config.js';

let csrf = '';
let token = '';
let storageRead = false;
export class ApiError extends Error { constructor(message,status){super(message);this.status=status;} }

function baseUrl(){
  if(typeof API_BASE!=='string'||!API_BASE.trim())throw new ApiError('Le service privé du dashboard n’est pas encore connecté. La connexion sera disponible dès sa mise en service.',0);
  let url;
  try{url=new URL(API_BASE);}catch{throw new ApiError('L’adresse du service privé est incorrecte. Contactez l’administrateur du dashboard.',0);}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash)throw new ApiError('L’adresse du service privé doit être une adresse HTTPS sans identifiant ni paramètre.',0);
  return url.href.replace(/\/+$/,'');
}
function storageKey(){return 'alclima.pages.session.v1:'+baseUrl()+':'+new URL('.',window.location.href).pathname;}
function readToken(){
  if(!storageRead){try{token=sessionStorage.getItem(storageKey())||'';}catch{token='';}storageRead=true;}
  return token;
}
function saveToken(value){token=value;storageRead=true;try{if(value)sessionStorage.setItem(storageKey(),value);else sessionStorage.removeItem(storageKey());}catch{}}
function clearSession(){csrf='';saveToken('');}
function expire(){clearSession();window.dispatchEvent(new Event('session-expired'));}
function endpoint(path){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('#')||path.includes('\\'))throw new ApiError('Adresse de requête incorrecte.',0);
  const base=baseUrl();
  const url=new URL(base+'/api'+path);
  if(url.origin!==new URL(base).origin||!url.pathname.startsWith(new URL(base+'/api/').pathname))throw new ApiError('Adresse de requête incorrecte.',0);
  return url.href;
}
export function configurationError(){try{baseUrl();return '';}catch(error){return error.message;}}
async function request(path,options={}){
  const url=endpoint(path);
  const {body,...rest}=options;
  const method=(rest.method||'GET').toUpperCase();
  const headers=new Headers(rest.headers||{});
  if(!headers.has('Accept'))headers.set('Accept','application/json');
  if(body!==undefined)headers.set('Content-Type','application/json');
  headers.delete('Authorization');
  const currentToken=readToken();
  if(currentToken&&path!=='/login')headers.set('Authorization','Bearer '+currentToken);
  if(!['GET','HEAD'].includes(method)&&csrf)headers.set('X-CSRF-Token',csrf);
  let response;
  try{response=await fetch(url,{...rest,method,headers,credentials:'omit',cache:'no-store',redirect:'error',...(body!==undefined?{body:JSON.stringify(body)}:{})});}
  catch{throw new ApiError('Le service privé est injoignable. Vérifiez votre connexion Internet, puis réessayez.',0);}
  if(response.status===401&&path!=='/login')expire();
  return response;
}
export async function api(path,options={}){
  const response=await request(path,options);
  const data=response.status===204?{}:await response.json().catch(()=>({}));
  if(!response.ok){
    const detail=data.detail||data.error||data.message;
    throw new ApiError(typeof detail==='string'?detail:Array.isArray(detail)?detail.map(x=>x.msg||'Champ incorrect').join(' · '):`La demande a échoué (${response.status}).`,response.status);
  }
  return data;
}
export async function session(){
  baseUrl();
  if(!readToken())return {authenticated:false};
  const result=await api('/session');
  csrf=result.csrf||'';
  if(!result.authenticated)clearSession();
  return result;
}
export async function login(password){
  baseUrl();
  clearSession();
  const result=await api('/login',{method:'POST',body:{password}});
  if(result.authenticated!==true||typeof result.token!=='string'||!result.token||typeof result.csrf!=='string'||!result.csrf)throw new ApiError('La connexion n’a pas pu être établie. Réessayez ou contactez l’administrateur.',0);
  saveToken(result.token);csrf=result.csrf;
  return {authenticated:true,csrf};
}
export async function logout(){const pending=api('/logout',{method:'POST'});clearSession();return await pending;}
export async function download(path,filename){
  const response=await request(path,{headers:{Accept:'application/octet-stream'}});
  if(!response.ok)throw new ApiError('Le téléchargement a échoué.',response.status);
  const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
