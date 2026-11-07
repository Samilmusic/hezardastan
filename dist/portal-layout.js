/* Layout only: preserves the portal's existing role-filtered navigation. */
(() => {
  const sidebar=document.getElementById('portal-sidebar');
  const toggle=document.getElementById('portal-menu-toggle');
  const close=document.getElementById('portal-menu-close');
  const backdrop=document.getElementById('portal-nav-backdrop');
  const main=document.getElementById('portal-main');
  const narrow=matchMedia('(max-width:1050px)');
  if(!sidebar||!toggle||!close||!backdrop||!main)return;
  let open=false;
  function setOpen(next,restoreFocus=false){
    open=narrow.matches&&next;
    document.body.classList.toggle('portal-menu-open',open);
    toggle.setAttribute('aria-expanded',String(open));
    backdrop.hidden=!open;
    sidebar.inert=narrow.matches&&!open;
    main.inert=open;
    if(narrow.matches){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal',String(open));}
    else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}
    if(open){
      const nav=document.getElementById('nav'),active=nav.querySelector('button.active');
      nav.scrollTop=active?Math.max(0,active.offsetTop-nav.offsetTop-8):0;
      requestAnimationFrame(()=>{if(open)close.focus();});
    }
    else if(restoreFocus&&narrow.matches)toggle.focus();
  }
  toggle.addEventListener('click',()=>setOpen(!open));
  close.addEventListener('click',()=>setOpen(false,true));
  backdrop.addEventListener('click',()=>setOpen(false,true));
  document.getElementById('nav').addEventListener('click',event=>{if(event.target.closest('button,a'))setOpen(false,true);});
  document.addEventListener('keydown',event=>{
    if(!open)return;
    if(event.key==='Escape'){event.preventDefault();setOpen(false,true);return;}
    if(event.key!=='Tab')return;
    const nodes=[...sidebar.querySelectorAll('button,a[href],input,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  narrow.addEventListener('change',()=>setOpen(false));
  setOpen(false);
})();
