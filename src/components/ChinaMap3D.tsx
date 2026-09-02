"use client";

import { Html, Line, OrbitControls, OrthographicCamera, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { geoMercator, type GeoProjection } from "d3-geo";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanvasTexture, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, LinearFilter, Path, Shape, SRGBColorSpace, Vector2 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MOUSE, TOUCH, OrthographicCamera as ThreeOrthographicCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsInstance } from "three-stdlib";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { type GridRow, type MapMode } from "../lib/climate-map";

import { prepareHeatSurface, renderHeatFrame } from "../lib/coastal-heat-surface";

type Position = [number, number];
type PolygonCoordinates = Position[][];
type GeoFeature = {
  type: "Feature";
  properties: { name?: string; adcode?: number | string; center?: Position; centroid?: Position };
  geometry: { type: "Polygon"; coordinates: PolygonCoordinates } | { type: "MultiPolygon"; coordinates: PolygonCoordinates[] };
};
type ChinaGeoJson = { type: "FeatureCollection"; features: GeoFeature[] };
type Props = {
  points: GridRow[]; values: number[]; mode: MapMode; low: number; high: number;
  selectedProvince: string | null; onProvinceSelect: (name: string) => void;
  focusRequest: { name: string | null; sequence: number } | null;
};
const DEPTH = 1.45;
type ViewRequest = { action: "in" | "out" | "reset"; sequence: number };
const MAP_TARGET: [number, number, number] = [0, -0.3, 0.5];
const CAMERA_OFFSET = new Vector3(0, -8, 24);
const CAMERA_POSITION: [number, number, number] = [0, -8.3, 24.5];
const MAP_MOUSE = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
const MAP_TOUCH = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
const coastalNames = new Set(["辽宁省", "河北省", "天津市", "山东省", "江苏省", "上海市", "浙江省", "福建省", "广东省", "广西壮族自治区", "海南省", "台湾省", "香港特别行政区", "澳门特别行政区"]);
const cityHubs: { name: string; coord: Position; offset: [number, number] }[] = [
  { name: "大连", coord: [121.62, 38.92], offset: [0.36, 0] },
  { name: "青岛", coord: [120.38, 36.07], offset: [0.48, 0] },
  { name: "上海", coord: [121.47, 31.23], offset: [0.7, 0] },
  { name: "宁波", coord: [121.55, 29.87], offset: [0.8, -0.23] },
  { name: "厦门", coord: [118.08, 24.48], offset: [0.5, 0] },
  { name: "深圳", coord: [114.06, 22.55], offset: [0.58, -0.1] },
  { name: "海口", coord: [110.2, 20.04], offset: [-0.48, -0.28] },
];
const shortName = (name: string) => name.replace(/壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市/g, "");
const polygonsOf = (feature: GeoFeature): PolygonCoordinates[] => feature.geometry.type === "Polygon"
  ? [feature.geometry.coordinates as PolygonCoordinates] : feature.geometry.coordinates as PolygonCoordinates[];
function project(projection: GeoProjection, coord: Position, z = 0): [number, number, number] {
  const point = projection(coord)!;
  return [point[0], -point[1], z];
}

// Province text is a texture on the map surface, not a floating HTML tag.
function ProvinceLabel({ name, number, center, selected, onSelect }: {
  name: string; number: number; center: [number, number, number]; selected: boolean; onSelect: () => void;
}) {
  const compact = ["北京市", "天津市", "上海市", "香港特别行政区", "澳门特别行政区"].includes(name);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = compact ? 96 : 320; canvas.height = 104;
    const ctx = canvas.getContext("2d")!;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "500 " + (compact ? 54 : 50) + 'px "Microsoft YaHei UI", sans-serif';
    ctx.lineJoin = "round"; ctx.lineWidth = 9; ctx.strokeStyle = "rgba(5,26,27,.85)";
    const label = String(number).padStart(2, "0") + (compact ? "" : " " + shortName(name));
    ctx.strokeText(label, canvas.width / 2, 52);
    ctx.fillStyle = selected ? "#ffdd81" : "#ffffff";
    ctx.fillText(label, canvas.width / 2, 52);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    return map;
  }, [name, number, selected, compact]);
  useEffect(() => () => texture.dispose(), [texture]);
  const width = compact ? 0.3 : shortName(name).length > 2 ? 1.9 : 1.6;
  return <mesh position={center} renderOrder={5} onClick={(event) => { event.stopPropagation(); if (event.delta < 5) onSelect(); }}>
    <planeGeometry args={[width, compact ? 0.3 : 0.48]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
  </mesh>;
}

