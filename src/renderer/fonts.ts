/**
 * The typefaces the Astryx themes ask for, bundled with the app (Latin subset, OFL).
 * The themes' own fonts.css files load them from Google Fonts; QuickCalc never touches the
 * network, so vite.config.ts replaces those files with nothing and these load instead.
 * Each file is only read when a theme actually uses that face.
 */

// Neutral, Stone (body)
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
// Butter
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/outfit/latin-700.css';
// Chocolate
import '@fontsource/albert-sans/latin-400.css';
import '@fontsource/albert-sans/latin-500.css';
import '@fontsource/albert-sans/latin-600.css';
import '@fontsource/albert-sans/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
// Gothic
import '@fontsource/fustat/latin-400.css';
import '@fontsource/fustat/latin-500.css';
import '@fontsource/fustat/latin-600.css';
import '@fontsource/fustat/latin-700.css';
// Matcha
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/playwrite-us-trad/latin-400.css';
// Stone (headings)
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
// Y2K
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
