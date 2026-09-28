const { test, expect } = require('@playwright/test');
test('local game, undo, persistence and responsive WebGL', async ({ page }) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000');
  await expect(page.locator('#board3d canvas')).toBeVisible();
  await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
  await page.click('#view2d');
  for(const square of ['e2','e4','e7','e5','g1','f3']) await page.locator(`[data-square="${square}"]`).click();
  await expect(page.locator('#history')).toContainText('Nf3');
  await page.click('#undo');await expect(page.locator('#history')).not.toContainText('Nf3');
  await page.reload();await expect(page.locator('#history')).toContainText('e5');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.click('#view2d');await page.locator('[data-square="g1"]').focus();await page.keyboard.press('Enter');await page.locator('[data-square="f3"]').focus();await page.keyboard.press('Enter');await expect(page.locator('#history')).toContainText('Nf3');
  expect(errors).toEqual([]);
});
test('checkmate and new game',async({page})=>{
  await page.goto('http://localhost:3000/ajedrez.html');await page.click('#view2d');
  for(const square of ['f2','f3','e7','e5','g2','g4','d8','h4'])await page.locator(`[data-square="${square}"]`).click();
  await expect(page.locator('#turn-title')).toHaveText('Jaque mate');
  await page.click('#new-game');await page.click('#confirm-yes');await expect(page.locator('#turn-title')).toHaveText('Juegan blancas');
});
test('two players and spectator synchronize',async({browser})=>{
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  const [a,b,c]=await Promise.all(contexts.map(x=>x.newPage()));
  await Promise.all([a,b,c].map(p=>p.goto('http://localhost:3000')));
  await a.click('#rooms-open');await a.click('#create-room');await expect(a.locator('#mode-label')).toHaveText('Multijugador');
  const invite=a.url();await b.goto(invite);await expect(b.locator('#mode-label')).toHaveText('Multijugador');await c.goto(invite);await expect(c.locator('#mode-label')).toHaveText('Espectador');
  for(const p of [a,b,c])await p.click('#view2d');
  await a.locator('[data-square="e2"]').click();await a.locator('[data-square="e4"]').click();
  for(const p of [a,b,c])await expect(p.locator('#history')).toContainText('e4');
  await b.locator('[data-square="e7"]').click();await b.locator('[data-square="e5"]').click();
  for(const p of [a,b,c])await expect(p.locator('#history')).toContainText('e5');
  await expect(c.locator('#new-game')).toBeDisabled();
  await a.click('#new-game');await expect(b.locator('#confirm-dialog')).toBeVisible();await b.click('#confirm-yes');
  for(const p of [a,b,c])await expect(p.locator('#history')).not.toContainText('e5');
  await Promise.all(contexts.map(x=>x.close()));
});
test('3D raycasting selects and moves a real piece',async({page})=>{
  const THREE=await import('three');
  await page.goto('http://localhost:3000');
  const canvas=page.locator('#board3d canvas');await expect(canvas).toBeVisible();const bounds=await canvas.boundingBox();
  const camera=new THREE.PerspectiveCamera(36,bounds.width/bounds.height,.1,100);camera.position.set(1.3,16.8*.78,16.8*.75);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  function point(x,y,z){const v=new THREE.Vector3(x,y,z).project(camera);return {x:bounds.x+(v.x+1)*bounds.width/2,y:bounds.y+(1-v.y)*bounds.height/2};}
  let p=point(.5,.7,2.5);await page.mouse.click(p.x,p.y);p=point(.5,.04,.5);await page.mouse.click(p.x,p.y);await expect(page.locator('#history')).toContainText('e4');
});
test('promotion choice and WebGL fallback remain playable',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};localStorage.setItem('enroque-pgn','1. a4 h5 2. a5 h4 3. a6 h3 4. axb7 hxg2');});
  await page.goto('http://localhost:3000');await expect(page.locator('#board2d')).toBeVisible();await expect(page.locator('#view3d')).toBeDisabled();
  await page.locator('[data-square="b7"]').click();await page.locator('[data-square="a8"]').click();await expect(page.locator('#promotion-dialog')).toBeVisible();await page.getByRole('button',{name:'caballo',exact:true}).click();await expect(page.locator('#history')).toContainText('bxa8=N');
});
test('Kick return restores profile, avatar, lobby and logout',async({page})=>{
  await page.route('https://example.com/avatar.png',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>'}));
  await page.goto('http://localhost:3000/?kick_username=KickPlayer&kick_avatar='+encodeURIComponent('https://example.com/avatar.png'));
  await expect(page.locator('#lobby-dialog')).toBeVisible();await expect(page.locator('#profile-name')).toHaveText('KickPlayer');await expect(page.locator('#profile img')).toBeVisible();expect(page.url()).not.toContain('kick_username');
  await page.locator('#lobby-dialog [data-close]').click();await page.click('#profile');await expect(page.locator('#kick-login')).toHaveAttribute('href','http://localhost:3000/auth/kick');await expect(page.locator('#profile-provider')).toHaveText('Perfil de Kick');
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('KickPlayer');await page.click('#profile');await page.click('#logout');await expect(page.locator('#profile-name')).toHaveText('Invitado');await expect(page.locator('#profile img')).toHaveCount(0);
});