function RegionMap({ geo, projection, selectedProvince, onProvinceSelect }: {
  geo: ChinaGeoJson; projection: GeoProjection; selectedProvince: string | null; onProvinceSelect: (name: string) => void;
}) {
  const [terrain, relief, normal] = useTexture(["/data/china-terrain.jpg", "/data/china-relief.jpg", "/data/china-terrain-normal.jpg"]);
  useEffect(() => {
    terrain.colorSpace = SRGBColorSpace;
    [terrain, relief, normal].forEach((texture) => { texture.minFilter = LinearFilter; texture.magFilter = LinearFilter; texture.needsUpdate = true; });
  }, [terrain, relief, normal]);
  const regions = useMemo(() => {
    const [minX, minY] = project(projection, [72, 16]);
    const [maxX, maxY] = project(projection, [136.5, 54.5]);
    return geo.features.filter((feature) => feature.properties.name).map((feature, index) => {
      const shapes: Shape[] = [], smallShapes: Shape[] = [], rings: [number, number, number][][] = [];
      // All southern islands and maritime boundary geometry remain in the inset.
      polygonsOf(feature).filter((polygon) => polygon[0].some((coord) => coord[1] >= 18)).forEach((polygon) => {
        const outer = polygon[0].map((coord) => { const [x, y] = project(projection, coord); return new Vector2(x, y); });
        if (outer.length < 3) return;
        const shape = new Shape(outer);
        polygon.slice(1).forEach((hole) => shape.holes.push(new Path(hole.map((coord) => { const [x, y] = project(projection, coord); return new Vector2(x, y); }))));
        const area = Math.abs(outer.reduce((sum, point, i) => { const next = outer[(i + 1) % outer.length]; return sum + point.x * next.y - next.x * point.y; }, 0)) / 2;
        (area < 0.015 ? smallShapes : shapes).push(shape);
        if (area >= 0.015) rings.push(polygon[0].map((coord) => project(projection, coord, DEPTH + 0.11)));
      });
      const pieces: ExtrudeGeometry[] = [];
      if (shapes.length) pieces.push(new ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.025, bevelSegments: 1, curveSegments: 1 }));
      if (smallShapes.length) {
        // Tiny islands remain visible/clickable but are not rendered as tall needles.
        const islands = new ExtrudeGeometry(smallShapes, { depth: 0.025, bevelEnabled: false, curveSegments: 1 });
        islands.translate(0, 0, DEPTH - 0.025); pieces.push(islands);
      }
      const geometry = mergeGeometries(pieces, false)!;
      let offset = 0;
      pieces.forEach((piece) => {
        piece.groups.forEach((group) => geometry.addGroup(group.start + offset, group.count, group.materialIndex));
        offset += piece.attributes.position.count;
        piece.dispose();
      });
      const positions = geometry.attributes.position, uvs: number[] = [];
      for (let i = 0; i < positions.count; i++) uvs.push((positions.getX(i) - minX) / (maxX - minX), (positions.getY(i) - minY) / (maxY - minY));
      geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
      const coord = feature.properties.centroid ?? feature.properties.center;
      return { name: feature.properties.name!, number: index + 1, geometry, rings, center: coord ? project(projection, coord, DEPTH + 0.13) : null };
    });
  }, [geo, projection]);
  useEffect(() => () => regions.forEach((region) => region.geometry.dispose()), [regions]);
  return <group>{regions.map((region) => {
    const active = selectedProvince === region.name;
    return <group key={region.name}>
      <mesh geometry={region.geometry} castShadow receiveShadow onClick={(event) => { event.stopPropagation(); if (event.delta < 5) onProvinceSelect(region.name); }}>
        <meshStandardMaterial attach="material-0" map={terrain} normalMap={normal} normalScale={[1.6, 1.6]} bumpMap={relief} bumpScale={0.35}
          color={active ? "#fff5cf" : coastalNames.has(region.name) ? "#e4efdb" : "#839e99"} roughness={0.88} metalness={0.05} />
        <meshStandardMaterial attach="material-1" color={active ? "#d9e7bd" : "#9eaeb0"} roughness={0.48} metalness={0.2} />
      </mesh>
      {region.rings.map((ring, i) => <group key={i}>
        <Line points={ring} color={active ? "#ffde85" : "#d6e9e0"} lineWidth={active ? 1.8 : 0.65} transparent opacity={active ? 1 : 0.6} />
        <Line points={ring.map(([x, y]) => [x, y, 0.06] as [number, number, number])} color="#3b7478" lineWidth={0.65} />
      </group>)}
      {region.center && <ProvinceLabel name={region.name} number={region.number} center={region.center} selected={active} onSelect={() => onProvinceSelect(region.name)} />}
    </group>;
  })}</group>;
}

