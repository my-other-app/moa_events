/**
 * An imported image's address. Next hands an import of a .png an object
 * ({src, width, height}); tests hand a plain string.
 */
export const assetSrc = (asset) => (typeof asset === "string" ? asset : asset?.src || "");
