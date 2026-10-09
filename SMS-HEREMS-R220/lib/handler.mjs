import fs from 'node:fs/promises';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';

const providers = {
  agoosms:'api.agoosms.com', mnotify:'api.mnotify.com', arkesel:'sms.arkesel.com',
  hubtel:'smsc.hubtel.com', termii:'api.ng.termii.com', smsto:'api.sms.to',
  twilio:'api.twilio.com', africastalking:'api.africastalking.com'
};
const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, X-API-Key, api-key, Authorization, Accept, X-School-Token',
  'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'
};
function json(data,status=200) { return new Response(JSON.stringify(data), {status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}}); }
function tokenValid(request) {
  const expected = process.env.SMS_RELAY_TOKEN || '';
  const supplied = request.headers.get('x-school-token') || '';
  if (!expected || !supplied) return false;
  const a=Buffer.from(expected), b=Buffer.from(supplied);
  return a.length===b.length && timingSafeEqual(a,b);
}
function agooKey(request) {
  return request.headers.get('x-api-key') || (tokenValid(request) ? process.env.AGOO_API_KEY : '') || '';
}
async function upstream(host, target, method, headers, body, fetcher) {
  const result = await fetcher(`https://${host}${target}`, {
    method, headers, ...(body?.length ? {body} : {}),
    redirect:'manual', signal:AbortSignal.timeout(15000)
  });
  // Never blindly relay Set-Cookie, host headers, redirects or hop-by-hop headers.
  const output={...cors,'Content-Type':result.headers.get('content-type') || 'application/json'};
  const retry=result.headers.get('retry-after'); if(retry) output['Retry-After']=retry;
  return new Response(result.body,{status:result.status,headers:output});
}
async function readBody(request) {
  const body=new Uint8Array(await request.arrayBuffer());
  if(body.length>1024*1024) throw Object.assign(new Error('Request too large'),{status:413});
  return body;
}
export async function handle(request, {fetcher=fetch}={}) {
  const u=new URL(request.url);
  const route=u.pathname==='/api/gateway' ? u.searchParams.get('__route') : null;
  const pathname=route!==null ? '/api/'+route.replace(/^\/+/, '') : u.pathname;
  if(route!==null) u.searchParams.delete('__route');
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  try {
    if(pathname==='/api/sms/ping') return json({ok:true,service:'HEREMS_PLUS SMS Relay',configured:!!agooKey(request),provider:'AgooSMS',sender:process.env.AGOO_SENDER || 'AgooSMSUser',device:'serverless-relay',timestamp:Date.now()});
    // Acknowledge only: this is NOT a persistent delivery-receipt database.
    if(pathname==='/api/arkesel/webhook' || pathname==='/api/sms/webhook') {
      if(request.method!=='POST') return json({ok:false,error:'POST required'},405);
      if(!tokenValid(request)) return json({ok:false,error:'Valid X-School-Token required'},401);
      await readBody(request);
      return json({ok:true,status:'RECEIVED',persisted:false,provider:'Arkesel',timestamp:Date.now()});
    }
    if(pathname==='/api/client-file') {
      if(request.method!=='GET') return json({ok:false,error:'GET required'},405);
      const code=(u.searchParams.get('code') || 'HER-2026').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,40) || 'HER-2026';
      const teacher=u.searchParams.get('kind')==='teacher';
      const name=(u.searchParams.get('name') || `${code} School`).slice(0,200);
      const location=(u.searchParams.get('location') || 'Ghana').slice(0,200);
      const src=await fs.readFile(path.join(process.cwd(),'public/index.html'),'utf8');
      const logo=src.match(/const APP_LOGO_URI='([^']+)'/)?.[1] || '';
      const payload={school:{id:'sch-'+code.toLowerCase().replace(/[^a-z0-9]/g,''),code,name,abbrev:code.split('-')[0],location,address:(u.searchParams.get('address') || location+', Ghana').slice(0,300),portalUrl:'gh$655e392a74276e224228286270327d4638292973247946243c7e33207d5a',status:'active',joinCode:code,joinStatus:'PENDING',joinActive:true,logo,use_app_for_canteen:true}};
      const enc=JSON.stringify(payload).split('').map(c=>String.fromCharCode(c.charCodeAt(0)+5)).join('');
      const pack={app:'HEREMS_PLUS',kind:teacher?'teacher-client':'school-client',v:1,issued:Date.now(),schoolCode:code,schoolName:name,payload:Buffer.from(enc).toString('base64')};
      const marker='<script>window.__HP_CLIENT__='+JSON.stringify(JSON.stringify(pack)).replace(/</g,'\\u003c')+'</script>';
      const result=src.replace(/<head[^>]*>/i,m=>m+'\n'+marker+'\n');
      // Explicit streaming avoids buffered function response limits for this large HTML.
      const bytes=new TextEncoder().encode(result); let offset=0;
      const stream=new ReadableStream({pull(controller){
        if(offset>=bytes.length){controller.close();return;}
        controller.enqueue(bytes.subarray(offset,offset+65536)); offset+=65536;
      }});
      return new Response(stream,{headers:{...cors,'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="HEREMS-${teacher?'TEACHER':'SCHOOL'}-${code}-CLIENT.html"`}});
    }
    if(pathname==='/api/sms/send' || pathname==='/api/agoosms/v1/sms/send') {
      if(request.method!=='POST') return json({ok:false,error:'POST required'},405);
      const key=agooKey(request);
      if(!key) return json({ok:false,error:'Set an AgooSMS key in app SMS settings, or supply an authorized relay token.'},401);
      const payload=JSON.parse(Buffer.from(await readBody(request)).toString() || '{}');
      const relay=pathname==='/api/sms/send';
      const original=String(payload.message || '');
      const isTest=payload.kind==='test' || /test\s+message/i.test(original);
      const sender=payload.senderId || payload.from || payload.sender || process.env.AGOO_SENDER || 'AgooSMSUser';
      const data={to:payload.to || payload.phone || '',message:!relay && isTest && sender==='AgooSMSUser'?'Hello from Agoo':original,senderId:sender};
      if(!data.to || !data.message) return json({ok:false,error:'Recipient and message required'},400);
      const headers={'X-API-Key':key,'Content-Type':'application/json','Accept':'application/json'};
      let response=await upstream(providers.agoosms,'/v1/sms/send','POST',headers,JSON.stringify(data),fetcher);
      let raw=await response.text(), parsed; try{parsed=JSON.parse(raw);}catch{}
      if(!relay && isTest && ['SENDER_ID_NOT_OWNED','SENDER_ID_NOT_APPROVED'].includes(parsed?.error?.code)) {
        response=await upstream(providers.agoosms,'/v1/sms/send','POST',headers,JSON.stringify({...data,message:'Hello from Agoo',senderId:'AgooSMSUser'}),fetcher);
        raw=await response.text();try{parsed=JSON.parse(raw);}catch{parsed=null;}
      }
      if(!relay) return new Response(raw,{status:response.status,headers:response.headers});
      if(response.status===200) return json({ok:true,status:'SENT',messageId:parsed?.data?.messageId || null,provider:'AgooSMS',sender});
      return json({ok:false,error:parsed?.error?.message || 'Provider rejected message',code:parsed?.error?.code || 'PROVIDER_REJECTED'},response.status);
    }
    const match=pathname.match(/^\/api\/([a-z]+)(\/.*)?$/);
    if(match && providers[match[1]]) {
      const provider=match[1];
      const headers={};
      for(const key of ['content-type','accept','x-api-key','api-key','authorization']) {
        const val=request.headers.get(key);if(val) headers[key]=val;
      }
      if(provider==='agoosms' && !headers['x-api-key'] && !headers.authorization) headers['x-api-key']=agooKey(request);
      if(provider==='arkesel' && !headers['api-key'] && !u.searchParams.has('api_key') && tokenValid(request)) headers['api-key']=process.env.ARKESEL_API_KEY || '';
      const hasAuth=headers['x-api-key'] || headers['api-key'] || headers.authorization || ['api_key','apikey','key','clientid','username'].some(k=>u.searchParams.has(k));
      // Form/JSON credentials for providers such as mNotify remain in the caller's body.
      const body=['GET','HEAD'].includes(request.method) ? undefined : await readBody(request);
      if(!hasAuth && !body?.length) return json({ok:false,error:'Provider credentials required'},401);
      return await upstream(providers[provider],(match[2] || '/')+u.search,request.method,headers,body,fetcher);
    }
    return json({ok:false,error:'Not found'},404);
  } catch(error) {
    if(error instanceof SyntaxError) return json({ok:false,error:'Invalid JSON'},400);
    if(error.status===413) return json({ok:false,error:error.message},413);
    return json({ok:false,error:'Gateway request failed',code:'PROXY_GATEWAY_ERROR'},502);
  }
}
