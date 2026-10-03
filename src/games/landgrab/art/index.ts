/**
 * Landgrab's art for the hub: the game card's live scene and the cosmetic previews in the
 * shop, locker and chest reveals, all drawn by the match renderer's own pieces so they
 * look exactly like a match.
 */
import type { Disposable } from '../../../shared/game';
import type { CosmeticDef } from '../../../shared/services';
import { CARD_STILL_AT, cardScene } from './cardArt';
import { play } from './playback';
import { PREVIEW_STILL_AT, previewScene } from './previews';
import { Scene } from './scene';

export function mountCardArt(host: HTMLElement): Disposable {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.append(canvas);
  const playing = play(canvas, () => new Scene(canvas, cardScene()), CARD_STILL_AT);
  return {
    dispose() {
      playing.dispose();
      canvas.remove();
    },
  };
}

export function renderCosmeticPreview(canvas: HTMLCanvasElement, cosmetic: CosmeticDef, color: number): Disposable {
  return play(canvas, () => new Scene(canvas, previewScene(cosmetic, color)), PREVIEW_STILL_AT[cosmetic.kind]);
}
