const paths={home:'Accueil',prospects:'Prospects',emails:'Mails importants',agenda:'Mon agenda',planning:'Planning par équipe',projects:'Projets & visites',jobs:'Chantiers & SAV',quotes:'Devis',finance:'Finance',stock:'Stock & achats',docs:'Documents',goals:'Objectifs',watch:'Veille concurrentielle',usage:'Utilisation ChatGPT',alerts:'Alertes',settings:'Paramètres'};
export const routes=paths;
export const currentRoute=()=>Object.hasOwn(paths,location.hash.slice(1))?location.hash.slice(1):'home';
export function navigate(route){location.hash=Object.hasOwn(paths,route)?route:'home';}
export function initRouter(render){window.addEventListener('hashchange',()=>render(currentRoute()));}
