import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOrigin} from '../config.mjs';
test('auto origin uses Render-assigned URL including collision suffixes',()=>{
  assert.equal(resolveOrigin({APP_ORIGIN:'auto',RENDER_EXTERNAL_URL:'https://our-place-actual-suffix.onrender.com'}),'https://our-place-actual-suffix.onrender.com');
});
test('automatic origin fails closed without a valid Render URL',()=>{
  for(const raw of [undefined,'http://app.onrender.com','https://onrender.com.evil.test','https://app.onrender.com/path','https://user:pass@app.onrender.com'])assert.throws(()=>resolveOrigin({APP_ORIGIN:'auto',RENDER_EXTERNAL_URL:raw}));
});
test('explicit HTTPS custom origin is normalized',()=>{
  assert.equal(resolveOrigin({APP_ORIGIN:'https://our-place.example/'}),'https://our-place.example');
});
