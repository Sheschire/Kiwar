/**
 * The "front" of the colony: the side of the sky where the alien twin hangs, the compass
 * points to, and (chantier 12) where the waves come from. A world azimuth with the
 * camera-controls convention: the direction (sin a, 0, cos a) from the centre. π is the far
 * side of the default view (the camera starts at azimuth 0, on +Z).
 */
export const FRONT_AZIMUTH = Math.PI;

/** Screen angle of the front (clockwise from up) for a camera at `cameraAzimuth`. */
export function frontScreenAngle(cameraAzimuth: number): number {
  const d = FRONT_AZIMUTH - cameraAzimuth;
  return Math.atan2(Math.sin(d), -Math.cos(d));
}
