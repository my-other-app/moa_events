/*
 * next/font/google in tests: there is no Next compiler to fetch and
 * self-host the faces, so every font is a stand-in with an empty class and
 * variable (the stylesheet's fallback stacks are what the tests see).
 */
const font = () => ({ className: "", variable: "", style: { fontFamily: "sans-serif" } });

export const DM_Sans = font;
export const Bebas_Neue = font;
export const Poppins = font;
export const Space_Grotesk = font;
export const Inter = font;
export const Noto_Sans = font;
export const Unbounded = font;
export const Plus_Jakarta_Sans = font;
