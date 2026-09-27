// Custom building materials: MeshStandardMaterial + atlas sampling, per-window variation, night lights.
import * as THREE from 'three';

export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

// Compose onBeforeCompile hooks (CSM installs its own).
export function addHook(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => { if (prev) prev(shader, renderer); fn(shader, renderer); };
  mat.customProgramCacheKey = () => key;
}

const HASH = `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

export function facadeMaterial(atlas) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.9 });
  mat.userData.atlas = atlas;
  addHook(mat, 'facade', (s) => {
    s.uniforms.uAtlas = { value: atlas };
    s.uniforms.uNight = shared.uNight;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aUv; attribute vec2 aInfo; varying vec2 vUvR; varying vec2 vInfo;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vUvR = aUv; vInfo = aInfo;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uAtlas; uniform float uNight; varying vec2 vUvR; varying vec2 vInfo; float gGlass; float gRnd;
${HASH}`)
      .replace('#include <color_fragment>', `
{
  vec2 cell = floor(vUvR); vec2 f = fract(vUvR);
  float tile = vInfo.x;
  vec2 tOff = vec2(mod(tile, 4.0), floor(tile / 4.0 + 0.01));
  f = clamp(f, vec2(0.006), vec2(0.994));
  vec2 st = vec2((tOff.x + f.x) / 4.0, (1.0 - tOff.y + f.y) / 2.0);
  vec2 dx = dFdx(vUvR) / vec2(4.0, 2.0), dy = dFdy(vUvR) / vec2(4.0, 2.0);
  vec4 tx = textureGrad(uAtlas, st, dx, dy);
  gGlass = tx.a;
  gRnd = h12(cell + vInfo.yy * 17.13);
  vec3 wallc = tx.rgb * vColor.rgb * (0.93 + 0.14 * h12(vec2(vInfo.y, cell.y)));
  vec3 glassc = tx.rgb * (0.7 + 0.6 * gRnd);
  diffuseColor.rgb = mix(wallc, glassc, gGlass);
  // cheap ambient occlusion near the ground and under the eaves
  float ao = mix(0.5, 1.0, smoothstep(0.0, 0.5, vUvR.y));
  diffuseColor.rgb *= ao;
}`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.12, gGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float lit = step(0.5, h12(floor(vUvR) * 1.37 + vInfo.yy * 3.1 + 7.0));
  float warm = h12(floor(vUvR) + 11.0);
  vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.85, 0.9, 1.0), step(0.8, warm));
  totalEmissiveRadiance += gGlass * lit * uNight * lc * (1.2 + 1.2 * gRnd);
}`);
  });
  return mat;
}

export function roofMaterial(atlas, photo = null, chunk = null) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, envMapIntensity: 0.7 });
  if (photo) mat.defines = { ...(mat.defines || {}), ROOF_PHOTO: '' };
  addHook(mat, photo ? 'roofphoto' : 'roof', (s) => {
    s.uniforms.uAtlas = { value: atlas };
    s.uniforms.uPhoto = photo || { value: null };
    s.uniforms.uChunk = { value: chunk || new THREE.Vector4(0, 0, 1, 0) };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aUv; attribute vec2 aInfo; varying vec2 vUvR; varying vec2 vInfo; varying vec2 vWXZ;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vUvR = aUv; vInfo = aInfo; vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uAtlas; uniform sampler2D uPhoto; uniform vec4 uChunk; varying vec2 vUvR; varying vec2 vInfo; varying vec2 vWXZ; float gMetal;
${HASH}`)
      .replace('#include <color_fragment>', `
{
  float tile = vInfo.x;
  vec2 tOff = vec2(mod(tile, 2.0), floor(tile / 2.0 + 0.01));
  vec2 f = fract(vUvR);
  f = clamp(f, vec2(0.004), vec2(0.996));
  vec2 st = vec2((tOff.x + f.x) / 2.0, (1.0 - tOff.y + f.y) / 2.0);
  vec2 dx = dFdx(vUvR) / 2.0, dy = dFdy(vUvR) / 2.0;
  vec4 tx = textureGrad(uAtlas, st, dx, dy);
  float patchv = 0.9 + 0.2 * h12(floor(vUvR / 3.0) + vInfo.yy);
  diffuseColor.rgb = tx.rgb * vColor.rgb * patchv;
  #ifdef ROOF_PHOTO
  {
    // real roof from the aerial photograph, with the tile pattern as fine relief
    vec2 cuv = clamp((vWXZ - uChunk.xy) / uChunk.z, vec2(-0.02), vec2(1.02));
    float inner = 1.0 - 2.0 * uChunk.w;
    vec2 puv = vec2(uChunk.w + cuv.x * inner, 1.0 - (uChunk.w + cuv.y * inner));
    float pl = dot(tx.rgb, vec3(0.3333));
    if (tile > 0.5 && tile < 1.5) {
      // flat roofs: the photo is an exact top-down view, use it with detail
      vec3 ph = texture2D(uPhoto, puv, 0.4).rgb;
      ph.g *= 0.96;
      float lum = dot(ph, vec3(0.2126, 0.7152, 0.0722));
      ph = mix(vec3(lum), ph, 1.15);
      diffuseColor.rgb = mix((ph * 1.3 + 0.035) * (0.8 + 0.2 * pl / 0.86), diffuseColor.rgb, 0.15);
    } else {
      // pitched roofs: per-building colour + tile relief, photo only as broad weathering
      vec3 ph = texture2D(uPhoto, puv, 4.5).rgb;
      float lum = dot(ph, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb *= mix(1.0, clamp(lum / 0.16, 0.7, 1.25), 0.45);
    }
  }
  #endif
  gMetal = step(1.5, tile) * step(tile, 2.5);
}`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.42, gMetal);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(metalness, 0.55, gMetal);`);
  });
  return mat;
}
