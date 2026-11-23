/**
 * A page shown inside a Tiles tile runs in an iframe named "mq-tile-…" on a Merqado page of the same origin.
 * This marks <html data-tile> before paint so the page drops its own side menu, title and GPT bar.
 * The iframe's name survives navigation inside the tile; a Merqado page framed by any other site is left alone.
 */
export const TILE_FRAME_PREFIX = "mq-tile-";

export const TILE_SCRIPT = `(function(){try{if(window.top!==window.self&&window.name.indexOf("${TILE_FRAME_PREFIX}")===0&&window.parent.location.origin===location.origin)document.documentElement.setAttribute("data-tile","")}catch(e){}})()`;
