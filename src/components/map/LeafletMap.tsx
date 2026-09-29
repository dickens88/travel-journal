import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Colors } from '@/constants/theme';
import { CHINA_TILE_BOUNDS, chooseTiles, toTileCoord, type TileSource } from '@/geo/coord';
import type { LatLng } from '@/geo/distance';
import { LEAFLET_CSS, LEAFLET_JS } from '@/map/leafletAssets';

type MapMarker = LatLng & { id: string; label: string; image?: string; kind?: 'photo' | 'dot' };
export type MapLine = { points: LatLng[]; color: string; width?: number; dash?: string };
type Padding = { top: number; right: number; bottom: number; left: number };
export type LeafletMapHandle = { fit: () => void; focus: (p: LatLng, zoom?: number) => void };

type Props = {
  markers: MapMarker[];
  lines?: MapLine[];
  padding?: Padding;
  onMarkerPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
};

type TileLayer = { url: string; subdomains: string; attribution: string; maxZoom: number; bounds?: number[][] };

const TILES: Record<'amap' | 'osm', TileLayer> = {
  amap: {
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: '1234',
    attribution: '© 高德地图',
    maxZoom: 18,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  },
};

const LAYERS: Record<TileSource, TileLayer[]> = {
  amap: [TILES.amap],
  osm: [TILES.osm],
  mixed: [TILES.osm, { ...TILES.amap, bounds: CHINA_TILE_BOUNDS }],
};

function html(tiles: TileSource) {
  const layers = LAYERS[tiles];
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>${LEAFLET_CSS}
html,body,#map{margin:0;height:100%;background:#EFE8D8}
.pin{width:44px;height:44px;position:relative}
.pin img,.pin i{position:absolute;left:2px;top:2px;width:34px;height:34px;border-radius:50%;border:3px solid ${Colors.card};background:${Colors.chip};object-fit:cover;box-shadow:0 3px 8px rgba(30,20,10,.3)}
.pin b{position:absolute;right:0;top:-2px;min-width:18px;height:18px;border-radius:9px;background:${Colors.accent};color:#fff;font:700 10px/18px sans-serif;text-align:center}
.dot{display:flex;align-items:center;gap:4px;white-space:nowrap;font:12px sans-serif;color:#fff}
.dot i{width:14px;height:14px;border-radius:50%;background:${Colors.accent};border:3px solid ${Colors.card};flex:none}
.dot span{background:${Colors.ink};padding:2px 6px;border-radius:6px}
.leaflet-control-attribution{font-size:9px}
</style><script>${LEAFLET_JS}</script></head><body><div id="map"></div><script>
// Tiles repeat east-west but not north-south: clamp latitude to the Web Mercator edge and never zoom out past the point
// where the world is shorter than the view, or blank bands show above and below
var map=L.map('map',{zoomControl:false,attributionControl:true,worldCopyJump:true,bounceAtZoomLimits:false,
  maxBounds:[[-85.0511,-1e4],[85.0511,1e4]],maxBoundsViscosity:1}).setView([35,110],4);
function clampZoom(){var h=map.getSize().y;if(h>0)map.setMinZoom(Math.max(0,Math.ceil(Math.log2(h/256))))}
clampZoom();map.on('resize',clampZoom);
${JSON.stringify(layers)}.forEach(function(t){L.tileLayer(t.url,{subdomains:t.subdomains,maxZoom:t.maxZoom,bounds:t.bounds,attribution:t.attribution}).addTo(map)});
// Stop at the shallowest layer so AMap never drops out inside China on mixed maps
map.setMaxZoom(${Math.min(...layers.map((t) => t.maxZoom))});
var layer=L.layerGroup().addTo(map),bounds=null,pad={top:40,right:40,bottom:40,left:40};
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
window.setData=function(d){
  layer.clearLayers();pad=d.padding||pad;var pts=[];
  (d.lines||[]).forEach(function(l){L.polyline(l.points,{color:l.color,weight:l.width||4,dashArray:l.dash||null,lineCap:'round'}).addTo(layer)});
  (d.markers||[]).forEach(function(m){
    var h=m.kind==='dot'?'<div class="dot"><i></i><span>'+esc(m.label)+'</span></div>'
      :'<div class="pin">'+(m.image?'<img src="'+m.image+'">':'<i></i>')+'<b>'+esc(m.label)+'</b></div>';
    var icon=L.divIcon({html:h,className:'',iconSize:m.kind==='dot'?null:[44,44],iconAnchor:m.kind==='dot'?[10,10]:[20,22]});
    L.marker([m.lat,m.lng],{icon:icon}).on('click',function(){post({type:'marker',id:m.id})}).addTo(layer);
    pts.push([m.lat,m.lng]);
  });
  bounds=pts.length?L.latLngBounds(pts):null;window.fit();
};
window.fit=function(){if(!bounds)return;if(bounds.getNorthEast().equals(bounds.getSouthWest()))map.setView(bounds.getCenter(),15);
  else map.fitBounds(bounds,{paddingTopLeft:[pad.left,pad.top],paddingBottomRight:[pad.right,pad.bottom],maxZoom:16})};
window.focusAt=function(lat,lng,z){map.flyTo([lat,lng],z||15,{duration:.5})};
post({type:'ready'});
</script></body></html>`;
}

// Leaflet in a WebView: works on Android phones without Google Play services, unlike Google Maps
export function LeafletMap({ markers, lines = [], padding, onMarkerPress, style, ref }: Props & { ref?: Ref<LeafletMapHandle> }) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const tiles = chooseTiles([...markers, ...lines.flatMap((l) => l.points)]);
  const source = useMemo(() => ({ html: html(tiles), baseUrl: 'https://lvji.local/' }), [tiles]);

  const payload = JSON.stringify({
    markers: markers.map((m) => ({ ...m, ...toTileCoord(m, tiles) })),
    lines: lines.map((l) => ({ ...l, points: l.points.map((p) => {
      const c = toTileCoord(p, tiles);
      return [c.lat, c.lng];
    }) })),
    padding,
  });

  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.setData(${payload});true;`);
  }, [ready, payload]);

  useImperativeHandle(ref, () => ({
    fit: () => web.current?.injectJavaScript('window.fit();true;'),
    focus: (p, zoom) => {
      const c = toTileCoord(p, tiles);
      web.current?.injectJavaScript(`window.focusAt(${c.lat},${c.lng},${zoom ?? 15});true;`);
    },
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') setReady(true);
    if (msg.type === 'marker') onMarkerPress?.(msg.id);
  };

  return (
    <WebView
      ref={web}
      key={tiles}
      source={source}
      originWhitelist={['*']}
      onMessage={onMessage}
      onLoadStart={() => setReady(false)}
      style={[styles.map, style]}
      setSupportMultipleWindows={false}
      overScrollMode="never"
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#EFE8D8' },
});
