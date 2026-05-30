// =======================================================
// MODULE: auth.js
// =======================================================

async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pwd=document.getElementById('login-pwd').value;
  const err=document.getElementById('login-err');
  err.style.display='none';
  try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pwd})});
    const d=await r.json();
    if(!r.ok){err.style.display='block';return;}
    token=d.token;currentUser=d.user;
    sessionStorage.setItem('token',token);
    sessionStorage.setItem('user',JSON.stringify(currentUser));
    document.getElementById('login-screen').style.display='none';
    document.getElementById('app-wrapper').classList.add('active');
    document.getElementById('user-badge').textContent=`👤 ${currentUser?.nome||currentUser?.email||''}`;
    const cb=document.getElementById('chat-btn');if(cb)cb.style.display='flex';
    await loadDD();
    loadDashboard();
    showSection('dashboard');
  }catch(e){err.style.display='block';}
}

function doLogout(){sessionStorage.clear();token='';currentUser=null;location.reload();}

function goToApp(sec='interventi'){
  document.getElementById('home-screen').style.display='none';
    const secs=['interventi','documenti','manutenzioni','anagrafiche','riepilogo','catasto','import','impostazioni'];
  const idx=Math.max(0,secs.indexOf(sec));
  
  document.querySelectorAll('#app-main .section').forEach(s=>s.classList.remove('active'));
  document.getElementById('sec-'+secs[idx])?.classList.add('active');
  if(sec==='riepilogo')renderRiep();
  if(sec==='impostazioni')loadUsers();
  initApp();
}

function goHome(){showHome();}

async function initApp(){
  await loadDD();
  loadDashboard();
}