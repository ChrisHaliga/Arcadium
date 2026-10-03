/** Player settings (volumes, haptics, screen shake). */
import { computed, type Signal } from '@preact/signals';
import type { SettingsService } from '../shared/services';
import { sanitizeSettings, type Settings } from './save';

export function createSettings(settings: Signal<Settings>): SettingsService {
  return {
    sfxVolume: computed(() => settings.value.sfxVolume),
    musicVolume: computed(() => settings.value.musicVolume),
    haptics: computed(() => settings.value.haptics),
    screenShake: computed(() => settings.value.screenShake),
    set(key, value) {
      // Validation clamps volumes to 0..1 and rejects values of the wrong type.
      settings.value = sanitizeSettings({ ...settings.value, [key]: value }, settings.value);
    },
  };
}
