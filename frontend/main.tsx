import React from 'react';
import {createRoot} from 'react-dom/client';
import './design.css';
import './production.css';
const host=document.getElementById('root')!;
try{
 for(let i=0;i<300&&!window.DraftRoomBridge?.data().ready;i++)await new Promise(resolve=>setTimeout(resolve,30));
 if(!window.DraftRoomBridge?.data().ready)throw Error('Saved roster data could not be loaded.');
 const {default:DraftRoom}=await import('./DraftRoom');
 document.body.classList.add('modern-ready');
 createRoot(host).render(<React.StrictMode><DraftRoom/></React.StrictMode>);
}catch(error){console.error('Draft Room interface could not start; original tools remain available.',error);document.body.classList.add('show-original');}
