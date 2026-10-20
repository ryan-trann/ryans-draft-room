// Native web controls for the production website. The framed preview remains separate.
import {useEffect,useRef,type PropsWithChildren,type InputHTMLAttributes} from 'react';
export function MobileScroll({children,className=''}:PropsWithChildren<{className?:string}>){return <section className={'mobile-page '+className}><div className="mobile-scroll">{children}</div></section>}
export function KeyboardInput(props:InputHTMLAttributes<HTMLInputElement>){return <input {...props}/>}
export function useKeyboard(){return {hide:()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur()}}}
export function useKeyboardInsets(){return {bottomInset:0,isKeyboardVisible:false}}
export function BottomSheet({open,onOpenChange,title,description,children}:PropsWithChildren<{open:boolean;onOpenChange:(v:boolean)=>void;title:string;description?:string;snap?:number}>){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;if(open&&!el?.open)el?.showModal();if(!open&&el?.open)el.close()},[open]);
 return <dialog ref={ref} className="bottom-sheet production-sheet" aria-labelledby="sheet-title" aria-describedby="sheet-description" onCancel={()=>onOpenChange(false)} onClose={()=>onOpenChange(false)} onClick={e=>{if(e.target===ref.current){const box=ref.current.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)onOpenChange(false)}}}>
 <div className="sheet-handle-zone"><div className="sheet-handle"/></div><div className="sheet-header"><h2 id="sheet-title" className="sheet-title">{title}</h2><p id="sheet-description" className="sheet-description">{description}</p></div><div className="sheet-content">{open?children:null}</div></dialog>
}