function CoastalHeat({ points, values, projection, geo, mode, low, high }: Props & { projection: GeoProjection; geo: ChinaGeoJson }) {
  const { invalidate } = useThree();
  const layer = useMemo(() => {
    const [minX, minY] = project(projection, [72, 16]), [maxX, maxY] = project(projection, [136.5, 54.5]);
    const land = geo.features.filter((feature) => feature.properties.name).flatMap((feature) => polygonsOf(feature)
      .filter((polygon) => polygon[0].some((coord) => coord[1] >= 18))
      .map((polygon) => polygon.map((ring) => ring.map((coord) => { const [x, y] = project(projection, coord); return [x, y] as Position; }))));
    const centres = points.map((point) => { const [x, y] = project(projection, [point.lon, point.lat]); return [x, y] as Position; });
    const surface = prepareHeatSurface(centres, land, { minX, minY, maxX, maxY });
    const canvases = [0, 1].map(() => { const canvas = document.createElement("canvas"); canvas.width = surface.width; canvas.height = surface.height; return canvas; });
    const textures = canvases.map((canvas) => {
      const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter; texture.magFilter = LinearFilter; texture.generateMipmaps = false;
      return texture;
    });
    return {
      surface, canvases, textures,
      from: new Uint8ClampedArray(surface.width * surface.height * 4),
      to: new Uint8ClampedArray(surface.width * surface.height * 4),
      centre: [(minX + maxX) / 2, (minY + maxY) / 2, DEPTH + 0.075] as [number, number, number],
      size: [maxX - minX, maxY - minY] as [number, number],
      uniforms: { fromMap: { value: textures[0] }, toMap: { value: textures[1] }, mixFactor: { value: 1 } },
    };
  }, [points, geo, projection]);
  useEffect(() => () => layer.textures.forEach((texture) => texture.dispose()), [layer]);
  useEffect(() => {
    const blend = layer.uniforms.mixFactor.value;
    // Continue smoothly even when a user scrubs to another year mid-transition.
    layer.surface.pixels.forEach((pixel) => {
      for (let channel = 0; channel < 4; channel++) {
        const i = pixel * 4 + channel;
        layer.from[i] += (layer.to[i] - layer.from[i]) * blend;
      }
    });
    layer.to.set(renderHeatFrame(layer.surface, values, low, high, mode));
    [layer.from, layer.to].forEach((pixels, index) => {
      const ctx = layer.canvases[index].getContext("2d")!;
      const frame = ctx.createImageData(layer.surface.width, layer.surface.height); frame.data.set(pixels);
      ctx.putImageData(frame, 0, 0); layer.textures[index].needsUpdate = true;
    });
    layer.uniforms.mixFactor.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0;
    invalidate();
  }, [layer, values, low, high, mode, invalidate]);
  useFrame((_, delta) => {
    if (layer.uniforms.mixFactor.value >= 1) return;
    layer.uniforms.mixFactor.value = Math.min(1, layer.uniforms.mixFactor.value + Math.min(delta, 0.05) * 3);
    invalidate();
  });
  return <mesh position={layer.centre} renderOrder={2}>
    <planeGeometry args={layer.size} />
    <shaderMaterial uniforms={layer.uniforms} transparent depthWrite={false} side={DoubleSide} toneMapped={false}
      vertexShader={"varying vec2 heatUv;\nvoid main(){heatUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"}
      fragmentShader={"uniform sampler2D fromMap;\nuniform sampler2D toMap;\nuniform float mixFactor;\nvarying vec2 heatUv;\nvoid main(){gl_FragColor=mix(texture2D(fromMap,heatUv),texture2D(toMap,heatUv),mixFactor);\n#include <colorspace_fragment>\n}"} />
  </mesh>;
}

