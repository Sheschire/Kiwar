import type { Dict } from './i18n';

export const fr: Dict = {
  app: {
    title: 'Kiwar',
    tagline: 'Une civilisation kiwi toute douce',
    loading: 'On épluche le kiwi…',
  },
  units: { second: 's', minute: 'min', hour: 'h', day: 'j' },
  settings: {
    title: 'Réglages',
    language: 'Langue',
    quality: 'Qualité graphique',
    qualityAuto: 'Auto ({preset})',
    close: 'Fermer',
  },
  quality: { low: 'Bas', medium: 'Moyen', high: 'Haut' },
  langs: { fr: 'Français', en: 'English' },
  faces: { kiwisu: 'Kiwisu', kiwino: 'Kiwino' },
  tiles: {
    heart: { name: 'Cœur', desc: 'La columelle blanche du kiwi. Le Nid y est installé.' },
    ray: { name: 'Rayon', desc: 'Un sentier pâle qui part du cœur. Les kiwis y marchent plus vite.' },
    seedRing: { name: 'Anneau de graines', desc: 'De brillantes graines noires dorment ici. Un trésor rare.' },
    flesh: { name: 'Chair', desc: 'Prairies de pulpe verte et juteuse. Idéal pour la cueillette.' },
    grove: { name: 'Bosquet de duvet', desc: 'Des fourrés de poils de kiwi, filés en fibre solide.' },
    juice: { name: 'Poche de jus', desc: 'Une mare pétillante de jus de kiwi.' },
    skin: { name: 'Peau', desc: 'Falaises brunes et poilues qui ferment le monde. Inconstructible.' },
  },
  tile: {
    richness: 'Richesse',
    good_for: 'Idéal pour',
    nothing: 'Rien à construire ici',
  },
  resources: {
    pulp: 'Pulpe',
    fiber: 'Fibre',
    seeds: 'Graines',
    juice: 'Jus',
  },
};
