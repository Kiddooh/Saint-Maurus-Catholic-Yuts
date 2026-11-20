import { useEffect, useState } from 'react';
import { ArrowUpRight, MapPin, Navigation } from 'lucide-react';
const query='St Maurus Catholic Church Mathare North Area 3 Nairobi Kenya';
const google='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
const osm='https://www.openstreetmap.org/search?query='+encodeURIComponent(query);
const embed='https://www.google.com/maps?q='+encodeURIComponent(query)+'&output=embed';
type MapState='loading'|'opened'|'slow';
export function ChurchMap(){
 const [showMap,setShowMap]=useState(true);
 const [status,setStatus]=useState<MapState>('loading');
 useEffect(()=>{
  if(!showMap)return;
  const timer=window.setTimeout(()=>setStatus(current=>current==='loading'?'slow':current),12000);
  return ()=>window.clearTimeout(timer);
 },[showMap]);
 function toggle(){if(showMap)setShowMap(false);else {setStatus('loading');setShowMap(true);}}
 return <section className="church-location wrap" aria-labelledby="location-title">
  <div className="location-copy"><p className="overline"><span>✦</span> FIND YOUR WAY</p><h2 id="location-title">Come find <em>community.</em></h2><p>St. Maurus Catholic Church<br/>Mathare North Area 3, Nairobi, Kenya</p><p className="field-hint">Map search results and the exact entrance should be confirmed with the ministry before travelling.</p><div className="location-actions"><a className="primary-action" href={google} target="_blank" rel="noopener noreferrer"><Navigation size={17}/> Open directions <ArrowUpRight size={15}/></a><a className="inline-button" href={osm} target="_blank" rel="noopener noreferrer">Search OpenStreetMap ↗</a></div></div>
  <div className="location-map"><div className="map-card-header"><div><span className="map-mini-icon"><MapPin size={18} aria-hidden="true"/></span><div><strong>St. Maurus Church</strong><small>Mathare North · Nairobi</small></div></div><button className="small-action" type="button" onClick={toggle} aria-expanded={showMap} aria-controls="church-map-frame">{showMap?'Hide map':'Load interactive map'}</button></div>
   <p className="map-privacy">This map loads from Google when you open this page, sharing your IP address with Google.</p>
   <p className="map-status" role="status" aria-live="polite">{!showMap?'Map hidden. Use the directions links or load it again.':status==='loading'?'Loading the interactive map…':status==='slow'?'The map is taking longer than expected. Use the directions links if it does not appear.':'Map frame opened. If the map is unavailable, use the directions links.'}</p>
   <div id="church-map-frame" className="map-frame-wrap">{showMap?<iframe title="Interactive search map for St. Maurus Catholic Church, Mathare North" src={embed} referrerPolicy="no-referrer" allowFullScreen onLoad={()=>setStatus('opened')}/>:<div className="map-placeholder"><span className="map-pin"><MapPin size={28} aria-hidden="true"/></span><strong>Map hidden</strong><span>Use the button above to load the interactive map.</span></div>}</div>
  </div>
 </section>;
}
