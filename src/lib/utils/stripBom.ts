/**
 * Removes a leading UTF-8 byte order mark.
 * npm and Node ignore it when they read a package.json, but JSON.parse does not.
 *
 * @param text - file contents.
 * @returns the contents without a leading BOM.
 */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export default stripBom
