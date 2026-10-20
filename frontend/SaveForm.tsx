import {useLayoutEffect,useRef,useState} from 'react';
import {bridge} from './engine';
export function SaveForm(){
 const host=useRef<HTMLDivElement>(null);const [status,setStatus]=useState(bridge.data().status);
 useLayoutEffect(()=>{
  bridge.review();const form=document.getElementById('editorReviewArea')!;const marker=document.createComment('original-save-form');form.before(marker);host.current!.append(form);
  const sync=()=>setStatus(bridge.data().status);window.addEventListener('draftroom:change',sync);
  return()=>{window.removeEventListener('draftroom:change',sync);marker.replaceWith(form)};
 },[]);
 return <div className="live-save-form"><div ref={host}/><p className="live-save-status" role="status">{status}</p></div>
}