function CityMarkers({ projection }: { projection: GeoProjection }) {
  return <group>{cityHubs.map((hub) => {
    const [x, y] = project(projection, hub.coord), z = DEPTH + 0.19;
    return <group key={hub.name}>
      <mesh position={[x, y, z]}><ringGeometry args={[0.045, 0.072, 32]} /><meshBasicMaterial color="#fff4c2" side={DoubleSide} toneMapped={false} /></mesh>
      <Line points={[[x, y, z], [x + hub.offset[0], y + hub.offset[1], z + 0.4]]} color="#f5d790" lineWidth={0.9} />
      <Html position={[x + hub.offset[0], y + hub.offset[1], z + 0.4]} center zIndexRange={[2, 0]} className="coastal-city-label" style={{ pointerEvents: "none" }}>{hub.name}</Html>
    </group>;
  })}</group>;
}

function FixedMapControls({ geo, projection, focusRequest, zoom, request }: {
  geo: ChinaGeoJson; projection: GeoProjection; focusRequest: Props["focusRequest"]; zoom: number; request: ViewRequest | null;
}) {
  const controls = useRef<OrbitControlsInstance>(null);
  const lastViewRequest = useRef(0);
  const lastFocusRequest = useRef(0);
  const goal = useRef<{ target: Vector3; zoom: number } | null>(null);
  const reducedMotion = useRef(false);
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reducedMotion.current = preference.matches; };
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!(camera instanceof ThreeOrthographicCamera)) return;
    goal.current = { target: new Vector3(...MAP_TARGET), zoom };
    invalidate();
  }, [camera, zoom, invalidate]);

  useEffect(() => {
    // Selection only changes highlights/readouts. Camera focus requires a dropdown request.
    if (!focusRequest || focusRequest.sequence <= lastFocusRequest.current || !(camera instanceof ThreeOrthographicCamera)) return;
    lastFocusRequest.current = focusRequest.sequence;
    const feature = geo.features.find((item) => item.properties.name === focusRequest.name);
    if (!feature) {
      goal.current = { target: new Vector3(...MAP_TARGET), zoom };
    } else {
      // Fit only the province's main-map geometry; Hainan's southern islands stay in the inset.
      const points = polygonsOf(feature).filter((polygon) => polygon[0].some((coord) => coord[1] >= 18))
        .flatMap((polygon) => polygon[0].map((coord) => project(projection, coord)));
      if (!points.length) return;
      const minX = Math.min(...points.map((point) => point[0])), maxX = Math.max(...points.map((point) => point[0]));
      const minY = Math.min(...points.map((point) => point[1])), maxY = Math.max(...points.map((point) => point[1]));
      const fit = Math.min(size.width * 0.62 / Math.max(maxX - minX, 0.2), size.height * 0.66 / Math.max((maxY - minY) * 0.949 + DEPTH * 0.316, 0.3));
      const focusedZoom = Math.max(zoom, Math.min(zoom * 3.4, fit));
      // Keep the selected province slightly right of centre, clear of the inspector.
      goal.current = { target: new Vector3((minX + maxX) / 2 - size.width * 0.09 / focusedZoom, (minY + maxY) / 2, DEPTH / 2), zoom: focusedZoom };
    }
    invalidate();
  }, [camera, geo, projection, focusRequest, size.width, size.height, zoom, invalidate]);

  useEffect(() => {
    if (!request || request.sequence <= lastViewRequest.current || !(camera instanceof ThreeOrthographicCamera) || !controls.current) return;
    lastViewRequest.current = request.sequence;
    if (request.action === "reset") {
      goal.current = { target: new Vector3(...MAP_TARGET), zoom };
    } else {
      const factor = request.action === "in" ? 1.25 : 0.8;
      goal.current = {
        target: goal.current?.target.clone() ?? controls.current.target.clone(),
        zoom: Math.max(zoom * 0.72, Math.min(zoom * 4, (goal.current?.zoom ?? camera.zoom) * factor)),
      };
    }
    invalidate();
  }, [request, camera, zoom, invalidate]);

  useFrame((_, delta) => {
    const target = goal.current, controller = controls.current;
    if (!target || !controller || !(camera instanceof ThreeOrthographicCamera)) return;
    const alpha = reducedMotion.current ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 10);
    controller.target.lerp(target.target, alpha);
    camera.zoom += (target.zoom - camera.zoom) * alpha;
    const settled = controller.target.distanceTo(target.target) < 0.002 && Math.abs(camera.zoom - target.zoom) < 0.02;
    if (settled) { controller.target.copy(target.target); camera.zoom = target.zoom; goal.current = null; }
    // Identical eye-to-target offset in every frame: focus and pan never rotate the map.
    camera.position.copy(controller.target).add(CAMERA_OFFSET);
    camera.updateProjectionMatrix();
    controller.update();
    invalidate();
  });

  return <OrbitControls ref={controls} makeDefault target={MAP_TARGET} enableRotate={false} autoRotate={false}
    enablePan screenSpacePanning enableZoom minZoom={zoom * 0.72} maxZoom={zoom * 4}
    mouseButtons={MAP_MOUSE} touches={MAP_TOUCH} enableDamping={false} panSpeed={1} zoomSpeed={0.8}
    onStart={() => { goal.current = null; }} />;
}

