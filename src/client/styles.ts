/**
 * One-time stylesheet installation for the rendered surfaces.
 *
 * DSH loads a plugin browser half as a single JavaScript artifact and offers no
 * stylesheet channel, so the CSS text is compiled into the bundle and injected
 * once per page. The style tag is namespaced, removed on unload, and never
 * overrides host classes: every rule is scoped under the plugin's own class or
 * data attribute.
 *
 * @module dsh-rich-msg/client/styles
 */
import richMsgCss from '../ui/rich-ui.css';
import primitivesCss from '../ui/primitives/primitives.css';
import hostThemeCss from './host-theme.css';
import { DOM_MARKERS } from '../shared/protocol.ts';

/** Inject the combined stylesheet once; returns a disposer that removes it. */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector('style[' + DOM_MARKERS.style + ']');
  if (existing !== null) return () => {};
  const tag = document.createElement('style');
  tag.setAttribute(DOM_MARKERS.style, '');
  tag.textContent = [primitivesCss, richMsgCss, hostThemeCss].join('\n');
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}
