/**
 * Host half of the account-balance pill.
 *
 * This plugin renders entirely in the browser: the client bundle registers one
 * entry in the composer dock slot and reads the balance through the existing
 * account remote. The Host half exists because every Loader row needs a module,
 * and only it carries the `dsh.client` declaration that turns the package into a
 * served browser bundle.
 */

/** Cordis plugin name used by the Loader and by diagnostics. */
export const name = 'dsh-plugin-account-balance';

/** No Host-side services are required. */
export const inject = [];

/** No Host-side behaviour. @param _ctx - unused plugin context. */
export function apply(_ctx) {}