function Scene(props: Props & { geo: ChinaGeoJson; viewRequest: ViewRequest | null }) {
  const projection = useMemo(() => geoMercator().center([104, 35]).scale(14).translate([0, 0]), []);
  const { size } = useThree();
  // Leave vertical breathing room for the northern outline and map controls.
  const zoom = Math.min(size.width / 17.6, size.height / 14.2);
  return <>
    <color attach="background" args={["#091a1e"]} />
    <OrthographicCamera makeDefault position={CAMERA_POSITION} up={[0, 0, 1]} zoom={zoom} near={0.1} far={100} />
    <FixedMapControls geo={props.geo} projection={projection} focusRequest={props.focusRequest} zoom={zoom} request={props.viewRequest} />
    <ambientLight intensity={0.8} color="#dcefe8" />
    <directionalLight position={[-8, -5, 15]} intensity={2.7} color="#fff1d5" castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0005}
      shadow-autoUpdate={false} shadow-needsUpdate={true} />
    <directionalLight position={[7, 4, 6]} intensity={0.65} color="#95c5d1" />
    <mesh position={[0, 0, -0.15]} receiveShadow><circleGeometry args={[17, 100]} /><meshStandardMaterial color="#10272d" roughness={1} /></mesh>
    <RegionMap geo={props.geo} projection={projection} selectedProvince={props.selectedProvince} onProvinceSelect={props.onProvinceSelect} />
    <CoastalHeat {...props} projection={projection} />
    <CityMarkers projection={projection} />
  </>;
}

