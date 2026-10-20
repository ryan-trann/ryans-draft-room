import {useLayoutEffect,useRef} from 'react';
import {projectionsMarkup,restoreMarkup,mountProjections,mountRestore} from './upload-tools';

export type Tool='draft'|'projections'|'restore';
export function ToolPage({tool,onNavigate}:{tool:Tool;onNavigate:(tool:Tool)=>void}){
 const host=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const el=host.current!;
  if(tool==='draft'){
   const draft=document.getElementById('draft')!;
   const panels=Array.from(document.querySelectorAll('#teams > .panel')).filter(p=>p.querySelector('#export,#refreshCloudTeams'));
   const moved=[draft,...panels].map(node=>{const marker=document.createComment('draft-tool-location');node.before(marker);el.append(node);return {node,marker}});
   const link=el.querySelector<HTMLAnchorElement>('a[href="teams-upload.html"]');
   const openRestore=(event:Event)=>{event.preventDefault();onNavigate('restore')};link?.addEventListener('click',openRestore);
   return()=>{link?.removeEventListener('click',openRestore);for(const {node,marker} of moved)marker.replaceWith(node)};
  }
  // Markup and handlers come from the existing, trusted upload pages.
  el.innerHTML=tool==='projections'?projectionsMarkup:restoreMarkup;
  for(const node of el.querySelectorAll<HTMLElement>('[id]')){node.dataset.toolId=node.id;node.id='tool-'+tool+'-'+node.id}
  for(const label of el.querySelectorAll<HTMLLabelElement>('label[for]'))label.htmlFor='tool-'+tool+'-'+label.htmlFor;
  if(tool==='projections')mountProjections(el);else mountRestore(el);
  return()=>{for(const input of el.querySelectorAll<HTMLInputElement>('input[type="password"]'))input.value='';el.replaceChildren()};
 },[tool]);
 return <div ref={host} className={'native-tools native-'+tool}/>;
}
