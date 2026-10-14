// Deterministic two-sided tree layout. No network, canvas library, or storage.
export function layoutMindMap(tree){
 const root=tree.nodes.find(n=>n.parent===null);
 const children=id=>tree.nodes.filter(n=>n.parent===id);
 const size=n=>{const width=n.parent===null?230:190;const lines=Math.ceil(Array.from(n.label).length/Math.floor((width-32)/16));return {width,height:Math.max(100,64+lines*24)};};
 const span=new Map();
 const measure=n=>{const own=size(n).height,kids=children(n.id);const childHeight=kids.reduce((sum,c)=>sum+measure(c),0)+Math.max(0,kids.length-1)*28;const height=Math.max(own,childHeight);span.set(n.id,height);return height;};
 measure(root);
 const sides={left:[],right:[]},heights={left:0,right:0};
 children(root.id).forEach((n,i)=>{const side=heights.right<=heights.left?'right':'left';sides[side].push({node:n,branch:i});heights[side]+=span.get(n.id)+36;});
 const height=Math.max(size(root).height,heights.left-36,heights.right-36)+120;
 const positioned=[{...root,...size(root),x:-115,y:(height-size(root).height)/2,side:'root',branch:-1}];
 function place(n,side,depth,top,branch){
  const {width,height:ownHeight}=size(n);const x=side==='right'?179+(depth-1)*254:-179-(depth-1)*254-width;
  positioned.push({...n,width,height:ownHeight,x,y:top+(span.get(n.id)-ownHeight)/2,side,branch});
  const kids=children(n.id),total=kids.reduce((sum,c)=>sum+span.get(c.id),0)+Math.max(0,kids.length-1)*28;
  let cursor=top+(span.get(n.id)-total)/2;for(const c of kids){place(c,side,depth+1,cursor,branch);cursor+=span.get(c.id)+28;}
 }
 for(const side of ['right','left']){let cursor=(height-Math.max(0,heights[side]-36))/2;for(const {node,branch} of sides[side]){place(node,side,1,cursor,branch);cursor+=span.get(node.id)+36;}}
 const minX=Math.min(...positioned.map(n=>n.x))-60,maxX=Math.max(...positioned.map(n=>n.x+n.width))+60;
 positioned.forEach(n=>n.x-=minX);
 const byId=new Map(positioned.map(n=>[n.id,n]));
 const edges=positioned.filter(n=>n.parent!==null).map(n=>{
  const p=byId.get(n.parent),right=n.side==='right';const x1=right?p.x+p.width:p.x,x2=right?n.x:n.x+n.width,y1=p.y+p.height/2,y2=n.y+n.height/2;
  const middle=(x1+x2)/2;return {parent:p.id,child:n.id,branch:n.branch,path:`M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`};
 });
 return {width:maxX-minX,height,nodes:positioned,edges};
}