function SouthSeaInset({ geo }: { geo: ChinaGeoJson }) {
  const paths = useMemo(() => {
    const features: GeoFeature[] = geo.features.map((feature) => ({ ...feature, geometry: { type: "MultiPolygon" as const, coordinates: polygonsOf(feature).filter((polygon) => !feature.properties.name || polygon[0].every((coord) => coord[1] < 18)) } })).filter((f) => f.geometry.coordinates.length);
    // Project rings directly: this source's ring winding must not be interpreted as the globe's complement.
    const projection = geoMercator().scale(1).translate([0, 0]);
    const rings = features.map((feature) => polygonsOf(feature).flatMap((polygon) => polygon.map((ring) => ring.map((coord) => projection(coord)!))));
    const points = rings.flat(2);
    const minX = Math.min(...points.map((p) => p[0])), maxX = Math.max(...points.map((p) => p[0]));
    const minY = Math.min(...points.map((p) => p[1])), maxY = Math.max(...points.map((p) => p[1]));
    const scale = Math.min(82 / (maxX - minX), 102 / (maxY - minY));
    const xOffset = (94 - (maxX - minX) * scale) / 2, yOffset = (114 - (maxY - minY) * scale) / 2;
    return rings.map((group, index) => ({ key: index, boundary: !features[index].properties.name,
      d: group.map((ring) => ring.map((point, i) => (i ? "L" : "M") + ((point[0] - minX) * scale + xOffset).toFixed(2) + "," + ((point[1] - minY) * scale + yOffset).toFixed(2)).join(" ") + "Z").join(" ") }));
  }, [geo]);
  return <figure className="south-sea-inset" aria-label="南海诸岛附图">
    <svg viewBox="0 0 94 114" role="img" aria-label="南海岛礁及界线">{paths.map((path) => <path key={path.key} d={path.d} fill={path.boundary ? "#729996" : "#a5beb1"} stroke="#99b6b0" strokeWidth={0.5} />)}</svg>
    <figcaption>南海诸岛</figcaption>
  </figure>;
}

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="map-loading">三维地图加载失败，请刷新页面重试。</div> : this.props.children; }
}

export default function ChinaMap3D(props: Props) {
  const [geo, setGeo] = useState<ChinaGeoJson | null>(null), [error, setError] = useState(false);
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const requestView = (action: ViewRequest["action"]) => setViewRequest((previous) => ({ action, sequence: (previous?.sequence ?? 0) + 1 }));
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/china-full.json", { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error("Map unavailable"); return r.json(); }).then(setGeo).catch((error) => { if (error.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, []);
  if (!geo) return <div className="map-loading">{error ? "边界数据加载失败，请刷新重试。" : "正在加载全国地形与省级边界…"}</div>;
  return <div className="china-map-3d">
    <MapBoundary><Canvas frameloop="demand" dpr={[1, 1.6]} gl={{ antialias: true, powerPreference: "high-performance" }} shadows>
      <Suspense fallback={null}><Scene {...props} geo={geo} viewRequest={viewRequest} /></Suspense>
    </Canvas></MapBoundary>
    <SouthSeaInset geo={geo} />
    <div className="map-view-controls" role="group" aria-label="地图视图控制">
      <button type="button" aria-label="放大地图" title="放大地图" onClick={() => requestView("in")}><Plus size={15} /></button>
      <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => requestView("out")}><Minus size={15} /></button>
      <button type="button" aria-label="复位全国视图" title="复位全国视图" onClick={() => requestView("reset")}><RotateCcw size={14} /></button>
    </div>
  </div>;
}
