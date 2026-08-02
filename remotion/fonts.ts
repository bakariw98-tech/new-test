/**
 * Fonts, loaded from node_modules rather than fetched at render time.
 *
 * The render machine has no system fonts, so an unloaded family silently falls
 * back to something generic — which reads as "slightly off" rather than as an
 * error, and is easy to ship. Self-hosting through @fontsource also means a
 * render never depends on Google's CDN being reachable.
 *
 * Importing this module is what makes the families available; the CSS is
 * side-effecting.
 */

import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/700.css";
