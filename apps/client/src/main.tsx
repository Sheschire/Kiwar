// Latin subsets only (latin-ext is needed for French "œ").
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-ext-400.css';
import '@fontsource/alegreya/latin-500.css';
import '@fontsource/alegreya/latin-ext-500.css';
import '@fontsource/alegreya/latin-700.css';
import '@fontsource/alegreya/latin-ext-700.css';
import './ui/styles.css';

/** `/admin` (or `?admin`) opens the admin space: its own chunk, without the 3D game. */
const path = window.location.pathname.replace(/\/+$/, '');
const isAdmin = path.endsWith('/admin') || new URLSearchParams(window.location.search).has('admin');

if (isAdmin) void import('./admin/startAdmin').then((m) => m.startAdmin());
else void import('./startGame');
