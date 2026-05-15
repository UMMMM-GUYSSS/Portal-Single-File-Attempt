/*
  Portal GitHub Proxy Service Worker
  - Adds Cross-Origin-Isolation headers (required for WebAssembly threads)
  - Transparently proxies all relative game file requests to raw.githubusercontent.com
  
  Replace RAW_BASE with your actual repo URL before deploying.
*/

const RAW_BASE = 'https://media.githubusercontent.com/media/UMMMM-GUYSSS/Portal-Single-File-Attempt/refs/heads/main';

// Files that live at the repo root
const ROOT_FILES = new Set([
  'hl2_launcher.js',
  'hl2_launcher.wasm',
  'libclient.so',
  'libdatacache.so',
  'libengine.so',
  'libfilesystem_stdio.so',
  'libGameUI.so',
  'libinputsystem.so',
  'liblauncher.so',
  'libmaterialsystem.so',
  'libscenefilecache.so',
  'libserver.so',
  'libServerBrowser.so',
  'libshaderapidx9.so',
  'libsoundemittersystem.so',
  'libstdshader_dx9.so',
  'libsteam_api.so',
  'libstudiorender.so',
  'libtier0.so',
  'libtogl.so',
  'libvaudio_minimp3.so',
  'libvgui2.so',
  'libvguimatsurface.so',
  'libvideo_services.so',
  'libvphysics.so',
  'libvstdlib.so',
  'libvtex_dll.so',
]);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', function (event) {
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(event.request.url);

  // Only intercept requests to our own origin (same-origin requests from the game)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname.replace(/^\//, ''); // strip leading slash
  // Also handle GitHub Pages subdirectory deployments (e.g. /portal-fixed8/hl2_launcher.js)
  const filename = path.split('/').pop();
  const isGameFile = ROOT_FILES.has(filename) ||
    path.includes('chunks/') ||
    path.includes('assets/');

  if (isGameFile) {
    // Reconstruct the raw.githubusercontent.com URL preserving subpath
    // e.g. chunks/background1.data -> RAW_BASE/chunks/background1.data
    const subpath = isSubpath(path);
    const rawUrl = RAW_BASE + '/' + subpath;

    event.respondWith(
      fetch(rawUrl, { mode: 'cors' })
        .then(function (response) {
          if (!response.ok && response.status !== 0) {
            return response;
          }
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => {
          console.error('[SW] Failed to fetch from GitHub:', rawUrl, e);
          return new Response('Failed to load game file: ' + rawUrl, { status: 502 });
        })
    );
    return;
  }

  // For all other requests (index.html itself, fonts, etc.) just add COI headers
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch((e) => console.error('[SW]', e))
  );
});

// Extract the game-relative subpath from the full page path
// Handles both root deployments (/hl2_launcher.js) and subdir ones (/portal/chunks/bg.data)
function isSubpath(path) {
  // Strip any leading repo/subdir prefix — keep from first known segment
  const knownPrefixes = ['chunks/', 'assets/'];
  for (const prefix of knownPrefixes) {
    const idx = path.indexOf(prefix);
    if (idx !== -1) return path.slice(idx);
  }
  // Root-level file — just the filename
  return path.split('/').pop();
}