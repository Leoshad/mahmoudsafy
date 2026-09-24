import {statSync,createReadStream} from 'node:fs';

export function serveVideo(req,res,file){
 const size=statSync(file).size,headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes'};
 let start=0,end=size-1,status=200;
 if(req.headers.range){
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(m&&(m[1]||m[2])){
   if(!m[1])start=Math.max(0,size-Number(m[2]));
   else {start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
  }
  if(!m||(!m[1]&&!m[2])||start>=size||start>end||(!m[1]&&Number(m[2])===0)){
   res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});res.end();return;
  }
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);
 if(req.method==='HEAD'){res.end();return;}
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
