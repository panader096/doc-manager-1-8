// Runs raw in <head>, not through the build pipeline — no transpilation, so
// keep syntax here no newer than Next's own minimum browser baseline.
try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch{}
