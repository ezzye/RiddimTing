/* MIT. Independently authored RiddimTing configurations; no manufacturer packs or recordings. */
window.TING_PACKS={
 'night-shift':{name:'Night Shift · RiddimTing originals',presets:[
  {pos:0,name:'Club echo',list:[{effect:'SAMPLE'},{effect:'DELAY',time:.28,echo:.46,'wet-level':.5,'dry-level':.9,'lowpass-cutoff':.62}],trigger:{row:0},handle:{row:1,param:'echo',depth:.25}},
  {pos:1,name:'Warehouse',list:[{effect:'SAMPLE'},{effect:'DIST',amount:3,mix:.35},{effect:'REVERB',time:.64,'wet-level':.44,'dry-level':.8}],trigger:{row:0},handle:{row:2,param:'wet-level',depth:.4}},
  {pos:2,name:'Chrome ring',list:[{effect:'SAMPLE'},{effect:'RING',frequency:137,mix:.6},{effect:'DELAY',time:.12,echo:.2,'wet-level':.25,'dry-level':1}],trigger:{row:0},handle:{row:1,param:'frequency',depth:450}},
  {pos:3,name:'Paper talk',list:[{effect:'SAMPLE'},{effect:'HIGHPASS',cutoff:.26},{effect:'LOWPASS',cutoff:.54},{effect:'DIST',amount:6,mix:.26}],trigger:{row:0},handle:{row:2,param:'cutoff',depth:.35}}
 ]}
};
