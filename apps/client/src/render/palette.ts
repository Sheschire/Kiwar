import { Color } from 'three';

/** Central colour palette of the world. Tweak the art direction here. */
export const PALETTE = {
  skyZenith: new Color('#7464b4'),
  skyMid: new Color('#c7a6dc'),
  skyHorizon: new Color('#ffd6b5'),
  skyBelow: new Color('#f6c6c9'),
  cloud: new Color('#fff3e6'),
  cloudShade: new Color('#e9b9c8'),
  sun: new Color('#ffe2b8'),
  hemiSky: new Color('#d9d2ff'),
  hemiGround: new Color('#ffcf9e'),
  moonSkin: new Color('#7b5536'),
  moonFlesh: new Color('#8fc23a'),
  moonCore: new Color('#fbf3d0'),
} as const;
