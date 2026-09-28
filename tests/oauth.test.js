const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
test('Kick OAuth preserves callback, PKCE, profile and one-use state',async()=>{
  let challenge,tokenReceived=false;
  const provider=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/token'){
      let body='';for await(const chunk of req)body+=chunk;const params=new URLSearchParams(body);
      tokenReceived=params.get('client_id')==='test-client'&&params.get('client_secret')==='test-secret'&&params.get('code')==='test-code'&&params.get('redirect_uri')===callback&&crypto.createHash('sha256').update(params.get('code_verifier')).digest('base64url')===challenge;
      res.end(JSON.stringify({access_token:'mock-token'}));
    }else if(req.url==='/users'&&req.headers.authorization==='Bearer mock-token')res.end(JSON.stringify({data:[{name:'Kick Player',profile_picture:'https://example.com/avatar.png'}]}));
    else{res.statusCode=401;res.end('{}');}
  });
  const providerPort=await listen(provider),reserve=http.createServer(),port=await listen(reserve);await new Promise(resolve=>reserve.close(resolve));
  const base=`http://127.0.0.1:${port}`,callback=base+'/auth/kick/callback';
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),KICK_CLIENT_ID:'test-client',KICK_CLIENT_SECRET:'test-secret',KICK_REDIRECT_URI:callback,APP_ORIGIN:'https://frontend.example',KICK_AUTH_URL:`http://127.0.0.1:${providerPort}/authorize`,KICK_TOKEN_URL:`http://127.0.0.1:${providerPort}/token`,KICK_USERINFO_URL:`http://127.0.0.1:${providerPort}/users`},stdio:'ignore'});
  try{
    let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/health')).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(ready,'server starts');
    const start=await fetch(base+'/auth/kick',{redirect:'manual'});assert.equal(start.status,302);const auth=new URL(start.headers.get('location'));challenge=auth.searchParams.get('code_challenge');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('redirect_uri'),callback);assert.equal(auth.searchParams.get('client_id'),'test-client');
    const state=auth.searchParams.get('state');assert.ok(state);const finish=await fetch(callback+'?code=test-code&state='+state,{redirect:'manual'});assert.equal(finish.status,302);assert.ok(tokenReceived,'token exchange verifies PKCE and configured credentials');
    const destination=new URL(finish.headers.get('location'));assert.equal(destination.origin,'https://frontend.example');assert.equal(destination.searchParams.get('kick_username'),'Kick Player');assert.equal(destination.searchParams.get('kick_avatar'),'https://example.com/avatar.png');
    assert.equal((await fetch(callback+'?code=test-code&state='+state)).status,400);
    assert.equal((await fetch(callback+'?code=test-code&state=__proto__')).status,400);
  }finally{child.kill();await new Promise(resolve=>provider.close(resolve));}
});
