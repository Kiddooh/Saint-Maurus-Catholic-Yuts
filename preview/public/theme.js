// Apply the saved preference before styles render, without inline scripts.
try {
  var savedTheme = localStorage.getItem('maurus-preview-theme');
  document.documentElement.dataset.theme = savedTheme === 'light' ? 'light' : savedTheme === 'system' && window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
} catch (_) { document.documentElement.dataset.theme = 'dark'; }

try {
  var savedPalette = localStorage.getItem('maurus-palette');
  document.documentElement.dataset.palette = savedPalette === 'ocean' || savedPalette === 'chapel' ? savedPalette : 'sanctuary';
} catch (_) { document.documentElement.dataset.palette = 'sanctuary'; }

var themeMeta = document.querySelector('meta[name="theme-color"]');
if (themeMeta) {
  var colours = document.documentElement.dataset.theme === 'light' ? {sanctuary:'#f8f4eb',ocean:'#f1f6f5',chapel:'#f9f2ee'} : {sanctuary:'#182a24',ocean:'#1a2c37',chapel:'#30242e'};
  themeMeta.setAttribute('content', colours[document.documentElement.dataset.palette]);
}
