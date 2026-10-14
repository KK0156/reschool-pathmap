import {layoutMindMap} from './mind-map-layout.js';
export function canvasLayout(tree,positions){
 const original=layoutMindMap(tree);
 const nodes=original.nodes.map(n=>({...n,...(positions.get(n.id)||{})}));
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const edges=nodes.filter(n=>n.parent!==null).map(n=>{
  const p=byId.get(n.parent),right=n.x+n.width/2>=p.x+p.width/2;
  const x1=right?p.x+p.width:p.x,x2=right?n.x:n.x+n.width,y1=p.y+p.height/2,y2=n.y+n.height/2,middle=(x1+x2)/2;
  return {parent:p.id,child:n.id,branch:n.branch,path:`M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`};
 });
 const bounds={left:Math.min(...nodes.map(n=>n.x))-60,top:Math.min(...nodes.map(n=>n.y))-60,right:Math.max(...nodes.map(n=>n.x+n.width))+60,bottom:Math.max(...nodes.map(n=>n.y+n.height))+60};
 return {width:bounds.right-bounds.left,height:bounds.bottom-bounds.top,nodes,edges,bounds};
}
export function syncPositions(tree,positions){
 const layout=layoutMindMap(tree),ids=new Set(tree.nodes.map(n=>n.id));for(const id of positions.keys())if(!ids.has(id))positions.delete(id);
 for(const n of layout.nodes){if(positions.has(n.id))continue;const parent=positions.get(n.parent);positions.set(n.id,parent?{x:parent.x+270,y:parent.y+140}:{x:n.x,y:n.y});}
 return positions;
}
