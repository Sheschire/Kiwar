import {
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A primitive placed by `matrix` and painted one colour (vertex colours, no uvs). */
export function colored(geo: BufferGeometry, color: string, matrix: Matrix4): BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(matrix);
  g.deleteAttribute('uv');
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

/** Translation, scale and rotation (Euler XYZ) in one matrix. */
export const mat = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(sx, sy, sz),
  );

/** Merges coloured parts into one geometry with flat normals. */
export function merged(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}
