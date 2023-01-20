/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * Convert hue, saturation, luminance, and alpha to red green blue alpha
 * @param {number} h - hue, in degrees
 * @param {number} s - saturation from 0 to 1
 * @param {number} l - luminance from 0 to 1
 * @param {number} a - alpha from 0 to 1
 * @returns {number[]} an array of normalized red, green, blue, and alpha values
 */
export function hsla_to_rgba(h, s, l, a) {
    const k = (n) => (n + h / 30) % 12;
    const sl = s * Math.min(l, 1 - l);
    const f = (n) =>
        l - sl * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4), a];
}

/**
 * Convert CSS rgb/rgba hex string to an array of normalized red, green, blue, alpha.
 * @param {string} rgba - css hex color string, such as #FFCCAA
 * @returns {number[]} an array of normalized red, green, blue, and alpha values
 */
export function rgba_hex_to_f4(rgba) {
    if (rgba[0] == "#") {
        rgba = rgba.slice(1);
    }

    if (rgba.length == 3) {
        rgba = `${rgba[0]}${rgba[0]}${rgba[1]}${rgba[1]}${rgba[2]}${rgba[2]}`;
    }

    if (rgba.length == 6) {
        rgba = `${rgba}FF`;
    }

    const str_components = [
        rgba.slice(0, 2),
        rgba.slice(2, 4),
        rgba.slice(4, 6),
        rgba.slice(6, 8),
    ];

    const num_components = str_components.map((v) => parseInt(v, 16) / 255);

    return num_components;
}

/**
 * Convert CSS rgb/rgba string to an array of normalized red, green, blue, alpha.
 * @param {string} rgba - css rgba color string, such as rgb(200, 100, 50)
 * @returns {number[]} an array of normalized red, green, blue, and alpha values
 */
export function rgba_to_f4(rgba) {
    if (!rgba.startsWith("rgba")) {
        rgba = `rgba(${rgba.slice(4, -1)}, 1)`;
    }
    rgba = rgba.trim().slice(5, -1);
    const parts = rgba.split(",").map((v) => parseFloat(v));
    const rgb = parts.slice(0, 3).map((v) => v / 255);
    const a = parts[3];
    return [...rgb, a];
}

/**
 * Converts an array of normalized red, green, blue, alpha values to a CSS
 * rgba color string.
 * @param {number[]} color - normalized color
 * @returns {string} css color string
 */
export function f4_to_rgba(color) {
    return `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${
        color[3]
    })`;
}